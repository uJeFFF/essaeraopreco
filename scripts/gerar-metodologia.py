"""Gera web/metodologia.html a partir dos CSVs de assetsexternos/.

O HTML é autocontido: CSS embutido, sem CDN e sem JavaScript externo. Os números
vêm dos CSVs; o texto metodológico e a lista de fontes ficam neste script.

Entradas (assetsexternos/):
  ancoras_por_capital.csv   âncoras dos 12 cortes por capital (2026)
  ancoras_validacao.csv     comparações derivado x observado
  cobertura_cortes.csv      status da série histórica de cada corte
  serie_carne_dieese.csv    carne bovina de primeira (DIEESE), mensal, nominal e real
  serie_cortes.csv          série estimada dos cortes, mensal, nominal e real
  diesel_municipal.csv      diesel S10 e comum (ANP), mensal, por capital
  diesel_cobertura.csv      cobertura dos produtos por capital

Saída:
  web/metodologia.html

Uso:
  python scripts/gerar-metodologia.py
"""

import csv
import html
import json
import statistics
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
SAIDA = RAIZ / "web" / "metodologia.html"
DATA = "6 de novembro de 2026"
REFERENCIA = "São Paulo"
MESES = {"01": "jan", "02": "fev", "03": "mar", "04": "abr", "05": "mai", "06": "jun",
         "07": "jul", "08": "ago", "09": "set", "10": "out", "11": "nov", "12": "dez"}
ANOS = [2008, 2012, 2016, 2020, 2024, 2026]
URL_IEA = "https://infoiea.agricultura.sp.gov.br/nia1/Precos_Medios.aspx?cod_sis=4"
URL_DIEESE = "https://www.dieese.org.br/cesta/produto"
URL_ANP = ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
           "precos/precos-revenda-e-de-distribuicao-combustiveis/"
           "serie-historica-do-levantamento-de-precos")
FONTE_CURTA = {
    "IEA/SP - Preços médios no varejo": "IEA/SP",
    "Mercado Mineiro + comOferta (BH, 5-7/10/2026)": "Mercado Mineiro/ComOferta",
    "Procon-JP - pesquisa de carnes": "Procon-JP",
    "Procon Fortaleza - Pesquisa Supermercados out/2026": "Procon Fortaleza",
    "Procon Vitória - Itens de primeira necessidade ago/2026": "Procon Vitória",
    "UFAC - PET Economia (abr/2026)": "UFAC/PET Economia",
    "Procon-PE - pesquisa de carnes RMR set/2022": "Procon-PE",
}


def ler(nome):
    with (PASTA / nome).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def e(texto):
    return html.escape(str(texto), quote=True)


def br(x, casas=2):
    s = f"{x:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def mes(ym):
    return f"{MESES[ym[5:]]}/{ym[:4]}" if ym else ""


def pct(x, casas=1):
    return f"{br(x, casas)}%"


def slug(texto):
    s = unicodedata.normalize("NFKD", texto)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return "-".join("".join(ch if ch.isalnum() else " " for ch in s).split())


def ordenar(texto):
    s = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def deslocar(ym, n):
    ano, m = int(ym[:4]), int(ym[5:])
    idx = ano * 12 + (m - 1) + n
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def blocos(meses):
    ms = sorted(meses)
    if not ms:
        return []
    out = []
    ini = ant = ms[0]
    for m in ms[1:]:
        if m != deslocar(ant, 1):
            out.append((ini, ant))
            ini = m
        ant = m
    out.append((ini, ant))
    return out


def texto_gaps(meses):
    b = blocos(meses)
    if len(b) <= 1:
        return ""
    partes = []
    for i in range(len(b) - 1):
        ini, fim = deslocar(b[i][1], 1), deslocar(b[i + 1][0], -1)
        partes.append(mes(ini) if ini == fim else f"{mes(ini)} a {mes(fim)}")
    return "; ".join(partes)


def estatisticas(valores):
    v = sorted(valores)
    return {"n": len(v), "mediana": statistics.median(v), "abs": statistics.mean(abs(x) for x in v),
            "min": v[0], "max": v[-1]}


def link(url, texto=None):
    if not url:
        return ""
    return f'<a href="{e(url)}" rel="noopener">{e(texto or url)}</a>'


def fonte_curta(nome):
    return FONTE_CURTA.get(nome, nome.split(" - ")[0].split(" (")[0])


def plural(n, singular, plural_):
    return f"{n} {singular if n == 1 else plural_}"


def css():
    return """
:root{--ink:#1f2328;--muted:#57606a;--line:#d0d7de;--bg:#ffffff;--soft:#f6f8fa;
--obs:#0f766e;--der:#9a3412;--warn:#b45309;--link:#0969da}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
header{padding:2.2rem 1.5rem 1.2rem;border-bottom:1px solid var(--line);background:var(--soft)}
header h1{margin:0 0 .3rem;font-size:1.9rem}
header p{margin:.2rem 0;color:var(--muted)}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1400px;margin:0 auto}
nav.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:1.2rem 1rem;border-right:1px solid var(--line);font-size:.9rem}
nav.toc h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:1rem 0 .4rem}
nav.toc ol{list-style:none;margin:0;padding:0}
nav.toc li{margin:.15rem 0}
nav.toc a{color:var(--link);text-decoration:none}
main{padding:1.2rem 2rem 4rem;min-width:0}
section{margin-bottom:2.8rem;scroll-margin-top:1rem}
h2{font-size:1.45rem;border-bottom:1px solid var(--line);padding-bottom:.3rem;margin-top:2rem}
h3{font-size:1.15rem;margin:1.6rem 0 .4rem}
p,li{max-width:86ch}
a{color:var(--link)}
table{border-collapse:collapse;width:100%;margin:.6rem 0 1rem;font-size:.92rem}
caption{caption-side:top;text-align:left;font-weight:600;padding:.3rem 0;color:var(--muted)}
th,td{border:1px solid var(--line);padding:.35rem .5rem;vertical-align:top;text-align:left}
th{background:var(--soft);font-weight:600}
td.num,th.num{text-align:right;white-space:nowrap}
.wrap{overflow-x:auto}
.anual{font-size:.8rem}
.anual th,.anual td{padding:.25rem .35rem}
.mini{font-weight:400;color:var(--muted);font-size:.72rem}
.badge{display:inline-block;padding:.05rem .5rem;border-radius:.4rem;font-size:.8rem;font-weight:600;color:#fff;margin-right:.3rem;white-space:nowrap}
.st-obs{background:var(--obs)}.st-der{background:var(--der)}.st-aguarda{background:var(--warn)}
.nota{background:var(--soft);border-left:4px solid var(--link);padding:.6rem .9rem;margin:.8rem 0;max-width:86ch}
.aviso{background:#fff8e6;border-left:4px solid var(--warn);padding:.6rem .9rem;margin:.8rem 0;max-width:86ch}
.cidade-h{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:2.2rem}
.cidade-h h2{border:none;margin:0;padding:0}
code{background:var(--soft);padding:.05rem .3rem;border-radius:.25rem;font-size:.9em}
svg text{font:12px system-ui,sans-serif;fill:var(--ink)}
@media (max-width:900px){.layout{grid-template-columns:1fr}nav.toc{position:static;max-height:none;border-right:none;border-bottom:1px solid var(--line)}}
@media print{nav.toc{display:none}.layout{display:block}main{padding:0}section{page-break-inside:avoid}}
"""


def badge(tipo):
    if tipo == "observado":
        return '<span class="badge st-obs">observado</span>'
    return '<span class="badge st-der">derivado</span>'


