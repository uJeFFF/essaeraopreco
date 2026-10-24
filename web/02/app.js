// Frontend /02/: streamgraph de precos reais por UF ao longo dos anos.
// Le apenas web/dados/ondas.json (gerado por src/compilar-ondas.js).
//
// Cada onda e uma UF:
//   - o centro segue a mediana real do ano;
//   - a espessura e o range (max - min) do ano, desenhado simetricamente em
//     torno da mediana. Minimo e maximo reais aparecem no tooltip.

import { GOVERNOS } from "../governos.js";

const URL_DADOS = "../dados/ondas.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1220;
const ALTURA = 640;
const MARGEM = { top: 70, right: 34, bottom: 62, left: 78 };
const PLOT = {
  x: MARGEM.left,
  y: MARGEM.top,
  w: LARGURA - MARGEM.left - MARGEM.right,
  h: ALTURA - MARGEM.top - MARGEM.bottom,
};

const ESPESSURA_MIN = 1.4;
const RAIO_HOVER = 32;

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
 * Fora desse intervalo a onda nao existe (nao extrapolamos).
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

function calcularDominio(estados) {
  let minimo = Infinity;
  let maximo = -Infinity;

  for (const estado of estados) {
    for (const ponto of estado.pontos) {
      const metade = (ponto.max - ponto.min) / 2;
      minimo = Math.min(minimo, ponto.med - metade);
      maximo = Math.max(maximo, ponto.med + metade);
    }
  }

  return { minimo: minimo - 0.6, maximo: maximo + 0.6 };
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

function caminhoFita(xs, cima, baixo) {
  const segmentosCima = segmentos(xs, cima);
  const segmentosBaixo = segmentos(xs, baixo);
  if (!segmentosCima.length || !segmentosBaixo.length) return "";

  let d = `M ${segmentosCima[0].x0.toFixed(2)} ${segmentosCima[0].y0.toFixed(2)}`;
  for (const s of segmentosCima) {
    d += ` C ${s.c1x.toFixed(2)} ${s.c1y.toFixed(2)},`;
    d += ` ${s.c2x.toFixed(2)} ${s.c2y.toFixed(2)},`;
    d += ` ${s.x1.toFixed(2)} ${s.y1.toFixed(2)}`;
  }

  const ultimoBaixo = segmentosBaixo[segmentosBaixo.length - 1];
  d += ` L ${ultimoBaixo.x1.toFixed(2)} ${ultimoBaixo.y1.toFixed(2)}`;

  for (let i = segmentosBaixo.length - 1; i >= 0; i--) {
    const s = segmentosBaixo[i];
    d += ` C ${s.c2x.toFixed(2)} ${s.c2y.toFixed(2)},`;
    d += ` ${s.c1x.toFixed(2)} ${s.c1y.toFixed(2)},`;
    d += ` ${s.x0.toFixed(2)} ${s.y0.toFixed(2)}`;
  }

  return `${d} Z`;
}

function montarGrafico(dados, estados, dominio) {
  const container = document.getElementById("grafico");
  container.innerHTML = "";

  const svg = criarSvg("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "img",
    "aria-label":
      "Streamgraph de preços reais por unidade da federação entre 1980 e 2026",
  });

  const anos = dados.anos;
  const ANO_MIN = anos[0];
  const ANO_MAX = anos[anos.length - 1];
  const passoAno = PLOT.w / (ANO_MAX - ANO_MIN);

  const escalaX = (ano) =>
    PLOT.x + ((ano - ANO_MIN) / (ANO_MAX - ANO_MIN)) * PLOT.w;
  const escalaY = (valor) =>
    PLOT.y +
    (1 - (valor - dominio.minimo) / (dominio.maximo - dominio.minimo)) *
      PLOT.h;
  const pxPorReal = PLOT.h / (dominio.maximo - dominio.minimo);
  const anoEmX = (px) =>
    ANO_MIN + ((px - PLOT.x) / PLOT.w) * (ANO_MAX - ANO_MIN);

  // Recorte para as fitas nao invadirem os eixos.
  const defs = criarSvg("defs");
  const recorte = criarSvg("clipPath", { id: "recorte-ondas" });
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

  // Grade horizontal e rotulos do eixo Y.
  const primeiroTick = Math.ceil(dominio.minimo / 5) * 5;
  for (let valor = primeiroTick; valor <= dominio.maximo; valor += 5) {
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

  const tituloY = criarSvg("text", {
    x: 18,
    y: PLOT.y + PLOT.h / 2,
    transform: `rotate(-90 18 ${PLOT.y + PLOT.h / 2})`,
    "text-anchor": "middle",
    class: "eixo-y-titulo",
  });
  tituloY.textContent = "PREÇO REAL · R$/KG (2026)";
  svg.appendChild(tituloY);

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

  for (const governo of GOVERNOS) {
    if (governo.ate < ANO_MIN || governo.de > ANO_MAX) continue;

    const de = Math.max(governo.de, ANO_MIN);
    const ate = Math.min(governo.ate, ANO_MAX);
    const x1 = escalaX(de);
    const x2 = Math.min(PLOT.x + PLOT.w, escalaX(ate) + passoAno);

    const rotulo = criarSvg("text", {
      x: (x1 + x2) / 2,
      y: 24,
      "text-anchor": "middle",
      class: "gov-rotulo",
    });
    rotulo.textContent = governo.nome;
    svg.appendChild(rotulo);

    if (de > ANO_MIN) {
      svg.appendChild(
        criarSvg("line", {
          x1,
          y1: 32,
          x2: x1,
          y2: 40,
          class: "gov-divisoria",
        }),
      );
    }
  }

  // Ondas.
  const grupoOndas = criarSvg("g", {
    class: "ondas",
    "clip-path": "url(#recorte-ondas)",
  });

  const grupos = new Map();

  for (const estado of estados) {
    if (!estado.pontos.length) continue;

    const xs = estado.pontos.map((ponto) => escalaX(ponto.ano));
    const centros = estado.pontos.map((ponto) => escalaY(ponto.med));
    const metades = estado.pontos.map((ponto) =>
      Math.max(
        ((ponto.max - ponto.min) / 2) * pxPorReal,
        ESPESSURA_MIN / 2,
      ),
    );

    const grupo = criarSvg("g", {
      class: "onda-grupo",
      "data-uf": estado.uf,
    });

    const fita = criarSvg("path", {
      class: "fita",
      d: caminhoFita(
        xs,
        centros.map((centro, i) => centro - metades[i]),
        centros.map((centro, i) => centro + metades[i]),
      ),
    });

    const centro = criarSvg("path", {
      class: "centro",
      d: caminhoSuave(xs, centros),
    });

    grupo.appendChild(fita);
    grupo.appendChild(centro);
    grupoOndas.appendChild(grupo);
    grupos.set(estado.uf, grupo);
  }

  svg.appendChild(grupoOndas);

  // Eixo X: marca em todo ano, rotulo a cada 5 anos e no ultimo ano.
  const baseY = PLOT.y + PLOT.h;
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
    y: PLOT.y + 4,
    width: 46,
    height: 18,
    rx: 9,
    ry: 9,
    class: "guia-ano-fundo",
  });
  const guiaAno = criarSvg("text", {
    x: PLOT.x + 23,
    y: PLOT.y + 17,
    "text-anchor": "middle",
    class: "guia-ano",
  });
  const guiaPonto = criarSvg("circle", {
    cx: PLOT.x,
    cy: PLOT.y,
    r: 4,
    class: "guia-ponto",
  });
  const guiaUf = criarSvg("text", {
    x: PLOT.x,
    y: PLOT.y,
    class: "guia-uf",
  });

  guia.appendChild(guiaLinha);
  guia.appendChild(guiaAnoFundo);
  guia.appendChild(guiaAno);
  guia.appendChild(guiaPonto);
  guia.appendChild(guiaUf);
  svg.appendChild(guia);

  // Camada transparente que captura o mouse em toda a area do grafico.
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

  let travado = false;

  const chips = new Map();
  for (const chip of document.querySelectorAll(".uf")) {
    chips.set(chip.dataset.uf, chip);
  }

  function aplicarDestaque(uf) {
    grupoOndas.classList.toggle("explorando", uf != null);

    for (const [ufEstado, grupo] of grupos) {
      const destacado = uf != null && ufEstado === uf;
      grupo.classList.toggle("destaque", destacado);
      grupo.classList.toggle("apagada", uf != null && !destacado);

      if (destacado && grupo.parentNode.lastElementChild !== grupo) {
        grupo.parentNode.appendChild(grupo);
      }
    }

    for (const [ufChip, chip] of chips) {
      chip.classList.toggle("ativa", uf != null && ufChip === uf);
    }
  }

  function mostrarGuia(resultado) {
    const { ano, estado, ponto } = resultado;
    const x = escalaX(ano);
    const y = escalaY(ponto.med);

    guiaLinha.setAttribute("x1", x);
    guiaLinha.setAttribute("x2", x);
    guiaLinha.setAttribute("y1", PLOT.y);
    guiaLinha.setAttribute("y2", baseY);

    const fundoX = Math.min(
      Math.max(x - 23, PLOT.x),
      PLOT.x + PLOT.w - 46,
    );
    guiaAnoFundo.setAttribute("x", fundoX);
    guiaAnoFundo.setAttribute("y", PLOT.y + 4);

    guiaAno.setAttribute("x", fundoX + 23);
    guiaAno.setAttribute("y", PLOT.y + 17);
    guiaAno.textContent = ano;

    guiaPonto.setAttribute("cx", x);
    guiaPonto.setAttribute("cy", y);

    const pertoDaDireita = x > PLOT.x + PLOT.w - 46;
    guiaUf.setAttribute("x", pertoDaDireita ? x - 10 : x + 10);
    guiaUf.setAttribute("y", y - 8);
    guiaUf.setAttribute("text-anchor", pertoDaDireita ? "end" : "start");
    guiaUf.textContent = estado.uf;

    guia.classList.remove("oculto");
  }

  function mostrarTooltip(resultado) {
    const { estado, ponto, ano, clientX, clientY } = resultado;

    tooltip.innerHTML = "";
    tooltip.classList.remove("oculto");

    const topo = criarHtml("div", "tt-topo");
    topo.appendChild(criarHtml("span", "tt-uf", estado.uf));
    topo.appendChild(criarHtml("span", "tt-nome", estado.nome));
    topo.appendChild(criarHtml("span", "tt-ano", String(ano)));

    const mediana = criarHtml("div", "tt-mediana");
    mediana.appendChild(criarHtml("span", null, "Mediana"));
    mediana.appendChild(
      criarHtml("strong", null, formatarBRL(ponto.med)),
    );

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

    tooltip.appendChild(topo);
    tooltip.appendChild(mediana);
    tooltip.appendChild(minimo);
    tooltip.appendChild(maximo);
    tooltip.appendChild(notas);

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
    guia.classList.add("oculto");
    tooltip.classList.add("oculto");
  }

  function pontoDoEvento(evento) {
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

    let melhor = null;

    for (const estado of estados) {
      const dadosAno = estado.porAno.get(ano);
      if (!dadosAno) continue;

      const centroY = escalaY(dadosAno.med);
      const metade = Math.max(
        ((dadosAno.max - dadosAno.min) / 2) * pxPorReal,
        ESPESSURA_MIN / 2,
      );
      const dentro =
        local.y >= centroY - metade && local.y <= centroY + metade;
      const distancia = Math.abs(local.y - centroY);

      if (
        !melhor ||
        (dentro && !melhor.dentro) ||
        (dentro === melhor.dentro && distancia < melhor.distancia)
      ) {
        melhor = {
          estado,
          ponto: dadosAno,
          ano,
          dentro,
          distancia,
          clientX: evento.clientX,
          clientY: evento.clientY,
        };
      }
    }

    if (!melhor) return null;
    if (!melhor.dentro && melhor.distancia > RAIO_HOVER) return null;
    return melhor;
  }

  // --- eventos -----------------------------------------------------------

  overlay.addEventListener("pointermove", (evento) => {
    if (travado) return;

    const resultado = pontoDoEvento(evento);
    if (!resultado) {
      limpar();
      return;
    }

    aplicarDestaque(resultado.estado.uf);
    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  overlay.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType === "mouse" && !travado) limpar();
  });

  overlay.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType === "mouse") return;

    const resultado = pontoDoEvento(evento);
    if (!resultado) {
      travado = false;
      limpar();
      return;
    }

    travado = true;
    aplicarDestaque(resultado.estado.uf);
    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  window.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      travado = false;
      limpar();
    }
  });

  // A tira de UFs destaca a onda correspondente, sem funcionar como filtro.
  for (const [uf, chip] of chips) {
    chip.addEventListener("pointerenter", () => {
      if (travado) return;
      aplicarDestaque(uf);
      guia.classList.add("oculto");
      tooltip.classList.add("oculto");
    });

    chip.addEventListener("pointerleave", () => {
      if (!travado) limpar();
    });

    chip.addEventListener("focus", () => {
      if (travado || !chip.matches(":focus-visible")) return;
      aplicarDestaque(uf);
      guia.classList.add("oculto");
      tooltip.classList.add("oculto");
    });

    chip.addEventListener("blur", () => {
      if (!travado) limpar();
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
    chip.title = estado.nome;
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

  const dominio = calcularDominio(estados);

  const produto = dados.produto;
  if (produto) {
    const rotulo =
      produto.rotulo ||
      `1${produto.unidadeBase || ""} DE ${produto.nome || ""}`.trim();
    document.getElementById("produto").textContent = rotulo;
  }

  montarLegenda(estados);
  montarGrafico(dados, estados, dominio);

  const notas = dados.contagens?.notas;
  const textoNotas = notas
    ? `${notas.toLocaleString("pt-BR")} notas`
    : "dados sintéticos";

  document.getElementById("nota").textContent =
    `Cada onda = uma UF · centro = mediana real · espessura = faixa de preços do ano, ` +
    `desenhada simetricamente em torno da mediana (mínimo e máximo reais no tooltip) · ` +
    `valores corrigidos para R$ de 2026 · ${estados.length} UFs · ${textoNotas}.`;

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
