// Parser do XML de NFC-e (sintetico ou real). Extrai apenas os campos que
// interessam ao modelo. Tolerante a ausencia de campos opcionais.

import { normalizarDescricao } from '../lib/catalogo.js';

function tag(xml, nome) {
  if (!xml) return undefined;
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return m ? m[1].trim() : undefined;
}

/** Divide um lote (ou arquivo unico) em objetos de nota. */
export function parseLote(conteudo) {
  const notas = [];
  const blocos = conteudo.match(/<nfeProc[\s\S]*?<\/nfeProc>/g) || [];
  for (const bloco of blocos) {
    const nota = parseNota(bloco);
    if (nota) notas.push(nota);
  }
  return notas;
}

function parseNota(bloco) {
  const chave = (bloco.match(/Id="NFe(\d{44})"/) || [])[1] || tag(bloco, 'chNFe');
  if (!chave) return null;

  const ide = tag(bloco, 'ide') || '';
  const emit = tag(bloco, 'emit') || '';
  const ender = tag(emit, 'enderEmit') || '';
  const infCpl = tag(bloco, 'infCpl') || '';
  const moeda = (infCpl.match(/MOEDA=([A-Z0-9]+)/) || [])[1] || 'BRL';

  const cnpj = (tag(emit, 'CNPJ') || '').replace(/\D/g, '');
  const dhEmi = tag(ide, 'dhEmi') || '';
  const data = dhEmi.slice(0, 10);
  const anoMes = dhEmi.slice(0, 7);

  const itens = [];
  const blocosDet = bloco.match(/<det\b[^>]*>[\s\S]*?<\/det>/g) || [];
  for (const det of blocosDet) {
    const prod = tag(det, 'prod') || '';
    itens.push({
      nItem: Number((det.match(/nItem="(\d+)"/) || [])[1] || itens.length + 1),
      cProd: tag(prod, 'cProd') || '',
      ean: limparEan(tag(prod, 'cEAN')),
      xProd: tag(prod, 'xProd') || '',
      ncm: tag(prod, 'NCM') || '',
      cfop: tag(prod, 'CFOP') || '',
      uCom: tag(prod, 'uCom') || 'UN',
      qCom: numero(tag(prod, 'qCom'), 1),
      vUnCom: numero(tag(prod, 'vUnCom'), 0),
      vProd: numero(tag(prod, 'vProd'), 0),
    });
  }

  return {
    chave,
    numero: tag(ide, 'nNF') || '',
    serie: tag(ide, 'serie') || '',
    modelo: tag(ide, 'mod') || '',
    data,
    anoMes,
    moeda,
    cnpj,
    xNome: texto(tag(emit, 'xNome')),
    logradouro: texto(tag(ender, 'xLgr')),
    numeroEndereco: tag(ender, 'nro') || '',
    bairro: texto(tag(ender, 'xBairro')),
    cMun: tag(ender, 'cMun') || tag(ide, 'cMunFG') || '',
    xMun: texto(tag(ender, 'xMun')),
    uf: tag(ender, 'UF') || '',
    cep: tag(ender, 'CEP') || '',
    itens,
  };
}

function numero(valor, padrao) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

function limparEan(valor) {
  const t = String(valor || '').trim().toUpperCase();
  if (!t || t === 'SEM GTIN' || t === '0' || /^0+$/.test(t)) return null;
  return t;
}

function texto(valor) {
  return (valor || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export { normalizarDescricao };
