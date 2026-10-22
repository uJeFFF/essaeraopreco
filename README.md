# PRECO

Banco de **notas fiscais de mercado** (NFC-e): uma base de dados estática de
preços de alimentos no Brasil, com pipeline de geração/ingestão e bundle
pré-agregado para um frontend estático (sem servidor, sem banco exposto).

## Visão geral

```
Gerador (seed fixa)  --XML NFC-e-->  Builder (Node)  --SQLite-->  bundle/  --compilar-web-->  web/dados/  -->  Frontend
  1980 → 2026                           dedup pela chave           JSON       amostras enxutas       JSON
```

- O **gerador** faz o papel de um "portal da SEFAZ": emite XMLs de NFC-e sintéticos.
- O **builder** lê os XMLs, acumula num SQLite local (nunca servido) e emite o
  **bundle JSON** (manifesto + shards + cubos pré-agregados).
- O **compilador web** lê o bundle e gera `web/dados/`, um conjunto enxuto com o
  heatmap, as contagens por faixa de preço e até 10 notas de exemplo por faixa.
- O **frontend** lê apenas `web/dados/`. Nada de usuário acessando banco.

Zero dependências: usa apenas o Node (inclui `node:sqlite` nativo).

## Como rodar

```bash
npm run gerar      # gera os XMLs sintéticos em data/xml/
npm run build      # lê os XMLs e gera o bundle em bundle/
npm run compilar   # gera os dados enxutos do frontend em web/dados/
npm run pipeline   # os três
npm run front      # serve web/ em http://localhost:8080/
```

Parâmetros:

```bash
# Gerador
node src/gerador/index.js --notas=100000 --de=1980 --ate=2026 --seed=20260101 --saida=data/xml

# Builder
node src/builder/index.js --entrada=data/xml --saida=bundle --banco=data/build.db
node src/builder/index.js --recomecar   # ignora o acumulado e reconstrói do zero

# Compilador do frontend
node src/compilar-web.js --entrada=bundle --saida=web/dados
```

O compilador web **sorteia** as notas de exemplo a cada execução. Rodar
`npm run compilar` de novo altera `web/dados/`, mesmo que os XMLs e o bundle
não tenham mudado. Isso é intencional: o popup mostra uma amostra diferente
a cada compilação.

O envio é **delta**: rodar o builder de novo só insere notas cujo `chave` ainda
não existe (idempotente por chave de acesso). Rodar o gerador com o mesmo
`--seed` reproduz exatamente o mesmo dataset.

## Modelo de dados (SQLite do builder)

| Tabela | Papel | Campos principais |
|---|---|---|
| `estado` | UF | `id` (código IBGE), `uf`, `nome` |
| `cidade` | município | `id` (IBGE), `nome`, `estado_id` |
| `estabelecimento` | mercado | `id`, `cnpj` (único), `nome`, `cidade_id` |
| `nota` | documento fiscal | `chave` (PK), `numero`, `serie`, `modelo`, `data`, `ano_mes`, `moeda`, `valor_total`, `valor_total_real`, `estabelecimento_id` |
| `produto` | catálogo canônico | `id`, `nome`, `categoria_id`, `unidade_base`, `ean` |
| `item_nota` | item da nota (N:N) | `nota_chave`, `produto_id`, `descricao`, `ean`, `ncm`, `unidade`, `quantidade`, `valor_unitario`, `valor_total`, `*_real`, `origem` |

> **Notas**
> - `produto` é o catálogo compartilhado (CARNE, PÃO, BISCOITO...). Cada compra é
>   um `item_nota`, resolvendo o N:N entre produto e nota.
> - Um mesmo item guarda **quantidade + unidade + valor total** como vieram na
>   nota. O preço unitário é derivado, então funciona tanto para "5 KG por
>   R$ 49,90" quanto para "3 UN de biscoito".
> - `*_real` = valor deflacionado para R$ de 2026 (ver seção de inflação).

## Moedas e inflação (1980–2026)

`item.valor_unitario`/`valor_total` estão no **valor nominal da moeda da época**
(`BRE1` cruzeiro, `BRC` cruzado, `BRN` cruzado novo, `BRR` cruzeiro real, `BRL`
real). Para comparar épocas, use o deflator:

```
valorReal2026 = valorNominal × indiceInflacao[anoMes]
```

O índice (`series/inflacao.json`, base 2026 = 1) embute a inflação mensal
brasileira aproximada **e** os cortes de zeros das trocas de moeda.

## Estrutura do bundle

```
bundle/
  meta.json                          # schemaVersion, período, contagens, ponteiros
  catalogo/
    estados.json  cidades.json  estabelecimentos.json  produtos.json  categorias.json
  fatos/                             # camada crua, shardada por ano
    notas-{ano}.json   itens-{ano}.json
  series/                            # cubos pré-agregados
    preco-mensal-produto.json         # evolução de preço (real) por produto
    preco-mensal-produto-estab.json   # preço por produto × estabelecimento (comparar mercados)
    preco-anual-estado.json           # preço real e nominal por estado × ano (heatmap)
    notas/{uf}.json                   # notas por estado (fonte do compilador web)
    gasto-mensal.json                 # gasto por mês × estado/cidade/estab × categoria
    inflacao.json                     # deflator mensal (base 2026 = 1)
  revisao.json                       # (opcional) descrições não mapeadas p/ curadoria
```

