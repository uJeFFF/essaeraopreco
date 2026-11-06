"""Baixa o salário mínimo nominal mensal da tabela do DIEESE.

Fonte: DIEESE, "Salário mínimo nominal e necessário"
(https://www.dieese.org.br/analisecestabasica/salarioMinimo.html).
Usamos a coluna "Salário mínimo nominal", que é o valor em vigor no mês.
A coluna "necessário" é outra coisa (o valor para comprar a cesta básica
inteira) e não entra no cálculo.

Saída:
  assetsexternos/salario_minimo.csv
  ano_mes;salario_minimo_rs   (jul/1994 a set/2026)

Uso:
  python scripts/baixar-salario-minimo.py
"""

import csv
import html as htmlmod
import re
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "assetsexternos" / "salario_minimo.csv"
URL = "https://www.dieese.org.br/analisecestabasica/salarioMinimo.html"
MESES = {
    "Janeiro": 1, "Fevereiro": 2, "Março": 3, "Abril": 4, "Maio": 5, "Junho": 6,
    "Julho": 7, "Agosto": 8, "Setembro": 9, "Outubro": 10, "Novembro": 11, "Dezembro": 12,
}


def limpar(trecho):
    return htmlmod.unescape(re.sub(r"<[^>]+>", "", trecho)).replace("\xa0", " ").strip()


def main():
    pedido = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pedido, timeout=90) as resposta:
        pagina = resposta.read().decode("utf-8", "replace")

    linhas = re.findall(r"<tr[^>]*>(.*?)</tr>", pagina, re.S)
    ano = None
    dados = {}
    for linha in linhas:
        celulas = [limpar(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", linha, re.S)]
        if len(celulas) == 1 and re.fullmatch(r"\d{4}", celulas[0]):
            ano = int(celulas[0])
            continue
        if ano is None or len(celulas) < 2 or celulas[0] not in MESES:
            continue
        bruto = celulas[1].replace("R$", "").replace(".", "").replace(",", ".").strip()
        if not bruto:
            continue
        dados[f"{ano:04d}-{MESES[celulas[0]]:02d}"] = float(bruto)

    if len(dados) < 300:
        raise SystemExit(f"esperados ~387 meses, encontrados {len(dados)}")
    if "1994-07" not in dados or dados["1994-07"] != 64.79:
        raise SystemExit("1994-07 deveria ser R$ 64,79")
    if "2026-09" not in dados or dados["2026-09"] != 1621.00:
        raise SystemExit("2026-09 deveria ser R$ 1.621,00")

    with SAIDA.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ano_mes", "salario_minimo_rs"])
        for ano_mes in sorted(dados):
            w.writerow([ano_mes, f"{dados[ano_mes]:.2f}"])

    print(f"gravado: {SAIDA} ({len(dados)} meses, {min(dados)} a {max(dados)})")
    print(f"1994-07: R$ {dados['1994-07']:.2f} | 2008-12: R$ {dados['2008-12']:.2f} | "
          f"2026-09: R$ {dados['2026-09']:.2f}")


if __name__ == "__main__":
    main()
