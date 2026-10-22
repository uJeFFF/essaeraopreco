// Catalogo de produtos. No MVP existe apenas 1 produto (1 kg de carne bovina),
// mas a estrutura ja suporta varios produtos/categorias.

export const CATEGORIAS = [
  { id: 'carnes', nome: 'Carnes e derivados' },
];

export const PRODUTOS = [
  {
    id: 'CARNE-BOVINA',
    nome: 'CARNE BOVINA',
    rotulo: '1KG DE CARNE',
    categoriaId: 'carnes',
    unidadeBase: 'KG',
    ean: '7891000000017',
    ncm: '02013000',
    // Preco real de referencia em R$ de 2026 (ancora da serie historica).
    precoReal2026: 42.0,
  },
];

/** Normaliza descricao para comparacao (maiuscula, sem acentos, espacos simples). */
export function normalizarDescricao(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
