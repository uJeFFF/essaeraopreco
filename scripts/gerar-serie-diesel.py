"""Gera a série mensal de diesel por capital a partir das planilhas da ANP.

Entradas (data/fontes/anp/):
  mensal-municipios-2001-a-2012.xlsb
  mensal-municipios-2013-a-2015.xlsx
  mensal-municipios-2016-a-2018.xlsx
  mensal-municipios-2019-a-2021.xlsx
  mensal-municipios-jan2022-2025.xlsx
  mensal-municipios-desde-jan2026.xlsx

Produtos:
  Diesel S10  (OLEO DIESEL S10; a partir de 2013)
  Diesel comum (OLEO DIESEL; desde 2001)

Saídas (assetsexternos/):
  diesel_municipal.csv    uma linha por capital x produto x mês
  diesel_cobertura.csv    cobertura por capital x produto
  fontes_diesel.csv       registro das planilhas usadas

Regras:
  - Preço de revenda (PREÇO MÉDIO REVENDA), em R$/L. Não usamos mínimo/máximo
    como âncora.
  - A média municipal é a publicada pela ANP; a margem é a amostral da média:
      1,96 x desvio-padrão / sqrt(n) / média
  - CV = desvio-padrão / média (em %).
  - Preço real = nominal x IPCA(set/2026) / IPCA(mês).
  - Litros por salário = salário mínimo nominal do mês / preço nominal.
  - Sem interpolação; mês sem dado fica vazio.

Uso:
  python scripts/baixar-anp-combustiveis.py
  python scripts/gerar-serie-diesel.py
"""

import csv
import math
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
FONTES = RAIZ / "data" / "fontes" / "anp"
MES_REAL = "2026-09"
URL_ANP = ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
           "precos/precos-revenda-e-de-distribuicao-combustiveis/"
           "serie-historica-do-levantamento-de-precos")
FONTE = "ANP - Levantamento de Preços (revenda)"

ARQUIVOS = [
    ("mensal-municipios-2001-a-2012.xlsb",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/2001-2012/"
     "mensal-municipios-2001-a-2012.xlsb",
     "2001-07", "2012-12"),
    ("mensal-municipios-2013-a-2015.xlsx",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/"
     "mensal-municipios-2013-a-2015.xlsx",
     "2013-01", "2015-12"),
    ("mensal-municipios-2016-a-2018.xlsx",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/"
     "mensal-municipios-2016-a-2018.xlsx",
     "2016-01", "2018-12"),
    ("mensal-municipios-2019-a-2021.xlsx",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/"
     "mensal-municipios-2019-a-2021.xlsx",
     "2019-01", "2021-12"),
    ("mensal-municipios-jan2022-2025.xlsx",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/"
     "mensal-municipios-jan2022-2025.xlsx",
     "2022-01", "2025-12"),
    ("mensal-municipios-desde-jan2026.xlsx",
     "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
     "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/"
     "mensal-municipios-desde-jan2026.xlsx",
     "2026-01", None),
]

