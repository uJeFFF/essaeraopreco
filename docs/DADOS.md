# Dados

[Voltar ao README](../README.md)

## Bundle completo (`bundle/`)

Gerado pelo builder, não versionado, usado para análise e como fonte do
compilador web.

```text
bundle/
  meta.json                          # schemaVersion, período, contagens, ponteiros
  catalogo/
    estados.json  cidades.json  estabelecimentos.json  produtos.json  categorias.json
  fatos/                             # camada crua, shardada por ano
    notas-{ano}.json   itens-{ano}.json
  series/                            # cubos pré-agregados
    preco-mensal-produto.json         # evolução de preço (real) por produto
    preco-mensal-produto-estab.json   # preço por produto × estabelecimento
    preco-anual-estado.json           # preço real e nominal por estado × ano
    notas/{uf}.json                   # notas por estado (fonte do compilador web)
    gasto-mensal.json                 # gasto por mês × estado/cidade/estab × categoria
    inflacao.json                     # deflator mensal (base 2026 = 1)
  revisao.json                       # (opcional) descrições não mapeadas
```

Exemplo de item em `series/preco-mensal-produto.json`:

```json
{ "produtoId": "CARNE-BOVINA", "anoMes": "2026-06", "precoMedio": 44.28,
  "precoMin": 41.52, "precoMax": 47.97, "nCompras": 6 }
```

Os preços das séries são **reais (R$ 2026)** e ponderados por quantidade. O valor
nominal de cada compra está na camada `fatos/`. O bundle completo continua com
essas médias; é o `web/dados/` que o frontend consome com medianas.

## Frontend

O heatmap mostra **estado × ano** da **mediana real** da carne, com linhas para
os 27 estados e colunas de 1980 a 2026. As colunas são agrupadas por governo
federal (FIGUEIREDO, SARNEY, COLLOR, ITAMAR, FHC 1/2, LULA 1/2/3, DILMA 1/2,
TEMER, BOLSONARO). A cor vai de **ciano (mais barato)** a **preto (mais caro)**;
células sem nota ficam em branco.

Abaixo do nome de cada governo há uma faixa com a **mediana real de todas as
notas do governo**, usando todos os estados e todos os anos do período. Essa
faixa não muda com os filtros; ela serve como referência do governo. Quando o
valor não cabe na largura da coluna, a célula permite rolagem horizontal e
mostra o valor completo em um chip flutuante no hover.

O popup de cada célula mostra a **mediana corrigida**, a mediana nominal da
época, o total de notas, um histograma com 10 faixas e uma lista com até 10
notas de exemplo por faixa. Os arquivos de estado são carregados sob demanda e
ficam em cache na página.

### Streamgraph (`/02/`)

O segundo frontend, em `web/02/`, mostra um **streamgraph de UF × ano**:

- cada onda é uma UF;
- o centro da onda acompanha a **mediana real** do ano;
- a espessura é o **range (máximo − mínimo)** do ano, desenhado
  simetricamente em torno da mediana;
- todas as ondas usam o mesmo ciano com **10% de opacidade**, então a
  sobreposição fica visível;
- o hover destaca uma onda, mostra a linha da mediana, o ano, o mínimo, o
  máximo e o número de notas;
- anos sem nota entre o primeiro e o último ano da UF são interpolados
  linearmente; não há extrapolação nas pontas;
- a página não tem filtros: exibe a série inteira de 1980 a 2026, com a faixa
  dos governos no topo e uma tira de UFs para identificação.

A página lê `web/dados/ondas.json` e reaproveita `web/governos.js`.

## Dados do frontend (`web/dados/`)

Gerado por `npm run compilar`, versionado e publicado na Vercel.

```text
web/dados/
  base.json                 # medianas estado × ano, medianas por governo e catálogo
  ondas.json                # mediana, min, max e n por UF × ano (streamgraph)
  estados/{UF}.json         # por ano: min, max, 10 contagens e até 10 amostras/faixa
```

### `base.json`

Traz:

- `origem` e `geradoEm`;
- `periodo`, `contagens` e `anos`;
- `produto` (rótulo exibido no título);
- `estados` com `valores` no formato
  `[medianaRealCentavos, medianaNominalCentavos, nCompras]` ou `null` quando não
  há dados no ano;
- `governos` no formato
  `{ nome: { de, ate, medianaCentavos, nNotas } }`;
- `estabelecimentos` no formato `{ id: nome }`.

As medianas de `estados` são calculadas com todas as notas daquele estado e
ano. As medianas de `governos` são calculadas com todas as notas do governo,
somando todos os estados e todos os anos do período. O heatmap usa essas
medianas para a escala de cores e para o preço corrigido do popup.

### `estados/{UF}.json`

Cada arquivo traz `uf`, `faixas` e uma lista `anos`. Cada ano é:

```text
[ano, minCentavos, maxCentavos, contagens[10], amostras[10]]
```

Cada amostra é:

```text
[precoRealCentavos, precoNominalCentavos, data, chave, estabId]
```

### `ondas.json`

Arquivo enxuto do streamgraph, gerado por `npm run compilar:ondas` (também roda
no fim de `npm run compilar`). Ele combina a mediana de `base.json` com o
mínimo e o máximo de `estados/{UF}.json`, sem carregar as amostras no browser.

```text
{
  schemaVersion: 1,
  geradoEm, origem, periodo, anos, produto, contagens,
  estados: [
    { id, uf, nome, valores: [[ano, medianaCentavos, minCentavos, maxCentavos, nNotas], ...] }
  ]
}
```

`valores` traz somente os anos com nota; o frontend interpola os anos vazios
entre o primeiro e o último ponto de cada UF.

Para gerar apenas esse arquivo sem sortear novas amostras:

```bash
npm run compilar:ondas
```

### Amostragem

- O intervalo `mín–máx` de cada célula é dividido em **10 faixas**.
- Se a faixa tiver 10 notas ou menos, todas entram.
- Se tiver mais, entram a nota de menor preço, a de maior preço e 8 sorteadas.
- Empates no menor/maior preço são sorteados.
- O sorteio usa `crypto.randomInt`, sem seed fixa: cada `npm run compilar` muda
  as amostras de `web/dados/`.

### Tamanho aproximado

Com as 100 mil notas sintéticas atuais:

- **56.648 amostras**;
- **~4,2 MB raw / ~1,1 MB gzip / ~0,8 MB Brotli**;
- `base.json` com ~27 KB raw / ~10 KB gzip;
- `ondas.json` com ~33 KB raw / ~12 KB gzip / ~9 KB Brotli;
- o estado é baixado sob demanda no primeiro hover do popup.

A Vercel aplica gzip/Brotli automaticamente; não é necessário versionar `.gz`.

## Atualização

```bash
npm run compilar
git add web/dados
git commit -m "atualiza dados do frontend"
git push
```

`data/` e `bundle/` continuam fora do Git. Veja [DEPLOY.md](DEPLOY.md).
