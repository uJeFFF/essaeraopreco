// Compilador do frontend: le o bundle completo e gera apenas os dados usados
// pelo heatmap e pelo popup.
//
//   node src/compilar-web.js --entrada=bundle --saida=web/dados
//
// A amostra de notas por faixa e sorteada com crypto.randomInt. Cada execucao
// gera um web/dados diferente; rode este script quando quiser renovar os
// exemplos que aparecem no popup.

import { randomInt } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GOVERNOS } from '../web/governos.js';

const FAIXAS = 10;
const LIMITE_POR_FAIXA = 10;

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const ENTRADA = path.resolve(arg('entrada', 'bundle'));
const SAIDA = path.resolve(arg('saida', 'web/dados'));

const centavos = (valor) => Math.round(Number(valor) * 100);

function mediana(valores) {
  if (!valores.length) return null;
  const ordenados = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

async function lerJson(caminho) {
  return JSON.parse(await readFile(caminho, 'utf8'));
}

async function escreverJson(caminho, dados) {
  await mkdir(path.dirname(caminho), { recursive: true });
  const conteudo = JSON.stringify(dados);
  await writeFile(caminho, conteudo, 'utf8');
  return Buffer.byteLength(conteudo);
}

function compararNota(a, b) {
  return (
    a[0] - b[0] ||
    String(a[2]).localeCompare(String(b[2])) ||
    String(a[3]).localeCompare(String(b[3]))
  );
}

/** Sorteia `quantidade` itens distintos de `lista` (Fisher-Yates parcial). */
function sortearSemRepeticao(lista, quantidade) {
  if (quantidade <= 0) return [];
  if (quantidade >= lista.length) return lista.slice();

  const copia = lista.slice();
  for (let i = 0; i < quantidade; i++) {
    const j = randomInt(i, copia.length);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, quantidade);
}

/**
 * Ate 10 notas por faixa.
 * Se a faixa tiver mais que isso, garante a nota de menor preco e a de maior
 * preco (sorteando entre empates) e completa com notas aleatorias.
 */
function escolherAmostra(faixa) {
  if (faixa.length <= LIMITE_POR_FAIXA) return faixa.slice();

  const precoMin = faixa[0][0];
  const precoMax = faixa[faixa.length - 1][0];

  if (precoMin === precoMax) {
    return sortearSemRepeticao(faixa, LIMITE_POR_FAIXA).sort(compararNota);
  }

  const menores = faixa.filter((nota) => nota[0] === precoMin);
  const maiores = faixa.filter((nota) => nota[0] === precoMax);
  const escolhidaMin = menores[randomInt(0, menores.length)];
  const escolhidaMax = maiores[randomInt(0, maiores.length)];

  const escolhidas = [escolhidaMin, escolhidaMax];
  const restantes = faixa.filter((nota) => nota !== escolhidaMin && nota !== escolhidaMax);
  const faltam = LIMITE_POR_FAIXA - escolhidas.length;

  escolhidas.push(...sortearSemRepeticao(restantes, faltam));
  return escolhidas.sort(compararNota);
}

function dividirFaixas(notas) {
  const min = notas[0][0];
  const max = notas[notas.length - 1][0];
  const passo = (max - min) / FAIXAS || 1;
  const faixas = Array.from({ length: FAIXAS }, () => []);

  for (const nota of notas) {
    let i = Math.floor((nota[0] - min) / passo);
    if (i < 0) i = 0;
    if (i >= FAIXAS) i = FAIXAS - 1;
    faixas[i].push(nota);
  }

  return { min, max, faixas };
}

function validarFaixas(uf, ano, faixas, amostras) {
  for (let i = 0; i < FAIXAS; i++) {
    const origem = faixas[i];
    const selecionadas = amostras[i];

    if (selecionadas.length > LIMITE_POR_FAIXA) {
      throw new Error(`${uf}/${ano}: faixa ${i} tem mais de ${LIMITE_POR_FAIXA} amostras.`);
    }
    if (origem.length <= LIMITE_POR_FAIXA && selecionadas.length !== origem.length) {
      throw new Error(`${uf}/${ano}: faixa ${i} deveria conter todas as notas.`);
    }
    if (origem.length > LIMITE_POR_FAIXA && selecionadas.length !== LIMITE_POR_FAIXA) {
      throw new Error(`${uf}/${ano}: faixa ${i} deveria conter ${LIMITE_POR_FAIXA} amostras.`);
    }
    for (const nota of selecionadas) {
      if (!origem.includes(nota)) {
        throw new Error(`${uf}/${ano}: amostra fora da faixa ${i}.`);
      }
    }

    if (origem.length > LIMITE_POR_FAIXA) {
      const precoMin = origem[0][0];
      const precoMax = origem[origem.length - 1][0];
      if (!selecionadas.some((nota) => nota[0] === precoMin)) {
        throw new Error(`${uf}/${ano}: faixa ${i} ficou sem a nota de menor preco.`);
      }
      if (!selecionadas.some((nota) => nota[0] === precoMax)) {
        throw new Error(`${uf}/${ano}: faixa ${i} ficou sem a nota de maior preco.`);
      }
    }
  }
}

function anosDoPeriodo(periodo, cubo) {
  let de = Number(String(periodo?.de ?? '').slice(0, 4));
  let ate = Number(String(periodo?.ate ?? '').slice(0, 4));

  if (!Number.isFinite(de) || !Number.isFinite(ate)) {
    const anos = cubo.map((linha) => Number(linha.ano)).filter(Number.isFinite);
    de = Math.min(...anos);
    ate = Math.max(...anos);
  }

  if (!Number.isFinite(de) || !Number.isFinite(ate)) {
    throw new Error('Nao foi possivel determinar o periodo do bundle (meta.json ou preco-anual-estado.json).');
  }

  return Array.from({ length: ate - de + 1 }, (_, i) => de + i);
}

async function main() {
  const [meta, estados, produtos, estabelecimentos, cubo] = await Promise.all([
    lerJson(path.join(ENTRADA, 'meta.json')).catch(() => null),
    lerJson(path.join(ENTRADA, 'catalogo', 'estados.json')),
    lerJson(path.join(ENTRADA, 'catalogo', 'produtos.json')),
    lerJson(path.join(ENTRADA, 'catalogo', 'estabelecimentos.json')),
    lerJson(path.join(ENTRADA, 'series', 'preco-anual-estado.json')),
  ]);

  const dirNotas = path.join(ENTRADA, 'series', 'notas');
  const arquivosNotas = (await readdir(dirNotas)).filter((arquivo) => arquivo.endsWith('.json')).sort();

  const notasPorUf = new Map();
  let totalNotas = 0;
  for (const arquivo of arquivosNotas) {
    const uf = path.basename(arquivo, '.json');
    const notas = await lerJson(path.join(dirNotas, arquivo));
    notas.sort(compararNota);
    notasPorUf.set(uf, notas);
    totalNotas += notas.length;
  }

  const anos = anosDoPeriodo(meta?.periodo, cubo);

  const notasPorEstadoAno = new Map();
  for (const estado of estados) {
    const notas = notasPorUf.get(estado.uf) ?? [];
    for (const nota of notas) {
      const ano = Number(String(nota[2]).slice(0, 4));
      if (!Number.isFinite(ano)) continue;
      const chave = `${estado.id}:${ano}`;
      let lista = notasPorEstadoAno.get(chave);
      if (!lista) {
        lista = [];
        notasPorEstadoAno.set(chave, lista);
      }
      lista.push(nota);
    }
  }

  const governos = {};
  for (const gov of GOVERNOS) {
    const precos = [];
    for (const notas of notasPorUf.values()) {
      for (const nota of notas) {
        const ano = Number(String(nota[2]).slice(0, 4));
        if (ano >= gov.de && ano <= gov.ate) precos.push(nota[0]);
      }
    }
    governos[gov.nome] = {
      de: gov.de,
      ate: gov.ate,
      medianaCentavos: precos.length ? centavos(mediana(precos)) : null,
      nNotas: precos.length,
    };
  }

  const base = {
    schemaVersion: 1,
    origem: meta?.origem ?? 'sintetico',
    geradoEm: new Date().toISOString(),
    periodo: meta?.periodo ?? { de: `${anos[0]}-01`, ate: `${anos[anos.length - 1]}-12` },
    contagens: meta?.contagens ?? null,
    faixas: FAIXAS,
    limitePorFaixa: LIMITE_POR_FAIXA,
    anos,
    produto: produtos[0]
      ? {
          id: produtos[0].id,
          nome: produtos[0].nome,
          rotulo: produtos[0].rotulo,
          unidadeBase: produtos[0].unidadeBase,
        }
      : null,
    estados: estados.map((estado) => ({
      id: estado.id,
      uf: estado.uf,
      nome: estado.nome,
      valores: anos.map((ano) => {
        const lista = notasPorEstadoAno.get(`${estado.id}:${ano}`);
        if (!lista || !lista.length) return null;
        return [
          centavos(mediana(lista.map((nota) => nota[0]))),
          centavos(mediana(lista.map((nota) => nota[1]))),
          lista.length,
        ];
      }),
    })),
    governos,
    estabelecimentos: Object.fromEntries(estabelecimentos.map((estab) => [estab.id, estab.nome])),
  };

  await rm(SAIDA, { recursive: true, force: true });
  await mkdir(path.join(SAIDA, 'estados'), { recursive: true });

  let totalAmostras = 0;
  let bytesEstados = 0;

  for (const estado of estados) {
    const anosComNotas = anos.filter((ano) => notasPorEstadoAno.has(`${estado.id}:${ano}`));

    const linhas = anosComNotas.map((ano) => {
      const lista = notasPorEstadoAno.get(`${estado.id}:${ano}`).slice().sort(compararNota);
      const { min, max, faixas } = dividirFaixas(lista);
      const contagens = faixas.map((faixa) => faixa.length);
      const amostras = faixas.map(escolherAmostra);

      validarFaixas(estado.uf, ano, faixas, amostras);

      totalAmostras += amostras.reduce((soma, faixa) => soma + faixa.length, 0);

      return [
        ano,
        centavos(min),
        centavos(max),
        contagens,
        amostras.map((faixa) => faixa.map((nota) => [
          centavos(nota[0]),
          centavos(nota[1]),
          nota[2],
          nota[3],
          nota[4],
        ])),
      ];
    });

    const dados = { uf: estado.uf, faixas: FAIXAS, anos: linhas };
    bytesEstados += await escreverJson(path.join(SAIDA, 'estados', `${estado.uf}.json`), dados);
  }

  base.amostrasNotas = totalAmostras;
  const bytesBase = await escreverJson(path.join(SAIDA, 'base.json'), base);

  const kb = (bytes) => (bytes / 1024).toFixed(1);
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

  console.log('Dados do frontend compilados:');
  console.log(`  Saida        : ${SAIDA}`);
  console.log(`  Base         : ${kb(bytesBase)} KB`);
  console.log(`  Estados      : ${estados.length} arquivos, ${mb(bytesEstados)} MB`);
  console.log(`  Notas fonte  : ${totalNotas}`);
  console.log(`  Notas amostra: ${totalAmostras}`);
  console.log(`  Faixas       : ${FAIXAS} por celula, ate ${LIMITE_POR_FAIXA} notas por faixa`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
