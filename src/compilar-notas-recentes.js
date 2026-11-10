// Compila o feed de ultimas notas da home.
//
//   node src/compilar-notas-recentes.js
//   node src/compilar-notas-recentes.js --entrada=web/dados --limite=5
//
// Le o base.json e os resumos estaduais ja gerados por compilar-web.js.
// Nao sorteia amostras nem altera os demais dados: apenas seleciona as notas
// mais recentes (ate a data de hoje) das amostras sinteticas existentes.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const ENTRADA = path.resolve(arg('entrada', 'web/dados'));
const SAIDA = path.resolve(arg('saida', path.join(ENTRADA, 'notas-recentes.json')));
const LIMITE = Math.max(1, Number(arg('limite', '5')) || 5);
const HOJE = arg('hoje', new Date().toISOString().slice(0, 10));

async function lerJson(caminho) {
  return JSON.parse(await readFile(caminho, 'utf8'));
}

function compararData(a, b) {
  return String(b.data).localeCompare(String(a.data)) || String(b.chave).localeCompare(String(a.chave));
}

async function main() {
  const base = await lerJson(path.join(ENTRADA, 'base.json'));

  if (!Array.isArray(base.estados) || !Array.isArray(base.anos)) {
    throw new Error('base.json nao tem os campos "estados" e "anos".');
  }

  const estabelecimentos = base.estabelecimentos ?? {};
  const arquivos = (await readdir(path.join(ENTRADA, 'estados')))
    .filter((arquivo) => arquivo.endsWith('.json'))
    .sort();

  const porUf = new Map();
  for (const arquivo of arquivos) {
    const uf = path.basename(arquivo, '.json');
    porUf.set(uf, await lerJson(path.join(ENTRADA, 'estados', arquivo)));
  }

  const todas = [];
  for (const estado of base.estados) {
    const resumo = porUf.get(estado.uf);
    if (!resumo) continue;

    for (const ano of resumo.anos ?? []) {
      const faixas = ano[4] ?? [];
      for (const faixa of faixas) {
        for (const nota of faixa ?? []) {
          todas.push({
            data: nota[2],
            uf: estado.uf,
            estabelecimento: estabelecimentos[nota[4]] ?? `#${nota[4]}`,
            precoRealCentavos: nota[0],
            precoNominalCentavos: nota[1],
            chave: nota[3],
          });
        }
      }
    }
  }

  if (!todas.length) {
    throw new Error('Nenhuma amostra de nota encontrada em web/dados/estados.');
  }

  const ateHoje = todas.filter((nota) => String(nota.data) <= HOJE);
  const universo = ateHoje.length ? ateHoje : todas;
  universo.sort(compararData);

  const notas = universo.slice(0, LIMITE);
  const dados = {
    schemaVersion: 1,
    geradoEm: new Date().toISOString(),
    origem: base.origem ?? 'sintetico',
    fonte: 'amostras sinteticas de web/dados/estados',
    limite: LIMITE,
    totalAmostras: todas.length,
    notas,
  };

  await mkdir(path.dirname(SAIDA), { recursive: true });
  const conteudo = JSON.stringify(dados);
  await writeFile(SAIDA, conteudo, 'utf8');

  console.log('Feed de notas recentes compilado:');
  console.log(`  Saida        : ${SAIDA}`);
  console.log(`  Amostras     : ${todas.length}`);
  console.log(`  Ate hoje     : ${ateHoje.length} (${HOJE})`);
  console.log(`  No feed      : ${notas.length}`);
  console.log(`  Tamanho      : ${(Buffer.byteLength(conteudo) / 1024).toFixed(1)} KB`);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
