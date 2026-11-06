"""Extende a série de cortes de São Paulo com o IEA 2025-2026 e o INPC.

Regras (decididas com o projeto):
  - São Paulo tem IEA/SP no varejo para 12 cortes em 2025-2026.
  - Os 7 cortes com INPC regional usam o INPC regional para os anos anteriores.
  - Os 4 cortes sem INPC regional em SP (picanha, capa de filé, filé-mignon,
    músculo) usam o INPC nacional. É uma exceção só para São Paulo; as outras
    capitais continuam só com o INPC regional.
  - Capa de filé: regional até 2011, nacional de 2012 em diante.
  - Músculo: regional até 2019, nacional de 2020 em diante.
  - Coxão duro: só IEA 2025-2026; não há INPC.
  - O IEA 2025-2026 observado substitui os valores derivados desses meses.

Entradas:
  assetsexternos/serie_cortes.csv, cobertura_cortes.csv
  assetsexternos/iea_varejo_sp.csv, inpc_carne_cesta.csv, ipca_indice.csv

Saídas (sobrescritas):
  assetsexternos/serie_cortes.csv   (com a coluna fonte_linha)
  assetsexternos/cobertura_cortes.csv

Uso:
  python scripts/baixar-iea-varejo.py
  python scripts/gerar-series.py
  python scripts/gerar-series-sp.py
"""

import csv
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
MES_REAL = "2026-09"
SP = "São Paulo"
UF = "SP"
CORTE_ITEM = {
    "acém": "acem", "alcatra": "alcatra", "capa de filé": "capa de file",
    "contrafilé": "contrafile", "costela": "costela", "coxão mole": "cha de dentro",
    "filé-mignon": "file-mignon", "lagarto": "lagarto comum", "músculo": "musculo",
    "patinho": "patinho", "picanha": "picanha",
}
REGIONAIS = {"acém", "alcatra", "contrafilé", "costela", "coxão mole", "lagarto", "patinho"}
NACIONAIS = {"picanha", "capa de filé", "filé-mignon", "músculo"}
CABECALHO_SERIE = ["cidade", "uf", "corte", "ano_mes", "preco_nominal_rs_kg",
                   "preco_real_set2026_rs_kg", "ancora_tipo", "ancora_mes",
                   "inpc_regiao", "inpc_item", "fonte_linha"]
CABECALHO_COBERTURA = ["cidade", "uf", "corte", "ancora_tipo", "ancora_mes", "status",
                       "inpc_regiao", "inpc_item", "primeiro_mes", "ultimo_mes",
                       "meses_com_valor", "lacunas", "observacao"]


def ler(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def escrever(nome, cabecalho, linhas):
    with (PASTA / nome).open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cabecalho)
        w.writerows(linhas)


