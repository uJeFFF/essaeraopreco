// Linha do tempo das moedas brasileiras 1980-2026.
//
// `corte` = quantas unidades da moeda-base (cruzeiro de 1980) equivalem a
// 1 unidade desta moeda. E o "corte de zeros" que aconteceu em cada transicao.
//
//   BRE1 -> BRC : 1.000 Cr$      = 1 Cz$
//   BRC  -> BRN : 1.000 Cz$      = 1 NCz$
//   BRN  -> BRE2: 1:1            = 1 Cr$
//   BRE2 -> BRR : 1.000 Cr$      = 1 CR$
//   BRR  -> BRL : 2.750 CR$      = 1 R$

export const ERAS = [
  { id: 'BRE1', nome: 'Cruzeiro', simbolo: 'Cr$', de: '1980-01', ate: '1986-02', corte: 1 },
  { id: 'BRC', nome: 'Cruzado', simbolo: 'Cz$', de: '1986-03', ate: '1989-01', corte: 1e3 },
  { id: 'BRN', nome: 'Cruzado Novo', simbolo: 'NCz$', de: '1989-02', ate: '1990-03', corte: 1e6 },
  { id: 'BRE2', nome: 'Cruzeiro', simbolo: 'Cr$', de: '1990-04', ate: '1993-07', corte: 1e6 },
  { id: 'BRR', nome: 'Cruzeiro Real', simbolo: 'CR$', de: '1993-08', ate: '1994-06', corte: 1e9 },
  { id: 'BRL', nome: 'Real', simbolo: 'R$', de: '1994-07', ate: '2099-12', corte: 2.75e12 },
];

const POR_ID = new Map(ERAS.map((e) => [e.id, e]));

export function eraPorId(id) {
  return POR_ID.get(id) || POR_ID.get('BRL');
}

export function eraDe(anoMes) {
  for (const era of ERAS) {
    if (anoMes >= era.de && anoMes <= era.ate) return era;
  }
  return eraPorId('BRL');
}

/** Formata um valor na precisao tipica da moeda (Real com centavos, demais inteiro). */
export function formatarValor(valor, eraId) {
  if (eraId === 'BRL') return valor.toFixed(2);
  return String(Math.round(valor));
}
