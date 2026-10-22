// Gerador sintetico: simula um "portal da SEFAZ" emitindo XMLs de NFC-e.
// MVP: cada nota tem exatamente 1 item = 1 KG de carne bovina.
//
//   node src/gerador/index.js --notas=100000 --de=1980 --ate=2026 --seed=20260101
//
// Saida: data/xml/{ano}.xml (um lote com varias notas por ano).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { criarRng } from '../lib/rng.js';
import { partesMes, dataIso } from '../lib/datas.js';import { eraDe } from '../lib/moedas.js';
import { construirInflacao } from '../lib/inflacao.js';
import { gerarChaveAcesso } from '../lib/cnpj.js';
import { PRODUTOS } from '../lib/catalogo.js';
import { notaXml } from '../lib/xml-writer.js';
import { construirEstabelecimentos } from './estabelecimentos.js';

// --- argumentos -----------------------------------------------------------

function arg(nome, padrao) {
  const prefixo = `--${nome}=`;
  const encontrado = process.argv.find((a) => a.startsWith(prefixo));
  return encontrado ? encontrado.slice(prefixo.length) : padrao;
}

const TOTAL_NOTAS = Number(arg('notas', 100000));
const ANO_DE = Number(arg('de', 1980));
const ANO_ATE = Number(arg('ate', 2026));
const SEED = Number(arg('seed', 20260101));
const SAIDA = path.resolve(arg('saida', 'data/xml'));

// --- distribuicao ---------------------------------------------------------

// Sazonalidade mensal (dezembro/janeiro compram mais).
const SAZONALIDADE = [1.15, 1.0, 0.97, 0.98, 1.0, 0.97, 0.98, 1.0, 1.0, 1.02, 1.05, 1.18];

function pesoAno(ano) {
  return 1 + (ano - ANO_DE) * 0.55;
}

/** Distribui `total` inteiros proporcionalmente a `pesos` (metodo do maior resto). */
function distribuir(total, pesos) {
  const soma = pesos.reduce((a, b) => a + b, 0);
  const base = pesos.map((p) => Math.floor((total * p) / soma));
  let resto = total - base.reduce((a, b) => a + b, 0);
  const ordem = pesos
    .map((p, i) => ({ i, frac: (total * p) / soma - Math.floor((total * p) / soma) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < resto && k < ordem.length; k++) base[ordem[k].i]++;
  return base;
}

function tendenciaReal(ano) {
  // Leve alta real do preco da carne ao longo das decadas.
  return 0.95 + 0.1 * ((ano - ANO_DE) / Math.max(1, ANO_ATE - ANO_DE));
}

function ondaReal(ano) {
  // Oscilacao suave de medio prazo.
  return 1 + 0.05 * Math.sin((ano - ANO_DE) / 6.5);
}

// --- execucao -------------------------------------------------------------

async function main() {
  const estabelecimentos = construirEstabelecimentos(SEED);
  const pesosEstab = estabelecimentos.map((e) => e.peso);

  const inflacao = construirInflacao();
  const produto = PRODUTOS[0];

  const anos = [];
  for (let ano = ANO_DE; ano <= ANO_ATE; ano++) anos.push(ano);
  const qtdPorAno = distribuir(TOTAL_NOTAS, anos.map((ano) => pesoAno(ano)));

  const rng = criarRng(SEED);
  const proxNumeroPorCnpj = new Map();

  await mkdir(SAIDA, { recursive: true });

  const inicio = Date.now();
  let totalGerado = 0;

  for (const ano of anos) {
    const qtdAno = qtdPorAno[anos.indexOf(ano)];
    const qtdPorMes = distribuir(qtdAno, SAZONALIDADE);
    const linhas = [];

    for (let mes = 1; mes <= 12; mes++) {
      const qtdMes = qtdPorMes[mes - 1];
      const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
      const era = eraDe(anoMes);
      const fatorNominal = inflacao.fatorNominalNoMes(anoMes);
      const fatorReal = tendenciaReal(ano) * ondaReal(ano);

      for (let i = 0; i < qtdMes; i++) {
        const estab = rng.escolherPonderado(estabelecimentos, pesosEstab);

        const dia = rng.inteiro(1, 28);
        const hora = rng.inteiro(8, 21);
        const minuto = rng.inteiro(0, 59);
        const dhEmi = dataIso(ano, mes, dia, hora, minuto);

        // Preco real (R$ 2026) -> valor nominal da moeda da epoca.
        let real = produto.precoReal2026 * estab.fatorPreco * fatorReal;
        real *= 1 + rng.normal() * 0.02;
        if (real < 1) real = 1;
        const nominal = real * fatorNominal;

        const numero = (proxNumeroPorCnpj.get(estab.cnpj) || 0) + 1;
        proxNumeroPorCnpj.set(estab.cnpj, numero);

        const cNF = rng.inteiro(0, 99999999);
        const chave = gerarChaveAcesso({
          cUF: estab.estadoId,
          ano,
          mes,
          cnpj: estab.cnpj,
          modelo: 65,
          serie: 1,
          numero,
          cNF,
        });

        linhas.push(
          notaXml({
            chave,
            cUF: estab.estadoId,
            cNF: String(cNF).padStart(8, '0'),
            serie: 1,
            numero,
            dhEmi,
            cMun: estab.cidadeId,
            xMun: estab.cidadeNome,
            uf: estab.uf,
            cnpj: estab.cnpj,
            xNome: estab.nome,
            xLgr: estab.logradouro,
            nro: estab.numero,
            xBairro: estab.bairro,
            cep: estab.cep,
            ie: estab.ie,
            moeda: era.id,
            item: {
              cProd: '0001',
              ean: produto.ean,
              xProd: produto.nome,
              ncm: produto.ncm,
              uCom: produto.unidadeBase,
              qCom: '1.0000',
              valorUnitario: nominal,
              valorTotal: nominal,
            },
          }),
        );
        totalGerado++;
      }
    }

    const conteudo = `<?xml version="1.0" encoding="UTF-8"?>\n<lote versao="1.00" ano="${ano}">\n${linhas.join('\n')}\n</lote>\n`;
    const arquivo = path.join(SAIDA, `${ano}.xml`);
    await writeFile(arquivo, conteudo, 'utf8');
    process.stdout.write(`  ${ano}: ${linhas.length} notas\n`);
  }

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`\nGeradas ${totalGerado} notas em ${anos.length} anos (${segundos}s)`);
  console.log(`Estabelecimentos: ${estabelecimentos.length}`);
  console.log(`Saida: ${SAIDA}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
