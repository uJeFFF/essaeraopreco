// Geracao deterministica de CNPJ e de chave de acesso da NFC-e.

export function formatarCNPJ(cnpj14) {
  return `${cnpj14.slice(0, 2)}.${cnpj14.slice(2, 5)}.${cnpj14.slice(5, 8)}/${cnpj14.slice(8, 12)}-${cnpj14.slice(12, 14)}`;
}

function digitoVerificadorCNPJ(base) {
  const pesos = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Gera um CNPJ (14 digitos) com digitos verificadores validos. */
export function gerarCNPJ(rng) {
  let base = '';
  for (let i = 0; i < 8; i++) base += rng.inteiro(0, 9);
  base += '0001';
  const d1 = digitoVerificadorCNPJ(base);
  const d2 = digitoVerificadorCNPJ(base + d1);
  return `${base}${d1}${d2}`;
}

/** Digito verificador da chave de acesso (44 digitos, mod 11, pesos 2..9 ciclicos). */
function digitoVerificadorChave(chave43) {
  let peso = 2;
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? 0 : dv;
}

/**
 * Monta a chave de acesso de 44 digitos.
 * Estrutura: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 */
export function gerarChaveAcesso({ cUF, ano, mes, cnpj, modelo, serie, numero, tpEmis = 1, cNF }) {
  const p = (n, casas) => String(n).padStart(casas, '0');
  const aa = p(ano % 100, 2);
  const mm = p(mes, 2);
  const semDv =
    p(cUF, 2) +
    aa +
    mm +
    cnpj +
    p(modelo, 2) +
    p(serie, 3) +
    p(numero, 9) +
    p(tpEmis, 1) +
    p(cNF, 8);
  return semDv + digitoVerificadorChave(semDv);
}
