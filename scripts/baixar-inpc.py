"""Baixa e consolida o INPC por subitem (nacional + regiões), 2005-2026.

Fonte: FTP do IBGE, Precos_Indices_de_Precos_ao_Consumidor.
  - 2005-01 e 2008-01 em diante: INPC (pasta do IPCA em 2005, pasta do INPC depois)
  - 2005-02 a 2007-12: o IBGE publicou só o IPCA nesses arquivos. Ficam no
    arquivo completo com indice=IPCA; não entram no recorte do site.

Saídas (assetsexternos/):
  inpc_subitens_completo.csv  -> todos os subitens publicados (arquivo histórico)
  inpc_carne_cesta.csv        -> recorte para o site (carne + cesta básica, só INPC)

Uso:
  python scripts/baixar-inpc.py
"""

import csv
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import xlrd

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "data" / "fontes" / "inpc"
SAIDA = RAIZ / "assetsexternos"

FTP = "https://ftp.ibge.gov.br/Precos_Indices_de_Precos_ao_Consumidor"
SIDRA = "https://apisidra.ibge.gov.br/values/t/{tab}/n1/all/v/{var}/p/last%201/c315/all"
TABELAS_SIDRA = [("1419", "63"), ("7060", "63"), ("7063", "44")]  # IPCA 2012-19, IPCA 2020+, INPC 2020+

ULTIMO_ANO_MES = (2026, 9)

# Recorte do site: carne bovina (cortes e agregados) e itens da cesta básica.
# Nomes conforme publicados pelo IBGE; "leite pasteurizado" é o item de leite até 2011,
# "leite longa vida" a partir de 2012 (reclassificação do IPCA/INPC).
CARNE = re.compile(
    r"carne|alcatra|contrafile|patinho|lagarto|musculo|acem|peito|capa de file|"
    r"costela|cupim|picanha|figado|cha de dentro|cha de fora|file[ -]mignon|maminha|"
    r"fraldinha|bisteca|paleta|charque|coxao|^pa$"
)
CESTA = re.compile(
    r"^arroz$|feijao|^farinha de (trigo|mandioca)$|^batata-inglesa$|^tomate$|"
    r"leite longa vida|leite pasteurizado|^pao frances$|^cafe moido$|^banana-prata$|"
    r"^acucar refinado$|^oleo de soja$|^manteiga$"
)

# Grafias que mudam ao longo da série, mesmo item. Chave = subitem_normalizado.
ITEM_CANONICO = {
    "file mignon": "file-mignon",
    "feijao-carioca(rajado)": "feijao-carioca (rajado)",
    "feijao-macassar": "feijao-macassar (fradinho)",
    "feijao-macacar (fradinho)": "feijao-macassar (fradinho)",
    "carne-seca": "carne-seca e de sol",
    "carne seca e de sol": "carne-seca e de sol",
}
# Quebras de série: o item muda de definição (não é a mesma série com outro nome).
QUEBRAS_DE_SERIE = {
    "leite pasteurizado": "reclassificado em 2012 (leite longa vida); verificar equivalência",
    "lagarto plano": "reclassificado em 2012 (lagarto redondo/comum); verificar equivalência",
}

_listagens = {}


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto.lower()).strip()


def sem_codigo(nome_normalizado):
    return re.sub(r"^\d+\.\s*", "", nome_normalizado)


def chave(nome):
    """Chave de comparação: só letras e números (ignora espaços, hífens e parênteses)."""
    return re.sub(r"[^a-z0-9]", "", sem_codigo(normalizar(nome)))


def pasta_do_mes(ano):
    if ano <= 2007:
        return f"{FTP}/IPCA/Resultados_por_Subitem/{ano}/"
    if ano == 2026:
        return f"{FTP}/INPC/Resultados_por_Subitem/"
    return f"{FTP}/INPC/Resultados_por_Subitem/{ano}/"


def listar(pasta):
    if pasta not in _listagens:
        with urllib.request.urlopen(pasta, timeout=120) as r:
            html = r.read().decode("utf-8", errors="replace")
        _listagens[pasta] = sorted({h[6:-1] for h in re.findall(r'href="[^"]+"', html)
                                    if h[6:-1].lower().endswith(".zip")})
    return _listagens[pasta]


def url_do_mes(ano, mes):
    """Acha o zip do mês. Alguns meses têm sufixo de revisão (ex.: _20190524); usa o mais recente."""
    prefixo = "ipca" if ano <= 2007 else "inpc"
    base = f"{prefixo}_{ano}{mes:02d}Subitem"
    candidatos = [n for n in listar(pasta_do_mes(ano)) if n.startswith(base)]
    if not candidatos:
        raise FileNotFoundError(f"zip de {ano}-{mes:02d} não encontrado na pasta")
    return pasta_do_mes(ano) + sorted(candidatos)[-1]


def baixar(url, destino):
    if destino.exists() and destino.stat().st_size > 0:
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        destino.write_bytes(r.read())
    return destino


def achar_folha(livro, prefixo):
    for s in livro.sheets():
        if s.name.upper().strip().startswith(prefixo):
            return s
    return None


def achar_cabecalho(folha, marcadores):
    for r in range(min(folha.nrows, 15)):
        valores = [str(v).strip().upper() for v in folha.row_values(r)]
        if any(m in valores for m in marcadores):
            return r
    return None


