"""Importa pesquisas de cortes em PDF e monta o registro de fontes.

Entradas (assetsexternos/fontes/):
  2026_palmas_pesquisa_acougue_e_peixaria_03_de_setembropdf.pdf
      Procon Tocantins, pesquisa em Palmas, 03/09/2026. Tabela por ponto de
      venda: 10 colunas de lojas + menor + maior. 34 itens, sendo 16 cortes
      bovinos (11 da lista de 12 + 5 extras).
  Cortes-de-Carne-SETEMBRO-2025.pdf
      Procon Aracaju, 01-05/09/2025. Tabela por loja: 7 lojas + menor + maior.
      16 cortes bovinos (10 da lista de 12 + 6 extras).

Saídas:
  assetsexternos/ancoras_observadas.csv  (linhas novas; o restante é preservado)
  assetsexternos/fontes_cortes.csv       (registro de fontes por capital)

Regras:
  - A âncora é a MEDIANA dos preços disponíveis por loja; não usamos o menor
    nem o maior preço da tabela.
  - Aracaju 2025 é usada como nível observado, mas não entra na validação de
    2026 (defasagem de 11 meses). A pesquisa de jun/2026 só publicou mínimo e
    máximo e o PDF de 2026 está com link quebrado; por isso não é âncora.
  - Goiânia 2026 entra apenas no registro de fontes: a tabela publicada tem
    mínimo/máximo, sem preço por loja.

Uso:
  python scripts/importar-fontes-cortes.py
"""

import csv
import re
import sys
import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    raise SystemExit("pypdf não instalado: pip install pypdf")

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "assetsexternos"
FONTES = PASTA / "fontes"
ARQ_ANCORAS = PASTA / "ancoras_observadas.csv"
ARQ_REGISTRO = PASTA / "fontes_cortes.csv"

PDF_PALMAS = FONTES / "2026_palmas_pesquisa_acougue_e_peixaria_03_de_setembropdf.pdf"
PDF_ARACAJU = FONTES / "Cortes-de-Carne-SETEMBRO-2025.pdf"

URL_PALMAS = "https://central.to.gov.br/download/489882"
URL_ARACAJU = ("https://procon.aracaju.se.gov.br/wp-content/uploads/2025/09/"
               "Cortes-de-Carne-SETEMBRO-2025.pdf")
URL_ARACAJU_2026 = ("https://procon.aracaju.se.gov.br/"
                    "procon-aracaju-divulga-pesquisa-de-precos-de-carnes-para-orientar-consumidores/")
URL_GOIANIA = ("https://www.diariodeaparecida.com.br/2026/02/06/"
               "pesquisa-do-procon-goiania-aponta-variacao-de-ate-200-no-preco-de-carnes-na-capital/")

FONTE_PALMAS = "Procon Tocantins - pesquisa de carnes em Palmas (03/09/2026)"
FONTE_ARACAJU = "Procon Aracaju - pesquisa de cortes de carne (01-05/09/2025)"

CABECALHO_ANCORAS = ["ano_mes", "cidade", "uf", "corte", "preco_rs_kg", "estatistica",
                     "canal", "fonte", "url", "confianca", "observacao"]
CABECALHO_REGISTRO = ["uf", "capital", "fonte", "tipo", "url", "data_pesquisa", "escopo",
                      "cortes", "estatistica", "status", "observacao"]

# Chaves em ASCII (sem acento), como saem do PDF depois da normalização.
MAPA_PALMAS = {
    "PICANHA": ("picanha", "padrao", ""),
    "FILE": ("filé-mignon", "padrao", "FILÉ na fonte; tratado como filé-mignon"),
    "ALCATRA": ("alcatra", "padrao", ""),
    "COXAO MOLE": ("coxão mole", "padrao", ""),
    "COXAO DURO": ("coxão duro", "padrao", ""),
    "CONTRA FILE": ("contrafilé", "padrao", ""),
    "PATINHO": ("patinho", "padrao", ""),
    "MUSCULO": ("músculo", "padrao", ""),
    "ACEM": ("acém", "padrao", ""),
    "LAGARTO": ("lagarto", "padrao", ""),
    "COSTELA DIANTEIRA": ("costela", "padrao", "costela dianteira na fonte"),
    "FRALDINHA": ("fraldinha", "extra", ""),
    "COSTELA MINDINHA": ("costela mindinha", "extra", ""),
    "CHAMBARI": ("chambari", "extra", ""),
    "PALETAO": ("paletão", "extra", ""),
    "PALETA C/ OSSO": ("paleta com osso", "extra", ""),
}

