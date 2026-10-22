# Deploy e desenvolvimento

[Voltar ao README](../README.md)

## Servidor local

O frontend faz `fetch` de JSON, o que não funciona em `file://`. O servidor
estático local serve `web/` na raiz:

```bash
npm run front
# http://localhost:8080/
```

O comando não recompila os dados. Ele usa o `web/dados/` que estiver no
repositório. Para renovar as amostras:

```bash
npm run compilar
```

## Vercel

O projeto publicado é a pasta `web/`. O `vercel.json` na raiz configura:

- `outputDirectory: "web"` — a Vercel serve `web/index.html` na raiz do domínio;
- `framework: null` — projeto estático, sem framework;
- `buildCommand: "node scripts/verificar-site.js"` — apenas verifica os arquivos
  obrigatórios, sem rodar o pipeline de dados;
- `installCommand: ""` — não há dependências para instalar;
- `headers` para `/dados/*` com `Cache-Control` de revalidação.

Mantenha o **Root Directory** da Vercel como a raiz do repositório. Não é
necessário mover o `index.html` para a raiz do projeto: ele está em `web/` e a
Vercel o encontra pelo `outputDirectory`.

### O que não vai para o deploy

- `data/` — XMLs e SQLite;
- `bundle/` — bundle completo;
- `src/` — pipeline de geração/build (o build da Vercel só usa `scripts/`);
- `node_modules/`.

O `.vercelignore` reforça essa lista. O `web/dados/` é versionado e é o dado que
o site publica.

## Compressão

A Vercel aplica gzip/Brotli automaticamente nas respostas JSON. O tamanho de
transferência de `web/dados/` fica em ~1,05 MB gzip / ~0,79 MB Brotli. Não é
necessário versionar arquivos `.gz`.

## Atualizar os dados publicados

```bash
npm run pipeline
git add web/dados
git commit -m "atualiza dados do frontend"
git push
```

`npm run compilar` sorteia novas notas de exemplo e altera `web/dados/` mesmo
que os XMLs e o bundle não tenham mudado. Isso é intencional; o site muda
quando você compila e faz push.

## Verificação

Antes de abrir um PR ou fazer deploy:

```bash
npm run verificar
```

O script confere `web/index.html`, `web/styles.css`, `web/app.js`,
`web/favicon.svg`, `web/dados/base.json` e os 27 arquivos de estado.