Exemplo de item em `series/preco-mensal-produto.json`:

```json
{ "produtoId": "CARNE-BOVINA", "anoMes": "2026-06", "precoMedio": 44.28,
  "precoMin": 41.52, "precoMax": 47.97, "nCompras": 6 }
```

Os preços das séries são **reais (R$ 2026)** e ponderados por quantidade. O valor
nominal de cada compra está na camada `fatos/`.

## Frontend (heatmap)

Heatmap **estado × ano** do preço real da carne: linhas = 27 estados, colunas =
1980–2026, cor da célula entre **ciano (mais barato)** e **preto (mais caro)**.
Células sem nota ficam em branco. As colunas são **agrupadas por governo federal**
(FIGUEIREDO, SARNEY, …, FHC 1/2, LULA 1/2/3, DILMA 1/2, TEMER, BOLSONARO).

Ao passar o mouse em uma célula, o popup mostra o preço corrigido, o valor
nominal da época, o total de notas e um histograma com **10 faixas de preço**.
Cada faixa guarda no máximo **10 notas de exemplo** (a de menor preço e a de
maior preço da faixa são sempre incluídas; as demais são sorteadas). A lista
indica quantas notas existem na faixa e quantas estão sendo exibidas.

```bash
npm run front    # serve web/ em http://localhost:8080/
```

> `file://` bloqueia `fetch`, por isso o servidor estático local.

Arquivos: `web/index.html`, `web/styles.css`, `web/app.js`.
O dado vem de `web/dados/base.json` e `web/dados/estados/{UF}.json`, gerados por
`npm run compilar`.

## Dados do frontend (`web/dados/`)

```text
web/dados/
  base.json                 # heatmap estado × ano + catálogo + estabelecimentos
  estados/{UF}.json         # por ano: min, max, 10 contagens e até 10 amostras/faixa
```

- `base.json` traz `anos`, `estados` (com `valores` em centavos) e o mapa de
  estabelecimentos usados no popup.
- Cada arquivo de estado traz, por ano:
  `[ano, minCentavos, maxCentavos, contagens[10], amostras[10]]`.
- Cada amostra é `[precoRealCentavos, precoNominalCentavos, data, chave, estabId]`.
- Se uma faixa tiver 10 notas ou menos, todas entram. Se tiver mais, entram a
  menor, a maior e 8 sorteadas.
- O sorteio usa `crypto.randomInt`; não há seed fixa.

Tamanho aproximado: **4,2 MB raw / ~1,1 MB gzip / ~0,8 MB Brotli** para as 100
mil notas de origem (56.648 amostras). O carregamento inicial é só o
`base.json` (~27 KB raw / ~10 KB gzip); o estado é baixado no primeiro hover.

## Deploy na Vercel

O projeto publicado é a pasta `web/`. O `vercel.json` já configura:

- `outputDirectory: "web"` — a Vercel serve `web/index.html` na raiz do domínio;
- `framework: null` e um build de verificação apenas, sem rodar o pipeline de dados;
- `bundle/` e `data/` continuam fora do deploy.

A Vercel aplica gzip/Brotli automaticamente nas respostas JSON. O tamanho de
transferência de `web/dados/` fica em ~1,05 MB gzip / ~0,79 MB Brotli; não é
necessário versionar arquivos `.gz`.

Como `web/dados/` é versionado, o deploy não precisa gerar dados. Para atualizar
os dados publicados:

```bash
npm run pipeline
git add web/dados
git commit -m "atualiza dados do frontend"
git push
```

Cada `npm run compilar` muda as amostras sorteadas e, portanto, o conteúdo de
`web/dados/`.

## MVP atual

Para reduzir ruído, cada nota tem **1 item = 1 KG de carne bovina**. A estrutura
já suporta vários produtos, categorias e itens por nota — basta ampliar o
catálogo (`src/lib/catalogo.js`) e o gerador.

## Distribuição dos dados

- ~100.000 notas de 1980 a 2026, mais concentradas nos anos recentes.
- Geografia ponderada por população (SP ~22%, MG ~10%, RJ ~8%...).
- Sazonalidade mensal (dez/jan compram mais).
- 156 estabelecimentos em 55 cidades de todos os 27 estados.

## Arquivos gerados

- `data/` (XMLs e o SQLite do builder) e `bundle/` **não são versionados**; são
  regeneráveis pelo pipeline.
- `web/dados/` **é versionado**, porque é o artefato estático publicado na
  Vercel. Ele é pequeno em relação ao bundle completo e não contém banco nem
  XMLs.
