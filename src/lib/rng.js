// Gerador pseudo-aleatorio deterministico (mulberry32) com utilitarios.
// Mesma seed => mesma sequencia, o que torna todo o dataset reproduzivel.

export function criarRng(seed) {
  let a = seed >>> 0;

  function proximo() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  let sobraNormal = null;

  return {
    proximo,

    inteiro(min, max) {
      return Math.floor(proximo() * (max - min + 1)) + min;
    },

    real(min, max) {
      return proximo() * (max - min) + min;
    },

    escolher(arr) {
      return arr[Math.floor(proximo() * arr.length)];
    },

    /** Escolhe um item proporcional aos pesos (array numerico paralelo). */
    escolherPonderado(arr, pesos) {
      let total = 0;
      for (const p of pesos) total += p;
      let r = proximo() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= pesos[i];
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },

    /** Normal(0,1) via Box-Muller com cache. */
    normal() {
      if (sobraNormal !== null) {
        const v = sobraNormal;
        sobraNormal = null;
        return v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = proximo();
      while (v === 0) v = proximo();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      sobraNormal = mag * Math.sin(2.0 * Math.PI * v);
      return mag * Math.cos(2.0 * Math.PI * v);
    },

    embaralhar(arr) {
      const copia = arr.slice();
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(proximo() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia;
    },
  };
}
