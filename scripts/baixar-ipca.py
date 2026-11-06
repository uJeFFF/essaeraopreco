"""Baixa o IPCA geral (número-índice) do SIDRA e grava assetsexternos/ipca_indice.csv.

Fonte: IBGE, SIDRA, tabela 1737, variável 2266
(IPCA - número-índice, base dezembro de 1993 = 100), todos os meses.

Saída: assetsexternos/ipca_indice.csv (separador ';')
  ano_mes;ipca_indice

Uso:
  python scripts/baixar-ipca.py
"""

import csv
import json
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "assetsexternos" / "ipca_indice.csv"
URL = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all?formato=json"


def main():
    with urllib.request.urlopen(URL, timeout=120) as resp:
        dados = json.loads(resp.read().decode("utf-8"))

    linhas = {}
    for item in dados[1:]:
        cod = item["D3C"]
        ano_mes = f"{cod[:4]}-{cod[4:]}"
        valor = item["V"].strip()
        if valor in ("", "-", "..", "...", "X"):
            continue
        linhas[ano_mes] = float(valor)

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    with SAIDA.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ano_mes", "ipca_indice"])
        for ano_mes in sorted(linhas):
            w.writerow([ano_mes, f"{linhas[ano_mes]:.4f}"])

    print(f"gravado: {SAIDA} ({len(linhas)} meses, {min(linhas)} a {max(linhas)})")


if __name__ == "__main__":
    main()
