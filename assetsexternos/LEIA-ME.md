# Dados externos: INPC, DIEESE, IPCA e séries de preço

Arquivos de apoio do site, gerados pelos scripts em `scripts/`. Cada seção indica o script e a fonte.

## INPC por subitem: carne e cesta básica

Gerado por `scripts/baixar-inpc.py` a partir do FTP do IBGE
(`ftp.ibge.gov.br/Precos_Indices_de_Precos_ao_Consumidor`).
Para atualizar, rode o script de novo: ele reaproveita os zips já baixados em `data/fontes/inpc/`.

## Arquivos

| Arquivo | Linhas | Uso |
|---|---|---|
| `inpc_carne_cesta.csv` | 84.740 | Recorte para o site: cortes de carne bovina, agregados de carne e os itens da cesta básica. Versionado. |
| `inpc_subitens_completo.csv` | 1.202.358 | Todos os 447 subitens publicados, nacional e regiões. Arquivo histórico. **Não versionado** (130 MB, acima do limite do GitHub). |

## Formato

- Separador `;`, decimal `.`, codificação UTF-8 com BOM (abre direto no Excel).
- Colunas:
  - `ano_mes`: `AAAA-MM`
  - `indice`: `INPC` ou `IPCA` (ver cobertura)
  - `regiao`: sigla publicada pelo IBGE; `NACIONAL` é o Brasil
  - `rotulo_original`: nome exatamente como está na planilha do IBGE
  - `subitem_normalizado`: minúsculas, sem acento, sem código
  - `item_canonico`: nome unificado quando a grafia muda ao longo da série (ex.: `file mignon` e `file-mignon` viram `file-mignon`)
  - `quebra_de_serie`: preenchida quando o item foi reclassificado e **não é a mesma série**
  - `codigo_sidra`: código de categoria da SIDRA (tabelas 1419, 7060 e 7063); vazio quando o nome não casa
  - `variacao_mensal_pct`: variação mensal publicada pelo IBGE
  - `peso_nacional_pct`: peso do subitem no índice nacional, quando publicado
  - `linha_planilha`: número da linha na planilha de origem (desambigua rótulos repetidos, como "SORVETE")
  - `arquivo_origem`: zip de origem

## Cobertura

- **INPC:** 2005-01 e 2008-01 a 2026-09 (226 meses).
- **IPCA (no arquivo completo apenas):** 2005-02 a 2007-12 (35 meses). Nesse período o IBGE publicou só o IPCA nos arquivos. O recorte do site não usa esses meses.
- **Regiões:** 11 regiões metropolitanas até 2013; Vitória e Campo Grande entram em 2014-01; Aracaju, Rio Branco e São Luís entram em 2018-05. Mais o NACIONAL em todo o período.

## Limites conhecidos

- **Sem marcas.** O IBGE publica só o subitem agregado (ex.: "arroz", não "Tio João").
- **Cortes que o INPC não publica:** maminha, fraldinha e chã de fora (coxão duro). Estão no IEA/SP, nas Procon e no Mercado Mineiro, não aqui.
- **Início tardio:** picanha desde 2020-01; chã de dentro desde 2012-01; capa de filé desde 2008-01; lagarto comum desde 2012-01.
- **Filé-mignon:** ausente de 2008-01 a 2011-12 na publicação do INPC.
- **Quebras de série:** `leite pasteurizado` (até 2011) foi reclassificado como `leite longa vida` em 2012; `lagarto plano` (até 2011) foi reclassificado em 2012 como lagarto redondo/comum. São marcadas em `quebra_de_serie`. Não tratar como continuidade sem checar.
- **Rótulos repetidos:** alguns rótulos aparecem duas vezes na mesma aba (ex.: SORVETE, CERVEJA). Não afetam o recorte do site; `linha_planilha` diferencia.

## Validação

Em 2026-09, a variação nacional de cada subitem que casa com a SIDRA (tabela 7063) foi comparada com a API. 431 de 431 batem.

## DIEESE: preço médio da carne por capital