def grafico_erros(validacao):
    linhas = sorted(validacao, key=lambda r: (r["cidade"], r["corte"]))
    cx, escala, passo, topo = 430, 8, 20, 6
    altura = topo + passo * len(linhas) + 16
    p = [f'<svg viewBox="0 0 640 {altura}" role="img" '
         f'aria-label="Erro de cada comparação entre derivado e observado">',
         f'<line x1="{cx}" y1="{topo}" x2="{cx}" y2="{altura - 12}" stroke="#57606a"/>']
    for i, r in enumerate(linhas):
        y = topo + i * passo
        err = float(r["erro_pct"])
        w = abs(err) * escala
        x = cx if err >= 0 else cx - w
        cor = "#9a3412" if err > 0 else "#0969da"
        p.append(f'<text x="4" y="{y + 12}">{e(r["cidade"])} · {e(r["corte"])}</text>')
        p.append(f'<rect x="{x:.1f}" y="{y + 2}" width="{w:.1f}" height="13" fill="{cor}"/>')
        tx = cx + w + 4 if err >= 0 else cx - w - 4
        anc = "start" if err >= 0 else "end"
        p.append(f'<text x="{tx:.1f}" y="{y + 12}" text-anchor="{anc}">{br(err, 1)}%</text>')
    p.append("</svg>")
    return "".join(p)


def status_serie(x):
    st = x["status"]
    if st == "serie":
        t = f'{mes(x["primeiro_mes"])} a {mes(x["ultimo_mes"])} · {x["meses_com_valor"]} meses'
        if int(x["lacunas"]) > 0:
            t += f' · {x["lacunas"]} lacunas'
        return t
    if st == "aguarda_inpc":
        return "começa com o INPC de out/2026, ainda não publicado"
    if st == "sem_inpc_regional":
        return "sem série: cidade sem INPC regional"
    if st == "sem_item_inpc":
        return "sem série: corte sem subitem no INPC"
    return f'sem série: {x["observacao"]}' if x["observacao"] else "sem série"


