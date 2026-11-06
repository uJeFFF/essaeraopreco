"""Baixa os preços médios mensais no varejo do IEA/SP (12 cortes, 2025-2026).

Fonte: IEA/SP, "Preços Médios Mensais no Varejo" (cod_sis=4), cidade de São Paulo.
A consulta pública gratuita oferece 2025/JAN a 2026/AGO. A série completa
(desde 1970) é vendida pelo IEA como "Séries históricas em planilha".

O site do IEA apresenta cadeia de certificado incompleta para o urllib do
Python; usamos um contexto SSL não verificado apenas nesta leitura pública.

Saída:
  assetsexternos/iea_varejo_sp.csv
  ano_mes;corte;preco_rs_kg;fonte;url

Uso:
  python scripts/baixar-iea-varejo.py
"""

import csv
import http.cookiejar
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "assetsexternos" / "iea_varejo_sp.csv"
URL = "https://infoiea.agricultura.sp.gov.br/nia1/Precos_Medios.aspx?cod_sis=4"
FONTE = "IEA/SP - Preços Médios Mensais no Varejo"
PERIODO_INICIAL = "2025/JAN"
PERIODO_FINAL = "2026/AGO"

# Índice de cada checkbox na página do IEA -> nome usado no projeto.
PRODUTOS = {
    5: "acém", 9: "alcatra", 41: "capa de filé", 54: "contrafilé",
    56: "costela", 61: "coxão duro", 62: "coxão mole", 74: "filé-mignon",
    80: "lagarto", 112: "músculo", 122: "patinho", 132: "picanha",
}


def escondido(pagina, nome):
    m = re.search(r'name="%s"[^>]*value="([^"]*)"' % nome, pagina)
    return m.group(1) if m else ""


def postar(opener, dados):
    pedido = urllib.request.Request(
        URL,
        data=urllib.parse.urlencode(dados).encode(),
        headers={"User-Agent": "Mozilla/5.0", "Referer": URL},
    )
    with opener.open(pedido, timeout=120) as resposta:
        return resposta.read().decode("utf-8", "replace")


def linhas(pagina):
    for linha in re.findall(r'<tr class="pg3-grid-row[^"]*">(.*?)</tr>', pagina, re.S):
        celulas = [
            re.sub(r"<[^>]+>", "", c).replace("&nbsp;", " ").strip()
            for c in re.findall(r"<td[^>]*>(.*?)</td>", linha, re.S)
        ]
        if len(celulas) != 6 or not celulas[0] or not celulas[1]:
            continue
        produto, mes, ano, _moeda, preco, _unidade = celulas
        if not re.fullmatch(r"\d{1,2}", mes) or not re.fullmatch(r"\d{4}", ano):
            continue
        corte = PRODUTOS.get(next((i for i, nome in PRODUTOS.items()
                                   if nome == produto.lower()), None))
        if corte is None:
            # A página traz "Contra-filé", "Costela de Vaca" etc.; mapeia pelo texto.
            normalizado = produto.lower().replace("-", " ").strip()
            mapa = {
                "acém": "acém", "alcatra": "alcatra", "capa de filé": "capa de filé",
                "contra filé": "contrafilé", "costela de vaca": "costela",
                "coxão duro": "coxão duro", "coxão mole": "coxão mole",
                "filé mignon": "filé-mignon", "lagarto": "lagarto",
                "músculo": "músculo", "patinho": "patinho", "picanha": "picanha",
            }
            corte = mapa.get(normalizado)
        if corte is None:
            raise SystemExit(f"produto não mapeado: {produto!r}")
        valor = preco.replace(".", "").replace(",", ".")
        yield f"{ano}-{int(mes):02d}", corte, float(valor)


def main():
    contexto = ssl._create_unverified_context()
    cozinheiro = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cozinheiro),
        urllib.request.HTTPSHandler(context=contexto),
    )

    with opener.open(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}),
                     timeout=90) as resposta:
        pagina = resposta.read().decode("utf-8", "replace")

    base = {
        "__VIEWSTATE": escondido(pagina, "__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": escondido(pagina, "__VIEWSTATEGENERATOR"),
        "cmbPeriodo_Inicial": PERIODO_INICIAL,
        "cmbPeriodo_Final": PERIODO_FINAL,
        "imgPesquisar": "Pesquisar",
    }
    if escondido(pagina, "__EVENTVALIDATION"):
        base["__EVENTVALIDATION"] = escondido(pagina, "__EVENTVALIDATION")
    for indice in PRODUTOS:
        base[f"chkLstItens${indice}"] = "on"

    pagina = postar(opener, base)
    dados = {}
    total_paginas = int(re.search(r"Página:\s*1\s*de\s*(\d+)", pagina).group(1))
    for numero in range(1, total_paginas + 1):
        for ano_mes, corte, valor in linhas(pagina):
            dados[(ano_mes, corte)] = valor
        if numero == total_paginas:
            break
        alvos = {
            texto: alvo
            for alvo, texto in re.findall(
                r"__doPostBack\('(Grid\$ctl44\$ctl\d+)',''\)[^>]*>(\d+)</a>", pagina
            )
        }
        alvo = alvos.get(str(numero + 1))
        if not alvo:
            raise SystemExit(f"paginador: página {numero + 1} não encontrada")
        base = {
            "__VIEWSTATE": escondido(pagina, "__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": escondido(pagina, "__VIEWSTATEGENERATOR"),
            "cmbPeriodo_Inicial": PERIODO_INICIAL,
            "cmbPeriodo_Final": PERIODO_FINAL,
            "__EVENTTARGET": alvo,
            "__EVENTARGUMENT": "",
        }
        if escondido(pagina, "__EVENTVALIDATION"):
            base["__EVENTVALIDATION"] = escondido(pagina, "__EVENTVALIDATION")
        for indice in PRODUTOS:
            base[f"chkLstItens${indice}"] = "on"
        pagina = postar(opener, base)

    if len(dados) != 240:
        raise SystemExit(f"esperados 240 registros, encontrados {len(dados)}")
    if len({c for _, c in dados}) != 12:
        raise SystemExit(f"esperados 12 cortes, encontrados {len({c for _, c in dados})}")
    if dados[("2026-08", "picanha")] != 90.42:
        raise SystemExit(f"picanha ago/2026 deveria ser 90,42; veio {dados[('2026-08', 'picanha')]}")

    with SAIDA.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ano_mes", "corte", "preco_rs_kg", "fonte", "url"])
        for (ano_mes, corte) in sorted(dados):
            w.writerow([ano_mes, corte, f"{dados[(ano_mes, corte)]:.2f}", FONTE, URL])

    print(f"gravado: {SAIDA} ({len(dados)} linhas, "
          f"{len({c for _, c in dados})} cortes, "
          f"{min(a for a, _ in dados)} a {max(a for a, _ in dados)})")


if __name__ == "__main__":
    main()
