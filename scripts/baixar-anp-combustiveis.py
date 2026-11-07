"""Baixa as planilhas mensais municipais da ANP (Levantamento de Preços).

Fonte: ANP - Série Histórica do Levantamento de Preços, planilhas mensais por
município, preço de revenda. São seis arquivos:
  2001-07 a 2012-12  (.xlsb)
  2013-01 a 2015-12
  2016-01 a 2018-12
  2019-01 a 2021-12
  2022-01 a 2025-12
  2026-01 em diante  (atualizado mensalmente)

Os arquivos brutos ficam em data/fontes/anp/ (ignorado pelo git). O CSV final,
pequeno, fica em assetsexternos/.

Uso:
  python scripts/baixar-anp-combustiveis.py
  python scripts/baixar-anp-combustiveis.py --forcar
"""

import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "fontes" / "anp"

BASE = ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
        "precos/precos-revenda-e-de-distribuicao-combustiveis/shlp")
PAGINA = f"{BASE}/mensal/mensal-municipios-desde-jan2026.xlsx"

ARQUIVOS = {
    "mensal-municipios-2001-a-2012.xlsb": f"{BASE}/2001-2012/mensal-municipios-2001-a-2012.xlsb",
    "mensal-municipios-2013-a-2015.xlsx": f"{BASE}/mensal/mensal-municipios-2013-a-2015.xlsx",
    "mensal-municipios-2016-a-2018.xlsx": f"{BASE}/mensal/mensal-municipios-2016-a-2018.xlsx",
    "mensal-municipios-2019-a-2021.xlsx": f"{BASE}/mensal/mensal-municipios-2019-a-2021.xlsx",
    "mensal-municipios-jan2022-2025.xlsx": f"{BASE}/mensal/mensal-municipios-jan2022-2025.xlsx",
    "mensal-municipios-desde-jan2026.xlsx": PAGINA,
}
REFERER = ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
           "precos/precos-revenda-e-de-distribuicao-combustiveis/"
           "serie-historica-do-levantamento-de-precos")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")


def valido(caminho):
    if not caminho.exists() or caminho.stat().st_size < 100_000:
        return False
    with caminho.open("rb") as f:
        return f.read(2) == b"PK"


def baixar_urllib(url, destino):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": REFERER,
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,"
                  "application/vnd.ms-excel.sheet.binary.macroEnabled.12,*/*",
    })
    with urllib.request.urlopen(req, timeout=180) as resposta, destino.open("wb") as f:
        shutil.copyfileobj(resposta, f)


def baixar_curl(url, destino):
    subprocess.run([
        "curl", "-k", "-L", "--max-time", "300", "-sS",
        "-A", UA, "-e", REFERER, "-o", str(destino), url,
    ], check=True)


def baixar(nome, url, forcar=False):
    destino = DESTINO / nome
    # O arquivo de 2026 muda todo mês; os históricos ficam em cache.
    precisa = forcar or nome.endswith("desde-jan2026.xlsx") or not valido(destino)
    if not precisa:
        print(f"ok       {nome} ({destino.stat().st_size // 1024} KB, cache)")
        return destino
    print(f"baixando {nome} ...")
    try:
        baixar_urllib(url, destino)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as erro:
        print(f"  urllib falhou ({erro}); tentando curl")
        baixar_curl(url, destino)
    if not valido(destino):
        raise SystemExit(f"arquivo inválido: {destino}")
    print(f"ok       {nome} ({destino.stat().st_size // 1024} KB)")
    return destino


def main():
    forcar = "--forcar" in sys.argv[1:]
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome, url in ARQUIVOS.items():
        baixar(nome, url, forcar=forcar)
    print(f"{len(ARQUIVOS)} arquivos em {DESTINO}")


if __name__ == "__main__":
    main()
