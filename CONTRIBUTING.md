# Contribuindo com o ESSE ERA O PREÇO

[Voltar ao README](README.md)

Obrigado pelo interesse! Este é um projeto open source e toda ajuda é
bem-vinda: código, documentação, dados, testes, ideias de produtos e relatos
de bugs.

## Tipos de contribuição

- **Bugs e melhorias** no heatmap, no popup ou no pipeline.
- **Novos produtos e categorias** no catálogo.
- **Importação e validação de NFC-e** para o futuro envio de notas.
- **Documentação** e exemplos.
- **Testes** manuais e automatizados.
- **Ideias** para a visualização e para a política de dados.

Para propostas maiores, abra uma issue antes de começar um PR.

## Desenvolvimento

Requisitos:

- Node.js **>= 22.5** (o builder usa `node:sqlite` nativo);
- nenhuma dependência externa.

O frontend funciona sem gerar dados de novo, porque `web/dados/` é versionado:

```bash
npm run front      # http://localhost:8080/
npm run verificar  # checagem usada no deploy
```

Para regenerar o pipeline completo:

```bash
npm run gerar      # XMLs sintéticos em data/xml/
npm run build      # bundle completo em bundle/
npm run compilar   # dados enxutos em web/dados/
npm run pipeline   # os três
```

### Atenção ao `web/dados/`

`npm run compilar` sorteia novas notas de exemplo a cada execução. Ele altera
`web/dados/` mesmo que os XMLs e o bundle não tenham mudado. Isso é
intencional. Se você recompilar, revise e commite esses arquivos junto.

`data/` e `bundle/` são regeneráveis e não são versionados.

## Antes de abrir um PR

1. Rode `npm run verificar`.
2. Teste o frontend em `http://localhost:8080/`.
3. Confira se `web/dados/` está consistente, se você o alterou.
4. Descreva o que mudou e por quê.

## Privacidade

O envio de notas reais ainda não está aberto. Quando estiver, não envie nem
commite notas com dados pessoais (CPF/CNPJ do consumidor, endereço, forma de
pagamento). O projeto publica apenas dados agregados de preço, produto,
estabelecimento e localidade.

A chave de acesso é usada para deduplicação e para o link de consulta na SEFAZ.

## Licença

Ao contribuir, você concorda que sua contribuição fica sob a licença
[MIT](LICENSE) do projeto.
