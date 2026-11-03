// Frontend /08/: mapa radial de precos reais por UF x ano.
// 270 graus, com o vao no quadrante superior direito. Um anel por ano
// (1999 no centro, o ano mais recente na borda) e uma coluna de 10 graus por
// UF, em ordem alfabetica. A cor da bolinha e o preco: branco = mais barato,
// azul royal = mais caro. Ano sem nota fica sem bolinha.
// Le apenas web/dados/ondas.json (gerado por src/compilar-ondas.js).

import { GOVERNOS } from "../governos.js";

const URL_DADOS = "../dados/ondas.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1000;
const ALTURA = 1000;
const CENTRO = LARGURA / 2;
const RAIO_INTERNO = 90;
const RAIO_EXTERNO = 400;
const RAIO_ROTULO = 430;
const ANO_INICIAL = 1999;
const ANGULO_INICIAL = 0; // direita
const ARCO = 270; // vao de 90 graus no quadrante superior direito
const RAIO_BOLINHA = 4.5;
// Azul royal bem escuro: ~70% de preto sobre o royal blue (#4169e1).
const AZUL_CARO = [21, 34, 76];

const tooltip = document.getElementById("tooltip");

function criarSvg(tag, atributos = {}) {
  const elemento = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    elemento.setAttribute(nome, String(valor));
  }
  return elemento;
}

function criarHtml(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto != null) elemento.textContent = texto;
  return elemento;
}

function formatarBRL(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function radianos(graus) {
  return (graus * Math.PI) / 180;
}

function posicao(raio, angulo) {
  return {
    x: CENTRO + raio * Math.cos(radianos(angulo)),
    y: CENTRO + raio * Math.sin(radianos(angulo)),
  };
}

function caminhoArco(raio, inicio, fim) {
  const a = posicao(raio, inicio);
  const b = posicao(raio, fim);
  const grande = fim - inicio > 180 ? 1 : 0;
  return (
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} ` +
    `A ${raio} ${raio} 0 ${grande} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  );
}

