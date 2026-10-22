// Utilidades de data no formato de mes "YYYY-MM".

export function mesParaIndice(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  return ano * 12 + (mes - 1);
}

export function indiceParaMes(indice) {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function proximoMes(anoMes) {
  return indiceParaMes(mesParaIndice(anoMes) + 1);
}

/** Lista inclusiva de meses entre deAnoMes e ateAnoMes. */
export function mesesEntre(deAnoMes, ateAnoMes) {
  const de = mesParaIndice(deAnoMes);
  const ate = mesParaIndice(ateAnoMes);
  const meses = [];
  for (let i = de; i <= ate; i++) meses.push(indiceParaMes(i));
  return meses;
}

/** "YYYY-MM" -> { ano, mes } */
export function partesMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  return { ano, mes };
}

/** Data ISO local (-03:00) a partir de ano/mes/dia/hora. */
export function dataIso(ano, mes, dia, hora, minuto) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${ano}-${p2(mes)}-${p2(dia)}T${p2(hora)}:${p2(minuto)}:00-03:00`;
}
