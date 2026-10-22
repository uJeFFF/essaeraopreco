// Store do builder (SQLite local, NUNCA servido). Serve para acumular as notas
// entre execucoes e garantir idempotencia pelo chave de acesso.

import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS estado (
  id         INTEGER PRIMARY KEY,
  uf         TEXT NOT NULL,
  nome       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cidade (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL,
  estado_id  INTEGER NOT NULL REFERENCES estado(id)
);

CREATE TABLE IF NOT EXISTS estabelecimento (
  id         INTEGER PRIMARY KEY,
  cnpj       TEXT NOT NULL UNIQUE,
  nome       TEXT NOT NULL,
  cidade_id  INTEGER NOT NULL REFERENCES cidade(id)
);

CREATE TABLE IF NOT EXISTS produto (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  rotulo       TEXT,
  categoria_id TEXT,
  unidade_base TEXT,
  ean          TEXT
);

CREATE TABLE IF NOT EXISTS nota (
  chave             TEXT PRIMARY KEY,
  numero            TEXT,
  serie             TEXT,
  modelo            TEXT,
  data              TEXT,
  ano_mes           TEXT,
  moeda             TEXT,
  valor_total       REAL,
  valor_total_real  REAL,
  estabelecimento_id INTEGER REFERENCES estabelecimento(id)
);

CREATE TABLE IF NOT EXISTS item_nota (
  id                  INTEGER PRIMARY KEY,
  nota_chave          TEXT NOT NULL REFERENCES nota(chave),
  produto_id          TEXT REFERENCES produto(id),
  descricao           TEXT,
  ean                 TEXT,
  ncm                 TEXT,
  unidade             TEXT,
  quantidade          REAL,
  valor_unitario      REAL,
  valor_total         REAL,
  valor_unitario_real REAL,
  valor_total_real    REAL,
  origem              TEXT
);

CREATE INDEX IF NOT EXISTS idx_item_nota_chave ON item_nota(nota_chave);
CREATE INDEX IF NOT EXISTS idx_nota_ano_mes ON nota(ano_mes);
CREATE INDEX IF NOT EXISTS idx_estabelecimento_cidade ON estabelecimento(cidade_id);
`;

export function abrirBanco(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  migrar(db);
  return db;
}

/** Migracoes leves para bancos criados por versoes anteriores. */
function migrar(db) {
  const colunas = db.prepare('PRAGMA table_info(produto)').all().map((c) => c.name);
  if (!colunas.includes('rotulo')) {
    db.exec('ALTER TABLE produto ADD COLUMN rotulo TEXT');
  }
}
