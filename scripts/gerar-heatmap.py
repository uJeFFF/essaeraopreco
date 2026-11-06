"""Gera web/dados/heatmap.json para a página 09.

Preço real (R$/kg de set/2026) e percentual do salário mínimo.
Cada célula é o preço de DEZEMBRO do ano; 2026 usa o último mês disponível
(SP: ago/2026, o último IEA observado; demais: set/2026). Não há média anual.

Margens:
  nível   = erro do nível derivado (validação cidade x corte, 2026)
  caminho = erro do INPC contra o IEA 2025-2026, corte por corte
  total   = sqrt(nível^2 + caminho^2)
  soma    = nível + caminho (limite superior conservador)

Entradas (assetsexternos/):
  serie_carne_dieese.csv, serie_cortes.csv, cobertura_cortes.csv,
  ancoras_validacao.csv, ancoras_por_capital.csv, iea_varejo_sp.csv,
  salario_minimo.csv, inpc_carne_cesta.csv, ipca_indice.csv

Saída:
  web/dados/heatmap.json

Uso:
  python scripts/gerar-heatmap.py
"""

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
SAIDA = RAIZ / "web" / "dados" / "heatmap.json"
URL_SALARIO = "https://www.dieese.org.br/analisecestabasica/salarioMinimo.html"
ANOS_CARNE = list(range(1994, 2027))
ANOS_CORTES = list(range(2008, 2027))
ORDEM_CORTES = [
    "acém", "alcatra", "capa de filé", "contrafilé", "costela", "coxão duro",
    "coxão mole", "filé-mignon", "lagarto", "músculo", "patinho", "picanha",
]
CORTE_ITEM = {
    "acém": "acem", "alcatra": "alcatra", "capa de filé": "capa de file",
    "contrafilé": "contrafile", "costela": "costela", "coxão mole": "cha de dentro",
    "filé-mignon": "file-mignon", "lagarto": "lagarto comum", "músculo": "musculo",
    "patinho": "patinho", "picanha": "picanha",
}
NACIONAIS = {"picanha", "capa de filé", "filé-mignon", "músculo"}


