// Serializa uma nota no formato NFC-e (modelo 65), enxuto mas fiel aos campos
// que o builder precisa. A moeda da epoca vai em infAdic/infCpl como "MOEDA=XXXX"
// (extensao sintetica; ausencia = BRL), mantendo o restante schema-friendly.

import { formatarCNPJ } from './cnpj.js';
import { formatarValor } from './moedas.js';

export function notaXml(n) {
  const valor = formatarValor(n.item.valorTotal, n.moeda);
  const unitario = formatarValor(n.item.valorUnitario, n.moeda);

  return (
    `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<NFe><infNFe versao="4.00" Id="NFe${n.chave}">` +
    `<ide>` +
    `<cUF>${n.cUF}</cUF>` +
    `<cNF>${n.cNF}</cNF>` +
    `<natOp>VENDA AO CONSUMIDOR</natOp>` +
    `<mod>65</mod>` +
    `<serie>${n.serie}</serie>` +
    `<nNF>${n.numero}</nNF>` +
    `<dhEmi>${n.dhEmi}</dhEmi>` +
    `<tpNF>1</tpNF>` +
    `<idDest>1</idDest>` +
    `<cMunFG>${n.cMun}</cMunFG>` +
    `<tpImp>4</tpImp>` +
    `<tpEmis>1</tpEmis>` +
    `<cDV>${n.chave.slice(-1)}</cDV>` +
    `<tpAmb>1</tpAmb>` +
    `<finNFe>1</finNFe>` +
    `<indFinal>1</indFinal>` +
    `<indPres>1</indPres>` +
    `</ide>` +
    `<emit>` +
    `<CNPJ>${n.cnpj}</CNPJ>` +
    `<xNome>${escapar(n.xNome)}</xNome>` +
    `<enderEmit>` +
    `<xLgr>${escapar(n.xLgr)}</xLgr>` +
    `<nro>${n.nro}</nro>` +
    `<xBairro>${escapar(n.xBairro)}</xBairro>` +
    `<cMun>${n.cMun}</cMun>` +
    `<xMun>${escapar(n.xMun)}</xMun>` +
    `<UF>${n.uf}</UF>` +
    `<CEP>${n.cep}</CEP>` +
    `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
    `</enderEmit>` +
    `<IE>${n.ie}</IE><CRT>3</CRT>` +
    `</emit>` +
    `<det nItem="1">` +
    `<prod>` +
    `<cProd>${n.item.cProd}</cProd>` +
    `<cEAN>${n.item.ean}</cEAN>` +
    `<xProd>${escapar(n.item.xProd)}</xProd>` +
    `<NCM>${n.item.ncm}</NCM>` +
    `<CFOP>5102</CFOP>` +
    `<uCom>${n.item.uCom}</uCom>` +
    `<qCom>${n.item.qCom}</qCom>` +
    `<vUnCom>${unitario}</vUnCom>` +
    `<vProd>${valor}</vProd>` +
    `<cEANTrib>${n.item.ean}</cEANTrib>` +
    `<uTrib>${n.item.uCom}</uTrib>` +
    `<qTrib>${n.item.qCom}</qTrib>` +
    `<vUnTrib>${unitario}</vUnTrib>` +
    `<indTot>1</indTot>` +
    `</prod>` +
    `</det>` +
    `<total><ICMSTot>` +
    `<vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>${valor}</vProd>` +
    `<vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>` +
    `<vII>0.00</vII><vIPI>0.00</vIPI><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>` +
    `<vOutro>0.00</vOutro><vNF>${valor}</vNF>` +
    `</ICMSTot></total>` +
    `<infAdic><infCpl>MOEDA=${n.moeda};CNPJ=${formatarCNPJ(n.cnpj)}</infCpl></infAdic>` +
    `</infNFe></NFe>` +
    `<protNFe versao="4.00"><infProt>` +
    `<chNFe>${n.chave}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>` +
    `</infProt></protNFe>` +
    `</nfeProc>`
  );
}

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
