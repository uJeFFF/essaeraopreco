"""Gera as séries de preço da carne em R$/kg, nominal e real (set/2026), por capital.

Duas saídas:

  serie_carne_dieese.csv   carne bovina de primeira (DIEESE), observada, mensal, 27 capitais.
                           Começa em jul/1994: antes disso a fonte está em cruzeiro real.
  serie_cortes.csv         12 cortes por capital, estimados a partir da âncora de 2026
                           e da variação mensal do INPC regional do corte.
  cobertura_cortes.csv     uma linha por capital x corte, com o motivo de cada corte ter
                           ou não série.

Regras dos cortes:
  - A série só existe se a capital tem INPC regional para o corte (16 capitais).
    Não há fallback para o INPC nacional.
  - A variação mensal do INPC regional precisa existir no mês da âncora.
  - Um mês só recebe valor se há variação em todos os meses entre ele e a âncora.
    Buraco na variação interrompe a cadeia: os meses do outro lado ficam vazios.
    Não há interpolação nem preenchimento.
  - Coxão duro não tem subitem no INPC: sem série em nenhuma capital.
  - Preço da âncora: observado (pesquisa) ou derivado (SP x fator DIEESE).

Real: preço nominal x IPCA(set/2026) / IPCA(mês), mesma unidade R$/kg.

Entradas (assetsexternos/):
  ancoras_por_capital.csv, inpc_carne_cesta.csv, dieese_carne.csv, ipca_indice.csv

Uso:
  python scripts/baixar-ipca.py      (uma vez, ou para atualizar)
  python scripts/gerar-series.py
"""

import csv
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
MES_REAL = "2026-09"