/** Caminho suave (Catmull-Rom) passando por uma lista de pontos. */
function caminhoSuave(pontos) {
  if (!pontos.length) return "";

  let d = `M ${pontos[0].x.toFixed(2)} ${pontos[0].y.toFixed(2)}`;

  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[i - 1] || pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d +=
      ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ` +
      `${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ` +
      `${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

function corDoPreco(valor, minimo, maximo) {
  const t = maximo > minimo ? (valor - minimo) / (maximo - minimo) : 0.5;
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(255 + (AZUL_CARO[0] - 255) * x);
  const g = Math.round(255 + (AZUL_CARO[1] - 255) * x);
  const b = Math.round(255 + (AZUL_CARO[2] - 255) * x);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Raio de teste: metade do atual no menor preco e 3x no maior. */
function raioDoPreco(valor, minimo, maximo) {
  const t = maximo > minimo ? (valor - minimo) / (maximo - minimo) : 0.5;
  const x = Math.max(0, Math.min(1, t));
  return RAIO_BOLINHA * (0.5 + x * 2.5);
}

async function buscarDados() {
  const resposta = await fetch(URL_DADOS, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(`${resposta.status} ao buscar ${URL_DADOS}`);
  }
  return resposta.json();
}

/**
 * Filtra o recorte a partir de 1999, ordena as UFs e monta o mapa
 * UF -> ano -> ponto. Tambem guarda o menor e o maior preco do recorte,
 * que sao os extremos da escala de cor.
 */
function prepararDados(dados) {
  const anos = dados.anos
    .filter((ano) => ano >= ANO_INICIAL)
    .sort((a, b) => a - b);

  const estados = dados.estados
    .slice()
    .sort((a, b) => a.uf.localeCompare(b.uf));

  const porUf = new Map();
  let minimo = Infinity;
  let maximo = -Infinity;

  for (const estado of estados) {
    const valores = new Map();

    for (const [ano, mediana, min, max, n] of estado.valores) {
      if (ano < ANO_INICIAL) continue;

      const ponto = {
        ano,
        med: mediana / 100,
        min: min / 100,
        max: max / 100,
        n,
      };

      valores.set(ano, ponto);
      minimo = Math.min(minimo, ponto.med);
      maximo = Math.max(maximo, ponto.med);
    }

    porUf.set(estado.uf, valores);
  }

  return { anos, estados, porUf, minimo, maximo };
}

/**
 * Mediana nacional por ano: mediana das medianas estaduais, igual aos
 * graficos 05 e 07.
 */
function calcularMedianaNacional(anos, estados, porUf) {
  const serie = new Map();

  for (const ano of anos) {
    const valores = [];

    for (const estado of estados) {
      const ponto = porUf.get(estado.uf)?.get(ano);
      if (ponto) valores.push(ponto.med);
    }

    if (!valores.length) continue;

    valores.sort((a, b) => a - b);
    const meio = Math.floor(valores.length / 2);
    const mediana =
      valores.length % 2
        ? valores[meio]
        : (valores[meio - 1] + valores[meio]) / 2;

    serie.set(ano, { ano, med: mediana, ufs: valores.length });
  }

  return serie;
}

function montarGrafico({ anos, estados, porUf, minimo, maximo }) {
  const container = document.getElementById("grafico");
  container.innerHTML = "";

  const passoAngular = ARCO / estados.length;
  const passoRadial =
    (RAIO_EXTERNO - RAIO_INTERNO) / Math.max(1, anos.length - 1);

  const anguloDaColuna = (indice) =>
    ANGULO_INICIAL + (indice + 0.5) * passoAngular;
  const raioDoAno = (indice) => RAIO_INTERNO + indice * passoRadial;

  // Barras do Brasil e coluna de governos no vao superior direito.
  // As barras usam o x da primeira coluna (AC), na borda direita do vao.
  // Assim o anel externo (ano mais novo) cai na direita e cada barra alinha
  // com o mesmo ano do anel, em ordem cronologica.
  const ANGULO_FIM = ANGULO_INICIAL + passoAngular / 2;
  const xFimDoAnel = (raio) =>
    CENTRO + raio * Math.cos(radianos(ANGULO_FIM));
  const BARRA_INICIO = xFimDoAnel(RAIO_INTERNO);
  const BARRA_FIM = xFimDoAnel(RAIO_EXTERNO);
  const BARRA_BASE = 450;
  const BARRA_TOPO = 300;
  const BARRA_ALTURA = BARRA_BASE - BARRA_TOPO;
  const ROTULO_X = CENTRO + 75;
  const GOV_LABEL_Y = [265, 274];
  const GOV_BRACKET_Y = 281;

  const brasil = calcularMedianaNacional(anos, estados, porUf);
  const valoresBrasil = [...brasil.values()].map((ponto) => ponto.med);
  const baseBarra = Math.min(...valoresBrasil) - 0.5;
  const topoBarra = Math.max(...valoresBrasil) + 0.5;
  const escalaBarra = (valor) =>
    BARRA_BASE -
    ((valor - baseBarra) / (topoBarra - baseBarra)) * BARRA_ALTURA;
  const passoBarra =
    (BARRA_FIM - BARRA_INICIO) / Math.max(1, anos.length - 1);
  const xBarra = (indice) => BARRA_INICIO + indice * passoBarra;
  const larguraBarra = Math.min(9, passoBarra * 0.7);

  const svg = criarSvg("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "img",
    "aria-label":
      `Mapa radial de preços reais por UF e ano entre ${anos[0]} e ` +
      `${anos[anos.length - 1]}, com ${anos.length} anéis e ` +
      `${estados.length} colunas em 270 graus, além das barras da mediana ` +
      "nacional e da faixa de governos no vão; cor e tamanho são " +
      "proporcionais ao preço",
  });

  // Gradiente das caudas: azul da barra no topo, branco fraco do anel na ponta.
  const defs = criarSvg("defs");
  const gradienteCauda = criarSvg("linearGradient", {
    id: "cauda-gradiente",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: BARRA_BASE,
    x2: 0,
    y2: CENTRO + RAIO_EXTERNO * Math.sin(radianos(ANGULO_FIM)) + 4,
  });
  gradienteCauda.appendChild(
    criarSvg("stop", {
      offset: "0%",
      "stop-color": "#7cc7f0",
      "stop-opacity": 0.72,
    }),
  );
  gradienteCauda.appendChild(
    criarSvg("stop", {
      offset: "30%",
      "stop-color": "#7cc7f0",
      "stop-opacity": 0.55,
    }),
  );
  gradienteCauda.appendChild(
    criarSvg("stop", {
      offset: "100%",
      "stop-color": "#ffffff",
      "stop-opacity": 0.12,
    }),
  );
  defs.appendChild(gradienteCauda);
  svg.appendChild(defs);

  // --- aneis de guia ----------------------------------------------------
  const grupoAneis = criarSvg("g", { class: "aneis" });

  for (let indice = 0; indice < anos.length; indice++) {
    grupoAneis.appendChild(
      criarSvg("path", {
        class: "anel",
        d: caminhoArco(
          raioDoAno(indice),
          ANGULO_INICIAL,
          ANGULO_INICIAL + ARCO,
        ),
      }),
    );
  }

  svg.appendChild(grupoAneis);

  // Contorno do arco de 270 graus, logo fora da ultima fileira de bolinhas.
  svg.appendChild(
    criarSvg("path", {
      class: "arco-externo",
      d: caminhoArco(
        RAIO_EXTERNO + 8,
        ANGULO_INICIAL,
        ANGULO_INICIAL + ARCO,
      ),
    }),
  );

  // --- eixo dos anos, dentro do vao -------------------------------------
  const grupoEixo = criarSvg("g", { class: "eixo-anos" });
  const rotulosAno = new Map();

  grupoEixo.appendChild(
    criarSvg("line", {
      class: "eixo-linha",
      x1: CENTRO,
      y1: CENTRO - RAIO_INTERNO,
      x2: CENTRO,
      y2: CENTRO - RAIO_EXTERNO - 10,
    }),
  );

  grupoEixo.appendChild(
    criarSvg("line", {
      class: "eixo-linha",
      x1: CENTRO + RAIO_INTERNO,
      y1: CENTRO,
      x2: CENTRO + RAIO_EXTERNO + 10,
      y2: CENTRO,
    }),
  );

  svg.appendChild(grupoEixo);

  // --- vao: barras do Brasil e coluna de governos ----------------------
  const grupoVao = criarSvg("g", { class: "vao" });
  const barras = new Map();

  const tituloBrasil = criarSvg("text", {
    class: "barra-titulo",
    x: BARRA_FIM + 8,
    y: 72,
  });
  tituloBrasil.textContent = "BRASIL";
  grupoVao.appendChild(tituloBrasil);

  const subtituloBrasil = criarSvg("text", {
    class: "barra-sub",
    x: BARRA_FIM + 8,
    y: 86,
  });
  subtituloBrasil.textContent = "mediana nacional";
  grupoVao.appendChild(subtituloBrasil);

  const passoPreco = 2;
  const primeiroTick = Math.ceil(baseBarra / passoPreco) * passoPreco;

  for (let valor = primeiroTick; valor <= topoBarra; valor += passoPreco) {
    const y = escalaBarra(valor);

    grupoVao.appendChild(
      criarSvg("line", {
        class: "barra-grade",
        x1: BARRA_INICIO,
        y1: y.toFixed(2),
        x2: BARRA_FIM,
        y2: y.toFixed(2),
      }),
    );

    const rotulo = criarSvg("text", {
      class: "barra-rotulo",
      x: BARRA_FIM + 8,
      y: (y + 3.5).toFixed(2),
      "text-anchor": "start",
    });
    rotulo.textContent = `R$ ${valor}`;
    grupoVao.appendChild(rotulo);
  }

  grupoVao.appendChild(
    criarSvg("line", {
      class: "barra-base",
      x1: BARRA_INICIO,
      y1: BARRA_BASE,
      x2: BARRA_FIM,
      y2: BARRA_BASE,
    }),
  );

  // Cada barra desce ~5px, arredonda as quinas e deixa sair uma linha fina
  // do centro ate o ponto AC do mesmo ano.
  const grupoBarras = criarSvg("g", { class: "barras-nacionais" });

  for (let indice = 0; indice < anos.length; indice++) {
    const ano = anos[indice];
    const ponto = brasil.get(ano);
    if (!ponto) continue;

    const x = xBarra(indice);
    const yTopo = escalaBarra(ponto.med);
    const yPonta =
      CENTRO + raioDoAno(indice) * Math.sin(radianos(ANGULO_FIM));
    const metade = larguraBarra / 2;
    const quina = 1.5;
    const linha = 0.6;

    const barra = criarSvg("path", {
      class: "barra-nacional",
      d:
        `M ${(x - metade).toFixed(2)} ${(yTopo + quina).toFixed(2)} ` +
        `Q ${(x - metade).toFixed(2)} ${yTopo.toFixed(2)}, ` +
        `${(x - metade + quina).toFixed(2)} ${yTopo.toFixed(2)} ` +
        `L ${(x + metade - quina).toFixed(2)} ${yTopo.toFixed(2)} ` +
        `Q ${(x + metade).toFixed(2)} ${yTopo.toFixed(2)}, ` +
        `${(x + metade).toFixed(2)} ${(yTopo + quina).toFixed(2)} ` +
        `L ${(x + metade).toFixed(2)} 450.80 ` +
        `Q ${(x + metade).toFixed(2)} 452, ` +
        `${(x + metade - quina).toFixed(2)} 452 ` +
        `Q ${(x + 1.2).toFixed(2)} 452, ` +
        `${(x + linha).toFixed(2)} 455 ` +
        `L ${(x + linha).toFixed(2)} ${yPonta.toFixed(2)} ` +
        `L ${(x - linha).toFixed(2)} ${yPonta.toFixed(2)} ` +
        `L ${(x - linha).toFixed(2)} 455 ` +
        `Q ${(x - 1.2).toFixed(2)} 452, ` +
        `${(x - metade + quina).toFixed(2)} 452 ` +
        `Q ${(x - metade).toFixed(2)} 452, ` +
        `${(x - metade).toFixed(2)} 450.80 ` +
        `Z`,
    });
    barra.dataset.ano = String(ano);

    grupoBarras.appendChild(barra);
    barras.set(ano, barra);
  }

  grupoVao.appendChild(grupoBarras);

  // Rotulos do eixo X: a cada 5 anos e no ultimo. Se o ultimo estiver a
  // menos de 3 anos de um multiplo de 5, o multiplo sai para nao encostar.
  const ultimoAno = anos[anos.length - 1];
  const rotuladosBarra = new Set();

  for (const ano of anos) {
    if ((ano - ANO_INICIAL) % 5 === 0) rotuladosBarra.add(ano);
  }
  rotuladosBarra.add(ultimoAno);
  rotuladosBarra.delete(ultimoAno - 2);

  for (let indice = 0; indice < anos.length; indice++) {
    const ano = anos[indice];
    if (!rotuladosBarra.has(ano)) continue;

    const rotulo = criarSvg("text", {
      class: "ano-barra",
      x: xBarra(indice).toFixed(2),
      y: 293,
      "text-anchor": "middle",
    });
    rotulo.textContent = ano;
    grupoVao.appendChild(rotulo);
    rotulosAno.set(ano, rotulo);
  }

  const tituloAno = criarSvg("text", {
    class: "ano-titulo",
    x: ROTULO_X,
    y: 296,
    "text-anchor": "end",
  });
  tituloAno.textContent = "ANO";
  grupoVao.appendChild(tituloAno);

  const tituloGoverno = criarSvg("text", {
    class: "gov-titulo",
    x: ROTULO_X,
    y: 274,
    "text-anchor": "end",
  });
  tituloGoverno.textContent = "GOVERNO";
  grupoVao.appendChild(tituloGoverno);

  let indiceGoverno = 0;

  for (const governo of GOVERNOS) {
    const indices = [];

    for (let indice = 0; indice < anos.length; indice++) {
      if (anos[indice] >= governo.de && anos[indice] <= governo.ate) {
        indices.push(indice);
      }
    }

    if (!indices.length) continue;

    const xInicio = xBarra(indices[0]);
    const xFim = xBarra(indices[indices.length - 1]);
    const centro = (xInicio + xFim) / 2;
    const yRotulo = GOV_LABEL_Y[indiceGoverno % 2];

    grupoVao.appendChild(
      criarSvg("line", {
        class: "gov-barra",
        x1: (xInicio - 3).toFixed(2),
        y1: GOV_BRACKET_Y,
        x2: (xFim + 3).toFixed(2),
        y2: GOV_BRACKET_Y,
      }),
    );

    for (const x of [xInicio - 3, xFim + 3]) {
      grupoVao.appendChild(
        criarSvg("line", {
          class: "gov-barra",
          x1: x.toFixed(2),
          y1: GOV_BRACKET_Y - 3,
          x2: x.toFixed(2),
          y2: GOV_BRACKET_Y + 3,
        }),
      );
    }

    const rotulo = criarSvg("text", {
      class: "gov-rotulo",
      x: centro.toFixed(2),
      y: yRotulo,
      "text-anchor": "middle",
    });
    rotulo.textContent = governo.nome;
    grupoVao.appendChild(rotulo);

    indiceGoverno++;
  }

  svg.appendChild(grupoVao);

  // --- rotulos das UFs, fora do arco ------------------------------------
  const grupoRotulos = criarSvg("g", { class: "rotulos-uf" });
  const rotulosUf = new Map();

  for (let indice = 0; indice < estados.length; indice++) {
    const estado = estados[indice];
    const angulo = anguloDaColuna(indice);
    const ponto = posicao(RAIO_ROTULO, angulo);

    let rotacao = (((angulo + 90) % 360) + 360) % 360;
    if (rotacao > 90 && rotacao < 270) rotacao -= 180;

    const rotulo = criarSvg("text", {
      class: "uf-rotulo",
      x: ponto.x.toFixed(2),
      y: ponto.y.toFixed(2),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      transform:
        `rotate(${rotacao.toFixed(2)} ` +
        `${ponto.x.toFixed(2)} ${ponto.y.toFixed(2)})`,
    });
    rotulo.textContent = estado.uf;
    grupoRotulos.appendChild(rotulo);
    rotulosUf.set(estado.uf, rotulo);
  }

  svg.appendChild(grupoRotulos);

  // --- bolinhas e celulas do heatmap -----------------------------------
  const grupoCelulas = criarSvg("g", { class: "celulas" });
  const grupoHeat = criarSvg("g", { class: "celulas-heat" });
  const celulas = new Map();
  const desenho = [];

  for (let linha = 0; linha < anos.length; linha++) {
    const ano = anos[linha];
    const raio = raioDoAno(linha);

    for (let coluna = 0; coluna < estados.length; coluna++) {
      const estado = estados[coluna];
      const ponto = porUf.get(estado.uf)?.get(ano);
      if (!ponto) continue;

      const angulo = anguloDaColuna(coluna);
      const { x, y } = posicao(raio, angulo);
      const raioCelula = raioDoPreco(ponto.med, minimo, maximo);

      const circulo = criarSvg("circle", {
        class: "celula",
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: raioCelula.toFixed(2),
        fill: corDoPreco(ponto.med, minimo, maximo),
      });
      circulo.dataset.uf = estado.uf;
      circulo.dataset.ano = String(ano);

      const raioInterno = raio - passoRadial / 2 + 0.6;
      const raioExterno = raio + passoRadial / 2 - 0.6;
      const anguloInicio = angulo - passoAngular / 2 + 0.3;
      const anguloFim = angulo + passoAngular / 2 - 0.3;
      const p1 = posicao(raioInterno, anguloInicio);
      const p2 = posicao(raioExterno, anguloInicio);
      const p3 = posicao(raioExterno, anguloFim);
      const p4 = posicao(raioInterno, anguloFim);
      const cor = corDoPreco(ponto.med, minimo, maximo);

      // Funil da linha para a celula AC (so na primeira coluna, onde as
      // linhas das barras chegam).
      if (coluna === 0) {
        const yTopo = (p1.y + p2.y) / 2;
        const yFunil = yTopo - 6;

        const funil = criarSvg("path", {
          class: "celula-funil",
          fill: cor,
          d:
            `M ${(x - 0.6).toFixed(2)} ${yFunil.toFixed(2)} ` +
            `Q ${(x - 0.6).toFixed(2)} ${(yTopo - 2).toFixed(2)}, ` +
            `${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
            `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} ` +
            `Q ${(x + 0.6).toFixed(2)} ${(yTopo - 2).toFixed(2)}, ` +
            `${(x + 0.6).toFixed(2)} ${yFunil.toFixed(2)} Z`,
        });

        grupoHeat.appendChild(funil);
      }

      const setor = criarSvg("path", {
        class: "celula-heat",
        fill: cor,
        d:
          `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
          `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} ` +
          `A ${raioExterno.toFixed(2)} ${raioExterno.toFixed(2)} 0 0 1 ` +
          `${p3.x.toFixed(2)} ${p3.y.toFixed(2)} ` +
          `L ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} ` +
          `A ${raioInterno.toFixed(2)} ${raioInterno.toFixed(2)} 0 0 0 ` +
          `${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`,
      });
      setor.dataset.uf = estado.uf;
      setor.dataset.ano = String(ano);

      desenho.push({ elemento: circulo, raio: raioCelula });
      grupoHeat.appendChild(setor);
      celulas.set(`${estado.uf}:${ano}`, {
        elemento: circulo,
        elementoHeat: setor,
        estado,
        ano,
        ponto,
      });
    }
  }

  // Maiores atras, menores na frente.
  desenho.sort((a, b) => b.raio - a.raio);
  for (const item of desenho) grupoCelulas.appendChild(item.elemento);

  const valoresCelulas = [...celulas.values()]
    .map((celula) => celula.ponto.med)
    .sort((a, b) => a - b);
  const meioCelulas = Math.floor(valoresCelulas.length / 2);
  const medianaGlobal =
    valoresCelulas.length % 2
      ? valoresCelulas[meioCelulas]
      : (valoresCelulas[meioCelulas - 1] + valoresCelulas[meioCelulas]) / 2;

  const faixaMin = Math.min(
    ...[...celulas.values()].map((celula) => celula.ponto.min),
  );
  const faixaMax = Math.max(
    ...[...celulas.values()].map((celula) => celula.ponto.max),
  );

  // --- linhas de minimo e maximo por estado ----------------------------
  const grupoFaixa = criarSvg("g", { class: "faixas" });
  const faixas = new Map();

  for (let coluna = 0; coluna < estados.length; coluna++) {
    const estado = estados[coluna];
    const angulo = anguloDaColuna(coluna);
    const larguraAngular = passoAngular - 0.6;
    const base = angulo - passoAngular / 2 + 0.3;
    const minPontos = [];
    const maxPontos = [];
    const minAngulos = [];
    const maxAngulos = [];

    for (let linha = 0; linha < anos.length; linha++) {
      const ponto = porUf.get(estado.uf)?.get(anos[linha]);
      if (!ponto) continue;

      const raio = raioDoAno(linha);
      const tMin = Math.max(
        0,
        Math.min(1, (ponto.min - faixaMin) / (faixaMax - faixaMin)),
      );
      const tMax = Math.max(
        0,
        Math.min(1, (ponto.max - faixaMin) / (faixaMax - faixaMin)),
      );
      const aMin = base + tMin * larguraAngular;
      const aMax = base + tMax * larguraAngular;

      minAngulos.push(aMin);
      maxAngulos.push(aMax);
      minPontos.push(posicao(raio, aMin));
      maxPontos.push(posicao(raio, aMax));
    }

    if (!minPontos.length) continue;

    const raioInicio = RAIO_INTERNO - passoRadial / 2 + 0.6;
    const raioFim = RAIO_EXTERNO + passoRadial / 2 - 0.6;
    const minBanda = [
      posicao(raioInicio, minAngulos[0]),
      ...minPontos,
      posicao(raioFim, minAngulos[minAngulos.length - 1]),
    ];
    const maxBanda = [
      posicao(raioInicio, maxAngulos[0]),
      ...maxPontos,
      posicao(raioFim, maxAngulos[maxAngulos.length - 1]),
    ];
    const dMin = caminhoSuave(minBanda);
    const dMax = caminhoSuave(maxBanda);
    const ultimoMax = maxBanda[maxBanda.length - 1];

    const clip = criarSvg("clipPath", {
      id: `faixa-clip-${estado.uf}`,
      clipPathUnits: "userSpaceOnUse",
    });
    clip.appendChild(
      criarSvg("path", {
        d:
          dMin +
          ` L ${ultimoMax.x.toFixed(2)} ${ultimoMax.y.toFixed(2)} ` +
          caminhoSuave(maxBanda.slice().reverse()).replace(/^M/, "L") +
          " Z",
      }),
    );
    defs.appendChild(clip);

    const grupo = criarSvg("g", {
      class: "faixa-estado",
      "data-uf": estado.uf,
    });
    grupo.appendChild(
      criarSvg("path", {
        class: "faixa-max",
        d: dMax,
      }),
    );
    grupo.appendChild(
      criarSvg("path", {
        class: "faixa-min",
        d: dMin,
      }),
    );

    grupoFaixa.appendChild(grupo);
    faixas.set(estado.uf, grupo);
  }

  grupoHeat.style.display = "none";
  grupoFaixa.style.display = "none";
  svg.appendChild(grupoCelulas);
  svg.appendChild(grupoHeat);
  svg.appendChild(grupoFaixa);
  container.appendChild(svg);

  // --- hover ------------------------------------------------------------
  let modo = "cor";
  let celulaAtiva = null;
  let celulaAtual = null;
  let ufAtiva = null;
  let anoAtivo = null;

  function limparDestaque() {
    if (celulaAtiva) celulaAtiva.classList.remove("ativa");
    if (ufAtiva) rotulosUf.get(ufAtiva)?.classList.remove("ativa");
    if (anoAtivo != null) rotulosAno.get(anoAtivo)?.classList.remove("ativa");
    for (const barra of barras.values()) barra.classList.remove("ativa");

    celulaAtiva = null;
    celulaAtual = null;
    ufAtiva = null;
    anoAtivo = null;
    tooltip.classList.add("oculto");
  }

  function destacar(celula) {
    limparDestaque();

    celulaAtual = celula;

    if (modo === "faixa") {
      const grupo = faixas.get(celula.estado.uf);
      if (grupo) {
        grupo.classList.add("ativa");
        celulaAtiva = grupo;
      }
    } else {
      celulaAtiva =
        modo === "heatmap" ? celula.elementoHeat : celula.elemento;
      celulaAtiva?.classList.add("ativa");
    }

    ufAtiva = celula.estado.uf;
    rotulosUf.get(ufAtiva)?.classList.add("ativa");

    anoAtivo = celula.ano;
    rotulosAno.get(anoAtivo)?.classList.add("ativa");
  }

  function celulaDoEvento(evento) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;

    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    const local = ponto.matrixTransform(matriz.inverse());

    const dx = local.x - CENTRO;
    const dy = local.y - CENTRO;
    const raio = Math.hypot(dx, dy);

    if (
      raio < RAIO_INTERNO - passoRadial / 2 ||
      raio > RAIO_EXTERNO + passoRadial / 2
    ) {
      return null;
    }

    let angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angulo < 0) angulo += 360;
    if (angulo < ANGULO_INICIAL) angulo += 360;
    if (angulo < ANGULO_INICIAL || angulo > ANGULO_INICIAL + ARCO) {
      return null;
    }

    const coluna = Math.min(
      estados.length - 1,
      Math.max(0, Math.floor((angulo - ANGULO_INICIAL) / passoAngular)),
    );
    const linha = Math.min(
      anos.length - 1,
      Math.max(0, Math.round((raio - RAIO_INTERNO) / passoRadial)),
    );

    const estado = estados[coluna];
    const ano = anos[linha];

    return celulas.get(`${estado.uf}:${ano}`) ?? null;
  }

  function mostrarTooltip(celula, evento) {
    const { estado, ano, ponto } = celula;

    tooltip.innerHTML = "";
    tooltip.classList.remove("oculto");

    const topo = criarHtml("div", "tt-topo");
    topo.appendChild(criarHtml("span", "tt-uf", estado.uf));
    topo.appendChild(criarHtml("span", "tt-nome", estado.nome));
    topo.appendChild(criarHtml("span", "tt-ano", String(ano)));
    tooltip.appendChild(topo);

    const mediana = criarHtml("div", "tt-mediana");
    mediana.appendChild(criarHtml("span", null, "Mediana"));
    mediana.appendChild(criarHtml("strong", null, formatarBRL(ponto.med)));
    tooltip.appendChild(mediana);

    const minimoAno = criarHtml("div", "tt-linha");
    minimoAno.appendChild(criarHtml("span", null, "Mínimo do ano"));
    minimoAno.appendChild(criarHtml("b", null, formatarBRL(ponto.min)));

    const maximoAno = criarHtml("div", "tt-linha");
    maximoAno.appendChild(criarHtml("span", null, "Máximo do ano"));
    maximoAno.appendChild(criarHtml("b", null, formatarBRL(ponto.max)));

    const notas = criarHtml("div", "tt-notas");
    const quantidade = ponto.n.toLocaleString("pt-BR");
    notas.appendChild(
      criarHtml(
        "strong",
        null,
        `${quantidade} ${ponto.n === 1 ? "nota" : "notas"}`,
      ),
    );
    notas.appendChild(document.createTextNode(" no ano"));

    tooltip.appendChild(minimoAno);
    tooltip.appendChild(maximoAno);
    tooltip.appendChild(notas);

    posicionarTooltip(evento);
  }

  function posicionarTooltip(evento) {
    const caixa = tooltip.getBoundingClientRect();
    let left = evento.clientX + 16;
    let top = evento.clientY + 16;

    if (left + caixa.width > window.innerWidth - 8) {
      left = evento.clientX - caixa.width - 16;
    }
    if (top + caixa.height > window.innerHeight - 8) {
      top = evento.clientY - caixa.height - 16;
    }

    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function mostrarTooltipBrasil(dados, evento) {
    tooltip.innerHTML = "";
    tooltip.classList.remove("oculto");

    const topo = criarHtml("div", "tt-topo");
    topo.appendChild(criarHtml("span", "tt-uf tt-brasil", "BR"));
    topo.appendChild(
      criarHtml("span", "tt-nome", "Brasil · mediana das UFs"),
    );
    topo.appendChild(criarHtml("span", "tt-ano", String(dados.ano)));
    tooltip.appendChild(topo);

    const mediana = criarHtml("div", "tt-mediana");
    mediana.appendChild(criarHtml("span", null, "Mediana"));
    mediana.appendChild(criarHtml("strong", null, formatarBRL(dados.med)));
    tooltip.appendChild(mediana);

    const notas = criarHtml("div", "tt-notas");
    notas.appendChild(criarHtml("strong", null, `${dados.ufs} UFs`));
    notas.appendChild(document.createTextNode(" com dados no ano"));
    tooltip.appendChild(notas);

    posicionarTooltip(evento);
  }

  function barraDoEvento(evento) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;

    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    const local = ponto.matrixTransform(matriz.inverse());

    if (
      local.x < BARRA_INICIO - passoBarra / 2 ||
      local.x > BARRA_FIM + passoBarra / 2 ||
      local.y < BARRA_TOPO ||
      local.y > BARRA_BASE
    ) {
      return null;
    }

    const indice = Math.min(
      anos.length - 1,
      Math.max(0, Math.round((local.x - BARRA_INICIO) / passoBarra)),
    );

    return brasil.get(anos[indice]) ?? null;
  }

  svg.addEventListener("pointermove", (evento) => {
    const barra = barraDoEvento(evento);

    if (barra) {
      limparDestaque();
      barras.get(barra.ano)?.classList.add("ativa");
      anoAtivo = barra.ano;
      rotulosAno.get(barra.ano)?.classList.add("ativa");
      mostrarTooltipBrasil(barra, evento);
      return;
    }

    const celula = celulaDoEvento(evento);

    if (!celula) {
      limparDestaque();
      return;
    }

    if (celulaAtual !== celula) destacar(celula);
    mostrarTooltip(celula, evento);
  });

  svg.addEventListener("pointerleave", limparDestaque);

  // --- modos de visualizacao -------------------------------------------
  const botoesModo = [...document.querySelectorAll(".opcao")];

  function aplicarModo(novoModo) {
    modo = novoModo;

    const ehTamanho = modo === "tamanho";
    const ehHeat = modo === "heatmap";
    const ehFaixa = modo === "faixa";

    grupoCelulas.style.display = ehHeat || ehFaixa ? "none" : "";
    grupoHeat.style.display = ehHeat || ehFaixa ? "" : "none";
    grupoFaixa.style.display = ehFaixa ? "" : "none";

    for (const celula of celulas.values()) {
      const circulo = celula.elemento;

      if (ehTamanho) {
        circulo.setAttribute(
          "r",
          raioDoPreco(celula.ponto.med, minimo, maximo).toFixed(2),
        );
        circulo.setAttribute("fill", "#7cc7f0");
        circulo.setAttribute("fill-opacity", "0.2");
      } else {
        circulo.setAttribute("r", RAIO_BOLINHA);
        circulo.setAttribute(
          "fill",
          corDoPreco(celula.ponto.med, minimo, maximo),
        );
        circulo.setAttribute("fill-opacity", "1");
      }

      const setor = celula.elementoHeat;
      if (ehFaixa) {
        setor.setAttribute(
          "clip-path",
          `url(#faixa-clip-${celula.estado.uf})`,
        );
      } else {
        setor.removeAttribute("clip-path");
      }
    }

    const clipFunil = `url(#faixa-clip-${estados[0].uf})`;
    for (const funil of grupoHeat.querySelectorAll(".celula-funil")) {
      if (ehFaixa) funil.setAttribute("clip-path", clipFunil);
      else funil.removeAttribute("clip-path");
    }

    for (const botao of botoesModo) {
      const ativo = botao.dataset.modo === modo;
      botao.classList.toggle("ativa", ativo);
      botao.setAttribute("aria-checked", ativo ? "true" : "false");
    }

    limparDestaque();
    montarLegenda(
      modo,
      minimo,
      maximo,
      medianaGlobal,
      faixaMin,
      faixaMax,
    );
  }

  for (const botao of botoesModo) {
    botao.addEventListener("click", () => aplicarModo(botao.dataset.modo));
  }

  aplicarModo("cor");
}

function montarLegenda(modo, minimo, maximo, mediana, faixaMin, faixaMax) {
  const container = document.getElementById("legenda");
  if (!container) return;

  container.innerHTML = "";

  if (modo === "faixa") {
    const barra = criarHtml("div", "leg-gradiente");
    barra.setAttribute("aria-hidden", "true");
    barra.style.background =
      `linear-gradient(90deg, #ffffff, ` +
      `rgb(${AZUL_CARO[0]}, ${AZUL_CARO[1]}, ${AZUL_CARO[2]}))`;

    container.append(
      criarHtml("span", "leg-ext", "MAIS BARATO"),
      barra,
      criarHtml("span", "leg-ext", "MAIS CARO"),
      criarHtml(
        "span",
        "leg-faixa",
        `${formatarBRL(minimo)} – ${formatarBRL(maximo)}`,
      ),
      criarHtml("span", "leg-ext", "MÍN–MÁX"),
      criarHtml(
        "span",
        "leg-faixa",
        `${formatarBRL(faixaMin)} – ${formatarBRL(faixaMax)}`,
      ),
      criarHtml("span", "leg-vazio", "tracejado = mínimo"),
      criarHtml("span", "leg-vazio", "cheio = máximo"),
    );
    return;
  }

  if (modo === "tamanho") {
    const grupo = criarHtml("div", "leg-tamanho");
    const amostras = [
      { valor: minimo, raio: raioDoPreco(minimo, minimo, maximo) },
      { valor: mediana, raio: raioDoPreco(mediana, minimo, maximo) },
      { valor: maximo, raio: raioDoPreco(maximo, minimo, maximo) },
    ];

    for (const amostra of amostras) {
      const item = criarHtml("div", "leg-amostra");
      const bola = document.createElement("i");
      bola.style.width = `${(amostra.raio * 2).toFixed(1)}px`;
      bola.style.height = `${(amostra.raio * 2).toFixed(1)}px`;
      item.appendChild(bola);
      item.appendChild(criarHtml("span", null, formatarBRL(amostra.valor)));
      grupo.appendChild(item);
    }

    container.append(
      grupo,
      criarHtml("span", "leg-vazio", "tamanho = preço"),
      criarHtml("span", "leg-vazio", "sem bolinha = sem nota"),
    );
    return;
  }

  const barra = criarHtml("div", "leg-gradiente");
  barra.setAttribute("aria-hidden", "true");
  barra.style.background =
    `linear-gradient(90deg, #ffffff, ` +
    `rgb(${AZUL_CARO[0]}, ${AZUL_CARO[1]}, ${AZUL_CARO[2]}))`;

  container.append(
    criarHtml("span", "leg-ext", "MAIS BARATO"),
    barra,
    criarHtml("span", "leg-ext", "MAIS CARO"),
    criarHtml(
      "span",
      "leg-faixa",
      `${formatarBRL(minimo)} – ${formatarBRL(maximo)}`,
    ),
    criarHtml("span", "leg-vazio", "cor = preço"),
    criarHtml(
      "span",
      "leg-vazio",
      modo === "heatmap" ? "sem célula = sem nota" : "sem bolinha = sem nota",
    ),
  );
}

function montarOpcoes() {
  const opcoes = document.getElementById("opcoes");
  if (!opcoes) return;

  const aba = opcoes.querySelector(".opcoes-aba");
  if (!aba) return;

  const estaAberto = () =>
    opcoes.matches(":hover") ||
    opcoes.matches(":focus-within") ||
    opcoes.classList.contains("aberto");

  const sincronizar = () => {
    aba.setAttribute("aria-expanded", estaAberto() ? "true" : "false");
  };

  opcoes.addEventListener("pointerenter", sincronizar);
  opcoes.addEventListener("pointerleave", () =>
    requestAnimationFrame(sincronizar),
  );
  opcoes.addEventListener("focusin", sincronizar);
  opcoes.addEventListener("focusout", () =>
    requestAnimationFrame(sincronizar),
  );

  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;
    opcoes.classList.remove("aberto");
    sincronizar();
  });

  aba.addEventListener("click", (evento) => {
    if (window.matchMedia("(hover: hover)").matches) {
      if (evento.detail > 0) aba.blur();
      return;
    }

    opcoes.classList.toggle("aberto");
    if (!opcoes.classList.contains("aberto")) aba.blur();
    sincronizar();
  });
}

