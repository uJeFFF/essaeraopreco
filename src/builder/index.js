// Builder: le os XMLs da NFC-e, acumula no SQLite (idempotente pela chave de
// acesso) e emite o bundle estatico (manifesto + shards + cubos pre-agregados).
//
//   node src/builder/index.js --entrada=data/xml --saida=bundle --banco=data/build.db
//
// Para reconstruir do zero: --recomecar

import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { abrirBanco } from './db.js';
import { parseLote } from './parse.js';
import { PRODUTOS, CATEGORIAS, normalizarDescricao } from '../lib/catalogo.js';
import { ESTADOS, CIDADES, estadoPorUf } from '../lib/geo.js';
import { construirInflacao } from '../lib/inflacao.js';

const SCHEMA_VERSAO = 1;

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

function temFlag(nome) {
  return process.argv.includes(`--${nome}`);
}

const ENTRADA = path.resolve(arg('entrada', 'data/xml'));
const SAIDA = path.resolve(arg('saida', 'bundle'));
const BANCO = path.resolve(arg('banco', 'data/build.db'));
const ORIGEM = arg('origem', 'sintetico');
const RECOMECAR = temFlag('recomecar');

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

async function escreverJson(caminho, dados) {
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify(dados), 'utf8');
}

// --- ingestao -------------------------------------------------------------