def main():
    capa = ler("ancoras_por_capital.csv")
    val = ler("ancoras_validacao.csv")
    cob = ler("cobertura_cortes.csv")
    carne = ler("serie_carne_dieese.csv")
    cortes = ler("serie_cortes.csv")
    heatmap = json.loads((RAIZ / "web" / "dados" / "heatmap.json").read_text(encoding="utf-8"))
    combustiveis = json.loads((RAIZ / "web" / "dados" / "combustiveis.json").read_text(encoding="utf-8"))
    diesel_cob = ler("diesel_cobertura.csv")
    margens = heatmap["margens"]["cortes"]
    inpc = ler("inpc_carne_cesta.csv")
    var_sp_alcatra = {x["ano_mes"]: float(x["variacao_mensal_pct"]) for x in inpc
                      if x["regiao"] == "SP" and x["item_canonico"] == "alcatra"
                      and x["variacao_mensal_pct"].strip()}

    por_cidade = defaultdict(list)
    for x in capa:
        por_cidade[x["cidade"]].append(x)
    carne_cidade = defaultdict(list)
    for x in carne:
        carne_cidade[x["cidade"]].append(x)
    cob_cidade = defaultdict(list)
    cob_map = {}
    for x in cob:
        cob_cidade[x["cidade"]].append(x)
        cob_map[(x["cidade"], x["corte"])] = x

    val_cidade = defaultdict(list)
    val_corte = defaultdict(list)
    for x in val:
        err = float(x["erro_pct"])
        val_cidade[x["cidade"]].append(err)
        val_corte[x["corte"]].append(err)
    geral = estatisticas([float(x["erro_pct"]) for x in val])

    def ordem(c):
        obs = any(x["tipo"] == "observado" for x in por_cidade[c])
        return (0 if c == REFERENCIA else 1 if obs else 2, ordenar(c))
    cidades = sorted(por_cidade, key=ordem)

    # ---- dados derivados ----
    anos = {}
    for c, rows in carne_cidade.items():
        anos[c] = {x["ano_mes"]: x for x in rows}

    def resumo_corte(c):
        rows = [x for x in cob_cidade[c]]
        n = sum(1 for x in rows if x["status"] == "serie")
        ag = sum(1 for x in rows if x["status"] == "aguarda_inpc")
        return n, ag

    partes = []

    # ---- cabeçalho ----
    partes.append(f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Metodologia dos preços de carne e diesel por capital · ESSE ERA O PREÇO</title>
<style>{css()}</style>
</head>
<body>
<header>
<h1>Metodologia dos preços de carne e diesel por capital</h1>
<p>De onde vem cada preço, qual conta foi feita e qual erro esperar.</p>
<p>Dados de {e(DATA)} · 27 capitais · série principal: carne bovina de primeira (DIEESE) e diesel (ANP)</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Sumário">
<h2>Sumário</h2>
<ol>
<li><a href="#resumo">Resumo das capitais</a></li>
<li><a href="#carne">Carne (DIEESE)</a></li>
<li><a href="#cortes">Cortes</a></li>
<li><a href="#salario-minimo">Salário mínimo</a></li>
<li><a href="#diesel">Diesel</a></li>
<li><a href="#fontes">Fontes</a></li>
<li><a href="#metodo">Metodologia</a></li>
<li><a href="#erro">Margem de erro</a></li>
<li><a href="#validacao">Validação</a></li>
<li><a href="#cidades">Cidades</a></li>
<li><a href="#limitacoes">Limitações</a></li>
<li><a href="#reprodutibilidade">Reprodutibilidade</a></li>
<li><a href="#glossario">Glossário</a></li>
<li><a href="#licencas">Licenças e citação</a></li>
<li><a href="#changelog">Changelog</a></li>
</ol>
<h2>Cidades</h2>
<ol>""")
    for c in cidades:
        partes.append(f'<li><a href="#{slug(c)}">{e(c)}</a></li>')
    partes.append("</ol>\n</nav>\n<main>")

    # ---- resumo ----
    partes.append('<section id="resumo"><h2>Resumo das capitais</h2>')
    partes.append(
        "<p>O site tem duas camadas. A primeira é a <strong>carne bovina de primeira</strong> medida todo mês "
        "pelo DIEESE em cada capital: é preço observado, em R$/kg. A segunda são os <strong>12 cortes</strong>: "
        "parte vem de pesquisa de 2025–2026, parte é calculada a partir de São Paulo. Cada corte tem série histórica "
        "só onde o INPC da capital publica aquele corte e chega ao mês da âncora.</p>")
    partes.append('<div class="wrap"><table><caption>Uma linha por capital</caption><thead><tr>'
                  '<th>Cidade (UF)</th><th>Carne (DIEESE)</th><th class="num">Set/2026<br><span class="mini">R$/kg</span></th>'
                  '<th class="num">Set/2026 real<br><span class="mini">R$/kg de set/2026</span></th>'
                  '<th>Cortes com série</th><th>Âncoras dos cortes</th></tr></thead><tbody>')
    for c in cidades:
        uf = por_cidade[c][0]["uf"]
        ms = [x["ano_mes"] for x in carne_cidade[c]]
        gap = texto_gaps(ms)
        setembro = anos[c].get("2026-09")
        nom = br(float(setembro["preco_nominal_rs_kg"])) if setembro else ""
        real = br(float(setembro["preco_real_set2026_rs_kg"])) if setembro else ""
        n, ag = resumo_corte(c)
        if n == 0 and ag == 0:
            txt = "0/12"
            if all(x["status"] == "sem_inpc_regional" for x in cob_cidade[c]):
                txt += " · cidade sem INPC regional"
        else:
            txt = f"{n}/12"
            if ag:
                txt += f" · {ag} começam com o INPC de out/2026"
        pad = [x for x in por_cidade[c] if x["lista"] == "padrao"]
        n_obs = sum(1 for x in pad if x["tipo"] == "observado")
        n_der = len(pad) - n_obs
        ancora = f"{plural(n_obs, 'observado', 'observados')} · {plural(n_der, 'derivado', 'derivados')}"
        periodo = f"{mes(min(ms))} a {mes(max(ms))}" if ms else "—"
        if gap:
            periodo += f" · falta {gap}"
        partes.append(f'<tr><td><a href="#{slug(c)}">{e(c)}</a> ({e(uf)})</td>'
                      f'<td>{e(periodo)}</td><td class="num">{e(nom)}</td><td class="num">{e(real)}</td>'
                      f'<td>{e(txt)}</td><td>{e(ancora)}</td></tr>')
    partes.append("</tbody></table></div>")
    partes.append('<p class="nota">Setembro de 2026 é o mês de referência da correção: nele, o valor nominal '
                  'e o real coincidem. A diferença entre os dois aparece nos anos anteriores, na tabela da '
                  'seção Carne.</p></section>')

    # ---- carne ----
    partes.append('<section id="carne"><h2>Carne bovina de primeira (DIEESE)</h2>')
    partes.append(
        "<p>O DIEESE pesquisa todo mês o preço da carne bovina de primeira — coxão mole, coxão duro e "
        "patinho, sem osso — em 28 cidades. Usamos as 27 capitais; Macaé fica de fora porque não é capital. "
        "São os valores publicados, em R$/kg do mês. Nesta série não há estimativa nossa.</p>")
    partes.append(
        "<p>Para comparar anos, corrigimos cada mês pelo IPCA até setembro de 2026: "
        "<code>preço real = preço nominal × IPCA(set/2026) / IPCA(mês)</code>. O valor continua em R$/kg, "
        "agora com o poder de compra de setembro de 2026.</p>")
    partes.append(
        "<p><strong>Cobertura.</strong> Dezessete capitais têm série longa, desde julho de 1994, quando o real "
        "entrou em vigor (Goiânia desde 1994-12, Aracaju desde 1995-09, Campo Grande desde 2012-10); "
        "Belo Horizonte e Brasília têm um "
        "único mês sem dado (mai/2021 e nov/2019). Dez têm um intervalo longo sem pesquisa: os valores "
        "existem em 2016–2017/2019 e voltam em abril de 2025. O vazio fica vazio.</p>")

    partes.append('<div class="wrap"><table><caption>Onde a série do DIEESE tem intervalo sem pesquisa</caption>'
                  '<thead><tr><th>Cidade</th><th>Primeiro período</th><th>Intervalo</th><th>Último período</th></tr></thead><tbody>')
    for c in cidades:
        b = blocos([x["ano_mes"] for x in carne_cidade[c]])
        for i in range(len(b) - 1):
            ini, fim = deslocar(b[i][1], 1), deslocar(b[i + 1][0], -1)
            partes.append(f'<tr><td>{e(c)}</td><td>{e(mes(b[i][0]))} a {e(mes(b[i][1]))}</td>'
                          f'<td>{e(mes(ini)) if ini == fim else e(mes(ini)) + " a " + e(mes(fim))}</td>'
                          f'<td>{e(mes(b[i + 1][0]))} a {e(mes(b[i + 1][1]))}</td></tr>')
    partes.append("</tbody></table></div>")

    partes.append('<div class="wrap"><table class="anual"><caption>Preço da carne em dezembro de cada ano '
                  '(2026: setembro), em R$/kg. Nominal e real (set/2026).</caption><thead><tr><th>Cidade</th>')
    for a in ANOS:
        partes.append(f'<th class="num">{a}<br><span class="mini">nom</span></th>'
                      f'<th class="num">{a}<br><span class="mini">real</span></th>')
    partes.append("</tr></thead><tbody>")
    for c in cidades:
        partes.append(f'<tr><td>{e(c)}</td>')
        for a in ANOS:
            x = anos[c].get(f"{a}-12" if a < 2026 else "2026-09")
            if x:
                partes.append(f'<td class="num">{br(float(x["preco_nominal_rs_kg"]))}</td>'
                              f'<td class="num">{br(float(x["preco_real_set2026_rs_kg"]))}</td>')
            else:
                partes.append('<td class="num">—</td><td class="num">—</td>')
        partes.append("</tr>")
    partes.append("</tbody></table></div>")
    partes.append('<p class="nota">A dispersão da pesquisa do DIEESE não é publicada. Por isso a série '
                  'principal não tem margem de erro calculada; ela é observada, não estimada.</p></section>')

    # ---- cortes ----
    st = Counter(x["status"] for x in cob)
    partes.append('<section id="cortes"><h2>Cortes</h2>')
    partes.append(
        "<p>O preço de referência de cada corte vem de uma pesquisa de 2025–2026: IEA em São Paulo; "
        "Procon em João Pessoa, Fortaleza, Vitória e Palmas; Procon Aracaju (set/2025); Mercado Mineiro "
        "em Belo Horizonte; UFAC em Rio Branco. Quando a capital não tem pesquisa daquele corte, "
        "calculamos a partir de São Paulo:</p>")
    partes.append("<p><code>P(cidade, corte) = P(São Paulo, corte) × fator DIEESE(cidade/SP)</code></p>")
    partes.append(
        "<p>O fator é a razão entre o preço da carne da capital e o de São Paulo no DIEESE, na mediana de "
        "junho a agosto de 2026. Ele não é específico de um corte: é a carne composta. Por isso a margem "
        "varia por corte e é maior onde o corte se afasta da carne composta.</p>")
    partes.append(
        "<p>Para os outros meses, aplicamos a variação mensal do INPC da própria capital para aquele corte:</p>")
    partes.append("<p><code>P(t) = P(âncora) × INPC(t) / INPC(âncora)</code></p>")
    partes.append(
        "<p><strong>As regras.</strong> Usamos só o INPC regional; não há fallback para o INPC nacional. "
        "Não interpolamos e não preenchemos mês faltante: se a variação de um mês não existe, a série para "
        "ali. O coxão duro não tem subitem no INPC, então fica só com o preço de 2026. E como o INPC "
        "regional trocou de cesta em 2020, várias séries terminam em 2019 e não chegam à âncora de 2026; "
        "essas ficam sem série.</p>")
    partes.append(
        f"<p><strong>O que existe hoje:</strong> {st['serie']} séries de corte construídas; "
        f"{st['aguarda_inpc']} começam com o INPC de outubro de 2026, ainda não publicado; "
        f"{st['sem_serie_regional_no_mes_ancora']} sem série porque o INPC regional não chega à âncora; "
        f"{st['sem_inpc_regional']} sem série porque a cidade não tem INPC regional. O coxão duro não tem "
        f"subitem no INPC; em São Paulo ele tem o IEA 2025–2026 e, nas outras 15 capitais com INPC regional, "
        f"aparece em {st['sem_item_inpc']} linhas sem série; nas outras 11, está contado entre as capitais "
        "sem INPC regional.</p>")

    sem_regiao = sorted({x["cidade"] for x in cob if x["status"] == "sem_inpc_regional"}, key=ordenar)
    partes.append(
        "<p><strong>Capitais sem INPC regional:</strong> " + ", ".join(e(c) for c in sem_regiao) +
        ". Nelas, os 12 cortes existem apenas como preço de referência de 2026.</p>")

    partes.append('<div class="wrap"><table><caption>Situação da série, por corte</caption>'
                  '<thead><tr><th>Corte</th><th class="num">Com série</th>'
                  '<th class="num">Começam com o INPC de out/2026</th><th class="num">Sem série</th>'
                  '</tr></thead><tbody>')
    por_corte = defaultdict(lambda: [0, 0, 0])
    for x in cob:
        i = 0 if x["status"] == "serie" else 1 if x["status"] == "aguarda_inpc" else 2
        por_corte[x["corte"]][i] += 1
    for k in sorted(por_corte, key=ordenar):
        com, ag, sem = por_corte[k]
        partes.append(f'<tr><td>{e(k)}</td><td class="num">{com}</td><td class="num">{ag}</td>'
                      f'<td class="num">{sem}</td></tr>')
    partes.append("</tbody></table></div>")

    ex = next((x for x in cortes if x["cidade"] == REFERENCIA and x["corte"] == "alcatra"
               and x["ano_mes"] in ("2026-07", "2026-08", "2026-09")), None)
    if ex:
        viz = [x for x in cortes if x["cidade"] == REFERENCIA and x["corte"] == "alcatra"
               and x["ano_mes"] in ("2026-07", "2026-08", "2026-09")]
        viz.sort(key=lambda x: x["ano_mes"])
        partes.append('<p><strong>Exemplo.</strong> A alcatra em São Paulo: a âncora de ago/2026 é '
                      f'R$ {br(float(viz[1]["preco_nominal_rs_kg"]))}/kg. A variação do INPC de set/2026 '
                      f'foi de {br(var_sp_alcatra["2026-09"])}%, levando o quilo a '
                      f'R$ {br(float(viz[2]["preco_nominal_rs_kg"]))}. Em julho, a variação de ago/2026 '
                      f'foi de {br(var_sp_alcatra["2026-08"])}%, e a alcatra valia '
                      f'R$ {br(float(viz[0]["preco_nominal_rs_kg"]))}.</p>')
    partes.append("</section>")

    # ---- salário mínimo ----
    partes.append("""<section id="salario-minimo"><h2>Percentual do salário mínimo</h2>
<p>O percentual é o preço nominal do mês dividido pelo salário mínimo nominal em vigor no mês:</p>
<p><code>% = preço nominal (R$/kg) / salário mínimo nominal (R$) × 100</code></p>
<p>Usamos o salário mínimo nominal, não o "salário mínimo necessário" do DIEESE. O necessário é o valor que
seria preciso para comprar a cesta básica inteira; não é o salário que as pessoas recebem.</p>
<p>O salário mínimo é nacional; a diferença entre cidades no percentual vem do preço. O resultado é o mesmo
se os dois valores forem corrigidos pelo mesmo índice de inflação.</p>
<p>A página <a href="09/">09</a> mostra esse percentual para a carne do DIEESE e para os cortes.</p>
</section>""")

    # ---- diesel ----
    partes.append('<section id="diesel"><h2>Diesel</h2>')
    partes.append(
        '<p>A página <a href="09/#diesel">09</a> também traz <strong>diesel S10</strong> e '
        '<strong>diesel comum</strong>, com preço de revenda e litros por salário mínimo. A fonte é a '
        f'{link(URL_ANP, "ANP")}, Levantamento de Preços, planilhas mensais por município. '
        'O preço é o de revenda (bomba), em R$/L; não usamos mínimo nem máximo como âncora.</p>')
    partes.append(
        '<p><strong>Produtos.</strong> O S10 é o diesel rodoviário moderno e existe na série a partir de '
        '2013. O comum cobre 2001–2026 e ainda é usado em agricultura e veículos antigos. São produtos '
        'diferentes: não são uma continuação um do outro. A página mostra os dois em abas separadas.</p>')
    partes.append(
        '<p><strong>Preço real e litros.</strong> O preço real é o nominal corrigido pelo IPCA até '
        'setembro de 2026: <code>preço real = preço nominal × IPCA(set/2026) / IPCA(mês)</code>. '
        'Os litros por salário mínimo são <code>salário mínimo nominal do mês / preço nominal</code>. '
        'Cada célula é dezembro; 2026 é setembro, o último mês mensal consolidado. Não há média anual '
        'nem interpolação.</p>')
    partes.append(
        '<p><strong>Margem.</strong> A margem de cada célula é a amostral da média municipal: '
        '<code>1,96 × desvio-padrão / √n / média</code>. O CV é <code>desvio / média</code>; n é o '
        'número de postos pesquisados. O CV mede a dispersão entre postos; a margem mede a precisão '
        'da média. O preço de revenda inclui ICMS/PIS/COFINS e margem do posto.</p>')
    partes.append(
        '<p><strong>Cobertura.</strong> 27 capitais. O S10 tem os 27 capitais em todos os dezembros; '
        'o comum tem 24 a 27 em 2013–2025 e 20 em set/2026. Setembro de 2020 não teve pesquisa nos '
        'dois produtos. O comum também tem buracos em alguns anos/capitais. O vazio fica vazio.</p>')
    partes.append(
        '<div class="wrap"><table><caption>Diesel: cobertura e faixas (preço real de set/2026)</caption>'
        '<thead><tr><th>Produto</th><th>Período</th><th class="num">Capitais</th>'
        '<th class="num">Meses</th><th class="num">Faixa histórica</th><th class="num">Faixa 2026</th>'
        '<th class="num">Margem da média</th><th class="num">CV entre postos</th>'
        '<th class="num">n</th></tr></thead><tbody>')
    for produto, p in combustiveis["produtos"].items():
        valores = [v for linha in p["preco"]["valores"] for v in linha if v is not None]
        margens_p = [v for linha in p["preco"]["margem_celula"] for v in linha if v is not None]
        cvs_p = [v for linha in p["preco"]["cv_celula"] for v in linha if v is not None]
        ns_p = [v for linha in p["preco"]["n_celula"] for v in linha if v is not None]
        j26 = combustiveis["anos"].index(2026)
        v26 = [linha[j26] for linha in p["preco"]["valores"] if linha[j26] is not None]
        ini, fim = p["periodo"].split(" a ")
        periodo = f"{mes(ini)} a {mes(fim)}"
        partes.append(
            f'<tr><td>{e(produto)}</td><td>{e(periodo)}</td>'
            f'<td class="num">{p["cidades_com_dado"]}</td><td class="num">{p["meses_com_dado"]}</td>'
            f'<td class="num">R$ {br(min(valores))} a R$ {br(max(valores))}</td>'
            f'<td class="num">R$ {br(min(v26))} a R$ {br(max(v26))}</td>'
            f'<td class="num">{pct(min(margens_p))} a {pct(max(margens_p))}</td>'
            f'<td class="num">{pct(min(cvs_p))} a {pct(max(cvs_p))}</td>'
            f'<td class="num">{min(ns_p)} a {max(ns_p)}</td></tr>')
    partes.append("</tbody></table></div>")
    capitais_diesel = [c["nome"] for c in combustiveis["capitais"]]
    for produto, p in combustiveis["produtos"].items():
        j26 = combustiveis["anos"].index(2026)
        faltam = [capitais_diesel[i] for i, linha in enumerate(p["preco"]["valores"])
                  if linha[j26] is None]
        if faltam:
            partes.append(
                f'<p class="nota">Em set/2026, {e(produto)} não tem dado para: '
                f'{", ".join(e(c) for c in faltam)}. A célula fica vazia.</p>')
    partes.append(
        '<p><strong>Cuidados.</strong> Diesel é custo de frete e de produção agropecuária; a relação '
        'com o preço dos alimentos é indireta e defasada, não causal. O preço de revenda inclui '
        'tributos e margem do posto, e a política de preços cria quebras (greve de 2018, mudanças de '
        'ICMS em 2022, subvenções). A média municipal da ANP é simples, não ponderada. O S10 e o comum '
        'são produtos diferentes.</p></section>')

    # ---- fontes ----
    fontes = [
        ("IEA/SP · preço médio mensal no varejo", "Instituto de Economia Agrícola (Secretaria de Agricultura de SP)",
         "12 cortes, 360 estabelecimentos varejistas (169 supermercados, 69 feiras-livres, 40 açougues, "
         "79 quitandas/sacolões e 13 padarias), ponderada pelo gasto domiciliar da POF/FIPE. Consulta gratuita "
         "2025–2026; série completa desde 1970 vendida em planilha. Varejo; atacado não usado.",
         URL_IEA, "Não publica a dispersão; a série completa é paga."),
        ("Mercado Mineiro + comOferta · pesquisa de carnes de BH", "Mercado Mineiro",
         "11 cortes (9 da lista de 12 e 2 extras), pesquisa de 5 a 7 de outubro de 2026, divulgada em reportagem.",
         "https://ncnews.com.br/2026/10/13/churrasco-fica-mais-caro-em-bh-picanha-chega-a-r-12990-o-quilo/",
         "Os valores são os publicados na reportagem que cita a pesquisa."),
        ("Procon-JP · pesquisa de carnes", "Procon de João Pessoa",
         "Tabela por estabelecimento (23 lojas), ago/2026. Usamos a mediana.",
         "https://sites.joaopessoa.pb.gov.br/procon/pesquisa-de-carne-e-franco-12-08-2026/",
         "A mediana reduz o efeito de lojas extremas."),
        ("Procon Fortaleza · Pesquisa Supermercados, out/2026", "Procon Fortaleza",
         "Coxão duro e coxão mole, 1 kg, média por produto.",
         "https://desenvolvimentoeconomico.fortaleza.ce.gov.br/procon/pesquisas-2026", "Dois cortes."),
        ("Procon Vitória · itens de primeira necessidade, ago/2026", "Procon Vitória",
         "Acém sem osso, 1 kg.",
         "https://www.vitoria.es.gov.br/noticia/pesquisa-do-procon-vitoria-revela-diferencas-nos-precos-de-itens-considerados-essenciais-57252",
         "Um corte."),
        ("UFAC · PET Economia, Rio Branco, abr/2026", "Universidade Federal do Acre",
         "Picanha (supermercado) e patinho (açougue), divulgados em reportagem.",
         "https://agazetadoacre.com/2026/06/noticias/geral/preco-da-carne-dispara-em-rio-branco-alcatra-sobe-quase-23-e-picanha-passa-de-r-70-o-quilo/",
         "Dois cortes e dois canais."),
        ("ANP · Levantamento de Preços (revenda)", "ANP",
         "Planilhas mensais municipais; diesel S10 (2013–2026) e diesel comum (2001–2026); "
         "27 capitais; média, desvio-padrão, nº de postos e CV.",
         URL_ANP, "Preço de revenda; inclui impostos e margem do posto; média municipal simples."),
        ("Procon Tocantins · pesquisa de carnes em Palmas, 03/09/2026", "Procon Tocantins",
         "Tabela por ponto de venda (10 pontos), 34 itens, sendo 16 cortes bovinos "
         "(11 da lista de 12 e 5 extras). Usamos a mediana por corte.",
         "https://central.to.gov.br/download/489882",
         "A pesquisa é feita na capital; não é proxy estadual."),
        ("Procon Aracaju · pesquisa de cortes de carne, 01–05/09/2025", "Procon Aracaju",
         "Tabela por loja (7 lojas), 16 cortes bovinos (10 da lista de 12 e 6 extras). "
         "Usamos a mediana; a pesquisa de jun/2026 só publicou mínimo/máximo e o PDF de 2026 "
         "está com link quebrado.",
         "https://procon.aracaju.se.gov.br/wp-content/uploads/2025/09/Cortes-de-Carne-SETEMBRO-2025.pdf",
         "Âncora de set/2025; não entra na validação de 2026 por defasagem."),
        ("Procon Goiânia · pesquisa de carnes, 30/01–02/02/2026", "Procon Goiânia",
         "9 lojas, 15 itens. A tabela publicada é um resumo com mínimo/máximo e 10 itens, "
         "sem preço por loja. Não usada como âncora.",
         "https://www.diariodeaparecida.com.br/2026/02/06/pesquisa-do-procon-goiania-aponta-variacao-de-ate-200-no-preco-de-carnes-na-capital/",
         "Pendente: sem tabela por loja."),
        ("Procon-PE · pesquisa de carnes RMR, set/2022", "Procon Pernambuco",
         "Média por loja, 22 estabelecimentos. Não usada como âncora: o preço é de 2022 e não foi corrigido.",
         "https://www.procon.pe.gov.br/images/cb2022/set/PESQUISA_CARNES_LATICNIOS_E_PRESUNTOS_-_SETEMBRO_2022.pdf",
         "Fica registrada como referência, fora do cálculo."),
        ("DIEESE · Cesta Básica, preço médio da carne", "DIEESE",
         "Carne bovina de primeira em 28 cidades. A série em R$ começa em jul/1994, quando o real entrou "
         "em vigor; antes disso a fonte está em cruzeiro real.",
         URL_DIEESE, "Não publica a dispersão da pesquisa."),
        ("DIEESE · salário mínimo nominal e necessário", "DIEESE",
         "Valor nominal em vigor por mês, jul/1994 a set/2026. Base do percentual do salário mínimo.",
         "https://www.dieese.org.br/analisecestabasica/salarioMinimo.html",
         "Usamos a coluna nominal; a coluna 'necessário' é o valor da cesta básica, não o salário pago."),
        ("IBGE · INPC por subitem", "IBGE",
         "Variação mensal por subitem e região, 2005–2026. Base das séries de corte.",
         "https://ftp.ibge.gov.br/Precos_Indices_de_Precos_ao_Consumidor/", "Dado público."),
        ("IBGE · IPCA, tabela 1737", "IBGE",
         "Número-índice (dez/1993 = 100), usado para corrigir os valores para set/2026.",
         "https://sidra.ibge.gov.br/tabela/1737", "Dado público."),
        ("IBGE · SIDRA, tabelas 7063, 1419 e 7060", "IBGE",
         "Conferência dos índices por subitem, nacional, 2020–2026.",
         "https://sidra.ibge.gov.br/", "Dado público."),
    ]
    partes.append('<section id="fontes"><h2>Fontes</h2><p>Cada número da página vem de uma destas fontes.</p>')
    partes.append('<div class="wrap"><table><caption>Fontes usadas</caption><thead><tr><th>Fonte</th><th>Quem publica</th>'
                  '<th>O que foi usado</th><th>Link</th><th>Observação</th></tr></thead><tbody>')
    for nome, quem, uso, url, obs in fontes:
        partes.append(f"<tr><td>{e(nome)}</td><td>{e(quem)}</td><td>{e(uso)}</td>"
                      f"<td>{link(url, 'abrir')}</td><td>{e(obs)}</td></tr>")
    partes.append("</tbody></table></div></section>")

    # ---- metodologia ----
    partes.append(f"""<section id="metodo"><h2>Metodologia</h2>
<h3>Preço de referência: São Paulo e o IEA</h3>
<p>São Paulo é a referência. O IEA/SP pesquisa 12 cortes no varejo da cidade, em 360 estabelecimentos.
A consulta gratuita cobre 2025–2026; a série completa desde 1970 é vendida em planilha. Usamos o IEA
2025–2026 como nível observado e o INPC para os meses anteriores:</p>
<p><code>P(t) = P_IEA(âncora) × INPC(t) / INPC(âncora)</code></p>
<h3>Série dos cortes</h3>
<p>Sete cortes (acém, alcatra, contrafilé, costela, coxão mole, lagarto e patinho) usam o INPC regional
de São Paulo. Quatro cortes sem INPC regional em São Paulo (picanha, capa de filé, filé-mignon e músculo)
usam o INPC nacional — uma exceção só para São Paulo; as outras capitais continuam só com o regional.
A capa usa o regional até 2011 e o nacional depois; o músculo usa o nacional, porque o regional tem falhas.
O coxão duro não tem INPC: fica só com o IEA 2025–2026.</p>
<p>Para as outras capitais, o nível é São Paulo × fator DIEESE; a série usa o INPC regional, sem fallback
nacional. Quando existe pesquisa municipal com tabela por loja, o nível observado substitui o derivado:
Palmas (set/2026) e Aracaju (set/2025). Aracaju é a única âncora de 2025 e não entra na validação de
nível de 2026; a série dela começa em set/2025.</p>
<h3>Ponto no tempo</h3>
<p>Cada célula é dezembro; 2026 é o último mês disponível (set/2026; em São Paulo, ago/2026, o último IEA).
Não há média anual.</p>
<h3>Margens</h3>
<p><strong>Nível:</strong> erro do preço derivado contra o observado ({geral['n']} comparações de 2026).
<strong>Caminho:</strong> erro do INPC contra o IEA 2025–2026, corte por corte.
<strong>Total:</strong> quadratura; a soma é o limite superior. O IEA e o DIEESE não publicam dispersão;
o % do salário mínimo herda a margem do preço.</p>""")
    partes.append('<div class="wrap"><table><caption>Margens por corte (em %)</caption><thead><tr>'
                  '<th>Corte</th><th class="num">Nível</th><th class="num">Caminho</th>'
                  '<th class="num">Total</th><th class="num">Soma</th>'
                  '<th class="num">n nível</th><th class="num">n caminho</th></tr></thead><tbody>')
    for corte in sorted(margens, key=ordenar):
        m = margens[corte]
        cam = "—" if m["caminho"] is None else pct(m["caminho"])
        tot = "—" if m["total"] is None else pct(m["total"])
        soma = "—" if m["soma"] is None else pct(m["soma"])
        partes.append(f'<tr><td>{e(corte)}</td><td class="num">{pct(m["nivel"])}</td>'
                      f'<td class="num">{cam}</td><td class="num">{tot}</td>'
                      f'<td class="num">{soma}</td><td class="num">{m["nivel_n"]}</td>'
                      f'<td class="num">{m["caminho_n"]}</td></tr>')
    partes.append("</tbody></table></div>")
    partes.append(
        "<p>O nível cobre o erro de aplicar o fator do DIEESE a um corte; o caminho cobre o erro de "
        "atualizar o preço pelo INPC. O total junta os dois. A margem do IEA e do DIEESE, em si, não é "
        "publicada; por isso o nível observado de São Paulo não tem margem própria.</p></section>")

    # ---- erro ----
    partes.append('<section id="erro"><h2>Margem de erro</h2>')
    partes.append(
        f"<p>As {geral['n']} comparações entre preço derivado e preço observado têm erro mediano de "
        f"{pct(geral['mediana'])} e erro absoluto médio de {pct(geral['abs'])}, com extremos de "
        f"{pct(geral['min'])} e {pct(geral['max'])}. A margem é empírica: mede o método no mês da âncora, "
        "não é intervalo de confiança. A margem de nível é do mês da âncora; a de caminho é medida no "
        "IEA 2025–2026; o total combina as duas (tabela na Metodologia).</p>")
    partes.append('<div class="wrap"><table><caption>Erro por cidade (derivado x observado)</caption><thead><tr>'
                  '<th>Cidade</th><th class="num">Comparações</th><th class="num">Erro mediano</th>'
                  '<th class="num">Erro absoluto médio</th><th class="num">Faixa</th></tr></thead><tbody>')
    for c in sorted(val_cidade, key=ordenar):
        s = estatisticas(val_cidade[c])
        partes.append(f'<tr><td>{e(c)}</td><td class="num">{s["n"]}</td><td class="num">{pct(s["mediana"])}</td>'
                      f'<td class="num">{pct(s["abs"])}</td><td class="num">{pct(s["min"])} a {pct(s["max"])}</td></tr>')
    partes.append("</tbody></table></div>")
    partes.append('<div class="wrap"><table><caption>Erro por corte</caption><thead><tr><th>Corte</th>'
                  '<th class="num">Comparações</th><th class="num">Erro absoluto médio</th>'
                  '<th class="num">Faixa</th></tr></thead><tbody>')
    for k in sorted(val_corte, key=lambda k: -statistics.mean(abs(x) for x in val_corte[k])):
        s = estatisticas(val_corte[k])
        leitura = "" if s["n"] >= 2 else " (1 comparação: indicativo)"
        partes.append(f'<tr><td>{e(k)}{leitura}</td><td class="num">{s["n"]}</td>'
                      f'<td class="num">{pct(s["abs"])}</td><td class="num">{pct(s["min"])} a {pct(s["max"])}</td></tr>')
    partes.append("</tbody></table></div>")
    partes.append(
        "<p>As capitais sem corte observado não têm como ser validadas. A margem delas é a do corte, "
        "medida nas cidades que têm âncora.</p></section>")

    # ---- validação ----
    partes.append('<section id="validacao"><h2>Validação</h2>')
    partes.append(
        "<p>Comparamos o preço derivado a partir de São Paulo com o preço observado nas cidades que têm "
        "pesquisa de corte. A validação mede o erro do método, não o das pesquisas. Cada barra é uma "
        "comparação: azul significa que o derivado ficou abaixo do observado; laranja, acima.</p>")
    partes.append(grafico_erros(val))
    partes.append('<div class="wrap"><table><caption>As comparações</caption><thead><tr><th>Cidade</th><th>Corte</th>'
                  '<th>Data do observado</th><th class="num">Observado</th><th class="num">Derivado</th>'
                  '<th class="num">Erro</th></tr></thead><tbody>')
    for x in sorted(val, key=lambda x: (ordenar(x["cidade"]), x["corte"])):
        partes.append(f'<tr><td>{e(x["cidade"])}</td><td>{e(x["corte"])}</td><td>{e(mes(x["ano_mes_observado"]))}</td>'
                      f'<td class="num">{br(float(x["preco_observado_rs_kg"]))}</td>'
                      f'<td class="num">{br(float(x["preco_derivado_rs_kg"]))}</td>'
                      f'<td class="num">{pct(float(x["erro_pct"]))}</td></tr>')
    partes.append("</tbody></table></div>")
    partes.append(
        "<p>Os derivados usam a mediana de jun–ago/2026. As observações de Belo Horizonte e Fortaleza são "
        "de out/2026, a de Palmas de set/2026 e a de Rio Branco de abr/2026: nesses casos a comparação "
        "mistura método e mês. A observação de Aracaju (set/2025) não entra nesta validação por defasagem "
        "de 11 meses.</p></section>")

    # ---- cidades ----
    partes.append('<section id="cidades"><h2>Cidades</h2><p>Uma seção por capital: a série do DIEESE e a '
                  'tabela dos 12 cortes, com a conta de cada um.</p></section>')
    for c in cidades:
        partes.append(secao_cidade(c, por_cidade[c], cob_map, carne_cidade[c], anos[c],
                                   val_cidade, geral))

    # ---- limitações ----
    partes.append("<section id=\"limitacoes\"><h2>Limitações</h2><ul>")
    partes.append(
        "<li><strong>A série principal também tem buracos.</strong> Dez capitais ficaram sem pesquisa do "
        "DIEESE por 6 a 8 anos, entre 2016 e 2025. Os valores não são preenchidos.</li>")
    partes.append(
        "<li><strong>A série de cortes cobre 16 capitais com INPC regional, incluindo São Paulo, que também "
        "usa o IEA.</strong> A cobertura varia por corte; os 12 cortes de São Paulo são a exceção mais completa.</li>")
    partes.append(
        "<li><strong>Onze capitais não têm INPC regional.</strong> Nelas, os 12 cortes existem apenas como "
        "preço de referência de 2026.</li>")
    partes.append(
        "<li><strong>Várias séries terminam em 2019.</strong> O INPC trocou de cesta em 2020; sem o INPC "
        "regional no mês da âncora, o corte não tem série.</li>")
    partes.append(
        "<li><strong>Coxão duro não tem subitem no INPC.</strong> Em São Paulo, tem o IEA 2025–2026; nas "
        "demais capitais, não tem série.</li>")
    partes.append(
        "<li><strong>O IEA completo é pago.</strong> A consulta gratuita cobre 2025–2026; a série desde 1970 "
        "é vendida em planilha. Para os anos anteriores de São Paulo, usamos o INPC.</li>")
    partes.append(
        "<li><strong>O INPC nacional é uma exceção só de São Paulo.</strong> Picanha, capa, filé e músculo "
        "usam o nacional porque não há regional de São Paulo; as outras capitais continuam só com o regional.</li>")
    partes.append(
        "<li><strong>Capa e músculo trocam de fonte.</strong> A capa usa o regional até 2011 e o nacional "
        "depois; o músculo usa o nacional porque o regional tem falhas.</li>")
    partes.append(
        "<li><strong>Cada célula é um ponto, não uma média.</strong> É dezembro; 2026 é o último mês "
        "disponível (set/2026; SP: ago/2026).</li>")
    partes.append(
        "<li><strong>IEA e DIEESE não publicam dispersão.</strong> A margem do nível observado de São Paulo "
        "e da série principal do DIEESE não pode ser medida.</li>")
    partes.append(
        "<li><strong>Belo Horizonte e Fortaleza têm âncora de out/2026.</strong> O INPC de outubro ainda não "
        "foi publicado; as séries dessas capitais começam quando ele sair.</li>")
    partes.append(
        "<li><strong>As datas das âncoras são diferentes:</strong> ago/2026 em São Paulo, João Pessoa e "
        "Vitória; set/2026 em Palmas; out/2026 em Belo Horizonte e Fortaleza; abr/2026 em Rio Branco; "
        "set/2025 em Aracaju. Cada linha traz a sua data.</li>")
    partes.append(
        "<li><strong>A margem é do mês da âncora.</strong> Ela mede o erro do nível em 2026, não o erro da "
        "série histórica inteira.</li>")
    partes.append(
        "<li><strong>O fator do DIEESE é de carne composta.</strong> Ele não diferencia picanha de alcatra; "
        "por isso a margem varia por corte.</li>")
    partes.append(
        f"<li><strong>A validação tem {geral['n']} comparações em {len(val_cidade)} cidades.</strong> "
        "As margens são indicativas, não estatísticas.</li>")
    partes.append(
        "<li><strong>Não publicamos média nacional.</strong> O DIEESE não tem série completa nas 27 capitais, "
        "e uma média com buraco ou com base variável enganaria.</li>")
    partes.append("</ul></section>")

    # ---- reprodutibilidade ----
    partes.append("""<section id="reprodutibilidade"><h2>Reprodutibilidade</h2>
<p>Os arquivos saem destes scripts, nesta ordem:</p>
<ol>
<li><code>python scripts/baixar-inpc.py</code> · baixa o INPC por subitem do FTP do IBGE.</li>
<li><code>python scripts/baixar-dieese-carne.py</code> · baixa a carne por capital do DIEESE.</li>
<li><code>python scripts/baixar-ipca.py</code> · baixa o IPCA do SIDRA.</li>
<li><code>python scripts/baixar-salario-minimo.py</code> · baixa o salário mínimo nominal do DIEESE.</li>
<li><code>python scripts/baixar-iea-varejo.py</code> · baixa os 12 cortes do IEA/SP em 2025–2026.</li>
<li><code>python scripts/importar-fontes-cortes.py</code> · lê os PDFs de Palmas (2026) e Aracaju (2025), calcula a mediana por loja e monta o registro de fontes.</li>
<li><code>python scripts/baixar-anp-combustiveis.py</code> · baixa as planilhas mensais municipais de diesel da ANP.</li>
<li><code>python scripts/gerar-serie-diesel.py</code> · gera a série de diesel S10 e comum por capital.</li>
<li><code>python scripts/gerar-combustiveis.py</code> · gera o JSON dos heatmaps de diesel.</li>
<li><code>python scripts/derivar-ancoras.py</code> · monta as âncoras e a validação.</li>
<li><code>python scripts/gerar-series.py</code> · gera as séries de carne e de cortes.</li>
<li><code>python scripts/gerar-series-sp.py</code> · estende São Paulo com IEA e INPC nacional.</li>
<li><code>python scripts/gerar-heatmap.py</code> · gera o JSON dos heatmaps e as margens.</li>
<li><code>python scripts/gerar-metodologia.py</code> · gera esta página.</li>
</ol>
<p>As âncoras observadas ficam em <code>assetsexternos/ancoras_observadas.csv</code>, com fonte, data,
estatística, canal e link de cada número. Os PDFs brutos ficam em <code>assetsexternos/fontes/</code>.
Goiânia não entra: a pesquisa de 30/01–02/02/2026 só publicou mínimo/máximo, sem preço por loja.
Aracaju/2026 também não: o PDF está com link quebrado e o release só tem mínimo/máximo.</p></section>""")

    # ---- glossário ----
    partes.append("""<section id="glossario"><h2>Glossário</h2><dl>
<dt>Nominal</dt><dd>O preço do mês, em R$/kg, sem correção.</dd>
<dt>Real</dt><dd>O preço corrigido pelo IPCA para set/2026. Continua em R$/kg, com o poder de compra de setembro de 2026.</dd>
<dt>Âncora</dt><dd>O preço de referência de um corte em uma cidade e data, de onde a série parte.</dd>
<dt>Observado</dt><dd>Preço publicado em pesquisa, medido em loja ou açougue.</dd>
<dt>Derivado</dt><dd>Preço calculado a partir de São Paulo e do fator regional do DIEESE.</dd>
<dt>DIEESE</dt><dd>Departamento Intersindical de Estatística e Estudos Socioeconômicos. Pesquisa a cesta básica e o preço da carne por capital.</dd>
<dt>INPC</dt><dd>Índice Nacional de Preços ao Consumidor, do IBGE. Aqui, a variação mensal por subitem e região.</dd>
<dt>IPCA</dt><dd>Índice de Preços ao Consumidor Amplo, do IBGE. Usado para corrigir os valores para set/2026.</dd>
<dt>Mediana</dt><dd>Valor do meio de uma lista ordenada. Menos sensível a extremos que a média.</dd>
<dt>Erro absoluto médio</dt><dd>Média dos erros em módulo, sem sinal. Mostra o tamanho típico do erro.</dd>
<dt>Série histórica</dt><dd>Os meses em que o corte tem preço calculado. Onde falta INPC, fica vazio.</dd>
</dl></section>""")

    # ---- licenças ----
    partes.append(f"""<section id="licencas"><h2>Licenças e citação</h2>
<p>Os dados são de instituições públicas (IBGE, DIEESE, ANP, Procons, IEA, UFAC) e de uma pesquisa do Mercado Mineiro.
Cada tabela indica a fonte. Ao reutilizar os números, cite a fonte original e esta página.</p>
<p>Citação sugerida: <em>ESSE ERA O PREÇO. Metodologia dos preços de carne e diesel por capital. Dados de {e(DATA)}.</em></p>
</section>""")

    # ---- changelog ----
    partes.append(f"""<section id="changelog"><h2>Changelog</h2>
<table><thead><tr><th>Data</th><th>Mudança</th></tr></thead><tbody>
<tr><td>{e(DATA)}</td><td>Versão 2: IEA/SP 2025–2026 nos 12 cortes; INPC nacional só para os 4 cortes
de São Paulo sem regional; capa e músculo com troca de fonte; ponto de dezembro/último mês, sem média;
margens de nível, caminho e total; 119 séries de corte; 27 capitais.</td></tr>
<tr><td>{e(DATA)}</td><td>Palmas (Procon Tocantins, 03/09/2026) e Aracaju (Procon Aracaju, 01–05/09/2025)
entram como âncoras observadas; Goiânia fica pendente porque a tabela publicada só tem mínimo/máximo;
a validação de nível passa a usar as comparações de 2026 (Aracaju/2025 não entra por defasagem).</td></tr>
<tr><td>{e(DATA)}</td><td>Diesel S10 e diesel comum (ANP, revenda) entram na página 09, abaixo dos
gráficos de carne: preço real em R$/L e litros por salário mínimo, com margem amostral e CV por célula.</td></tr>
</tbody></table></section>
</main>
</div>
</body>
</html>
""")

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text("".join(partes), encoding="utf-8")
    print(f"gravado: {SAIDA} ({SAIDA.stat().st_size // 1024} KB)")


def secao_cidade(c, rows, cob_map, carne_rows, carne_mes, val_cidade, geral):
    uf = rows[0]["uf"]
    pad = [x for x in rows if x["lista"] == "padrao"]
    ext = [x for x in rows if x["lista"] == "extra"]
    obs = [x for x in pad if x["tipo"] == "observado"]
    der = [x for x in pad if x["tipo"] == "derivado"]
    regional = rows[0]["inpc_serie"] == "regional"
    ms = [x["ano_mes"] for x in carne_rows]
    gap = texto_gaps(ms)
    setembro = carne_mes.get("2026-09")

    out = [f'<section id="{slug(c)}">',
           f'<div class="cidade-h"><h2>{e(c)} ({e(uf)})</h2>'
           f'<span class="badge {"st-obs" if setembro else "st-der"}">DIEESE {e(mes(min(ms)))} a {e(mes(max(ms)))}</span>'
           f'<span class="badge st-der">cortes: {sum(1 for x in pad if cob_map[(c, x["corte"])]["status"] == "serie")}/12 com série</span>'
           f'</div>']

    if setembro:
        txt = (f"A carne de primeira é medida pelo DIEESE em {e(c)} desde {e(mes(min(ms)))}. "
               f"Em set/2026, o quilo custava R$ {br(float(setembro['preco_nominal_rs_kg']))} "
               f"(R$ {br(float(setembro['preco_real_set2026_rs_kg']))} em valores de set/2026).")
        if gap:
            txt += f" A pesquisa tem um intervalo sem dado: {e(gap)}."
        out.append(f"<p><strong>Carne (DIEESE).</strong> {txt}</p>")
    else:
        out.append("<p><strong>Carne (DIEESE).</strong> Sem valor em set/2026.</p>")

    fontes_obs = sorted({fonte_curta(x["fonte"]) for x in obs})
    datas_obs = sorted({x["ano_mes"] for x in obs})
    fator = der[0]["fator_dieese"] if der else ""
    if c == REFERENCIA:
        texto = ("São Paulo é a referência. Os 12 cortes vêm da pesquisa do IEA, em ago/2026, e a série "
                 "histórica usa o INPC de São Paulo para cada corte.")
    elif obs and der:
        n_obs_txt = f"{len(obs)} corte" + ("s" if len(obs) != 1 else "")
        vem = "vêm" if len(obs) != 1 else "vem"
        if len(der) == 1:
            resto = "O outro corte é calculado"
        else:
            resto = f"Os outros {len(der)} cortes são calculados"
        texto = (f"{n_obs_txt} {vem} de pesquisa ({'; '.join(fontes_obs)}; "
                 f"{', '.join(mes(d) for d in datas_obs)}). "
                 f"{resto} a partir de São Paulo com o fator DIEESE {e(c)}/SP "
                 f"de {br(float(fator), 4)} (mediana de jun–ago/2026).")
    elif obs:
        texto = f"Os 12 cortes vêm de pesquisa ({'; '.join(fontes_obs)}; {', '.join(mes(d) for d in datas_obs)})."
    else:
        texto = (f"Os 12 cortes são calculados a partir de São Paulo com o fator DIEESE {e(c)}/SP "
                 f"de {br(float(fator), 4)} (mediana de jun–ago/2026).")
    out.append(f"<p><strong>Cortes.</strong> {e(texto)}</p>")

    if regional:
        out.append(f"<p><strong>Série histórica.</strong> Usa o INPC regional de {e(c)}, corte por corte. "
                   "Onde o INPC não publica o corte ou não chega a 2026, a série fica vazia.</p>")
    else:
        out.append("<p><strong>Série histórica.</strong> A cidade não tem INPC regional, então os cortes "
                   "não têm série. A tabela traz o preço de referência de 2026.</p>")

    if c in val_cidade:
        s = estatisticas(val_cidade[c])
        out.append(f"<p><strong>Validação nesta cidade:</strong> {s['n']} comparações, erro mediano "
                   f"{pct(s['mediana'])}, erro absoluto médio {pct(s['abs'])}, faixa {pct(s['min'])} a {pct(s['max'])}.</p>")

    out.append('<div class="wrap"><table><caption>Os 12 cortes</caption><thead><tr><th>Corte</th>'
               '<th class="num">Preço (R$/kg)</th><th>Tipo</th><th>Data</th><th>Como foi obtido</th>'
               '<th class="num">Margem</th><th>Fonte</th><th>Série histórica</th></tr></thead><tbody>')
    for x in pad:
        cob = cob_map[(c, x["corte"])]
        margem = f"±{br(float(x['margem_pct']))}%" if x["margem_pct"] else "—"
        titulo_margem = "" if x["margem_pct"] else ' title="a fonte não publica dispersão"'
        if x["tipo"] == "observado":
            fonte = link(x["fonte_url"], "fonte")
        else:
            fonte = f'{link(URL_IEA, "IEA")} + {link(URL_DIEESE, "DIEESE")}'
        out.append(f'<tr><td>{e(x["corte"])}</td><td class="num">{br(float(x["preco_rs_kg"]))}</td>'
                   f'<td>{badge(x["tipo"])}</td><td>{e(mes(x["ano_mes"]))}</td>'
                   f'<td>{e(x["calculo"])}</td><td class="num"{titulo_margem}>{e(margem)}</td>'
                   f'<td>{fonte}</td><td>{e(status_serie(cob))}</td></tr>')
    out.append("</tbody></table></div>")

    if ext:
        out.append("<p><strong>Outros cortes observados nesta cidade</strong> (fora da lista de 12):</p><ul>")
        for x in ext:
            out.append(f'<li>{e(x["corte"])}: R$ {br(float(x["preco_rs_kg"]))}/kg, {e(mes(x["ano_mes"]))}, '
                       f'{e(x["fonte"])}. {link(x["fonte_url"], "fonte")}</li>')
        out.append("</ul>")

    notas = sorted({x["observacao"] for x in der if x["observacao"]})
    for n in notas:
        out.append(f'<p class="nota">{e(n)}</p>')
    out.append("</section>")
    return "".join(out)


if __name__ == "__main__":
    main()