# (MUNICÍPIO, ESTADO) normalizados -> (nome canônico, UF).
CAPITAIS = {
    ("RIO BRANCO", "ACRE"): ("Rio Branco", "AC"),
    ("MACEIO", "ALAGOAS"): ("Maceió", "AL"),
    ("MACAPA", "AMAPA"): ("Macapá", "AP"),
    ("MANAUS", "AMAZONAS"): ("Manaus", "AM"),
    ("SALVADOR", "BAHIA"): ("Salvador", "BA"),
    ("FORTALEZA", "CEARA"): ("Fortaleza", "CE"),
    ("BRASILIA", "DISTRITO FEDERAL"): ("Brasília", "DF"),
    ("VITORIA", "ESPIRITO SANTO"): ("Vitória", "ES"),
    ("GOIANIA", "GOIAS"): ("Goiânia", "GO"),
    ("SAO LUIS", "MARANHAO"): ("São Luís", "MA"),
    ("CUIABA", "MATO GROSSO"): ("Cuiabá", "MT"),
    ("CAMPO GRANDE", "MATO GROSSO DO SUL"): ("Campo Grande", "MS"),
    ("BELO HORIZONTE", "MINAS GERAIS"): ("Belo Horizonte", "MG"),
    ("BELEM", "PARA"): ("Belém", "PA"),
    ("JOAO PESSOA", "PARAIBA"): ("João Pessoa", "PB"),
    ("CURITIBA", "PARANA"): ("Curitiba", "PR"),
    ("RECIFE", "PERNAMBUCO"): ("Recife", "PE"),
    ("TERESINA", "PIAUI"): ("Teresina", "PI"),
    ("RIO DE JANEIRO", "RIO DE JANEIRO"): ("Rio de Janeiro", "RJ"),
    ("NATAL", "RIO GRANDE DO NORTE"): ("Natal", "RN"),
    ("PORTO ALEGRE", "RIO GRANDE DO SUL"): ("Porto Alegre", "RS"),
    ("PORTO VELHO", "RONDONIA"): ("Porto Velho", "RO"),
    ("BOA VISTA", "RORAIMA"): ("Boa Vista", "RR"),
    ("FLORIANOPOLIS", "SANTA CATARINA"): ("Florianópolis", "SC"),
    ("SAO PAULO", "SAO PAULO"): ("São Paulo", "SP"),
    ("ARACAJU", "SERGIPE"): ("Aracaju", "SE"),
    ("PALMAS", "TOCANTINS"): ("Palmas", "TO"),
}

PRODUTOS = {
    "OLEO DIESEL S10": "Diesel S10",
    "OLEO DIESEL S 10": "Diesel S10",
    "OLEO DIESEL": "Diesel comum",
}

CABECALHO = [
    "cidade", "uf", "ano_mes", "produto", "preco_nominal_rs_l",
    "preco_real_set2026_rs_l", "num_postos", "desvio_padrao_rs_l",
    "coef_variacao_pct", "margem_pct", "litros_por_salario", "fonte", "url",
]
CABECALHO_COB = [
    "cidade", "uf", "produto", "primeiro_mes", "ultimo_mes",
    "meses_com_valor", "lacunas", "status", "observacao",
]
CABECALHO_FONTES = [
    "produto", "fonte", "tipo", "url", "periodo", "abrangencia",
    "estatistica", "status", "observacao",
]


def normalizar(texto):
    return unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().upper().strip()


def normalizar_espacos(texto):
    return " ".join(normalizar(texto).split())


