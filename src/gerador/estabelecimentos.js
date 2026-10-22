// Catalogo deterministico de estabelecimentos (mercados) por cidade.
// O mesmo seed sempre gera os mesmos estabelecimentos, o que mantem a
// idempotencia do builder entre execucoes.

import { CIDADES } from '../lib/geo.js';
import { criarRng } from '../lib/rng.js';
import { gerarCNPJ } from '../lib/cnpj.js';

const REDES = [
  'SUPERMERCADO BOM PRECO',
  'MERCADO DIA A DIA',
  'ATACADAO POPULAR',
  'REDE ECONOMIA',
  'EMPORIO DO BAIRRO',
  'SUPER MAIS',
  'MERCADINHO CENTRAL',
  'HOME MERCADO',
  'REDE ALIMENTAR',
  'SUPERMERCADO IDEAL',
  'MERCADO SAO JOSE',
  'SUPER COMPRAS',
];

const BAIRROS = ['CENTRO', 'JARDIM AMERICA', 'VILA NOVA', 'SAO JOSE', 'BOA VISTA', 'INDUSTRIAL'];

export function construirEstabelecimentos(seed = 20260101) {
  const rng = criarRng(seed);
  const estabelecimentos = [];

  for (const cidade of CIDADES) {
    const quantidade = cidade.peso >= 1.0 ? rng.inteiro(3, 5) : rng.inteiro(1, 3);
    const usados = new Set();

    for (let i = 0; i < quantidade; i++) {
      const rede = REDES[rng.inteiro(0, REDES.length - 1)];
      let nome = `${rede} - ${cidade.nome.toUpperCase()}`;
      if (usados.has(nome)) nome = `${nome} ${i + 1}`;
      usados.add(nome);

      estabelecimentos.push({
        cnpj: gerarCNPJ(rng),
        nome,
        cidadeId: cidade.id,
        cidadeNome: cidade.nome,
        estadoId: cidade.estadoId,
        uf: cidade.uf,
        // Peso dividido pelo numero de estabelecimentos da cidade, para o total
        // da cidade respeitar o peso populacional.
        peso: cidade.pesoCombinado / quantidade,
        // Fator de preco do estabelecimento (0.90 a 1.10).
        fatorPreco: 0.9 + rng.proximo() * 0.2,
        bairro: BAIRROS[rng.inteiro(0, BAIRROS.length - 1)],
        logradouro: rng.escolher(['RUA', 'AVENIDA', 'TRAVESSA']) + ' ' + rng.escolher(['DAS FLORES', 'BRASIL', 'PRINCIPAL', 'DO COMERCIO', 'XV DE NOVEMBRO']),
        numero: rng.inteiro(10, 5000),
        cep: String(rng.inteiro(10000000, 99999999)).padStart(8, '0'),
        ie: String(rng.inteiro(100000000, 999999999)),
      });
    }
  }

  return estabelecimentos;
}