MAPA_ARACAJU = {
    "ALCATRA": ("alcatra", "padrao", ""),
    "CONTRA FILE": ("contrafilé", "padrao", ""),
    "COSTELA": ("costela", "padrao", ""),
    "COXAO DURO/CHA DE FORA": ("coxão duro", "padrao", "chã de fora na fonte"),
    "COXAO MOLE/CHA DE DENTRO": ("coxão mole", "padrao", "chã de dentro na fonte"),
    "FILE MIGNON": ("filé-mignon", "padrao", ""),
    "LAGARTO / LOMBO PAULISTA": ("lagarto", "padrao", "lagarto/lombo paulista na fonte"),
    "MUSCULO": ("músculo", "padrao",
                "a coluna 'maior' da fonte (30,99) não inclui o valor 31,99 da loja 1"),
    "PATINHO": ("patinho", "padrao", ""),
    "PICANHA": ("picanha", "padrao", ""),
    "ACEM COM OSSO": ("acém com osso", "extra", "com osso; não equivale ao acém sem osso"),
    "CUPIM": ("cupim", "extra", ""),
    "FRALDINHA": ("fraldinha", "extra", ""),
    "MAMINHA": ("maminha", "extra", ""),
    "PALETA COM OSSO": ("paleta com osso", "extra", ""),
    "PEITO COM OSSO": ("peito com osso", "extra", ""),
}


def normalizar(texto):
    """Remove acentos para o parser não depender da forma Unicode do PDF."""
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def texto_do_pdf(caminho):
    if not caminho.exists():
        raise SystemExit(f"PDF não encontrado: {caminho}")
    return normalizar("\n".join((p.extract_text() or "") for p in PdfReader(str(caminho)).pages))


