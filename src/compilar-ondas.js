// Compila o arquivo enxuto usado pelo streamgraph do /02/.
//
//   node src/compilar-ondas.js
//   node src/compilar-ondas.js --entrada=web/dados --saida=web/dados/ondas.json
//
// Le o base.json (medianas) e os resumos estaduais (minimos e maximos) gerados
// por compilar-web.js. Nao sorteia amostras nem altera os demais dados.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const ENTRADA = path.resolve(arg('entrada', 'web/dados'));
const SAIDA = path.resolve(arg('saida', path.join(ENTRADA, 'ondas.json')));

async function lerJson(caminho) {
  return JSON.parse(await readFile(caminho, 'utf8'));
}

async function main() {
  const base = await lerJson(path.join(ENTRADA, 'base.json'));

  if (!Array.isArray(base.anos) || !Array.isArray(base.estados)) {
    throw new Error('base.json nao tem os campos "anos" e "estados".');
  }

  const estados = [];
  let totalPontos = 0;

  for (const estado of base.estados) {
    const resumo = await lerJson(path.join(ENTRADA, 'estados', `${estado.uf}.json`));
    const faixasPorAno = new Map(resumo.anos.map(([ano, min, max]) => [ano, [min, max]]));
    const valores = [];

    for (let i = 0; i < base.anos.length; i++) {
      const valor = estado.valores?.[i];
      if (!valor) continue;

      const ano = base.anos[i];
      const faixa = faixasPorAno.get(ano);
      if (!faixa) {
        throw new Error(`${estado.uf}/${ano}: sem minimo/maximo em estados/${estado.uf}.json.`);
      }

      valores.push([ano, valor[0], faixa[0], faixa[1], valor[2]]);
      totalPontos++;
    }

    estados.push({
      id: estado.id,
      uf: estado.uf,
      nome: estado.nome,
      valores,
    });
  }

  if (!estados.length) {
    throw new Error('Nenhum estado encontrado em base.json.');
  }

  const ondas = {
    schemaVersion: 1,
    geradoEm: base.geradoEm ?? new Date().toISOString(),
    origem: base.origem ?? 'sintetico',
    periodo: base.periodo ?? null,
    anos: base.anos,
    produto: base.produto ?? null,
    contagens: {
      estados: estados.length,
      pontos: totalPontos,
      notas: base.contagens?.notas ?? null,
    },
    estados,
  };

  await mkdir(path.dirname(SAIDA), { recursive: true });
  const conteudo = JSON.stringify(ondas);
  await writeFile(SAIDA, conteudo, 'utf8');

  const kb = (Buffer.byteLength(conteudo) / 1024).toFixed(1);
  console.log('Ondas do streamgraph compiladas:');
  console.log(`  Entrada : ${ENTRADA}`);
  console.log(`  Saida   : ${SAIDA}`);
  console.log(`  Estados : ${estados.length}`);
  console.log(`  Pontos  : ${totalPontos}`);
  console.log(`  Tamanho : ${kb} KB`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
