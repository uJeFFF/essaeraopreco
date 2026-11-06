"""Deriva a tabela de âncoras por capital: 27 capitais x 12 cortes da lista IEA, mais extras observados.

Entradas (assetsexternos/):
  ancoras_observadas.csv    preços observados, com fonte, data, estatística e canal
  dieese_fatores_vs_sp.csv  razão mensal cidade/SP do preço da carne (DIEESE)

Regras:
  - Referência: São Paulo (IEA, ago/2026), 12 cortes.
  - Fator regional = mediana do fator em jun, jul e ago/2026.
  - Capital com corte observado: usa o observado. Observação de 2022 não é usada (não inflacionada).
  - Observação anterior a 2026 não entra na validação de nível (defasagem), mas pode ser usada
    como âncora de nível e para começar a série. É o caso de Aracaju (set/2025).
  - Capital sem corte observado: derivado = preço de SP x fator.
  - Margem do derivado = erro absoluto médio medido na validação para o corte (se houver
    pelo menos 2 comparações), senão a média geral.
  - Método: A = observado + INPC regional; B = observado + INPC nacional; C = derivado.

Saídas (assetsexternos/):
  ancoras_por_capital.csv   tabela de âncoras (linhas padrão + extras observados)
  ancoras_validacao.csv     comparações derivado x observado nas cidades com corte observado

Uso:
  python scripts/derivar-ancoras.py
"""

import csv
import statistics
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
REFERENCIA = "São Paulo"
MES_ANCORA = "2026-08"
MESES_FATOR = ["2026-06", "2026-07", "2026-08"]
URL_IEA = "https://infoiea.agricultura.sp.gov.br/nia1/Precos_Medios.aspx?cod_sis=4"
URL_DIEESE = "https://www.dieese.org.br/cesta/"

UF = {
    "Aracaju": "SE", "Belém": "PA", "Belo Horizonte": "MG", "Boa Vista": "RR", "Brasília": "DF",
    "Campo Grande": "MS", "Cuiabá": "MT", "Curitiba": "PR", "Florianópolis": "SC", "Fortaleza": "CE",
    "Goiânia": "GO", "João Pessoa": "PB", "Macapá": "AP", "Maceió": "AL", "Manaus": "AM",
    "Natal": "RN", "Palmas": "TO", "Porto Alegre": "RS", "Porto Velho": "RO", "Recife": "PE",
    "Rio Branco": "AC", "Rio de Janeiro": "RJ", "Salvador": "BA", "São Luís": "MA",
    "São Paulo": "SP", "Teresina": "PI", "Vitória": "ES",
}
# Capitais com índice regional no INPC (16). As demais usam o INPC nacional.
INPC_REGIONAL = {
    "Rio de Janeiro", "Porto Alegre", "Belo Horizonte", "Recife", "São Paulo", "Brasília", "Belém",
    "Fortaleza", "Salvador", "Curitiba", "Goiânia", "Vitória", "Campo Grande", "Rio Branco",
    "São Luís", "Aracaju",
}
NOTA = {
    "Recife": "observação de 2022 (Procon-PE) existe e não foi usada: não inflacionada",
    "Aracaju": ("observação de set/2025 usada como nível; não entra na validação de 2026 "
                "por defasagem de 11 meses"),
}
CABECALHO = ["ano_mes", "cidade", "uf", "corte", "lista", "preco_rs_kg", "tipo", "metodo",
             "inpc_serie", "fonte", "fonte_url", "fator_dieese", "meses_fator", "fonte_fator_url",
             "margem_pct", "margem_texto", "calculo", "observacao"]


def ler(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def escrever(nome, cabecalho, linhas):
    with (PASTA / nome).open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cabecalho)
        w.writerows(linhas)


def mediana_fator(serie, cidade):
    xs = [serie[cidade][m] for m in MESES_FATOR if m in serie[cidade]]
    return statistics.median(xs) if xs else None


def br(x, casas=2):
    s = f"{x:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def linha_observada(cidade, corte, lista, r):
    obs = r["observacao"]
    if lista == "extra":
        obs = (obs + " | " if obs else "") + "corte fora da lista de 12"
    return [r["ano_mes"], cidade, UF[cidade], corte, lista, f'{float(r["preco_rs_kg"]):.2f}',
            "observado", "observado", "regional" if cidade in INPC_REGIONAL else "sem índice regional",
            r["fonte"], r["url"], "", "", "", "", "dispersão não informada pela fonte",
            f'observado: {r["fonte"]}; {r["estatistica"]}; canal: {r["canal"]}', obs]


