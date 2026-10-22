// Indice de inflacao mensal brasileiro (aproximado) 1980-2026, base 2026-12 = 1.
//
// Ideia:
//  - "S"      = inflacao acumulada desde 1980-01, em unidades constantes (moeda-base).
//  - "corte"  = corte de zeros da moeda vigente (ver moedas.js).
//  - fatorNominal(mes) = (S / corte) normalizado para o mes-base.
//      Converte um preco real (R$ 2026) no valor NOMINAL da moeda da epoca.
//  - indice(mes) = 1 / fatorNominal(mes)
//      Converte o valor NOMINAL da epoca de volta para R$ 2026 (deflacao).
//
// O frontend precisa apenas de `indice`, com base 2026 = 1.

import { mesesEntre, partesMes } from './datas.js';
import { eraDe } from './moedas.js';

// Inflacao anual aproximada (fracao, ex.: 1.10 = 110%). Fonte: IPCA/INPC historico.
const TAXAS_ANUAIS = {
  1980: 1.1, 1981: 0.95, 1982: 1.0, 1983: 2.11, 1984: 2.23, 1985: 2.35,
  1986: 0.65, 1987: 4.15, 1988: 10.3, 1989: 17.8, 1990: 14.77, 1991: 4.8,
  1992: 11.5, 1993: 24.77, 1994: 9.16, 1995: 0.22, 1996: 0.096, 1997: 0.052,
  1998: 0.017, 1999: 0.089, 2000: 0.06, 2001: 0.077, 2002: 0.125, 2003: 0.093,
  2004: 0.076, 2005: 0.057, 2006: 0.031, 2007: 0.045, 2008: 0.059, 2009: 0.043,
  2010: 0.059, 2011: 0.065, 2012: 0.058, 2013: 0.059, 2014: 0.064, 2015: 0.107,
  2016: 0.063, 2017: 0.029, 2018: 0.037, 2019: 0.043, 2020: 0.045, 2021: 0.101,
  2022: 0.058, 2023: 0.046, 2024: 0.048, 2025: 0.05, 2026: 0.045,
};

// Taxas mensais explicitas para os anos com planos economicos (congelamento),
// onde a inflacao nao foi uniforme. Sem isso o valor nominal salta artificialmente
// no fim desses anos.
const TAXAS_MENSAIS = {
  '1990-01': 0.71, '1990-02': 0.72, '1990-03': 0.82,
  '1990-04': 0.05, '1990-05': 0.07, '1990-06': 0.10, '1990-07': 0.12,
  '1990-08': 0.12, '1990-09': 0.10, '1990-10': 0.14, '1990-11': 0.16, '1990-12': 0.19,
  '1994-01': 0.41, '1994-02': 0.40, '1994-03': 0.43, '1994-04': 0.43, '1994-05': 0.44, '1994-06': 0.47,
  '1994-07': 0.065, '1994-08': 0.019, '1994-09': 0.015, '1994-10': 0.026, '1994-11': 0.027, '1994-12': 0.01,
};

const DE = '1980-01';
const BASE = '2026-12';

/**
 * Constroi o indice e devolve utilitarios.
 * @returns {{ fatorNominalNoMes:(m:string)=>number, indiceNoMes:(m:string)=>number, serie:Array }}
 */
export function construirInflacao() {
  const meses = mesesEntre(DE, BASE);
  const sPorMes = new Map();

  let s = 1;
  for (const mes of meses) {
    sPorMes.set(mes, s);
    const { ano } = partesMes(mes);
    const taxaMensal = TAXAS_MENSAIS[mes];
    const mensal = taxaMensal != null
      ? taxaMensal
      : Math.pow(1 + (TAXAS_ANUAIS[ano] ?? 0.05), 1 / 12) - 1;
    s *= 1 + mensal;
  }

  const sBase = sPorMes.get(BASE);
  const corteBase = eraDe(BASE).corte;
  const fatorBase = sBase / corteBase;

  const fatorNominalPorMes = new Map();
  const indicePorMes = new Map();
  const serie = [];

  for (const mes of meses) {
    const era = eraDe(mes);
    const fatorNominal = sPorMes.get(mes) / era.corte / fatorBase;
    const indice = 1 / fatorNominal;
    fatorNominalPorMes.set(mes, fatorNominal);
    indicePorMes.set(mes, indice);
    serie.push({ anoMes: mes, moeda: era.id, indice: Number(indice.toPrecision(10)) });
  }

  return {
    fatorNominalNoMes: (mes) => fatorNominalPorMes.get(mes) ?? 1,
    indiceNoMes: (mes) => indicePorMes.get(mes) ?? 1,
    serie,
  };
}
