// Verificacao minima do site estatico antes do deploy.
// Nao gera dados: o web/dados versionado e a fonte usada pela Vercel.

import { access, readFile } from 'node:fs/promises';

const obrigatorios = [
  'web/index.html',
  'web/styles.css',
  'web/app.js',
  'web/governos.js',
  'web/favicon.svg',
  'web/dados/base.json',
  'web/dados/ondas.json',
  'web/02/index.html',
  'web/02/styles.css',
  'web/02/app.js',
  'web/03/index.html',
  'web/03/styles.css',
  'web/03/app.js',
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

  console.log(
    `Site estatico pronto: ${obrigatorios.length} arquivos base, ` +
      `${base.estados.length} estados e ${ondas.estados.length} ondas verificados.`,
  );
} catch (erro) {
  console.error(
    `Arquivo obrigatorio ausente ou invalido: ${erro.path ?? erro.message}`,
  );
  process.exit(1);
}