def deslocar(ym, n):
    ano, mes = int(ym[:4]), int(ym[5:])
    idx = ano * 12 + (mes - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def cadeia(var, ancora):
    """Fator de cada mês em relação à âncora; para na primeira variação ausente."""
    fator = {ancora: 1.0}
    f, m = 1.0, ancora
    while deslocar(m, 1) in var:
        m = deslocar(m, 1)
        f *= 1 + var[m] / 100
        fator[m] = f
    f, m = 1.0, ancora
    while m in var:
        f /= 1 + var[m] / 100
        m = deslocar(m, -1)
        fator[m] = f
    return fator


def main():
    # Fonte da âncora observada por cidade/corte. Sem isso, toda série fora de
    # São Paulo seria rotulada como "SP × fator", mesmo quando o nível vem de
    # uma pesquisa local (Aracaju, João Pessoa, BH, Fortaleza, Vitória, Rio Branco).
    fonte_obs = {
        (x["cidade"], x["corte"]): x["fonte"]
        for x in ler("ancoras_por_capital.csv")
        if x["lista"] == "padrao" and x["tipo"] == "observado"
    }
    serie = {}
    for x in ler("serie_cortes.csv"):
        chave = (x["cidade"], x["corte"], x["ano_mes"])
        if x["cidade"] == SP:
            x["fonte_linha"] = "IEA + INPC regional"
        elif x["ancora_tipo"] == "observado":
            x["fonte_linha"] = fonte_obs.get((x["cidade"], x["corte"]), "observado") + " + INPC regional"
        else:
            x["fonte_linha"] = "SP × fator + INPC regional"
        serie[chave] = x

    cobertura = {(x["cidade"], x["corte"]): x for x in ler("cobertura_cortes.csv")}
    iea = {(x["ano_mes"], x["corte"]): float(x["preco_rs_kg"])
           for x in ler("iea_varejo_sp.csv")}
    inpc = ler("inpc_carne_cesta.csv")
    ipca = {x["ano_mes"]: float(x["ipca_indice"]) for x in ler("ipca_indice.csv")}
    var = defaultdict(dict)
    for x in inpc:
        if x["variacao_mensal_pct"].strip():
            var[(x["regiao"], x["item_canonico"])][x["ano_mes"]] = float(x["variacao_mensal_pct"])

    def real(valor, mes):
        return valor * ipca[MES_REAL] / ipca[mes]

    def adicionar(corte, mes, nominal, tipo, ancora, regiao, item, fonte):
        serie[(SP, corte, mes)] = {
            "cidade": SP, "uf": UF, "corte": corte, "ano_mes": mes,
            "preco_nominal_rs_kg": f"{nominal:.2f}",
            "preco_real_set2026_rs_kg": f"{real(nominal, mes):.2f}",
            "ancora_tipo": tipo, "ancora_mes": ancora,
            "inpc_regiao": regiao, "inpc_item": item, "fonte_linha": fonte,
        }

    # 7 cortes com INPC regional: os valores de 2025-2026 vêm do IEA.
    for corte in REGIONAIS:
        for (mes, c), valor in iea.items():
            if c == corte:
                adicionar(corte, mes, valor, "observado", mes, "SP", CORTE_ITEM[corte], "IEA/SP")
        for (cid, c, mes), x in list(serie.items()):
            if cid == SP and c == corte:
                x["fonte_linha"] = "IEA + INPC regional"

    def serie_nacional(corte, primeira, regiao_inicial=None):
        """Série com o INPC nacional; regional opcional até um mês."""
        item = CORTE_ITEM[corte]
        nac = var[("NACIONAL", item)]
        fac_nac = cadeia(nac, "2026-08")
        fac_reg = {}
        if regiao_inicial:
            reg = var[("SP", item)]
            fac_reg[regiao_inicial] = fac_nac[regiao_inicial]
            f, m = fac_reg[regiao_inicial], regiao_inicial
            while m in reg:
                f /= 1 + reg[m] / 100
                m = deslocar(m, -1)
                fac_reg[m] = f
        for m in sorted(set(fac_nac) | set(fac_reg)):
            if m < primeira:
                continue
            if regiao_inicial and m <= regiao_inicial:
                f = fac_reg[m]
                regiao, fonte = "SP", "IEA + INPC regional"
            else:
                f = fac_nac[m]
                regiao, fonte = "NACIONAL", "IEA + INPC nacional"
            if m not in nac and not (regiao_inicial and m <= regiao_inicial and m in fac_reg):
                continue
            adicionar(corte, m, float(next(x["preco_rs_kg"] for x in iea_ancora if x["corte"] == corte)) * f,
                      "derivado", "2026-08", regiao, item, fonte)

    # A âncora de cada corte é o IEA de ago/2026 (o valor da tabela de 2026).
    iea_ancora = [{"corte": c, "preco_rs_kg": v} for (m, c), v in iea.items() if m == "2026-08"]

    serie_nacional("picanha", "2020-01")
    serie_nacional("capa de filé", "2008-01", "2011-12")
    serie_nacional("músculo", "2008-01")
    serie_nacional("filé-mignon", "2008-01")

    # Coxão duro: só IEA.
    for (mes, c), valor in iea.items():
        if c == "coxão duro":
            adicionar(c, mes, valor, "observado", mes, "", "", "IEA/SP")

    # O IEA 2025-2026 observado substitui o derivado nos quatro cortes nacionais.
    for corte in NACIONAIS:
        for (mes, c), valor in iea.items():
            if c == corte:
                adicionar(corte, mes, valor, "observado", mes,
                          "SP + NACIONAL" if corte in ("capa de filé", "músculo") else "NACIONAL",
                          CORTE_ITEM[corte], "IEA/SP")

    # Cobertura.
    for corte in REGIONAIS:
        c = cobertura[(SP, corte)]
        c["observacao"] = "IEA 2025-2026; INPC regional"
        c["ancora_tipo"] = "observado"
        c["ancora_mes"] = "2026-08"
        c["inpc_regiao"] = "SP"
        c["inpc_item"] = CORTE_ITEM[corte]
    for corte in NACIONAIS:
        meses = sorted(m for (cid, c, m) in serie if cid == SP and c == corte)
        c = cobertura[(SP, corte)]
        c.update({
            "status": "serie", "ancora_tipo": "observado", "ancora_mes": "2026-08",
            "inpc_regiao": "SP + NACIONAL" if corte == "capa de filé" else "NACIONAL",
            "inpc_item": CORTE_ITEM[corte], "primeiro_mes": meses[0], "ultimo_mes": meses[-1],
            "meses_com_valor": str(len(meses)), "lacunas": str(
                (int(meses[-1][:4]) * 12 + int(meses[-1][5:])) -
                (int(meses[0][:4]) * 12 + int(meses[0][5:])) + 1 - len(meses)),
            "observacao": "IEA 2025-2026; INPC nacional" + (
                "; regional até 2011" if corte == "capa de filé" else
                "; regional com falhas, não usado" if corte == "músculo" else ""),
        })
    meses = sorted(m for (cid, c, m) in serie if cid == SP and c == "coxão duro")
    c = cobertura[(SP, "coxão duro")]
    c.update({
        "status": "serie", "ancora_tipo": "observado", "ancora_mes": "2026-08",
        "inpc_regiao": "", "inpc_item": "", "primeiro_mes": meses[0], "ultimo_mes": meses[-1],
        "meses_com_valor": str(len(meses)), "lacunas": "0",
        "observacao": "Só IEA/SP 2025-2026; sem INPC",
    })

    escrever("serie_cortes.csv", CABECALHO_SERIE,
             [[serie[k][h] for h in CABECALHO_SERIE] for k in sorted(serie)])
    escrever("cobertura_cortes.csv", CABECALHO_COBERTURA,
             [[cobertura[k][h] for h in CABECALHO_COBERTURA] for k in sorted(cobertura)])

    sp = [x for x in serie.values() if x["cidade"] == SP]
    print(f"São Paulo: {len({x['corte'] for x in sp})} cortes, "
          f"{len(sp)} linhas, {min(x['ano_mes'] for x in sp)} a {max(x['ano_mes'] for x in sp)}")
    for corte in sorted({x["corte"] for x in sp}):
        xs = sorted(x["ano_mes"] for x in sp if x["corte"] == corte)
        print(f"  {corte:14} {xs[0]}..{xs[-1]}  {len(xs)} meses")


if __name__ == "__main__":
    main()
