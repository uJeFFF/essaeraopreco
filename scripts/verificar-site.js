// Verificacao minima do site estatico antes do deploy.
// Nao gera dados: o web/dados versionado e a fonte usada pela Vercel.

import { access, readFile } from 'node:fs/promises';

const obrigatorios = [
  'web/index.html',
  'web/styles.css',
  'web/home.js',
  'web/governos.js',
  'web/menu.css',
  'web/menu.js',
  'web/favicon.svg',
  'web/dados/base.json',
  'web/dados/ondas.json',
  'web/dados/heatmap.json',
  'web/dados/notas-recentes.json',
  'web/01/index.html',
  'web/01/styles.css',
  'web/01/app.js',
  'web/02/index.html',
  'web/02/styles.css',
  'web/02/app.js',
  'web/03/index.html',
  'web/03/styles.css',
  'web/03/app.js',
  'web/08/index.html',
  'web/08/styles.css',
  'web/08/app.js',
];

try {
  for (const arquivo of obrigatorios) {
    await access(arquivo);
  }

  const base = JSON.parse(await readFile('web/dados/base.json', 'utf8'));
  for (const estado of base.estados) {
    await access(`web/dados/estados/${estado.uf}.json`);
  }

  const ondas = JSON.parse(await readFile('web/dados/ondas.json', 'utf8'));
  if (
    !Array.isArray(ondas.estados) ||
    ondas.estados.length !== base.estados.length
  ) {
    throw new Error('ondas.json nao corresponde aos estados de base.json.');
  }
  for (const estado of ondas.estados) {
    if (!Array.isArray(estado.valores) || !estado.valores.length) {
      throw new Error(`ondas.json sem valores para ${estado.uf}.`);
    }
  }

  const heatmap = JSON.parse(
    await readFile('web/dados/heatmap.json', 'utf8'),
  );
  if (
    !Array.isArray(heatmap.anos_cortes) ||
    !Array.isArray(heatmap.capitais) ||
    !heatmap.capitais.some((capital) => capital.nome === 'São Paulo') ||
    !heatmap.cortes ||
    !Object.keys(heatmap.cortes).length
  ) {
    throw new Error('heatmap.json sem os cortes de São Paulo.');
  }

  const notasRecentes = JSON.parse(
    await readFile('web/dados/notas-recentes.json', 'utf8'),
  );
  if (
    !Array.isArray(notasRecentes.notas) ||
    !notasRecentes.notas.length
  ) {
    throw new Error('notas-recentes.json sem notas.');
  }
  for (const nota of notasRecentes.notas) {
    if (
      !nota.data ||
      !nota.uf ||
      !nota.estabelecimento ||
      !nota.chave ||
      !Number.isFinite(nota.precoRealCentavos) ||
      !Number.isFinite(nota.precoNominalCentavos)
    ) {
      throw new Error('notas-recentes.json com nota incompleta.');
    }
  }

  console.log(
    `Site estatico pronto: ${obrigatorios.length} arquivos base, ` +
      `${base.estados.length} estados, ${ondas.estados.length} ondas, ` +
      `${Object.keys(heatmap.cortes).length} cortes de São Paulo e ` +
      `${notasRecentes.notas.length} notas recentes verificados.`,
  );
} catch (erro) {
  console.error(
    `Arquivo obrigatorio ausente ou invalido: ${erro.path ?? erro.message}`,
  );
  process.exit(1);
}