INPC_REGIAO = {
    "Aracaju": "AJU", "Belém": "BEL", "Belo Horizonte": "BH", "Brasília": "DF",
    "Campo Grande": "CG", "Curitiba": "CUR", "Fortaleza": "FOR", "Goiânia": "GOI",
    "Porto Alegre": "POA", "Rio Branco": "RB", "Recife": "REC", "Rio de Janeiro": "RJ",
    "Salvador": "SAL", "São Luís": "SL", "São Paulo": "SP", "Vitória": "VIT",
}
CORTE_ITEM = {
    "acém": "acem", "alcatra": "alcatra", "capa de filé": "capa de file",
    "contrafilé": "contrafile", "costela": "costela", "coxão duro": None,
    "coxão mole": "cha de dentro", "filé-mignon": "file-mignon", "lagarto": "lagarto comum",
    "músculo": "musculo", "patinho": "patinho", "picanha": "picanha",
}


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
    """Fator de cada mês em relação à âncora (âncora = 1).

    var: mês -> variação % do mês em relação ao anterior.
    Para na primeira variação ausente, nos dois sentidos.
    """
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
    ancoras = [x for x in ler("ancoras_por_capital.csv") if x["lista"] == "padrao"]
    inpc = ler("inpc_carne_cesta.csv")
    dieese = ler("dieese_carne.csv")
    ipca = {x["ano_mes"]: float(x["ipca_indice"]) for x in ler("ipca_indice.csv")}
    uf = {x["cidade"]: x["uf"] for x in ancoras}

    var = defaultdict(dict)
    for x in inpc:
        if x["variacao_mensal_pct"].strip():
            var[(x["regiao"], x["item_canonico"])][x["ano_mes"]] = float(x["variacao_mensal_pct"])
    ultimo_inpc = max(m for d in var.values() for m in d)

    def real(valor, mes):
        return valor * ipca[MES_REAL] / ipca[mes]

    # ---- carne DIEESE (observada) ----
    carne = []
    capitais = set()
    for x in sorted(dieese, key=lambda x: (x["cidade"], x["ano_mes"])):
        if x["e_capital"] != "1" or not x["preco_carne_rs_kg"].strip():
            continue
        # Jan-jun/1994 estão em cruzeiro real na fonte; a série em R$ começa
        # em julho de 1994, quando o real entrou em vigor.
        if x["ano_mes"] < "1994-07":
            continue
        p = float(x["preco_carne_rs_kg"])
        capitais.add(x["cidade"])
        carne.append([x["cidade"], uf[x["cidade"]], x["ano_mes"], f"{p:.2f}",
                      f"{real(p, x['ano_mes']):.2f}", x["fonte"], x["url"]])
    if len(capitais) != 27:
        raise SystemExit(f"esperadas 27 capitais na carne DIEESE, encontradas {len(capitais)}")

    # ---- cortes (estimados) ----
    cortes, cobertura = [], []
    for x in ancoras:
        cid, corte, a = x["cidade"], x["corte"], x["ano_mes"]
        preco_a = float(x["preco_rs_kg"])
        regiao, item = INPC_REGIAO.get(cid), CORTE_ITEM.get(corte)
        base = [cid, x["uf"], corte, x["tipo"], a]
        extra = [regiao or "", item or ""]
        obs = ""
        serie_inpc = var[(regiao, item)] if regiao and item else {}
        ult = max(serie_inpc) if serie_inpc else ""
        if regiao is None:
            status = "sem_inpc_regional"
        elif item is None:
            status = "sem_item_inpc"
        elif not serie_inpc:
            status = "sem_serie_regional_no_mes_ancora"
            obs = "INPC regional não existe para o corte"
        elif a in serie_inpc:
            status = "serie"
        elif a > ultimo_inpc and ult == ultimo_inpc:
            status = "aguarda_inpc"
            obs = f"INPC de {a} ainda não publicado (último: {ultimo_inpc})"
        else:
            status = "sem_serie_regional_no_mes_ancora"
            obs = f"INPC regional termina em {ult}"
        if status == "serie":
            fator = cadeia(var[(regiao, item)], a)
            meses = sorted(fator)
            for m in meses:
                nominal = preco_a * fator[m]
                if m == a and f"{nominal:.2f}" != f"{preco_a:.2f}":
                    raise SystemExit(f"âncora não reproduzida: {cid} {corte} {a}")
                r = real(nominal, m) if m in ipca else None
                cortes.append([cid, x["uf"], corte, m, f"{nominal:.2f}",
                               f"{r:.2f}" if r is not None else "", x["tipo"], a, regiao, item])
            intervalo = len(meses) and (
                (int(meses[-1][:4]) * 12 + int(meses[-1][5:])) - (int(meses[0][:4]) * 12 + int(meses[0][5:])) + 1)
            lacunas = intervalo - len(meses)
            obs = f"lacunas: {lacunas} meses" if lacunas else ""
            cobertura.append(base + [status, *extra, meses[0], meses[-1], len(meses), lacunas, obs])
            continue
        cobertura.append(base + [status, *extra, "", "", 0, 0, obs])

    escrever("serie_carne_dieese.csv",
             ["cidade", "uf", "ano_mes", "preco_nominal_rs_kg", "preco_real_set2026_rs_kg", "fonte", "fonte_url"],
             carne)
    escrever("serie_cortes.csv",
             ["cidade", "uf", "corte", "ano_mes", "preco_nominal_rs_kg", "preco_real_set2026_rs_kg",
              "ancora_tipo", "ancora_mes", "inpc_regiao", "inpc_item"],
             cortes)
    escrever("cobertura_cortes.csv",
             ["cidade", "uf", "corte", "ancora_tipo", "ancora_mes", "status", "inpc_regiao", "inpc_item",
              "primeiro_mes", "ultimo_mes", "meses_com_valor", "lacunas", "observacao"],
             cobertura)

    from collections import Counter
    st = Counter(r[5] for r in cobertura)
    print(f"carne DIEESE: {len(carne)} linhas em {len(capitais)} capitais")
    print(f"cortes: {len(cortes)} linhas de série; pares cidade x corte: {len(cobertura)}")
    for k, v in st.most_common():
        print(f"  {k:34} {v}")


if __name__ == "__main__":
    main()