Gerado por `scripts/baixar-dieese-carne.py` a partir do Banco de Dados da Cesta Básica
(`dieese.org.br/cesta`, produto "Carne", tipo "Preço médio", todas as cidades).

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `dieese_carne.csv` | 11.004 | Preço R$/kg por cidade e mês, 393 meses (1994-01 a 2026-09), 28 cidades |
| `dieese_fatores_vs_sp.csv` | 7.006 | Razão `cidade / São Paulo` por mês: o fator regional de carne |

- Preço "Carne" = carne bovina de primeira (coxão mole, coxão duro e patinho, sem osso), média da pesquisa de cada capital.
- **Moeda:** os meses de jan a jun/1994 estão em cruzeiro real na fonte. A série em R$/kg (`serie_carne_dieese.csv`) começa em jul/1994, quando o real entrou em vigor; os meses anteriores ficam fora, sem conversão.
- Células vazias em `preco_carne_rs_kg` = a cidade não era pesquisada naquele mês. Início de coleta: a maioria das capitais em 1994; Goiânia 1994-12; Aracaju 1995-09; Manaus 2008-09; Campo Grande 2012-10; Cuiabá, Boa Vista, Macapá, Palmas, Porto Velho, Rio Branco, Maceió, São Luís e Teresina em 2016-01; Macaé (não é capital) de 2012-07 a 2020-12.
- São Paulo tem preço em todos os 393 meses, então o fator existe para todas as cidades que têm preço no mês.
- Coluna `e_capital` (1/0) separa as capitais de Macaé.
- Validação: set/2026 bate com a consulta direta ao site (SP R$ 56,07; RJ R$ 54,36).

## Salário mínimo

Gerado por `scripts/baixar-salario-minimo.py`.

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `salario_minimo.csv` | 387 | Salário mínimo nominal em vigor por mês, jul/1994 a set/2026 |

- Fonte: DIEESE, "Salário mínimo nominal e necessário" (`https://www.dieese.org.br/analisecestabasica/salarioMinimo.html`).
- Usamos a coluna **nominal**; a coluna "necessário" é o valor para comprar a cesta básica inteira, não o salário pago.
- 1994-07: R$ 64,79; 2008-12: R$ 415,00; 2026-09: R$ 1.621,00.

## Âncoras de corte por capital (observadas e derivadas)

Gerado por `scripts/derivar-ancoras.py` (âncoras e validação) e por
`scripts/importar-fontes-cortes.py` (observações de Palmas/Aracaju e registro de fontes).

| Arquivo | Conteúdo |
|---|---|
| `ancoras_observadas.csv` | 79 linhas de preço observado (IEA/SP, Mercado Mineiro/BH, Procon-JP, Procon Fortaleza, Procon Vitória, UFAC/Rio Branco, Procon Tocantins/Palmas 2026, Procon Aracaju/Aracaju 2025 e Procon-PE/Recife 2022), com fonte, data, canal e confiança A/B/C |
| `ancoras_por_capital.csv` | 341 linhas: 324 padrão (27 capitais x 12 cortes da IEA) + 17 extras observados (6 antigos + 11 novos). `tipo` = `observado` ou `derivado` |
| `ancoras_validacao.csv` | 34 comparações derivado x observado de 2026 (sem Recife 2022 e sem Aracaju 2025, que não são comparáveis) |
| `fontes_cortes.csv` | 28 linhas de registro de fontes por capital: fonte, tipo, URL, data, escopo, cortes, estatística, status e observação |

**Como o derivado é calculado:** `preço_corte,capital = preço_corte,SP (IEA, ago/2026) x fator DIEESE carne (capital/SP, mediana de jun–ago/2026)`.

**Validação (erro = derivado/observado - 1):**

| Cidade | Cortes | Erro mediano | Erro absoluto médio | Faixa |
|---|---|---|---|---|
| Belo Horizonte | 9 | -6,3% | 5,9% | -11,5% a +0,3% |
| Fortaleza | 2 | -2,7% | 2,7% | -5,3% a -0,1% |
| João Pessoa | 9 | +1,2% | 7,2% | -9,4% a +18,4% |
| Palmas | 11 | -2,6% | 5,4% | -9,0% a +11,2% |
| Rio Branco | 2 | -1,4% | 8,1% | -9,5% a +6,7% |
| Vitória | 1 | +2,9% | 2,9% | +2,9% a +2,9% |

