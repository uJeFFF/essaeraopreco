// Frontend /04/: barras da mediana nacional por ano com as medianas de cada UF
// sobrepostas como linhas, na mesma escala Y linear, de R$ 0 a R$ 50.
// O grafico usa metade da altura original (714 -> 357) para ficar mais largo
// e baixo.
// Mesma pagina do /03/ (governos, eixo de anos, tira de UFs e trava por
// clique), mas sem heatmap: as barras ocupam toda a area do plot.
// Le apenas web/dados/ondas.json (gerado por src/compilar-ondas.js).

import { GOVERNOS } from "../governos.js";

const URL_DADOS = "../dados/ondas.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1220;
// Metade da altura original (714), mantendo as margens do topo e do eixo X.
const ALTURA = 357;
const MARGEM = { top: 56, right: 34, bottom: 50, left: 78 };
const PLOT = {
  x: MARGEM.left,
  y: MARGEM.top,
  w: LARGURA - MARGEM.left - MARGEM.right,
  h: ALTURA - MARGEM.top - MARGEM.bottom,
};

// Distancia (em px do SVG) para considerar o ponteiro em cima de uma linha.
const RAIO_HOVER = 7;

// Escala linear fixa de R$ 0 a R$ 50, com ticks a cada R$ 5.
const DOMINIO_MAX = 50;
const PASSO_Y = 5;

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

async function buscarDados() {
  const resposta = await fetch(URL_DADOS, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(`${resposta.status} ao buscar ${URL_DADOS}`);
  }
  return resposta.json();
}

/**
 * Preenche os anos sem nota entre o primeiro e o ultimo ano de cada UF.
 * Fora desse intervalo a linha nao existe (nao extrapolamos).
 */
function prepararEstados(dados) {
  return dados.estados.map((estado) => {
    const valores = estado.valores.slice().sort((a, b) => a[0] - b[0]);

    if (!valores.length) {
      return { ...estado, pontos: [], porAno: new Map() };
    }

    const conhecidos = new Map(
      valores.map(([ano, mediana, min, max, n]) => [
        ano,
        {
          ano,
          med: mediana / 100,
          min: min / 100,
          max: max / 100,
          n,
          interpolado: false,
        },
      ]),
    );

    const primeiro = valores[0][0];
    const ultimo = valores[valores.length - 1][0];
    const pontos = [];

    for (let ano = primeiro; ano <= ultimo; ano++) {
      const ponto = conhecidos.get(ano);
      if (ponto) {
        pontos.push(ponto);
        continue;
      }

      let antes = null;
      let depois = null;
      for (const valor of valores) {
        if (valor[0] < ano) antes = valor;
        else if (valor[0] > ano) {
          depois = valor;
          break;
        }
      }

      const t = (ano - antes[0]) / (depois[0] - antes[0]);
      const interpolar = (a, b) => a / 100 + ((b / 100 - a / 100) * t);

      pontos.push({
        ano,
        med: interpolar(antes[1], depois[1]),
        min: interpolar(antes[2], depois[2]),
        max: interpolar(antes[3], depois[3]),
        n: 0,
        interpolado: true,
      });
    }

    return {
      ...estado,
      pontos,
      porAno: new Map(pontos.map((ponto) => [ponto.ano, ponto])),
    };
  });
}

/** Segmentos de uma curva Catmull-Rom convertidos para cubicas de Bezier. */
function segmentos(xs, ys) {
  const total = xs.length;
  const lista = [];

  for (let i = 0; i < total - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = i;
    const i2 = i + 1;
    const i3 = Math.min(total - 1, i + 2);

    lista.push({
      x0: xs[i1],
      y0: ys[i1],
      c1x: xs[i1] + (xs[i2] - xs[i0]) / 6,
      c1y: ys[i1] + (ys[i2] - ys[i0]) / 6,
      c2x: xs[i2] - (xs[i3] - xs[i1]) / 6,
      c2y: ys[i2] - (ys[i3] - ys[i1]) / 6,
      x1: xs[i2],
      y1: ys[i2],
    });
  }

  return lista;
}

