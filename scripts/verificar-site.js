// Verificacao minima do site estatico antes do deploy.
// Nao gera dados: o web/dados versionado e a fonte usada pela Vercel.

import { access, readFile } from 'node:fs/promises';

const obrigatorios = [
  'web/index.html',
  'web/styles.css',
  'web/app.js',
  'web/favicon.svg',
  'web/dados/base.json',
];

try {
  for (const arquivo of obrigatorios) {
    await access(arquivo);
  }

  const base = JSON.parse(await readFile('web/dados/base.json', 'utf8'));
  for (const estado of base.estados) {
    await access(`web/dados/estados/${estado.uf}.json`);
  }

  console.log(
    `Site estatico pronto: ${obrigatorios.length} arquivos base e ${base.estados.length} estados verificados.`,
  );
} catch (erro) {
  console.error(`Arquivo obrigatorio ausente: ${erro.path ?? erro.message}`);
  process.exit(1);
}