def linha_derivada(cidade, corte, ref, f, m, validada):
    p = ref * f
    texto = f"±{m:.1f}% · " + (
        "cidade com comparação própria (ver validação)" if validada else "não validado nesta cidade")
    calculo = (f"R$ {br(ref)} (SP, IEA ago/2026) × {br(f, 4)} "
               f"(fator DIEESE {cidade}/SP, mediana jun–ago/2026) = R$ {br(p)}")
    return [MES_ANCORA, cidade, UF[cidade], corte, "padrao", f"{p:.2f}", "derivado", "derivado",
            "regional" if cidade in INPC_REGIONAL else "sem índice regional",
            "IEA/SP (ago/2026) e DIEESE (carne)", URL_IEA, f"{f:.4f}", "jun–ago/2026",
            URL_DIEESE, f"{m:.1f}", texto, calculo, NOTA.get(cidade, "")]


def main():
    obs = ler("ancoras_observadas.csv")
    fat = ler("dieese_fatores_vs_sp.csv")
    serie = defaultdict(dict)
    for r in fat:
        serie[r["cidade"]][r["ano_mes"]] = float(r["fator_vs_sp"])

    capitais = sorted({r["cidade"] for r in fat if r["ano_mes"] == MES_ANCORA and r["e_capital"] == "1"})
    if len(capitais) != 27:
        raise SystemExit(f"esperadas 27 capitais, encontradas {len(capitais)}")
    sp = {r["corte"]: r for r in obs if r["cidade"] == REFERENCIA and r["ano_mes"] == MES_ANCORA}
    if len(sp) != 12:
        raise SystemExit(f"esperados 12 cortes de SP, encontrados {len(sp)}")

    anc = {}
    for r in obs:
        if r["cidade"] == REFERENCIA or r["ano_mes"].startswith("2022"):
            continue
        anc[(r["cidade"], r["corte"])] = r

    comparacoes = []
    for (c, k), r in sorted(anc.items()):
        if k not in sp:
            continue
        # A validação de nível é de 2026. Observações de 2025 (Aracaju) são
        # usadas como âncora, mas não entram nesta conta por defasagem.
        if r["ano_mes"] < "2026-01":
            continue
        f = mediana_fator(serie, c)
        if f is None:
            continue
        der = float(sp[k]["preco_rs_kg"]) * f
        ob = float(r["preco_rs_kg"])
        comparacoes.append({"cidade": c, "corte": k, "ano_mes": r["ano_mes"], "obs": ob,
                            "der": der, "erro": der / ob - 1})

    escrever("ancoras_validacao.csv",
             ["cidade", "corte", "ano_mes_observado", "preco_observado_rs_kg",
              "preco_derivado_rs_kg", "erro_pct"],
             [[c["cidade"], c["corte"], c["ano_mes"], f'{c["obs"]:.2f}', f'{c["der"]:.2f}',
               f'{c["erro"] * 100:.1f}'] for c in comparacoes])

    erros_corte = defaultdict(list)
    for c in comparacoes:
        erros_corte[c["corte"]].append(abs(c["erro"]))
    geral = statistics.mean(abs(c["erro"]) for c in comparacoes) * 100
    margem_corte = {k: (statistics.mean(v) * 100 if len(v) >= 2 else geral)
                    for k, v in erros_corte.items()}
    validadas = {c["cidade"] for c in comparacoes}

    linhas = []
    for cidade in capitais:
        if cidade == REFERENCIA:
            for k in sorted(sp):
                linhas.append(linha_observada(cidade, k, "padrao", sp[k]))
            continue
        f = mediana_fator(serie, cidade)
        for k in sorted(sp):
            if (cidade, k) in anc:
                linhas.append(linha_observada(cidade, k, "padrao", anc[(cidade, k)]))
            else:
                m = margem_corte.get(k, geral)
                linhas.append(linha_derivada(cidade, k, float(sp[k]["preco_rs_kg"]), f, m,
                                             cidade in validadas))
        for (c, k), r in sorted(anc.items()):
            if c == cidade and k not in sp:
                linhas.append(linha_observada(cidade, k, "extra", r))

    escrever("ancoras_por_capital.csv", CABECALHO, linhas)

    n_pad = sum(1 for r in linhas if r[4] == "padrao")
    n_ext = sum(1 for r in linhas if r[4] == "extra")
    n_obs = sum(1 for r in linhas if r[6] == "observado")
    n_der = sum(1 for r in linhas if r[6] == "derivado")
    print(f"capitais: {len(capitais)} | linhas padrão: {n_pad} | extras observados: {n_ext}")
    print(f"observados: {n_obs} | derivados: {n_der}")
    print(f"validação: {len(comparacoes)} comparações em {len(validadas)} cidades; "
          f"erro absoluto médio geral {geral:.1f}%")


if __name__ == "__main__":
    main()