**Limites que valem para qualquer uso:**
- O erro por corte vai de -11,5% a +18,4%. Picanha (João Pessoa +18,4%) e contrafilé (+11,4%) são os mais instáveis; patinho e coxão duro são os mais próximos.
- Em BH, o derivado fica abaixo do observado em 7 de 9 cortes. Isso é viés da cidade, não ruído: um único fator de carne não captura bem a composição de BH.
- A validação tem 34 comparações em 6 cidades. É pequena e indicativa, não estatística.
- BH e Fortaleza são comparadas com o preço de SP de ago/2026 e o fator mediano de jun–ago/2026, mas a observação é de out/2026. Palmas é de set/2026 e Rio Branco de abr/2026; nesses casos a comparação mistura método e mês.
- Aracaju (set/2025) é usada como âncora de nível e para começar a série, mas não entra na validação de 2026 por defasagem de 11 meses.
- Os valores derivados devem ser exibidos como **estimativa**, nunca como preço observado.

### Registro de fontes

`fontes_cortes.csv` tem uma linha por capital/pesquisa, com `uf`, `capital`, `fonte`, `tipo`, `url`, `data_pesquisa`, `escopo`, `cortes`, `estatistica`, `status` e `observacao`.

- **Aceitas (8 capitais):** São Paulo (IEA), Belo Horizonte (Mercado Mineiro), João Pessoa (Procon-JP), Fortaleza (Procon Fortaleza), Vitória (Procon Vitória), Rio Branco (UFAC), Palmas (Procon Tocantins) e Aracaju (Procon Aracaju, set/2025).
- **Pendente:** Goiânia — a pesquisa de 30/01–02/02/2026 tem 9 lojas e 15 itens, mas a tabela publicada só tem mínimo/máximo e 10 itens, sem preço por loja. Não foi usada.
- **Não usadas:** release de Aracaju de jun/2026 (só mínimo/máximo; o PDF de 2026 está com link quebrado 404), Recife 2022 (não inflacionada) e Cuiabá (Procon-MT só publica "carne bovina" genérica).
- **Não localizadas (9):** Manaus, Salvador, Brasília, Belém, Curitiba, Rio de Janeiro, Natal, Porto Alegre e Florianópolis.
- **A pesquisar (7):** Maceió, Macapá, São Luís, Campo Grande, Teresina, Porto Velho e Boa Vista.

Os PDFs originais ficam em `assetsexternos/fontes/` (Palmas 2026 e Aracaju 2025) e são lidos por `scripts/importar-fontes-cortes.py`; o script calcula a mediana por loja e não usa mínimo/máximo como âncora. Ele precisa de `pypdf` (`pip install pypdf`).

## IPCA (deflator)

Gerado por `scripts/baixar-ipca.py`.

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `ipca_indice.csv` | 562 | Número-índice do IPCA (dez/1993 = 100), 1979-12 a 2026-09 |

- Fonte: SIDRA, tabela 1737, variável 2266.
- Uso: `preço real = preço nominal x IPCA(set/2026) / IPCA(mês)`. O resultado continua em R$/kg, com poder de compra de set/2026.

## Séries de preço

Geradas por `scripts/gerar-series.py` e `scripts/gerar-series-sp.py`.

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `serie_carne_dieese.csv` | 6.852 | Carne bovina de primeira (DIEESE), 27 capitais, nominal e real. Começa em jul/1994; uma linha por mês com valor |
| `serie_cortes.csv` | 19.768 | 12 cortes por capital, estimados a partir da âncora, do INPC regional e, em São Paulo, do IEA 2025-2026 e do INPC nacional. `fonte_linha` diz a fonte de cada linha |
| `cobertura_cortes.csv` | 324 | Uma linha por capital x corte, com o status da série e o motivo |
| `iea_varejo_sp.csv` | 240 | IEA/SP 2025-2026, 12 cortes, varejo, mensal. A consulta é gratuita; a série completa desde 1970 é paga |

