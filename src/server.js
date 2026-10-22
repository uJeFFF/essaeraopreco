// Servidor estatico minimo (sem dependencias) apenas para desenvolvimento local.
// Serve web/, o mesmo diretorio publicado na Vercel.
// O frontend faz fetch de JSON, o que nao funciona em file:// — por isso servir.
//
//   node src/server.js --port=8080
//   npm run front

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(fileURLToPath(new URL('../web', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const PORTA = Number(arg('port', process.env.PORT || 8080));

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORTA}`);
    let caminho = decodeURIComponent(url.pathname);

    if (caminho.endsWith('/')) caminho += 'index.html';

    const absoluto = path.resolve(RAIZ, `.${caminho}`);
    if (!absoluto.startsWith(RAIZ)) {
      res.writeHead(403);
      res.end('Acesso negado');
      return;
    }

    const conteudo = await readFile(absoluto);
    const tipo = MIME[path.extname(absoluto).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(conteudo);
  } catch (erro) {
    if (erro.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo nao encontrado');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro interno');
      console.error(erro);
    }
  }
});

servidor.listen(PORTA, () => {
  console.log(`Servindo ${RAIZ}`);
  console.log(`Abra: http://localhost:${PORTA}/`);
});