async function main() {
  const carregando = document.getElementById("carregando");
  const erro = document.getElementById("erro");

  let dados;
  try {
    dados = await buscarDados();
  } catch (falha) {
    carregando.classList.add("oculto");
    erro.classList.remove("oculto");
    erro.textContent = `Não foi possível carregar os dados: ${falha.message}`;
    return;
  }

  const preparado = prepararDados(dados);

  if (!preparado.estados.length || !preparado.anos.length) {
    throw new Error("ondas.json nao tem dados a partir de 1999.");
  }

  const produto = dados.produto;
  if (produto) {
    const rotulo =
      produto.rotulo ||
      `1${produto.unidadeBase || ""} DE ${produto.nome || ""}`.trim();
    document.getElementById("produto").textContent = rotulo;
  }

  document.getElementById("periodo").textContent =
    `${preparado.anos[0]}–${preparado.anos[preparado.anos.length - 1]}`;

  montarGrafico(preparado);
  montarOpcoes();

  // No mobile o grafico nao cabe inteiro; abre a rolagem no vao (direita),
  // onde ficam as barras e as colunas de ano/governo.
  const area = document.querySelector(".radial-area");
  if (area && area.scrollWidth > area.clientWidth) {
    area.scrollLeft = area.scrollWidth - area.clientWidth;
  }

  carregando.classList.add("oculto");
}

main().catch((falha) => {
  const carregando = document.getElementById("carregando");
  const erro = document.getElementById("erro");
  carregando?.classList.add("oculto");
  if (erro) {
    erro.classList.remove("oculto");
    erro.textContent = `Erro ao montar o gráfico: ${falha.message}`;
  }
  console.error(falha);
});