**Regras da série de cortes:**
- Só existe série onde a capital tem INPC regional para o corte. **Exceção:** São Paulo usa o INPC nacional para picanha, capa de filé, filé-mignon e músculo; as outras capitais não têm esse fallback.
- Capa de filé: regional em São Paulo até 2011, nacional depois. Músculo: nacional, porque o regional tem falhas.
- O IEA 2025-2026 de São Paulo é observado e substitui o valor derivado nesses meses. O IEA 2025-2026 é gratuito; a série completa desde 1970 é vendida pelo IEA.
- A variação do INPC precisa existir no mês da âncora.
- Um mês só recebe valor se há variação em todos os meses entre ele e a âncora. Buraco na variação interrompe a cadeia; não há interpolação.
- Coxão duro não tem subitem no INPC: em São Paulo, só IEA 2025-2026; nas demais, sem série.
- Séries que terminaram em 2019 (troca de cesta do INPC) não chegam à âncora de 2026 e ficam sem série.

**Status em 2026-11-06:**
- 119 séries construídas; São Paulo tem os 12 cortes; 7 de BH começam com o INPC de out/2026 (ainda não publicado).
- 51 sem série porque o INPC regional não chega à âncora.
- 132 sem série porque a capital não tem INPC regional (11 capitais x 12 cortes).
- 15 de coxão duro nas capitais com INPC regional; em São Paulo, o coxão duro tem série IEA.
- Aracaju: 10 cortes observados em set/2025 e 2 derivados; 8/12 com série. Palmas: 11 observados em set/2026 e 1 derivado; 0/12 com série (sem INPC regional), mas os 11 pontos observados aparecem no heatmap de 2026.

## Heatmap da página 09

Gerado por `scripts/gerar-heatmap.py`.

| Arquivo | Conteúdo |
|---|---|
| `web/dados/heatmap.json` | Preço real (R$/kg de set/2026) e % do salário mínimo por capital × ano, com as margens, para a página `web/09/` |

- Quatro blocos: preço e % do salário mínimo, para a carne do DIEESE e para os 12 cortes.
- Preço: R$/kg de set/2026 (real, corrigido pelo IPCA).
- %: preço nominal do mês / salário mínimo nominal do mês × 100.
- Cada célula é **dezembro** do ano; 2026 = último mês disponível (set/2026; São Paulo: ago/2026, o último IEA). Não há média anual.
- Células sem dado viram `null` e aparecem hachuradas na página.
- Palmas não tem série, mas os 11 cortes observados em set/2026 entram como ponto único no ano de 2026; os anos anteriores ficam vazios.
- `margens`: nível (34 comparações de 2026 cidade × corte), caminho (INPC contra o IEA 2025-2026, corte por corte), total (quadratura) e soma (limite superior).

## O que isto não é

- A série de cortes é **estimada**, não observada. As âncoras de pesquisa (IEA/SP, Procons, Mercado Mineiro, UFAC) são observadas no mês da coleta; a série entre elas é estimada pelo INPC. Aracaju usa a âncora de set/2025; Palmas não tem série e aparece só no ponto de 2026.
- Aracaju/2025 é a única âncora fora de 2026; ela não entra na validação de nível de 2026.
- O INPC nacional é uma **exceção só de São Paulo** (picanha, capa, filé e músculo); as outras capitais usam só o regional.
- A série completa do IEA desde 1970 é **paga**; a consulta gratuita cobre 2025-2026.
- O heatmap usa um **ponto** (dezembro; 2026 = último mês), não uma média anual.
- A margem de **nível** é do mês da âncora; a de **caminho** é medida no IEA 2025-2026; o **total** combina as duas. O IEA e o DIEESE não publicam dispersão.
- Não há média nacional: o DIEESE não tem série completa nas 27 capitais, e uma média com buraco ou base variável enganaria.