def ler_planilha(xls_bytes):
    """Retorna (indice, regioes, linhas, pesos_nacionais) de um arquivo mensal."""
    livro = xlrd.open_workbook(file_contents=xls_bytes)

    folha = achar_folha(livro, "MENSAL SUBITEM INPC")
    indice = "INPC"
    if folha is None:
        folha = achar_folha(livro, "MENSAL SUBITEM IPCA")
        indice = "IPCA"
    if folha is None:
        # Alguns meses de 2005-2006 trazem a tabela numa aba "RELATÓRIO" (mesmo layout).
        folha = next((s for s in livro.sheets() if achar_cabecalho(s, {"RJ", "SP"}) is not None), None)
        if folha is None:
            raise ValueError("aba mensal de subitens não encontrada")
        titulo = " ".join(str(v) for r in range(4) for v in folha.row_values(r)).upper()
        indice = "INPC" if "INPC" in titulo else "IPCA"

    cab = achar_cabecalho(folha, {"RJ", "SP", "NACIONAL"})
    if cab is None:
        raise ValueError("cabeçalho de regiões não encontrado")

    colunas = {c: str(v).strip().upper()
               for c, v in enumerate(folha.row_values(cab)) if c > 0 and str(v).strip()}

    linhas = []
    for r in range(cab + 1, folha.nrows):
        rotulo = str(folha.cell_value(r, 0)).strip()
        if not rotulo:
            continue
        valores = {regiao: folha.cell_value(r, c)
                   for c, regiao in colunas.items() if isinstance(folha.cell_value(r, c), float)}
        if valores:
            linhas.append((rotulo, r + 1, valores))

    pesos = {}
    folha_p = achar_folha(livro, "PESOS SUBITEM " + indice)
    if folha_p is not None:
        cab_p = achar_cabecalho(folha_p, {"NACIONAL"})
        if cab_p is not None:
            col = [c for c, v in enumerate(folha_p.row_values(cab_p))
                   if str(v).strip().upper() == "NACIONAL"][0]
            for r in range(cab_p + 1, folha_p.nrows):
                rotulo = str(folha_p.cell_value(r, 0)).strip()
                v = folha_p.cell_value(r, col)
                if rotulo and isinstance(v, float):
                    pesos[rotulo] = v
    return indice, list(colunas.values()), linhas, pesos


def carregar_codigos():
    """Mapa chave(nome) -> código de categoria SIDRA, de IPCA 2012+ e INPC/IPCA 2020+."""
    mapa = {}
    for tab, var in TABELAS_SIDRA:
        try:
            with urllib.request.urlopen(SIDRA.format(tab=tab, var=var), timeout=120) as r:
                dados = json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError) as erro:
            print(f"aviso: SIDRA {tab} indisponível ({erro})", file=sys.stderr)
            continue
        for item in dados[1:]:
            mapa.setdefault(chave(item["D4N"]), item["D4C"])
    return mapa


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    SAIDA.mkdir(parents=True, exist_ok=True)
    codigos = carregar_codigos()

    completo_path = SAIDA / "inpc_subitens_completo.csv"
    carne_path = SAIDA / "inpc_carne_cesta.csv"
    cabecalho = ["ano_mes", "indice", "regiao", "rotulo_original", "subitem_normalizado",
                 "item_canonico", "quebra_de_serie", "codigo_sidra", "variacao_mensal_pct",
                 "peso_nacional_pct", "linha_planilha", "arquivo_origem"]

    falhas, total, total_site = [], 0, 0
    with completo_path.open("w", newline="", encoding="utf-8-sig") as fc, \
         carne_path.open("w", newline="", encoding="utf-8-sig") as fk:
        escritor_c = csv.writer(fc, delimiter=";")
        escritor_k = csv.writer(fk, delimiter=";")
        escritor_c.writerow(cabecalho)
        escritor_k.writerow(cabecalho)

        for ano in range(2005, 2027):
            for mes in range(1, 13):
                if (ano, mes) > ULTIMO_ANO_MES:
                    break
                ano_mes = f"{ano}-{mes:02d}"
                try:
                    url = url_do_mes(ano, mes)
                    zip_path = CACHE / Path(url).name
                    baixar(url, zip_path)
                    with zipfile.ZipFile(zip_path) as z:
                        nome_xls = next(n for n in z.namelist() if n.lower().endswith(".xls"))
                        indice, regioes, linhas, pesos = ler_planilha(z.read(nome_xls))
                except Exception as erro:
                    falhas.append((ano_mes, repr(erro)))
                    print(f"FALHA {ano_mes}: {erro!r}", file=sys.stderr)
                    continue

                arquivo = Path(url).name
                for rotulo, num_linha, valores in linhas:
                    sub = sem_codigo(normalizar(rotulo))
                    cod = codigos.get(chave(rotulo), "")
                    peso = pesos.get(rotulo)
                    peso_txt = f"{peso:.4f}" if peso is not None else ""
                    no_site = indice == "INPC" and (CARNE.search(sub) or CESTA.search(sub))
                    canonico = ITEM_CANONICO.get(sub, sub)
                    quebra = QUEBRAS_DE_SERIE.get(sub, "")
                    for regiao, variacao in valores.items():
                        linha = [ano_mes, indice, regiao, rotulo, sub, canonico, quebra, cod,
                                 f"{variacao:.2f}", peso_txt, num_linha, arquivo]
                        escritor_c.writerow(linha)
                        total += 1
                        if no_site:
                            escritor_k.writerow(linha)
                            total_site += 1
                print(f"ok {ano_mes} ({indice}): {len(linhas)} linhas x {len(regioes)} colunas")

    print(f"\nLinhas no completo: {total}")
    print(f"Linhas no recorte carne+cesta: {total_site}")
    print(f"Arquivo completo: {completo_path}")
    print(f"Arquivo carne+cesta: {carne_path}")
    if falhas:
        print(f"Meses com falha: {len(falhas)}", file=sys.stderr)
        for mes, motivo in falhas:
            print(f"  {mes}: {motivo}", file=sys.stderr)


if __name__ == "__main__":
    main()