function prepararIngestao(db) {
  const inflacao = construirInflacao();

  const porEan = new Map();
  const porNome = new Map();
  for (const p of PRODUTOS) {
    if (p.ean) porEan.set(p.ean, p);
    porNome.set(normalizarDescricao(p.nome), p);
  }

  const stmt = {
    produto: db.prepare(
      `INSERT INTO produto (id,nome,categoria_id,unidade_base,ean,rotulo) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         nome=excluded.nome,
         categoria_id=excluded.categoria_id,
         unidade_base=excluded.unidade_base,
         ean=excluded.ean,
         rotulo=excluded.rotulo`,
    ),
    estado: db.prepare('INSERT OR IGNORE INTO estado (id,uf,nome) VALUES (?,?,?)'),
    cidade: db.prepare('INSERT OR IGNORE INTO cidade (id,nome,estado_id) VALUES (?,?,?)'),
    selCidade: db.prepare('SELECT id FROM cidade WHERE id=?'),
    selEstab: db.prepare('SELECT id FROM estabelecimento WHERE cnpj=?'),
    insEstab: db.prepare('INSERT INTO estabelecimento (cnpj,nome,cidade_id) VALUES (?,?,?)'),
    existeNota: db.prepare('SELECT 1 FROM nota WHERE chave=?'),
    insNota: db.prepare(
      'INSERT INTO nota (chave,numero,serie,modelo,data,ano_mes,moeda,valor_total,valor_total_real,estabelecimento_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ),
    insItem: db.prepare(
      'INSERT INTO item_nota (nota_chave,produto_id,descricao,ean,ncm,unidade,quantidade,valor_unitario,valor_total,valor_unitario_real,valor_total_real,origem) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ),
  };

  // Semeia dimensoes presentes no catalogo/geo (garante catalogo mesmo sem dados).
  for (const e of ESTADOS) stmt.estado.run(e.id, e.uf, e.nome);
  for (const c of CIDADES) stmt.cidade.run(c.id, c.nome, c.estadoId);
  for (const p of PRODUTOS) stmt.produto.run(p.id, p.nome, p.categoriaId, p.unidadeBase, p.ean, p.rotulo ?? null);

  const mapaUf = new Map(ESTADOS.map((e) => [e.uf, e.id]));
  const mapaCidade = new Map();
  const mapaEstab = new Map();
  const desconhecidos = new Map();

  function garantirCidade(cMun, nome, uf) {
    const id = Number(cMun);
    if (mapaCidade.has(id)) return id;
    if (stmt.selCidade.get(id)) {
      mapaCidade.set(id, id);
      return id;
    }
    const estadoId = mapaUf.get(uf) ?? 0;
    stmt.estado.run(estadoId, uf || '??', uf || 'Desconhecido');
    stmt.cidade.run(id, nome || String(cMun), estadoId);
    mapaCidade.set(id, id);
    return id;
  }

  function garantirEstabelecimento(cnpj, nome, cidadeId) {
    if (mapaEstab.has(cnpj)) return mapaEstab.get(cnpj);
    const existente = stmt.selEstab.get(cnpj);
    if (existente) {
      mapaEstab.set(cnpj, existente.id);
      return existente.id;
    }
    const info = stmt.insEstab.run(cnpj, nome, cidadeId);
    const id = Number(info.lastInsertRowid);
    mapaEstab.set(cnpj, id);
    return id;
  }

  function mapearProduto(item) {
    if (item.ean && porEan.has(item.ean)) return porEan.get(item.ean).id;
    const norm = normalizarDescricao(item.xProd);
    if (porNome.has(norm)) return porNome.get(norm).id;
    const id = `X-${slug(item.ean || norm)}`;
    if (!desconhecidos.has(id)) {
      desconhecidos.set(id, { id, nome: item.xProd, ean: item.ean, unidade: item.uCom });
      stmt.produto.run(id, item.xProd, 'nao-classificado', item.uCom, item.ean, null);
    }
    return id;
  }

  function ingerirNota(nota) {
    if (stmt.existeNota.get(nota.chave)) return false;

    const cidadeId = garantirCidade(nota.cMun, nota.xMun, nota.uf);
    const estabId = garantirEstabelecimento(nota.cnpj, nota.xNome, cidadeId);
    const indice = inflacao.indiceNoMes(nota.anoMes);

    let valorTotal = 0;
    let valorTotalReal = 0;
    for (const item of nota.itens) {
      valorTotal += item.vProd;
      valorTotalReal += item.vProd * indice;
    }

    stmt.insNota.run(
      nota.chave,
      nota.numero,
      nota.serie,
      nota.modelo,
      nota.data,
      nota.anoMes,
      nota.moeda,
      valorTotal,
      valorTotalReal,
      estabId,
    );

    for (const item of nota.itens) {
      stmt.insItem.run(
        nota.chave,
        mapearProduto(item),
        item.xProd,
        item.ean,
        item.ncm,
        item.uCom,
        item.qCom,
        item.vUnCom,
        item.vProd,
        item.vUnCom * indice,
        item.vProd * indice,
        ORIGEM,
      );
    }
    return true;
  }

  return { ingerirNota, desconhecidos };
}

function slug(texto) {
  return String(texto).replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'SEMID';
}

async function ingerir(db, desconhecidos) {
  let arquivos = [];
  try {
    arquivos = (await readdir(ENTRADA)).filter((f) => f.toLowerCase().endsWith('.xml')).sort();
  } catch {
    console.log(`Nenhum XML encontrado em ${ENTRADA}`);
  }

  const ing = prepararIngestao(db);

  let novas = 0;
  let ignoradas = 0;
  for (const arquivo of arquivos) {
    const conteudo = await readFile(path.join(ENTRADA, arquivo), 'utf8');
    const notas = parseLote(conteudo);
    let inseridas = 0;
    for (const nota of notas) {
      if (ing.ingerirNota(nota)) inseridas++;
      else ignoradas++;
    }
    novas += inseridas;
    process.stdout.write(`  ${arquivo}: ${notas.length} notas (${inseridas} novas)\n`);
  }

  for (const [id, info] of ing.desconhecidos) desconhecidos.set(id, info);

  console.log(`\nIngestao: ${novas} notas novas, ${ignoradas} ja existentes (ignoradas).`);
}

// --- agregacao ------------------------------------------------------------

async function gerarBundle(db, desconhecidos) {
  const estados = db.prepare('SELECT id, uf, nome FROM estado ORDER BY uf').all();
  const cidades = db.prepare('SELECT id, nome, estado_id AS estadoId FROM cidade ORDER BY nome').all();
  const estabelecimentos = db
    .prepare(
      `SELECT e.id, e.cnpj, e.nome, e.cidade_id AS cidadeId, c.nome AS cidadeNome, c.estado_id AS estadoId
       FROM estabelecimento e JOIN cidade c ON c.id = e.cidade_id ORDER BY e.nome`,
    )
    .all();
  const produtos = db
    .prepare('SELECT id, nome, rotulo, categoria_id AS categoriaId, unidade_base AS unidadeBase, ean FROM produto ORDER BY nome')
    .all();

  await escreverJson(path.join(SAIDA, 'catalogo', 'estados.json'), estados);
  await escreverJson(path.join(SAIDA, 'catalogo', 'cidades.json'), cidades);
  await escreverJson(path.join(SAIDA, 'catalogo', 'estabelecimentos.json'), estabelecimentos);
  await escreverJson(path.join(SAIDA, 'catalogo', 'produtos.json'), produtos);
  await escreverJson(path.join(SAIDA, 'catalogo', 'categorias.json'), CATEGORIAS);

  // Fatos crus por ano.
  const anos = db
    .prepare('SELECT DISTINCT substr(ano_mes,1,4) AS ano FROM nota ORDER BY ano')
    .all()
    .map((r) => r.ano);

  const selNotasAno = db.prepare(
    `SELECT chave, numero, serie, data, moeda, valor_total AS valorTotal, valor_total_real AS valorTotalReal,
            estabelecimento_id AS estabId
     FROM nota WHERE substr(ano_mes,1,4) = ? ORDER BY data`,
  );
  const selItensAno = db.prepare(
    `SELECT i.nota_chave AS notaChave, i.produto_id AS produtoId, i.descricao, i.ean, i.unidade,
            i.quantidade, i.valor_unitario AS valorUnitario, i.valor_total AS valorTotal,
            i.valor_unitario_real AS valorUnitarioReal, i.valor_total_real AS valorTotalReal
     FROM item_nota i JOIN nota n ON n.chave = i.nota_chave
     WHERE substr(n.ano_mes,1,4) = ? ORDER BY n.data`,
  );

  let totalItens = 0;
  for (const ano of anos) {
    const notas = selNotasAno.all(ano);
    const itens = selItensAno.all(ano);
    totalItens += itens.length;
    await escreverJson(path.join(SAIDA, 'fatos', `notas-${ano}.json`), notas);
    await escreverJson(path.join(SAIDA, 'fatos', `itens-${ano}.json`), itens);
  }

  // Cubos pre-agregados.
  const precoMensal = db
    .prepare(
      `SELECT i.produto_id AS produtoId, n.ano_mes AS anoMes,
              SUM(i.valor_unitario_real * i.quantidade) / SUM(i.quantidade) AS precoMedio,
              MIN(i.valor_unitario_real) AS precoMin,
              MAX(i.valor_unitario_real) AS precoMax,
              COUNT(*) AS nCompras
       FROM item_nota i JOIN nota n ON n.chave = i.nota_chave
       GROUP BY i.produto_id, n.ano_mes ORDER BY n.ano_mes`,
    )
    .all()
    .map((r) => ({ ...r, precoMedio: r2(r.precoMedio), precoMin: r2(r.precoMin), precoMax: r2(r.precoMax) }));

  const precoMensalEstab = db
    .prepare(
      `SELECT i.produto_id AS produtoId, n.estabelecimento_id AS estabId, n.ano_mes AS anoMes,
              SUM(i.valor_unitario_real * i.quantidade) / SUM(i.quantidade) AS precoMedio,
              MIN(i.valor_unitario_real) AS precoMin,
              MAX(i.valor_unitario_real) AS precoMax,
              COUNT(*) AS nCompras
       FROM item_nota i JOIN nota n ON n.chave = i.nota_chave
       GROUP BY i.produto_id, n.estabelecimento_id, n.ano_mes ORDER BY n.ano_mes`,
    )
    .all()
    .map((r) => ({ ...r, precoMedio: r2(r.precoMedio), precoMin: r2(r.precoMin), precoMax: r2(r.precoMax) }));

  const gastoMensal = db
    .prepare(
      `SELECT n.ano_mes AS anoMes, c.estado_id AS estadoId, e.cidade_id AS cidadeId,
              n.estabelecimento_id AS estabId, p.categoria_id AS categoriaId,
              SUM(i.valor_total_real) AS total, COUNT(*) AS nItens
       FROM item_nota i
       JOIN nota n ON n.chave = i.nota_chave
       JOIN estabelecimento e ON e.id = n.estabelecimento_id
       JOIN cidade c ON c.id = e.cidade_id
       JOIN produto p ON p.id = i.produto_id
       GROUP BY n.ano_mes, c.estado_id, e.cidade_id, n.estabelecimento_id, p.categoria_id
       ORDER BY n.ano_mes`,
    )
    .all()
    .map((r) => ({ ...r, total: r2(r.total) }));

  const precoAnualEstado = db
    .prepare(
      `SELECT es.uf AS uf, c.estado_id AS estadoId, substr(n.ano_mes,1,4) AS ano,
              SUM(i.valor_unitario_real * i.quantidade) / SUM(i.quantidade) AS precoMedio,
              SUM(i.valor_unitario * i.quantidade) / SUM(i.quantidade) AS precoMedioNominal,
              COUNT(*) AS nCompras
       FROM item_nota i
       JOIN nota n ON n.chave = i.nota_chave
       JOIN estabelecimento e ON e.id = n.estabelecimento_id
       JOIN cidade c ON c.id = e.cidade_id
       JOIN estado es ON es.id = c.estado_id
       GROUP BY c.estado_id, substr(n.ano_mes,1,4)
       ORDER BY ano, es.uf`,
    )
    .all()
    .map((r) => ({
      uf: r.uf,
      estadoId: r.estadoId,
      ano: Number(r.ano),
      precoMedio: r2(r.precoMedio),
      precoMedioNominal: r2(r.precoMedioNominal),
      nCompras: r.nCompras,
    }));

  // Notas por estado (para o popup: distribuicao, lista e link da SEFAZ).
  // Formato compacto por nota: [precoReal, precoNominal, data, chave, estabId]
  const linhasNotas = db
    .prepare(
      `SELECT es.uf AS uf, i.valor_unitario_real AS precoReal, i.valor_unitario AS precoNominal,
              n.data AS data, n.chave AS chave, n.estabelecimento_id AS estabId
       FROM item_nota i
       JOIN nota n ON n.chave = i.nota_chave
       JOIN estabelecimento e ON e.id = n.estabelecimento_id
       JOIN cidade c ON c.id = e.cidade_id
       JOIN estado es ON es.id = c.estado_id
       ORDER BY es.uf, i.valor_unitario_real`,
    )
    .all();

  const notasPorUf = new Map();
  for (const linha of linhasNotas) {
    let lista = notasPorUf.get(linha.uf);
    if (!lista) {
      lista = [];
      notasPorUf.set(linha.uf, lista);
    }
    lista.push([
      r2(linha.precoReal),
      r2(linha.precoNominal),
      linha.data,
      linha.chave,
      linha.estabId,
    ]);
  }

  const inflacao = construirInflacao();
  await escreverJson(path.join(SAIDA, 'series', 'preco-mensal-produto.json'), precoMensal);
  await escreverJson(path.join(SAIDA, 'series', 'preco-mensal-produto-estab.json'), precoMensalEstab);
  await escreverJson(path.join(SAIDA, 'series', 'gasto-mensal.json'), gastoMensal);
  await escreverJson(path.join(SAIDA, 'series', 'preco-anual-estado.json'), precoAnualEstado);
  await escreverJson(path.join(SAIDA, 'series', 'inflacao.json'), inflacao.serie);

  for (const [uf, lista] of notasPorUf) {
    await escreverJson(path.join(SAIDA, 'series', 'notas', `${uf}.json`), lista);
  }

  // Manifesto.
  const contagens = {
    notas: db.prepare('SELECT COUNT(*) AS n FROM nota').get().n,
    itens: db.prepare('SELECT COUNT(*) AS n FROM item_nota').get().n,
    produtos: produtos.length,
    estabelecimentos: estabelecimentos.length,
    cidades: cidades.length,
    estados: estados.length,
  };

  const periodo = db
    .prepare('SELECT MIN(ano_mes) AS de, MAX(ano_mes) AS ate FROM nota')
    .get();

  const meta = {
    schemaVersion: SCHEMA_VERSAO,
    origem: ORIGEM,
    geradoEm: new Date().toISOString(),
    periodo: { de: periodo.de, ate: periodo.ate },
    contagens,
    arquivos: {
      estados: 'catalogo/estados.json',
      cidades: 'catalogo/cidades.json',
      estabelecimentos: 'catalogo/estabelecimentos.json',
      produtos: 'catalogo/produtos.json',
      categorias: 'catalogo/categorias.json',
      fatos: anos.map((ano) => ({ ano, notas: `fatos/notas-${ano}.json`, itens: `fatos/itens-${ano}.json` })),
      series: {
        precoMensalProduto: 'series/preco-mensal-produto.json',
        precoMensalProdutoEstab: 'series/preco-mensal-produto-estab.json',
        gastoMensal: 'series/gasto-mensal.json',
        precoAnualEstado: 'series/preco-anual-estado.json',
        notasPorEstado: 'series/notas/{uf}.json',
        inflacao: 'series/inflacao.json',
      },
    },
  };

  await escreverJson(path.join(SAIDA, 'meta.json'), meta);

  if (desconhecidos.size > 0) {
    await escreverJson(path.join(SAIDA, 'revisao.json'), [...desconhecidos.values()]);
  }

  return { meta, totalItens };
}

// --- main -----------------------------------------------------------------

async function main() {
  if (RECOMECAR) {
    for (const sufixo of ['', '-wal', '-shm']) {
      await rm(BANCO + sufixo, { force: true });
    }
    console.log('Banco zerado (--recomecar).');
  }

  await mkdir(path.dirname(BANCO), { recursive: true });
  const db = abrirBanco(BANCO);

  const desconhecidos = new Map();
  await ingerir(db, desconhecidos);

  const { meta, totalItens } = await gerarBundle(db, desconhecidos);

  console.log('\nBundle gerado:');
  console.log(`  Periodo      : ${meta.periodo.de} a ${meta.periodo.ate}`);
  console.log(`  Notas        : ${meta.contagens.notas}`);
  console.log(`  Itens        : ${totalItens}`);
  console.log(`  Estabelec.   : ${meta.contagens.estabelecimentos}`);
  console.log(`  Produtos     : ${meta.contagens.produtos}`);
  if (desconhecidos.size > 0) console.log(`  Revisao      : ${desconhecidos.size} descricoes nao mapeadas`);
  console.log(`  Saida        : ${SAIDA}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
