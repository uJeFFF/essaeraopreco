"""Baixa o Preço Médio da Carne por capital (DIEESE, Cesta Básica) e calcula o fator regional vs SP.

Fonte: https://www.dieese.org.br/cesta/ (Banco de Dados, produto "Carne", tipo "Preço médio").
Consulta: POST /cesta/produto com produtos=2 (Carne), tipoDado=4 (Preço médio), cidades=0 (todas).

Saídas (assetsexternos/):
  dieese_carne.csv             -> preço R$/kg por cidade e mês, 1994-01 a 2026-09
  dieese_fatores_vs_sp.csv     -> razão cidade/SP por mês (fator regional de carne)

Uso:
  python scripts/baixar-dieese-carne.py
"""

import csv
import html
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "assetsexternos"
URL = "https://www.dieese.org.br/cesta/produto"
DATA_INICIAL = "011994"
DATA_FINAL = "092026"
REFERENCIA = "São Paulo"
CAPITAIS = {
    "Brasília", "Campo Grande", "Cuiabá", "Goiânia", "Belo Horizonte", "Rio de Janeiro",
    "São Paulo", "Vitória", "Curitiba", "Florianópolis", "Porto Alegre", "Belém", "Boa Vista",
    "Macapá", "Manaus", "Palmas", "Porto Velho", "Rio Branco", "Aracaju", "Fortaleza",
    "João Pessoa", "Maceió", "Natal", "Recife", "Salvador", "São Luís", "Teresina",
}


def baixar_tabela():
    corpo = urllib.parse.urlencode({
        "farinha": "true", "produtos": "2", "tipoDado": "4", "cidades": "0",
        "dataInicial": DATA_INICIAL, "dataFinal": DATA_FINAL,
    }).encode("ascii")
    req = urllib.request.Request(URL, data=corpo,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=180) as r:
        bruto = r.read()
    # A página vem em ISO-8859-1/cp1252 (acentos quebram se decodificar como UTF-8).
    try:
        return bruto.decode("utf-8")
    except UnicodeDecodeError:
        return bruto.decode("cp1252", errors="replace")


def ler_tabela(pagina):
    m = re.search(r'<table[^>]*id="dados"[^>]*>(.*?)</table>', pagina, re.S)
    if not m:
        raise ValueError("tabela de Preço Médio - Carne não encontrada na resposta")
    tabela = m.group(1)
    cabecalho = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<th[^>]*>(.*?)</th>", tabela, re.S)]
    cidades = cabecalho[1:]  # a primeira <th> é vazia (coluna de mês)

    linhas = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tabela[tabela.find("<tbody"):], re.S):
        celulas = [html.unescape(re.sub(r"<[^>]+>", "", td)).strip()
                   for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(celulas) < 2:
            continue
        mes, valores = celulas[0], celulas[1:]
        if not re.fullmatch(r"\d{2}-\d{4}", mes):
            continue
        mm, aaaa = mes.split("-")
        if len(valores) != len(cidades):
            raise ValueError(f"{mes}: {len(valores)} valores para {len(cidades)} cidades")
        linhas.append((f"{aaaa}-{mm}", dict(zip(cidades, valores))))
    return cidades, linhas


def para_numero(texto):
    texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return None  # "-" = sem coleta naquele mês


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    pagina = baixar_tabela()
    cidades, linhas = ler_tabela(pagina)
    print(f"meses: {len(linhas)} ({linhas[0][0]} a {linhas[-1][0]}), cidades: {len(cidades)}")

    precos = SAIDA / "dieese_carne.csv"
    with precos.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ano_mes", "cidade", "e_capital", "preco_carne_rs_kg", "fonte", "url"])
        for ano_mes, valores in linhas:
            for cidade in cidades:
                v = para_numero(valores[cidade])
                w.writerow([ano_mes, cidade, int(cidade in CAPITAIS),
                            "" if v is None else f"{v:.2f}",
                            "DIEESE - Cesta Básica Nacional, Preço médio carne", URL])

    fatores = SAIDA / "dieese_fatores_vs_sp.csv"
    faltas = []
    with fatores.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ano_mes", "cidade", "e_capital", "fator_vs_sp"])
        for ano_mes, valores in linhas:
            ref = para_numero(valores[REFERENCIA])
            if ref is None:
                faltas.append(ano_mes)
                continue
            for cidade in cidades:
                v = para_numero(valores[cidade])
                if v is None:
                    continue
                w.writerow([ano_mes, cidade, int(cidade in CAPITAIS), f"{v / ref:.4f}"])

    print(f"gravado: {precos}")
    print(f"gravado: {fatores}")
    if faltas:
        print(f"meses sem preço de {REFERENCIA} (sem fator): {len(faltas)} -> {faltas[:5]}", file=sys.stderr)


if __name__ == "__main__":
    main()