def ler(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def deslocar(ym, n):
    ano, mes = int(ym[:4]), int(ym[5:])
    idx = ano * 12 + (mes - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def cadeia(var, ancora):
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


def agregar_pontos(por_chave, cidades, anos, corte=None):
    """Um valor por ano: dezembro; 2026 é tratado fora, pelo chamador."""
    valores, referencia, fonte, natureza = [], [], [], []
    for cidade in cidades:
        lv, lr, lf, ln = [], [], [], []
        for ano in anos:
            x = por_chave.get((cidade, ano))
            lv.append(round(float(x["preco_real_set2026_rs_kg"]), 2) if x else None)
            lr.append(x["ano_mes"] if x else "")
            lf.append(x.get("fonte_linha", "DIEESE") if x else "")
            ln.append(x.get("natureza", "") if x else "")
        valores.append(lv); referencia.append(lr); fonte.append(lf); natureza.append(ln)
    planos = [v for linha in valores for v in linha if v is not None]
    return valores, referencia, fonte, natureza, min(planos), max(planos)


def main():
    carne = ler("serie_carne_dieese.csv")
    cortes = ler("serie_cortes.csv")
    iea = {(x["ano_mes"], x["corte"]): float(x["preco_rs_kg"])
           for x in ler("iea_varejo_sp.csv")}
    salario = {x["ano_mes"]: float(x["salario_minimo_rs"])
               for x in ler("salario_minimo.csv")}
    ipca = {x["ano_mes"]: float(x["ipca_indice"]) for x in ler("ipca_indice.csv")}
    inpc = ler("inpc_carne_cesta.csv")
    var = defaultdict(dict)
    for x in inpc:
        if x["variacao_mensal_pct"].strip():
            var[(x["regiao"], x["item_canonico"])][x["ano_mes"]] = float(x["variacao_mensal_pct"])

    # Âncoras observadas de 2026 que não geram série (cidade sem INPC regional,
    # como Palmas). Entram como ponto único no ano de 2026; os outros anos
    # continuam vazios, sem interpolação.
    ancoras = ler("ancoras_por_capital.csv")
    obs_2026 = {
        (x["cidade"], x["corte"]): x
        for x in ancoras
        if x["lista"] == "padrao" and x["tipo"] == "observado"
        and x["ano_mes"] in ("2026-08", "2026-09")
    }

    # ----- margem de nível: validação cidade x corte -----
    val = ler("ancoras_validacao.csv")
    por_corte = defaultdict(list)
    por_cidade = defaultdict(list)
    for x in val:
        e = abs(float(x["erro_pct"]))
        por_corte[x["corte"]].append(e)
        por_cidade[x["cidade"]].append(e)
    geral = statistics.mean(abs(float(x["erro_pct"])) for x in val)
    nivel_corte = {}
    for c in ORDEM_CORTES:
        xs = por_corte.get(c, [])
        nivel_corte[c] = {
            "nivel": round(statistics.mean(xs), 1) if len(xs) >= 2 else round(geral, 1),
            "nivel_n": len(xs),
        }

    # ----- margem de caminho: IEA 2025-2026 contra o INPC -----
    caminho = {}
    for c in ORDEM_CORTES:
        item = CORTE_ITEM.get(c)
        if not item:
            caminho[c] = {"caminho": None, "caminho_n": 0}
            continue
        regiao = "NACIONAL" if c in NACIONAIS else "SP"
        fac = cadeia(var[(regiao, item)], "2026-08")
        ancora = iea.get(("2026-08", c))
        res = []
        for (m, cc), v in iea.items():
            if cc != c or m == "2026-08" or m not in fac:
                continue
            res.append(v / (ancora * fac[m]) - 1)
        caminho[c] = {
            "caminho": round(statistics.mean(abs(x) for x in res) * 100, 1) if res else None,
            "caminho_n": len(res),
        }

    margens = {
        "geral": {"nivel": round(geral, 1), "n": len(val)},
        "cortes": {},
        "cidades": {c: {"nivel": round(statistics.mean(xs), 1), "n": len(xs)}
                    for c, xs in sorted(por_cidade.items())},
        "observado": {
            "iea": "não publicada",
            "diese": "não publicada",
            "procons": "amostra da fonte",
        },
        "salario_minimo": "o salário é exato; o % herda a margem do preço",
    }
    for c in ORDEM_CORTES:
        n = nivel_corte[c]["nivel"]
        p = caminho[c]["caminho"]
        if p is None:
            total = soma = None
        else:
            total = round((n ** 2 + p ** 2) ** 0.5, 1)
            soma = round(n + p, 1)
        margens["cortes"][c] = {
            "nivel": n, "nivel_n": nivel_corte[c]["nivel_n"],
            "caminho": p, "caminho_n": caminho[c]["caminho_n"],
            "total": total, "soma": soma,
        }

    # ----- pontos: dezembro; 2026 = último mês disponível -----
    cidades = sorted({x["cidade"] for x in carne})
    por_carne = defaultdict(dict)
    for x in carne:
        por_carne[(x["cidade"], x["ano_mes"][:4])][x["ano_mes"]] = x
    carne_pontos = {}
    for c in cidades:
        for ano in ANOS_CARNE:
            mes = f"{ano}-12" if ano < 2026 else "2026-09"
            x = por_carne[(c, str(ano))].get(mes)
            if x:
                x = dict(x); x["natureza"] = "observado"; x["fonte_linha"] = "DIEESE"
            carne_pontos[(c, ano)] = x

    por_corte = defaultdict(dict)
    for x in cortes:
        por_corte[(x["cidade"], x["corte"], x["ano_mes"][:4])][x["ano_mes"]] = x
    corte_pontos = {}
    for c in cidades:
        for corte in ORDEM_CORTES:
            for ano in ANOS_CORTES:
                if ano == 2026:
                    mes = "2026-08" if c == "São Paulo" else "2026-09"
                else:
                    mes = f"{ano}-12"
                x = por_corte[(c, corte, str(ano))].get(mes)
                if not x and ano == 2026:
                    o = obs_2026.get((c, corte))
                    if o:
                        nominal = float(o["preco_rs_kg"])
                        real = (nominal * ipca["2026-09"] / ipca[o["ano_mes"]]
                                if o["ano_mes"] in ipca else nominal)
                        x = {
                            "ano_mes": o["ano_mes"],
                            "preco_nominal_rs_kg": f"{nominal:.2f}",
                            "preco_real_set2026_rs_kg": f"{real:.2f}",
                            "fonte_linha": o["fonte"],
                            "natureza": "observado",
                            "ancora_tipo": "observado",
                        }
                elif x:
                    x = dict(x)
                    if x.get("natureza") != "observado":
                        x["natureza"] = "observado" if x["fonte_linha"] == "IEA/SP" else "estimado"
                corte_pontos[(c, corte, ano)] = x

    def percentual(x):
        if not x or x["ano_mes"] not in salario:
            return None
        return round(float(x["preco_nominal_rs_kg"]) / salario[x["ano_mes"]] * 100, 2)

    valores, referencia, fonte, natureza, vmin, vmax = agregar_pontos(
        carne_pontos, cidades, ANOS_CARNE)
    pct = [[percentual(carne_pontos[(c, ano)]) for ano in ANOS_CARNE] for c in cidades]
    pct_planos = [v for linha in pct for v in linha if v is not None]
    carne_json = {
        "natureza": "observado", "valores": valores, "referencia": referencia,
        "fonte": fonte, "natureza_celula": natureza, "min": vmin, "max": vmax,
        "percentual": {
            "valores": pct, "min": min(pct_planos), "max": max(pct_planos),
            "referencia": referencia, "fonte": fonte,
            "natureza_celula": natureza, "margem": None,
        },
    }

    blocos = {}
    for corte in ORDEM_CORTES:
        v, ref, f, nat, lo, hi = agregar_pontos(
            {(c, ano): corte_pontos[(c, corte, ano)] for c in cidades for ano in ANOS_CORTES},
            cidades, ANOS_CORTES)
        pc = [[percentual(corte_pontos[(c, corte, ano)]) for ano in ANOS_CORTES] for c in cidades]
        pp = [x for linha in pc for x in linha if x is not None]
        com_serie = sum(1 for linha in v if any(x is not None for x in linha))
        if not com_serie:
            continue
        blocos[corte] = {
            "natureza": "estimado", "valores": v, "referencia": ref, "fonte": f,
            "natureza_celula": nat, "min": lo, "max": hi,
            "margem": margens["cortes"][corte],
            "percentual": {
                "valores": pc, "min": min(pp), "max": max(pp),
                "referencia": ref, "fonte": f, "natureza_celula": nat,
                "margem": margens["cortes"][corte],
            } if pp else None,
            "cidades_com_serie": com_serie,
        }

    dados = {
        "atualizado": "2026-11-06",
        "unidade": "R$/kg de set/2026",
        "regra": "dezembro de cada ano; 2026 = último mês disponível (SP: ago/2026; demais: set/2026)",
        "anos_carne": ANOS_CARNE,
        "anos_cortes": ANOS_CORTES,
        "capitais": [{"nome": c, "uf": next(x["uf"] for x in carne if x["cidade"] == c)}
                     for c in cidades],
        "carne": carne_json,
        "cortes": blocos,
        "margens": margens,
        "salario_minimo": {
            "fonte": "DIEESE", "url": URL_SALARIO,
            "primeiro": min(salario), "ultimo": max(salario),
        },
        "coxao_duro": {
            "nota": "SP: IEA 2025-2026; sem INPC. Nas demais capitais, sem série."
        },
    }

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")),
                     encoding="utf-8")

    print(f"gravado: {SAIDA} ({SAIDA.stat().st_size // 1024} KB)")
    print(f"carne: {len(cidades)} capitais; R$ {vmin} a R$ {vmax}")
    for corte, b in blocos.items():
        m = b["margem"]
        print(f"  {corte:14} cidades={b['cidades_com_serie']:2}  "
              f"R$ {b['min']} a R$ {b['max']}  "
              f"nível={m['nivel']}% caminho={m['caminho']}% total={m['total']}%")
    print("margens:", json.dumps(margens["cortes"], ensure_ascii=False))


if __name__ == "__main__":
    main()