function caminhoSuave(xs, ys) {
  const lista = segmentos(xs, ys);
  if (!lista.length) return "";

  let d = `M ${lista[0].x0.toFixed(2)} ${lista[0].y0.toFixed(2)}`;
  for (const s of lista) {
    d += ` C ${s.c1x.toFixed(2)} ${s.c1y.toFixed(2)},`;
    d += ` ${s.c2x.toFixed(2)} ${s.c2y.toFixed(2)},`;
    d += ` ${s.x1.toFixed(2)} ${s.y1.toFixed(2)}`;
  }
  return d;
}

/**
 * Serie nacional: para cada ano, a mediana das medianas estaduais.
 * Nao existe mediana do Brasil nos dados do site, entao esta e a melhor
 * aproximacao possivel a partir de ondas.json (26-27 UFs por ano).
 */
function calcularMedianaBrasil(estados, anos) {
  const serie = new Map();

  for (const ano of anos) {
    const valores = [];

    for (const estado of estados) {
      const ponto = estado.porAno.get(ano);
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

function montarGrafico(dados, estados) {
  const container = document.getElementById("grafico");
  container.innerHTML = "";

  const svg = criarSvg("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "img",
    "aria-label":
      "Gráfico de barras da mediana nacional por ano, com as medianas de cada " +
      "unidade da federação sobrepostas como linhas, em escala linear de " +
      "0 a 50, entre 1980 e 2026",
  });

  const anos = dados.anos;
  const ANO_MIN = anos[0];
  const ANO_MAX = anos[anos.length - 1];

  // Cada ano ocupa uma faixa de 1 ano e fica no centro dela: assim 1980 e 2026
  // nao encostam nas bordas e a primeira/ultima barra ficam dentro do plot.
  const totalAnos = ANO_MAX - ANO_MIN + 1;
  const passoAno = PLOT.w / totalAnos;

  const escalaX = (ano) =>
    PLOT.x + (ano - ANO_MIN + 0.5) * passoAno;
  const anoEmX = (px) =>
    ANO_MIN + (px - PLOT.x) / passoAno - 0.5;

  const baseY = PLOT.y + PLOT.h;
  const larguraBarra = Math.max(3, passoAno * 0.62);

  // --- escala unica ------------------------------------------------------
  // Barras (Brasil) e linhas (UFs) dividem o mesmo eixo Y linear, fixo de
  // R$ 0 a R$ 50.
  const brasil = calcularMedianaBrasil(estados, anos);

  const escalaY = (valor) =>
    baseY - (valor / DOMINIO_MAX) * PLOT.h;

  // Grade horizontal e rotulos do eixo Y.
  const ticks = [];
  for (let valor = 0; valor <= DOMINIO_MAX; valor += PASSO_Y) {
    ticks.push(valor);
  }

  for (const valor of ticks) {
    const y = escalaY(valor);

    svg.appendChild(
      criarSvg("line", {
        x1: PLOT.x,
        y1: y,
        x2: PLOT.x + PLOT.w,
        y2: y,
        class: "grade",
      }),
    );

    const rotulo = criarSvg("text", {
      x: PLOT.x - 12,
      y: y + 3.5,
      "text-anchor": "end",
      class: "rotulo-y",
    });
    rotulo.textContent = `R$ ${valor}`;
    svg.appendChild(rotulo);
  }

  // Recorte para barras e linhas nao invadirem os eixos.
  const defs = criarSvg("defs");
  const recorte = criarSvg("clipPath", { id: "recorte-plot" });
  recorte.appendChild(
    criarSvg("rect", {
      x: PLOT.x,
      y: PLOT.y,
      width: PLOT.w,
      height: PLOT.h,
    }),
  );
  defs.appendChild(recorte);
  svg.appendChild(defs);

  // Faixa dos governos, sem colunas: apenas nomes e divisores discretos.
  svg.appendChild(
    criarSvg("line", {
      x1: PLOT.x,
      y1: 32,
      x2: PLOT.x + PLOT.w,
      y2: 32,
      class: "linha-gov",
    }),
  );

  // Cada governo comeca entre anos: a divisoria cai no meio do caminho entre
  // o ultimo ano do governo anterior e o primeiro ano deste governo.
  const divisoesGoverno = [];

  for (const governo of GOVERNOS) {
    if (governo.ate < ANO_MIN || governo.de > ANO_MAX) continue;

    const de = Math.max(governo.de, ANO_MIN);
    const ate = Math.min(governo.ate, ANO_MAX);
    const x1 = escalaX(Math.max(de - 0.5, ANO_MIN));
    const x2 = Math.min(PLOT.x + PLOT.w, escalaX(ate + 0.5));

    const rotulo = criarSvg("text", {
      x: (x1 + x2) / 2,
      y: 24,
      "text-anchor": "middle",
      class: "gov-rotulo",
    });
    rotulo.textContent = governo.nome;
    svg.appendChild(rotulo);

    if (governo.de > ANO_MIN) {
      divisoesGoverno.push(escalaX(governo.de - 0.5));
    }
  }

  // --- barras da mediana nacional (Brasil) --------------------------------
  // As barras partem do zero, na base do plot.
  const barras = new Map();
  const grupoBarras = criarSvg("g", {
    class: "barras",
    "clip-path": "url(#recorte-plot)",
  });

  for (const [ano, ponto] of brasil) {
    const x = escalaX(ano);
    const y = escalaY(ponto.med);
    const barra = criarSvg("rect", {
      class: "barra-brasil",
      x: (x - larguraBarra / 2).toFixed(2),
      y: y.toFixed(2),
      width: larguraBarra.toFixed(2),
      height: Math.max(1, baseY - y).toFixed(2),
      rx: 2,
    });
    grupoBarras.appendChild(barra);
    barras.set(ano, barra);
  }

  svg.appendChild(grupoBarras);

  // --- linhas das UFs (mesma escala das barras) ---------------------------
  const grupoLinhas = criarSvg("g", {
    class: "linhas",
    "clip-path": "url(#recorte-plot)",
  });

  const estadosComLinha = estados
    .filter((estado) => estado.pontos.length)
    .sort((a, b) => a.uf.localeCompare(b.uf));
  const linhasPorUf = new Map();

  for (const estado of estadosComLinha) {
    const xs = estado.pontos.map((ponto) => escalaX(ponto.ano));
    const ys = estado.pontos.map((ponto) => escalaY(ponto.med));

    const linha = criarSvg("path", {
      class: "linha-uf",
      "data-uf": estado.uf,
      d: caminhoSuave(xs, ys),
    });

    grupoLinhas.appendChild(linha);
    linhasPorUf.set(estado.uf, linha);
  }

  svg.appendChild(grupoLinhas);

  // Marcador do ano exato na linha da UF ativa.
  const pontoAtivo = criarSvg("circle", {
    class: "ponto-uf oculto",
    r: 3.5,
    cx: 0,
    cy: 0,
  });
  svg.appendChild(pontoAtivo);

  // Divisorias dos governos: pontilhadas, dos governos ate o eixo dos anos,
  // por cima das barras e das linhas.
  const divisorias = criarSvg("g", {
    class: "governos-divisorias",
    "aria-hidden": "true",
  });

  for (const x of divisoesGoverno) {
    divisorias.appendChild(
      criarSvg("line", {
        x1: x,
        y1: 32,
        x2: x,
        y2: baseY,
        class: "gov-divisoria",
      }),
    );
  }

  svg.appendChild(divisorias);

  // Eixo X: marca em todo ano, rotulo a cada 5 anos e no ultimo ano.
  svg.appendChild(
    criarSvg("line", {
      x1: PLOT.x,
      y1: baseY,
      x2: PLOT.x + PLOT.w,
      y2: baseY,
      class: "linha-base",
    }),
  );

  const rotulados = new Set();
  for (let ano = ANO_MIN; ano <= ANO_MAX; ano += 5) rotulados.add(ano);
  if (!rotulados.has(ANO_MAX)) {
    const anterior = ANO_MAX - 1;
    if (rotulados.has(anterior)) rotulados.delete(anterior);
    rotulados.add(ANO_MAX);
  }

  for (let ano = ANO_MIN; ano <= ANO_MAX; ano++) {
    const x = escalaX(ano);
    const destacado = rotulados.has(ano);

    svg.appendChild(
      criarSvg("line", {
        x1: x,
        y1: baseY,
        x2: x,
        y2: baseY + (destacado ? 6 : 3),
        class: "ano-marca",
      }),
    );

    if (destacado) {
      const rotulo = criarSvg("text", {
        x,
        y: baseY + 18,
        "text-anchor": ano === ANO_MAX ? "end" : "middle",
        class: "ano-rotulo",
      });
      rotulo.textContent = ano;
      svg.appendChild(rotulo);
    }
  }

  const tituloX = criarSvg("text", {
    x: PLOT.x + PLOT.w,
    y: baseY + 34,
    "text-anchor": "end",
    class: "eixo-x-titulo",
  });
  tituloX.textContent = "ANO";
  svg.appendChild(tituloX);

  // Guia do hover.
  const guia = criarSvg("g", { class: "guia oculto" });
  const guiaLinha = criarSvg("line", {
    x1: PLOT.x,
    y1: PLOT.y,
    x2: PLOT.x,
    y2: baseY,
    class: "guia-linha",
  });
  const guiaAnoFundo = criarSvg("rect", {
    x: PLOT.x,
    y: PLOT.y - 18,
    width: 46,
    height: 16,
    rx: 8,
    ry: 8,
    class: "guia-ano-fundo",
  });
  const guiaAno = criarSvg("text", {
    x: PLOT.x + 23,
    y: PLOT.y - 6,
    "text-anchor": "middle",
    class: "guia-ano",
  });

  guia.appendChild(guiaLinha);
  guia.appendChild(guiaAnoFundo);
  guia.appendChild(guiaAno);
  svg.appendChild(guia);

  // Camada transparente que captura o mouse sobre toda a area do plot.
  const overlay = criarSvg("rect", {
    x: PLOT.x,
    y: PLOT.y,
    width: PLOT.w,
    height: PLOT.h,
    class: "overlay",
  });
  svg.appendChild(overlay);

  container.appendChild(svg);

  // --- estado do destaque ------------------------------------------------

  // UF presa por clique (chip ou linha); null = apenas hover.
  let ufTravada = null;

  const estadosPorUf = new Map(estados.map((estado) => [estado.uf, estado]));

  const chips = new Map();
  for (const chip of document.querySelectorAll(".uf")) {
    chips.set(chip.dataset.uf, chip);
  }

  function aplicarDestaque(uf) {
    for (const [ufLinha, linha] of linhasPorUf) {
      const destacado = uf != null && ufLinha === uf;
      const travada = ufTravada != null && ufLinha === ufTravada;
      linha.classList.toggle("destaque", destacado);
      linha.classList.toggle("travada", travada);
      if (destacado && grupoLinhas.lastElementChild !== linha) {
        grupoLinhas.appendChild(linha);
      }
    }

    for (const [ufChip, chip] of chips) {
      const ativo = uf != null && ufChip === uf;
      const preso = ufTravada != null && ufChip === ufTravada;
      chip.classList.toggle("ativa", ativo);
      chip.classList.toggle("travada", preso);
      chip.setAttribute("aria-pressed", ativo ? "true" : "false");
      if (chip.dataset.nome) {
        chip.title =
          `${chip.dataset.nome} — ` +
          (preso ? "clique para destravar" : "clique para travar");
      }
    }
  }

  function destacarBarra(ano) {
    for (const [anoBarra, barra] of barras) {
      barra.classList.toggle("ativa", anoBarra === ano);
    }
  }

  function mostrarPonto(estado, ponto) {
    if (!estado || !ponto) {
      pontoAtivo.classList.add("oculto");
      return;
    }

    pontoAtivo.setAttribute("cx", escalaX(ponto.ano).toFixed(2));
    pontoAtivo.setAttribute("cy", escalaY(ponto.med).toFixed(2));
    pontoAtivo.classList.remove("oculto");
  }

  function esconderGuia() {
    guia.classList.add("oculto");
    tooltip.classList.add("oculto");
    pontoAtivo.classList.add("oculto");
    destacarBarra(null);
  }

  function mostrarGuia(resultado) {
    const { ano } = resultado;
    const x = escalaX(ano);

    guiaLinha.setAttribute("x1", x);
    guiaLinha.setAttribute("x2", x);
    guiaLinha.setAttribute("y1", PLOT.y);
    guiaLinha.setAttribute("y2", baseY);

    const fundoX = Math.min(
      Math.max(x - 23, PLOT.x),
      PLOT.x + PLOT.w - 46,
    );
    guiaAnoFundo.setAttribute("x", fundoX);
    guiaAnoFundo.setAttribute("y", PLOT.y - 18);

    guiaAno.setAttribute("x", fundoX + 23);
    guiaAno.setAttribute("y", PLOT.y - 6);
    guiaAno.textContent = ano;

    destacarBarra(ano);
    mostrarPonto(
      resultado.tipo === "uf" ? resultado.estado : null,
      resultado.tipo === "uf" ? resultado.ponto : null,
    );

    guia.classList.remove("oculto");
  }

  function mostrarTooltip(resultado) {
    const { ponto, ano, clientX, clientY } = resultado;
    const ehBrasil = resultado.tipo === "brasil";

    tooltip.innerHTML = "";
    tooltip.classList.remove("oculto");

    const topo = criarHtml("div", "tt-topo");
    if (ehBrasil) {
      topo.appendChild(criarHtml("span", "tt-uf tt-brasil", "BR"));
      topo.appendChild(
        criarHtml("span", "tt-nome", "Brasil · mediana das UFs"),
      );
    } else {
      topo.appendChild(criarHtml("span", "tt-uf", resultado.estado.uf));
      topo.appendChild(criarHtml("span", "tt-nome", resultado.estado.nome));
    }
    topo.appendChild(criarHtml("span", "tt-ano", String(ano)));

    const mediana = criarHtml("div", "tt-mediana");
    mediana.appendChild(criarHtml("span", null, "Mediana"));
    mediana.appendChild(
      criarHtml("strong", null, formatarBRL(ponto.med)),
    );

    tooltip.appendChild(topo);
    tooltip.appendChild(mediana);

    if (ehBrasil) {
      const notas = criarHtml("div", "tt-notas");
      notas.appendChild(criarHtml("strong", null, `${ponto.ufs} UFs`));
      notas.appendChild(document.createTextNode(" com dados no ano"));
      tooltip.appendChild(notas);
    } else {
      const minimo = criarHtml("div", "tt-linha");
      minimo.appendChild(criarHtml("span", null, "Mínimo do ano"));
      minimo.appendChild(criarHtml("b", null, formatarBRL(ponto.min)));

      const maximo = criarHtml("div", "tt-linha");
      maximo.appendChild(criarHtml("span", null, "Máximo do ano"));
      maximo.appendChild(criarHtml("b", null, formatarBRL(ponto.max)));

      const notas = criarHtml("div", "tt-notas");
      if (ponto.interpolado) {
        notas.textContent = "Sem notas neste ano · faixa interpolada";
      } else {
        const quantidade = ponto.n.toLocaleString("pt-BR");
        notas.appendChild(
          criarHtml(
            "strong",
            null,
            `${quantidade} ${ponto.n === 1 ? "nota" : "notas"}`,
          ),
        );
        notas.appendChild(document.createTextNode(" no ano"));
      }

      tooltip.appendChild(minimo);
      tooltip.appendChild(maximo);
      tooltip.appendChild(notas);
    }

    const caixa = tooltip.getBoundingClientRect();
    let left = clientX + 16;
    let top = clientY + 16;
    if (left + caixa.width > window.innerWidth - 8) {
      left = clientX - caixa.width - 16;
    }
    if (top + caixa.height > window.innerHeight - 8) {
      top = clientY - caixa.height - 16;
    }
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function limpar() {
    aplicarDestaque(null);
    esconderGuia();
  }

  /** Trava a UF clicada; clicar de novo na mesma (ou Esc) solta. */
  function travarUf(uf) {
    ufTravada = uf != null && ufTravada === uf ? null : uf;

    if (ufTravada == null) {
      limpar();
      return;
    }

    aplicarDestaque(ufTravada);
    esconderGuia();
  }

  function pontoDoEvento(evento, ignorarTrava = false) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;

    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    const local = ponto.matrixTransform(matriz.inverse());

    if (
      local.x < PLOT.x ||
      local.x > PLOT.x + PLOT.w ||
      local.y < PLOT.y ||
      local.y > baseY
    ) {
      return null;
    }

    const ano = Math.max(
      ANO_MIN,
      Math.min(ANO_MAX, Math.round(anoEmX(local.x))),
    );

    const eventos = {
      ano,
      clientX: evento.clientX,
      clientY: evento.clientY,
    };

    // Com UF travada, ela responde em qualquer ponto do plot.
    if (ufTravada != null && !ignorarTrava) {
      const estado = estadosPorUf.get(ufTravada);
      const ponto = estado?.porAno.get(ano);
      if (!ponto) return null;
      return { tipo: "uf", estado, ponto, ...eventos };
    }

    // Linha mais proxima do cursor naquele ano.
    let melhor = null;
    for (const estado of estadosComLinha) {
      const ponto = estado.porAno.get(ano);
      if (!ponto) continue;

      const distancia = Math.abs(local.y - escalaY(ponto.med));
      if (!melhor || distancia < melhor.distancia) {
        melhor = { estado, ponto, distancia };
      }
    }

    if (melhor && melhor.distancia <= RAIO_HOVER) {
      return {
        tipo: "uf",
        estado: melhor.estado,
        ponto: melhor.ponto,
        ...eventos,
      };
    }

    // Fora das linhas, leitura nacional pelas barras.
    const pontoBrasil = brasil.get(ano);
    if (!pontoBrasil) return null;
    return { tipo: "brasil", ponto: pontoBrasil, ...eventos };
  }

  // --- eventos -----------------------------------------------------------

  overlay.addEventListener("pointermove", (evento) => {
    const resultado = pontoDoEvento(evento);

    if (!resultado) {
      if (ufTravada == null) {
        limpar();
      } else {
        esconderGuia();
      }
      return;
    }

    if (resultado.tipo === "uf") {
      aplicarDestaque(resultado.estado.uf);
    } else if (ufTravada == null) {
      aplicarDestaque(null);
    }

    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  overlay.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType !== "mouse") return;
    if (ufTravada == null) limpar();
    else esconderGuia();
  });

  // Clique (mouse ou toque) trava a UF da linha; fora das linhas, solta.
  overlay.addEventListener("pointerdown", (evento) => {
    // Ignora a trava atual: assim clicar em outra linha troca a UF travada.
    const resultado = pontoDoEvento(evento, true);

    if (resultado?.tipo === "uf") {
      travarUf(resultado.estado.uf);
      if (ufTravada != null) aplicarDestaque(ufTravada);
    } else {
      travarUf(null);
    }

    if (!resultado) return;
    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  window.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || ufTravada == null) return;
    travarUf(null);
  });

  // A tira de UFs destaca a linha correspondente; clicar trava na UF.
  for (const [uf, chip] of chips) {
    chip.addEventListener("click", () => {
      travarUf(uf);
    });

    chip.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter" && evento.key !== " ") return;
      evento.preventDefault();
      travarUf(uf);
    });

    chip.addEventListener("pointerenter", () => {
      if (ufTravada != null) return;
      aplicarDestaque(uf);
      esconderGuia();
    });

    chip.addEventListener("pointerleave", () => {
      if (ufTravada == null) limpar();
    });

    chip.addEventListener("focus", () => {
      if (ufTravada != null || !chip.matches(":focus-visible")) return;
      aplicarDestaque(uf);
      esconderGuia();
    });

    chip.addEventListener("blur", () => {
      if (ufTravada == null) limpar();
    });
  }
}

function montarLegenda(estados) {
  const lista = document.getElementById("listaUfs");
  lista.innerHTML = "";

  const ordenados = estados.slice().sort((a, b) => a.uf.localeCompare(b.uf));
  for (const estado of ordenados) {
    const chip = document.createElement("span");
    chip.className = "uf";
    chip.dataset.uf = estado.uf;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-pressed", "false");
    chip.dataset.nome = estado.nome;
    chip.title = `${estado.nome} — clique para travar`;
    chip.textContent = estado.uf;
    chip.setAttribute("aria-label", `${estado.uf} — ${estado.nome}`);
    lista.appendChild(chip);
  }
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

  const estados = prepararEstados(dados);
  if (!estados.length) {
    throw new Error("ondas.json nao tem estados.");
  }

  const produto = dados.produto;
  if (produto) {
    const rotulo =
      produto.rotulo ||
      `1${produto.unidadeBase || ""} DE ${produto.nome || ""}`.trim();
    document.getElementById("produto").textContent = rotulo;
  }

  montarLegenda(estados);
  montarGrafico(dados, estados);

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