def ler_csv(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def numero(serie):
    """Converte coluna numérica; aceita célula numérica ou texto com vírgula."""
    if pd.api.types.is_numeric_dtype(serie):
        return pd.to_numeric(serie, errors="coerce")
    s = serie.astype(str).str.strip()
    com_virgula = s.str.contains(",", regex=False)
    s = s.where(~com_virgula, s.str.replace(".", "", regex=False))
    s = s.str.replace(",", ".", regex=False)
    return pd.to_numeric(s, errors="coerce")


def deslocar(ym, n):
    ano, mes = int(ym[:4]), int(ym[5:])
    idx = ano * 12 + (mes - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def intervalo(a, b):
    return (int(b[:4]) * 12 + int(b[5:])) - (int(a[:4]) * 12 + int(a[5:])) + 1


def ler_planilha(caminho):
    engine = "pyxlsb" if caminho.suffix.lower() == ".xlsb" else "openpyxl"
    try:
        xl = pd.ExcelFile(caminho, engine=engine)
    except Exception as erro:
        raise SystemExit(f"não consegui abrir {caminho.name}: {erro}")
    bruto = pd.read_excel(caminho, sheet_name=0, header=None, nrows=30, engine=engine)
    header = None
    for i in range(len(bruto)):
        valores = {normalizar(v) for v in bruto.iloc[i].tolist() if pd.notna(v)}
        if {"MES", "PRODUTO", "MUNICIPIO"} <= valores:
            header = i
            break
    if header is None:
        raise SystemExit(f"cabeçalho não encontrado em {caminho.name}")
    df = pd.read_excel(caminho, sheet_name=0, header=header, engine=engine)
    df.columns = [normalizar_espacos(c) for c in df.columns]

    df["PRODUTO_NORM"] = df["PRODUTO"].map(normalizar_espacos)
    df["PRODUTO_CANON"] = df["PRODUTO_NORM"].map(PRODUTOS)
    df = df[df["PRODUTO_CANON"].notna()].copy()

    df["MUN_NORM"] = df["MUNICIPIO"].map(normalizar_espacos)
    df["EST_NORM"] = df["ESTADO"].map(normalizar_espacos)
    mapa = df.apply(lambda r: CAPITAIS.get((r["MUN_NORM"], r["EST_NORM"])), axis=1)
    df["CIDADE"] = mapa.map(lambda x: x[0] if isinstance(x, tuple) else None)
    df["UF"] = mapa.map(lambda x: x[1] if isinstance(x, tuple) else None)
    df = df[df["CIDADE"].notna()].copy()

    if pd.api.types.is_numeric_dtype(df["MES"]):
        datas = pd.to_datetime(df["MES"], unit="D", origin="1899-12-30", errors="coerce")
    else:
        datas = pd.to_datetime(df["MES"], errors="coerce")
    df["ANO_MES"] = datas.dt.strftime("%Y-%m")

    df["PRECO"] = numero(df["PRECO MEDIO REVENDA"])
    df["SD"] = numero(df["DESVIO PADRAO REVENDA"])
    df["N"] = numero(df["NUMERO DE POSTOS PESQUISADOS"])
    df["CV"] = numero(df["COEF DE VARIACAO REVENDA"])

    df = df[
        df["ANO_MES"].notna()
        & df["PRECO"].gt(0)
        & df["N"].gt(0)
    ].copy()
    df["N"] = df["N"].astype(int)
    df["PRODUTO"] = df["PRODUTO_CANON"]
    return df


def main():
    ipca = {x["ano_mes"]: float(x["ipca_indice"]) for x in ler_csv("ipca_indice.csv")}
    salario = {x["ano_mes"]: float(x["salario_minimo_rs"]) for x in ler_csv("salario_minimo.csv")}
    if MES_REAL not in ipca:
        raise SystemExit(f"IPCA de {MES_REAL} ausente")

    partes = []
    fontes = []
    for nome, url, periodo_ini, periodo_fim in ARQUIVOS:
        caminho = FONTES / nome
        if not caminho.exists():
            raise SystemExit(f"arquivo ausente: {caminho}; rode baixar-anp-combustiveis.py")
        df = ler_planilha(caminho)
        df["FONTE_ARQ"] = nome
        df["URL_ARQ"] = url
        partes.append(df)
        produtos_arquivo = sorted(df["PRODUTO"].unique())
        periodo = f"{df['ANO_MES'].min()} a {df['ANO_MES'].max()}"
        fontes.append([
            "; ".join(produtos_arquivo), FONTE, "federal", url, periodo,
            "municipal (27 capitais filtradas)",
            "média, desvio-padrão, nº de postos, CV", "usada",
            "planilha mensal municipal; preço de revenda"
            + ("; S10 não existe antes de 2013" if periodo_ini.startswith("2001") else ""),
        ])
        print(f"{nome}: {len(df)} linhas; {periodo}; {', '.join(produtos_arquivo)}")

    df = pd.concat(partes, ignore_index=True)
    df["IPCA_MES"] = df["ANO_MES"].map(ipca)
    df["SALARIO_MES"] = df["ANO_MES"].map(salario)

    df["PRECO_REAL"] = df["PRECO"] * ipca[MES_REAL] / df["IPCA_MES"]
    df["CV_PCT"] = np.where(
        df["CV"].notna(),
        df["CV"] * 100,
        np.where(df["PRECO"].gt(0), df["SD"] / df["PRECO"] * 100, np.nan),
    )
    df["MARGEM"] = np.where(
        (df["N"] > 1) & df["SD"].notna() & df["PRECO"].gt(0),
        1.96 * df["SD"] / np.sqrt(df["N"]) / df["PRECO"] * 100,
        np.nan,
    )
    df["LITROS"] = np.where(
        df["SALARIO_MES"].notna() & df["PRECO"].gt(0),
        df["SALARIO_MES"] / df["PRECO"],
        np.nan,
    )

    df = df.sort_values(["PRODUTO", "CIDADE", "ANO_MES"]).reset_index(drop=True)
    dup = df.duplicated(["CIDADE", "PRODUTO", "ANO_MES"], keep=False)
    if dup.any():
        print(f"AVISO: {int(dup.sum())} linhas duplicadas; mantendo a primeira de cada chave")
        df = df.drop_duplicates(["CIDADE", "PRODUTO", "ANO_MES"], keep="first")

    linhas = []
    for r in df.itertuples(index=False):
        linhas.append([
            r.CIDADE, r.UF, r.ANO_MES, r.PRODUTO,
            f"{r.PRECO:.4f}", f"{r.PRECO_REAL:.4f}", int(r.N),
            f"{r.SD:.4f}" if pd.notna(r.SD) else "",
            f"{r.CV_PCT:.2f}" if pd.notna(r.CV_PCT) else "",
            f"{r.MARGEM:.2f}" if pd.notna(r.MARGEM) else "",
            f"{r.LITROS:.2f}" if pd.notna(r.LITROS) else "",
            FONTE, URL_ANP,
        ])
    with (PASTA / "diesel_municipal.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO)
        w.writerows(linhas)

    # Cobertura por capital x produto.
    max_mes = df["ANO_MES"].max()
    primeira = {"Diesel comum": "2001-07", "Diesel S10": "2013-01"}
    cob = []
    for produto in ["Diesel S10", "Diesel comum"]:
        for cidade, uf in sorted({(r.CIDADE, r.UF) for r in df.itertuples(index=False)}):
            meses = sorted(df[(df["PRODUTO"] == produto) & (df["CIDADE"] == cidade)]["ANO_MES"].unique())
            esperado_ini = primeira[produto]
            if not meses:
                cob.append([cidade, uf, produto, "", "", 0, intervalo(esperado_ini, max_mes),
                            "sem_dado", f"sem dado de {esperado_ini} a {max_mes}"])
                continue
            ini, fim = meses[0], meses[-1]
            lacunas = intervalo(ini, fim) - len(meses)
            completo = ini == esperado_ini and fim == max_mes and lacunas == 0
            notas = []
            if ini > esperado_ini:
                notas.append(f"sem dado de {esperado_ini} a {deslocar(ini, -1)}")
            if fim < max_mes:
                notas.append(f"sem dado de {deslocar(fim, 1)} a {max_mes}")
            if lacunas:
                notas.append(f"{lacunas} lacunas entre {ini} e {fim}")
            cob.append([cidade, uf, produto, ini, fim, len(meses), lacunas,
                        "completo" if completo else "com_lacunas",
                        "; ".join(notas)])
    with (PASTA / "diesel_cobertura.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_COB)
        w.writerows(cob)

    with (PASTA / "fontes_diesel.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_FONTES)
        w.writerows(fontes)

    print("=" * 70)
    print(f"diesel_municipal.csv: {len(linhas)} linhas")
    print(f"capitais: {df['CIDADE'].nunique()} | produtos: {', '.join(sorted(df['PRODUTO'].unique()))}")
    print(f"meses: {df['ANO_MES'].min()} a {df['ANO_MES'].max()}")
    for produto in ["Diesel S10", "Diesel comum"]:
        sub = df[df["PRODUTO"] == produto]
        print(f"  {produto:13} linhas={len(sub):5} capitais={sub['CIDADE'].nunique():2} "
              f"meses={sub['ANO_MES'].nunique():3} faixa=R$ {sub['PRECO'].min():.3f} a {sub['PRECO'].max():.3f}")
    print(f"diesel_cobertura.csv: {len(cob)} linhas")
    print(f"fontes_diesel.csv: {len(fontes)} linhas")
    print(f"margem amostral: {df['MARGEM'].min():.2f}% a {df['MARGEM'].max():.2f}%")
    print(f"CV entre postos: {df['CV_PCT'].min():.1f}% a {df['CV_PCT'].max():.1f}%")


if __name__ == "__main__":
    main()
