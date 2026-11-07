"""Gera web/dados/combustiveis.json para a seção de diesel da página 09.

Entrada (assetsexternos/):
  diesel_municipal.csv

Saída:
  web/dados/combustiveis.json

Regras:
  - Cada célula é dezembro do ano; 2026 = set/2026 (último mês mensal).
  - Sem interpolação: mês sem dado vira null e a página hachura.
  - Preço real em R$/L de set/2026; litros = salário mínimo nominal / preço nominal.
  - Margem por célula = margem amostral da média (1,96 x desvio / sqrt(n)).
  - CV por célula = desvio / média.

Uso:
  python scripts/gerar-serie-diesel.py
  python scripts/gerar-combustiveis.py
"""

import csv
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
SAIDA = RAIZ / "web" / "dados" / "combustiveis.json"
MES_2026 = "2026-09"
PRODUTOS = ["Diesel S10", "Diesel comum"]


def ler(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def numero(valor):
    if valor is None or str(valor).strip() == "":
        return None
    return float(str(valor).replace(",", "."))


def painel(por_chave, capitais, anos, campo, unidade):
    valores, referencia, margem, cv, n = [], [], [], [], []
    for cidade in capitais:
        linha_v, linha_r, linha_m, linha_cv, linha_n = [], [], [], [], []
        for ano in anos:
            mes = MES_2026 if ano == 2026 else f"{ano}-12"
            r = por_chave.get((cidade, mes))
            if r is None:
                linha_v.append(None)
                linha_r.append("")
                linha_m.append(None)
                linha_cv.append(None)
                linha_n.append(None)
                continue
            v = numero(r.get(campo))
            linha_v.append(round(v, 4) if v is not None else None)
            linha_r.append(mes)
            linha_m.append(numero(r.get("margem_pct")))
            linha_cv.append(numero(r.get("coef_variacao_pct")))
            nv = numero(r.get("num_postos"))
            linha_n.append(int(nv) if nv is not None else None)
        valores.append(linha_v)
        referencia.append(linha_r)
        margem.append(linha_m)
        cv.append(linha_cv)
        n.append(linha_n)
    planos = [v for linha in valores for v in linha if v is not None]
    return {
        "valores": valores,
        "referencia": referencia,
        "margem_celula": margem,
        "cv_celula": cv,
        "n_celula": n,
        "min": round(min(planos), 4) if planos else None,
        "max": round(max(planos), 4) if planos else None,
        "unidade": unidade,
    }


def main():
    linhas = ler("diesel_municipal.csv")
    if not linhas:
        raise SystemExit("diesel_municipal.csv vazio; rode gerar-serie-diesel.py")
    capitais = sorted({(r["cidade"], r["uf"]) for r in linhas})
    anos = list(range(2001, 2027))

    produtos = {}
    for produto in PRODUTOS:
        sub = [r for r in linhas if r["produto"] == produto]
        if not sub:
            continue
        por_chave = {(r["cidade"], r["ano_mes"]): r for r in sub}
        meses = sorted({r["ano_mes"] for r in sub})
        preco = painel(por_chave, [c for c, _ in capitais], anos,
                       "preco_real_set2026_rs_l", "R$/L")
        litros = painel(por_chave, [c for c, _ in capitais], anos,
                        "litros_por_salario", "L")
        produtos[produto] = {
            "nome": produto,
            "periodo": f"{meses[0]} a {meses[-1]}",
            "cidades_com_dado": len({r["cidade"] for r in sub}),
            "meses_com_dado": len({r["ano_mes"] for r in sub}),
            "preco": preco,
            "litros": litros,
        }

    dados = {
        "atualizado": "2026-11-06",
        "unidade": "R$/L de set/2026",
        "regra": "dezembro de cada ano; 2026 = set/2026",
        "fonte": "ANP - Levantamento de Preços (revenda)",
        "url": ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
                "precos/precos-revenda-e-de-distribuicao-combustiveis/"
                "serie-historica-do-levantamento-de-precos"),
        "margem_formula": "1,96 × desvio-padrão / sqrt(n) / média",
        "cv_formula": "desvio-padrão / média",
        "anos": anos,
        "capitais": [{"nome": c, "uf": u} for c, u in capitais],
        "produtos": produtos,
    }

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")),
                     encoding="utf-8")
    print(f"gravado: {SAIDA} ({SAIDA.stat().st_size // 1024} KB)")
    for nome, p in produtos.items():
        print(f"  {nome}: {p['periodo']} | capitais={p['cidades_com_dado']} "
              f"meses={p['meses_com_dado']} | R$ {p['preco']['min']} a {p['preco']['max']} | "
              f"litros {p['litros']['min']} a {p['litros']['max']}")


if __name__ == "__main__":
    main()