def duas_casas(valor):
    if not isinstance(valor, Decimal):
        valor = Decimal(str(valor))
    return valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def mediana_decimal(valores):
    """Mediana exata em Decimal: evita 21,995 virar 21,99 por erro de float."""
    ordenados = sorted(valores)
    n = len(ordenados)
    if n % 2:
        return ordenados[n // 2]
    return (ordenados[n // 2 - 1] + ordenados[n // 2]) / Decimal(2)


def ler_palmas():
    """Devolve (produto, n_lojas, mediana, menor, maior) dos cortes mapeados."""
    texto = texto_do_pdf(PDF_PALMAS)
    padrao = re.compile(
        r"^([A-Z0-9 /]+?)\s+"
        r"((?:(?:R\$ )?[\d.,]+|\*+)(?:\s+(?:(?:R\$ )?[\d.,]+|\*+))*)"
        r"\s+([\d,]+)%$"
    )
    achados = []
    for linha in texto.splitlines():
        linha = " ".join(linha.split())
        m = padrao.match(linha)
        if not m:
            continue
        produto = m.group(1).strip()
        if produto not in MAPA_PALMAS:
            continue
        tokens = re.findall(r"(?:R\$ )?([\d.,]+)|\*+", m.group(2))
        valores = [Decimal(t.replace(".", "").replace(",", ".")) if t else None for t in tokens]
        if len(valores) != 12:
            raise SystemExit(f"Palmas/{produto}: esperados 12 valores, achados {len(valores)}")
        lojas, menor, maior = valores[:10], duas_casas(valores[10]), duas_casas(valores[11])
        disponiveis = [v for v in lojas if v is not None]
        if not disponiveis:
            raise SystemExit(f"Palmas/{produto}: nenhuma loja com preço")
        mediana = duas_casas(mediana_decimal(disponiveis))
        if duas_casas(min(disponiveis)) != menor or duas_casas(max(disponiveis)) != maior:
            print(f"AVISO Palmas/{produto}: menor/maior da tabela não batem com as lojas")
        achados.append((produto, len(disponiveis), mediana, menor, maior))
    return achados


def ler_aracaju():
    """Devolve (produto, n_lojas, mediana, menor, maior) dos 16 cortes bovinos."""
    texto = texto_do_pdf(PDF_ARACAJU)
    padrao = re.compile(
        r"^(\d+)\s+([A-Za-z0-9 /]+?)\s+"
        r"((?:(?:R\$ )?[\d.,]+|\*+)(?:\s+(?:(?:R\$ )?[\d.,]+|\*+))*)$"
    )
    achados = []
    for linha in texto.splitlines():
        linha = " ".join(linha.split())
        m = padrao.match(linha)
        if not m:
            continue
        item = int(m.group(1))
        if item > 16:  # depois do item 16 vêm suínos, linguiças e frango
            continue
        produto = m.group(2).strip().upper()
        if produto not in MAPA_ARACAJU:
            continue
        tokens = re.findall(r"(?:R\$ )?([\d.,]+)|\*+", m.group(3))
        valores = [Decimal(t.replace(".", "").replace(",", ".")) if t else None for t in tokens]
        if len(valores) != 9:
            raise SystemExit(f"Aracaju/{produto}: esperados 9 valores, achados {len(valores)}")
        lojas, menor, maior = valores[:7], duas_casas(valores[7]), duas_casas(valores[8])
        disponiveis = [v for v in lojas if v is not None]
        if not disponiveis:
            raise SystemExit(f"Aracaju/{produto}: nenhuma loja com preço")
        mediana = duas_casas(mediana_decimal(disponiveis))
        if duas_casas(min(disponiveis)) != menor or duas_casas(max(disponiveis)) != maior:
            print(f"AVISO Aracaju/{produto}: menor/maior da tabela não batem com as lojas")
        achados.append((produto, len(disponiveis), mediana, menor, maior))
    return achados


def linha_ancora(ano_mes, cidade, uf, corte, preco, estatistica, fonte, url, observacao):
    return [ano_mes, cidade, uf, corte, f"{preco:.2f}", estatistica, "varejo",
            fonte, url, "A", observacao]


def montar_ancoras():
    novas = []

    for produto, n, mediana, _, _ in ler_palmas():
        corte, lista, nota = MAPA_PALMAS[produto]
        obs = (f"PDF; {n} pontos de venda; 03/09/2026; "
               "tabela por loja; mediana das lojas")
        if nota:
            obs += f"; {nota}"
        obs += "; capa de filé não pesquisada"
        novas.append(linha_ancora("2026-09", "Palmas", "TO", corte, mediana,
                                  f"mediana ({n} pontos de venda)", FONTE_PALMAS,
                                  URL_PALMAS, obs))

    for produto, n, mediana, _, _ in ler_aracaju():
        corte, lista, nota = MAPA_ARACAJU[produto]
        obs = (f"PDF; {n} lojas; 01-05/09/2025; tabela por loja; "
               "mediana das lojas; não entra na validação de nível de 2026")
        if nota:
            obs += f"; {nota}"
        obs += ("; a pesquisa de jun/2026 só publicou mínimo/máximo e o PDF de 2026 "
                "está com link quebrado")
        novas.append(linha_ancora("2025-09", "Aracaju", "SE", corte, mediana,
                                  f"mediana ({n} lojas)", FONTE_ARACAJU,
                                  URL_ARACAJU, obs))

    return novas


def atualizar_ancoras(novas):
    with ARQ_ANCORAS.open(encoding="utf-8-sig", newline="") as f:
        antigas = list(csv.DictReader(f, delimiter=";"))
    # Remove apenas as linhas geradas por este importador; preserva o resto.
    fontes_novas = {FONTE_PALMAS, FONTE_ARACAJU}
    mantidas = [r for r in antigas if r["fonte"] not in fontes_novas]
    with ARQ_ANCORAS.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_ANCORAS)
        for r in mantidas:
            w.writerow([r[c] for c in CABECALHO_ANCORAS])
        w.writerows(novas)
    return len(mantidas), len(novas)


def montar_registro():
    """Registro de fontes: uma linha por capital/pesquisa, com o status."""
    linhas = [
        ["SP", "São Paulo", "IEA/SP - Preços médios no varejo", "estadual",
         "https://infoiea.agricultura.sp.gov.br/nia1/Precos_Medios.aspx?cod_sis=4",
         "2026-08", "capital", "12 cortes", "média ponderada", "aceita",
         "360 estabelecimentos; consulta gratuita 2025-2026"],
        ["MG", "Belo Horizonte", "Mercado Mineiro + comOferta", "privado",
         "https://ncnews.com.br/2026/10/13/churrasco-fica-mais-caro-em-bh-picanha-chega-a-r-12990-o-quilo/",
         "2026-10-05/07", "capital", "11 cortes (9 padrão + 2 extras)", "média", "aceita",
         "pesquisa divulgada em reportagem"],
        ["PB", "João Pessoa", "Procon-JP - pesquisa de carnes", "municipal",
         "https://sites.joaopessoa.pb.gov.br/procon/pesquisa-de-carne-e-franco-12-08-2026/",
         "2026-08-12", "capital", "13 cortes (11 padrão + 2 extras)", "mediana (23 lojas)", "aceita",
         "tabela por estabelecimento"],
        ["CE", "Fortaleza", "Procon Fortaleza - Pesquisa Supermercados", "municipal",
         "https://desenvolvimentoeconomico.fortaleza.ce.gov.br/procon/pesquisas-2026",
         "2026-10", "capital", "2 cortes", "média", "aceita", "coxão duro e coxão mole"],
        ["ES", "Vitória", "Procon Vitória - itens de primeira necessidade", "municipal",
         "https://www.vitoria.es.gov.br/noticia/pesquisa-do-procon-vitoria-revela-diferencas-nos-precos-de-itens-considerados-essenciais-57252",
         "2026-08", "capital", "1 corte", "não informado", "aceita", "acém sem osso"],
        ["AC", "Rio Branco", "UFAC - PET Economia", "universidade",
         "https://agazetadoacre.com/2026/06/noticias/geral/preco-da-carne-dispara-em-rio-branco-alcatra-sobe-quase-23-e-picanha-passa-de-r-70-o-quilo/",
         "2026-04", "capital", "2 cortes", "média", "aceita", "picanha e patinho"],
        ["TO", "Palmas", "Procon Tocantins - pesquisa de carnes em Palmas", "estadual (pesquisa na capital)",
         URL_PALMAS, "2026-09-03", "capital", "16 cortes bovinos (11 padrão + 5 extras)",
         "mediana (10 pontos de venda)", "aceita",
         "PDF com tabela por loja; a pesquisa é na capital, não é proxy estadual; "
         "COSTELA (linha após pernil) tratada como suína, e a costela bovina usada é a dianteira"],
        ["SE", "Aracaju", "Procon Aracaju - pesquisa de cortes de carne", "municipal",
         URL_ARACAJU, "2025-09-01/05", "capital", "16 cortes bovinos (10 padrão + 6 extras)",
         "mediana (7 lojas)", "aceita",
         "PDF com tabela por loja; o PDF de jun/2026 está quebrado (404)"],
        ["SE", "Aracaju", "Procon Aracaju - release de carnes (jun/2026)", "municipal",
         URL_ARACAJU_2026, "2026-06-01/02", "capital", "15 itens (bovinos, suínos, aves)",
         "mínimo/máximo", "não usada",
         "só publica mínimo e máximo, sem preço por loja; PDF de 2026 com link 404"],
        ["GO", "Goiânia", "Procon Goiânia - pesquisa de carnes", "municipal",
         URL_GOIANIA, "2026-01-30/02-02", "capital", "15 itens (10 no resumo)",
         "mínimo/máximo", "pendente",
         "9 lojas; a tabela publicada é um resumo com mínimo/máximo e 10 itens; picanha não publicada"],
        ["PE", "Recife", "Procon-PE - pesquisa de carnes RMR", "estadual",
         "https://www.procon.pe.gov.br/images/cb2022/set/PESQUISA_CARNES_LATICNIOS_E_PRESUNTOS_-_SETEMBRO_2022.pdf",
         "2022-09", "RMR (não é a capital)", "6 cortes", "média (22 lojas)", "não usada (2022)",
         "observação de 2022, não inflacionada; não serve de âncora para 2026"],
        ["MT", "Cuiabá", "Procon-MT", "estadual", "—", "—", "capital",
         "carne bovina (genérica)", "—", "não usada",
         "só publica 'carne bovina' genérica; sem corte nomeado"],
        ["AM", "Manaus", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["BA", "Salvador", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["DF", "Brasília", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["PA", "Belém", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["PR", "Curitiba", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["RJ", "Rio de Janeiro", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["RN", "Natal", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["RS", "Porto Alegre", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["SC", "Florianópolis", "—", "—", "—", "—", "capital", "—", "—", "não localizada",
         "pesquisa municipal 2025-2026 com tabela por loja não localizada"],
        ["AL", "Maceió", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["AP", "Macapá", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["MA", "São Luís", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["MS", "Campo Grande", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["PI", "Teresina", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["RO", "Porto Velho", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
        ["RR", "Boa Vista", "—", "—", "—", "—", "capital", "—", "—", "a pesquisar",
         "não pesquisada nesta rodada"],
    ]
    return linhas


def gravar_registro(linhas):
    with ARQ_REGISTRO.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_REGISTRO)
        w.writerows(linhas)


def main():
    print("=" * 70)
    print("PALMAS 2026")
    for produto, n, mediana, menor, maior in ler_palmas():
        print(f"  {produto:22} n={n:2} mediana={mediana:7.2f}  menor={menor:7.2f}  maior={maior:7.2f}")
    print("=" * 70)
    print("ARACAJU 2025")
    for produto, n, mediana, menor, maior in ler_aracaju():
        print(f"  {produto:22} n={n:2} mediana={mediana:7.2f}  menor={menor:7.2f}  maior={maior:7.2f}")

    novas = montar_ancoras()
    mantidas, n_novas = atualizar_ancoras(novas)
    registro = montar_registro()
    gravar_registro(registro)

    print("=" * 70)
    print(f"ancoras_observadas.csv: {mantidas} linhas mantidas + {n_novas} novas")
    print(f"fontes_cortes.csv: {len(registro)} linhas")
    print("Palmas: 11 cortes padrão + 5 extras; Aracaju: 10 padrão + 6 extras")


if __name__ == "__main__":
    main()
