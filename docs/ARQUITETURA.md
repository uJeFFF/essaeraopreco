# Arquitetura

[Voltar ao README](../README.md)

## Visão geral

```text
Gerador (seed fixa)  --XML NFC-e-->  Builder (Node)  --SQLite-->  bundle/
  1980 → 2026                           dedup pela chave           JSON
                                                                     |
                                                                     v
                                                              compilar-web
                                                                     |
                                                                     v
                                                              web/dados/  -->  Frontend
```

- O **gerador** faz o papel de um "portal da SEFAZ": emite XMLs de NFC-e
  sintéticos para desenvolvimento e testes.
- O **builder** lê os XMLs, acumula num SQLite local (nunca servido) e emite o
  **bundle JSON** (manifesto + shards + cubos pré-agregados).
- O **compilador web** lê o bundle e gera `web/dados/`, um conjunto enxuto com o
  heatmap, as contagens por faixa de preço e até 10 notas de exemplo por faixa.
- O **frontend** lê apenas `web/dados/`. Nada de usuário acessando banco.

O projeto não tem dependências externas: usa apenas o Node.js (incluindo
`node:sqlite` nativo) e HTML/CSS/JavaScript puro no frontend.

## Pipeline

### Gerador

Emite XMLs de NFC-e sintéticos em `data/xml/`, com seed fixa. Rodar com a mesma
seed reproduz exatamente o mesmo dataset.

```bash
node src/gerador/index.js --notas=100000 --de=1980 --ate=2026 --seed=20260101 --saida=data/xml
```

### Builder

Lê os XMLs, acumula no SQLite local e gera o bundle. O envio é **delta**: rodar
de novo só insere notas cuja `chave` ainda não existe. A operação é idempotente
pela chave de acesso.

```bash
node src/builder/index.js --entrada=data/xml --saida=bundle --banco=data/build.db
node src/builder/index.js --recomecar   # ignora o acumulado e reconstrói do zero
```

### Compilador web

Transforma o bundle no conjunto pequeno que o frontend consome.

```bash
node src/compilar-web.js --entrada=bundle --saida=web/dados
```

- Calcula a **mediana real e nominal de cada estado × ano**.
- Calcula a **mediana real de cada governo**, usando todas as notas de todos os
  estados e anos do período.
- Divide o intervalo de preços de cada célula em **10 faixas**.
- Cada faixa guarda no máximo **10 notas de exemplo**.
- A nota de menor preço e a de maior preço da faixa são sempre incluídas.
- As demais são sorteadas com `crypto.randomInt`, sem seed fixa.
- Cada execução gera um `web/dados/` diferente.

O bundle completo continua com médias ponderadas para análise; o `web/dados/`
que alimenta o heatmap é a camada de medianas.

O formato dos arquivos está em [DADOS.md](DADOS.md).

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
> - `produto` é o catálogo compartilhado (CARNE, PÃO, BISCOITO...). Cada compra
>   é um `item_nota`, resolvendo o N:N entre produto e nota.
> - Um mesmo item guarda **quantidade + unidade + valor total** como vieram na
>   nota. O preço unitário é derivado, então funciona tanto para "5 KG por
>   R$ 49,90" quanto para "3 UN de biscoito".
> - `*_real` = valor deflacionado para R$ de 2026 (ver seção de inflação).

## Moedas e inflação (1980–2026)

`item.valor_unitario`/`valor_total` estão no **valor nominal da moeda da época**
(`BRE1` cruzeiro, `BRC` cruzado, `BRN` cruzado novo, `BRR` cruzeiro real, `BRL`
real). Para comparar épocas, use o deflator:

```text
valorReal2026 = valorNominal × indiceInflacao[anoMes]
```

O índice (`series/inflacao.json`, base 2026 = 1) embute a inflação mensal
brasileira aproximada **e** os cortes de zeros das trocas de moeda.

## MVP atual

Para reduzir ruído, cada nota tem **1 item = 1 KG de carne bovina**. A estrutura
já suporta vários produtos, categorias e itens por nota — basta ampliar o
catálogo (`src/lib/catalogo.js`) e o gerador.

## Distribuição dos dados sintéticos

- ~100.000 notas de 1980 a 2026, mais concentradas nos anos recentes.
- Geografia ponderada por população (SP ~22%, MG ~10%, RJ ~8%...).
- Sazonalidade mensal (dez/jan compram mais).
- 156 estabelecimentos em 55 cidades de todos os 27 estados.

## Arquivos gerados

- `data/` (XMLs e o SQLite do builder) e `bundle/` **não são versionados**; são
  regeneráveis pelo pipeline.
- `web/dados/` **é versionado**, porque é o artefato estático publicado na
  Vercel.
