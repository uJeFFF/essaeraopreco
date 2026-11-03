// Frontend /07/: bolhas de precos reais por UF x ano.
// Mesma pagina do /05/ (barras da mediana nacional, faixa de governos, trava
// por clique), mas no lugar do heatmap vai uma linha por UF com uma bolha por
// ano: a area da bolha e proporcional ao preco. Anos sem nota viram um X.
// Le apenas web/dados/ondas.json (gerado por src/compilar-ondas.js).

import { GOVERNOS } from "../governos.js";

const URL_DADOS = "../dados/ondas.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1220;
const ALTURA = 714;
const MARGEM = { top: 156, right: 34, bottom: 50, left: 78 };
const PLOT = {
  x: MARGEM.left,
  y: MARGEM.top,
  w: LARGURA - MARGEM.left - MARGEM.right,
  h: ALTURA - MARGEM.top - MARGEM.bottom,
};

// Faixa das barras da mediana nacional: ~106px entre os governos e o grafico.
const BARRAS_BASE = MARGEM.top - 18;
const BARRAS_ALTURA = 90;
const BARRAS_TOPO = BARRAS_BASE - BARRAS_ALTURA;

// Escala das bolhas: area proporcional ao preco, usando a celula do /05 como
// referencia. A menor bolha tem 10% da area do quadrado; a maior, 200%.
const AREA_MIN_FATOR = 0.1;
const AREA_MAX_FATOR = 2;

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
 * Mantem apenas os anos com nota real. Diferente do /05/, aqui nao interpolamos
 * os buracos: o ano sem nota vira um X no grafico.
 */
function prepararEstados(dados) {
  return dados.estados.map((estado) => {
    const valores = estado.valores.slice().sort((a, b) => a[0] - b[0]);

    const pontos = valores.map(([ano, mediana, min, max, n]) => ({
      ano,
      med: mediana / 100,
      min: min / 100,
      max: max / 100,
      n,
    }));

    return {
      ...estado,
      pontos,
      porAno: new Map(pontos.map((ponto) => [ponto.ano, ponto])),
    };
  });
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

function medianaDe(valores) {
  if (!valores.length) return 0;
  const ordenados = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function montarGrafico(dados, estados) {
  const container = document.getElementById("grafico");
  container.innerHTML = "";

  const svg = criarSvg("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "img",
    "aria-label":
      "Bolhas de preços reais por unidade da federação e ano entre 1980 e 2026, " +
      "com o tamanho da bolha proporcional ao preço e X nos anos sem nota",
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

  const larguraBarra = Math.max(3, passoAno * 0.62);
  const barrasInicio = PLOT.x;
  const barrasFim = PLOT.x + PLOT.w;

  // --- linhas por UF (alfabetica) ----------------------------------------
  const linhas = estados.slice().sort((a, b) => a.uf.localeCompare(b.uf));
  const alturaLinha = PLOT.h / linhas.length;
  const centroLinha = (indice) =>
    PLOT.y + indice * alturaLinha + alturaLinha / 2;

  let medianaMin = Infinity;
  let medianaMax = -Infinity;

  for (const estado of linhas) {
    for (const ponto of estado.pontos) {
      medianaMin = Math.min(medianaMin, ponto.med);
      medianaMax = Math.max(medianaMax, ponto.med);
    }
  }

  const amplitudeMediana = medianaMax - medianaMin || 1;

  // Area proporcional ao preco, entre 10% e 200% da area da celula do /05.
  // Usa o lado menor da celula: assim a bolha mediana cabe na linha e o
  // trilho de cada UF continua visivel entre as bolhas.
  const ladoQuadrado = Math.min(passoAno - 2, alturaLinha - 2);
  const areaMin = AREA_MIN_FATOR * ladoQuadrado * ladoQuadrado;
  const areaMax = AREA_MAX_FATOR * ladoQuadrado * ladoQuadrado;

  const posicaoPreco = (valor) =>
    Math.max(0, Math.min(1, (valor - medianaMin) / amplitudeMediana));
  const raioDe = (valor) => {
    const area = areaMin + posicaoPreco(valor) * (areaMax - areaMin);
    return Math.sqrt(area / Math.PI);
  };

  // Barras da mediana nacional. A escala e recortada entre o minimo e o
  // maximo da serie (com folga de meio real) para a variacao ficar legivel.
  const brasil = calcularMedianaBrasil(estados, anos);
  const valoresBrasil = [...brasil.values()].map((ponto) => ponto.med);
  const baseBarra = Math.min(...valoresBrasil) - 0.5;
  const topoBarra = Math.max(...valoresBrasil) + 0.5;
  const escalaBarra = (valor) =>
    BARRAS_BASE -
    ((valor - baseBarra) / (topoBarra - baseBarra)) * BARRAS_ALTURA;

  const defs = criarSvg("defs");
  const recorteBarras = criarSvg("clipPath", { id: "recorte-barras" });
  recorteBarras.appendChild(
    criarSvg("rect", {
      x: barrasInicio,
      y: BARRAS_TOPO,
      width: barrasFim - barrasInicio,
      height: BARRAS_BASE - BARRAS_TOPO,
    }),
  );
  defs.appendChild(recorteBarras);
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

  // Barras da mediana nacional, na faixa entre os governos e o grafico.
  const barras = new Map();

  svg.appendChild(
    criarSvg("line", {
      x1: barrasInicio,
      y1: BARRAS_BASE,
      x2: barrasFim,
      y2: BARRAS_BASE,
      class: "barras-base",
    }),
  );

  // Regua de preco da faixa das barras: escala propria, recortada, com linhas
  // guias claras e rotulos na mesma coluna dos precos do eixo principal.
  const passoRegua = 2;
  const primeiroTickBarra = Math.ceil(baseBarra / passoRegua) * passoRegua;

  for (
    let valor = primeiroTickBarra;
    valor <= topoBarra;
    valor += passoRegua
  ) {
    const y = escalaBarra(valor);

    svg.appendChild(
      criarSvg("line", {
        x1: PLOT.x,
        y1: y,
        x2: PLOT.x + PLOT.w,
        y2: y,
        class: "barra-grade",
      }),
    );

    const rotulo = criarSvg("text", {
      x: PLOT.x - 12,
      y: y + 3,
      "text-anchor": "end",
      class: "rotulo-barra",
    });
    rotulo.textContent = `R$ ${valor}`;
    svg.appendChild(rotulo);
  }

  if (valoresBrasil.length) {
    const grupoBarras = criarSvg("g", {
      class: "barras",
      "clip-path": "url(#recorte-barras)",
    });

    for (const [ano, ponto] of brasil) {
      const x = escalaX(ano);
      const y = escalaBarra(ponto.med);
      const barra = criarSvg("rect", {
        class: "barra-brasil",
        x: (x - larguraBarra / 2).toFixed(2),
        y: y.toFixed(2),
        width: larguraBarra.toFixed(2),
        height: Math.max(1, BARRAS_BASE - y).toFixed(2),
        rx: 2,
      });
      grupoBarras.appendChild(barra);
      barras.set(ano, barra);
    }

    svg.appendChild(grupoBarras);
  }

  // --- trilhos e rotulos das UFs -----------------------------------------
  const grupoLinhas = criarSvg("g", { class: "bolhas-linhas" });
  const gruposLinha = new Map();

  linhas.forEach((estado, indice) => {
    const yLinha = PLOT.y + indice * alturaLinha;
    const yCentro = centroLinha(indice);
    const grupo = criarSvg("g", {
      class: "bolha-linha",
      "data-uf": estado.uf,
    });

    grupo.appendChild(
      criarSvg("rect", {
        class: "bolha-fundo",
        x: PLOT.x,
        y: yLinha.toFixed(2),
        width: PLOT.w,
        height: alturaLinha.toFixed(2),
      }),
    );

    grupo.appendChild(
      criarSvg("line", {
        class: "trilho-estado",
        x1: PLOT.x,
        y1: yCentro.toFixed(2),
        x2: PLOT.x + PLOT.w,
        y2: yCentro.toFixed(2),
      }),
    );

    const rotulo = criarSvg("text", {
      class: "bolha-rotulo",
      x: PLOT.x - 8,
      y: (yCentro + 3.5).toFixed(2),
      "text-anchor": "end",
    });
    rotulo.textContent = estado.uf;
    grupo.appendChild(rotulo);

    grupoLinhas.appendChild(grupo);
    gruposLinha.set(estado.uf, grupo);
  });

  svg.appendChild(grupoLinhas);

  // --- bolhas ------------------------------------------------------------
  // Desenhadas da maior para a menor: as pequenas ficam por cima e nao
  // desaparecem quando as areas se sobrepoem.
  const bolhas = [];
  const bolhasPorChave = new Map();

  linhas.forEach((estado, indice) => {
    const yCentro = centroLinha(indice);

    for (const ano of anos) {
      const ponto = estado.porAno.get(ano);
      if (!ponto) continue;

      const raio = raioDe(ponto.med);
      const cx = escalaX(ano);
      const elemento = criarSvg("circle", {
        class: "bolha",
        cx: cx.toFixed(2),
        cy: yCentro.toFixed(2),
        r: raio.toFixed(2),
      });

      bolhas.push({ elemento, uf: estado.uf, ano, estado, ponto, cx, cy: yCentro, r: raio });
      bolhasPorChave.set(`${estado.uf}:${ano}`, elemento);
    }
  });

  const grupoCirculos = criarSvg("g", { class: "bolhas" });
  for (const bolha of bolhas.slice().sort((a, b) => b.r - a.r)) {
    grupoCirculos.appendChild(bolha.elemento);
  }
  svg.appendChild(grupoCirculos);

  // --- anos sem nota: X --------------------------------------------------
  const marcasX = new Map();
  const grupoX = criarSvg("g", { class: "marcas-x" });

  linhas.forEach((estado, indice) => {
    const yCentro = centroLinha(indice);

    for (const ano of anos) {
      if (estado.porAno.has(ano)) continue;

      const x = escalaX(ano);
      const d = 4;
      const marca = criarSvg("g", {
        class: "bolha-x",
        "data-uf": estado.uf,
        "data-ano": ano,
      });

      marca.appendChild(
        criarSvg("line", {
          x1: (x - d).toFixed(2),
          y1: (yCentro - d).toFixed(2),
          x2: (x + d).toFixed(2),
          y2: (yCentro + d).toFixed(2),
        }),
      );
      marca.appendChild(
        criarSvg("line", {
          x1: (x - d).toFixed(2),
          y1: (yCentro + d).toFixed(2),
          x2: (x + d).toFixed(2),
          y2: (yCentro - d).toFixed(2),
        }),
      );

      grupoX.appendChild(marca);
      marcasX.set(`${estado.uf}:${ano}`, marca);
    }
  });

  svg.appendChild(grupoX);

  // Divisorias dos governos: pontilhadas, dos governos ate o eixo dos anos,
  // por cima das barras e das bolhas.
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
        y2: PLOT.y + PLOT.h,
        class: "gov-divisoria",
      }),
    );
  }

  svg.appendChild(divisorias);

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
    y1: BARRAS_TOPO,
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

  // Camada transparente que captura o mouse na faixa das barras e no grafico.
  const overlay = criarSvg("rect", {
    x: PLOT.x,
    y: BARRAS_TOPO,
    width: PLOT.w,
    height: baseY - BARRAS_TOPO,
    class: "overlay",
  });
  svg.appendChild(overlay);

  container.appendChild(svg);

  // --- estado do destaque ------------------------------------------------

  // UF presa por clique (chip ou bolha); null = apenas hover.
  let ufTravada = null;

  const chips = new Map();
  for (const chip of document.querySelectorAll(".uf")) {
    chips.set(chip.dataset.uf, chip);
  }

  function aplicarDestaque(uf) {
    for (const [ufLinha, grupo] of gruposLinha) {
      const destacado = uf != null && ufLinha === uf;
      grupo.classList.toggle("destaque", destacado);
      grupo.classList.toggle(
        "travada",
        ufTravada != null && ufLinha === ufTravada,
      );
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

  let marcaAtiva = null;

  function destacarPonto(uf, ano) {
    if (marcaAtiva) marcaAtiva.classList.remove("ativa");
    marcaAtiva = null;

    if (uf == null || ano == null) return;

    const chave = `${uf}:${ano}`;
    marcaAtiva = bolhasPorChave.get(chave) ?? marcasX.get(chave) ?? null;
    if (marcaAtiva) marcaAtiva.classList.add("ativa");
  }

  function esconderGuia() {
    guia.classList.add("oculto");
    tooltip.classList.add("oculto");
    destacarBarra(null);
    destacarPonto(null, null);
  }

  function mostrarGuia(resultado) {
    const { ano } = resultado;
    const x = escalaX(ano);

    guiaLinha.setAttribute("x1", x);
    guiaLinha.setAttribute("x2", x);
    guiaLinha.setAttribute("y1", BARRAS_TOPO);
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
    destacarPonto(
      resultado.tipo === "brasil" ? null : resultado.estado.uf,
      resultado.tipo === "brasil" ? null : ano,
    );

    guia.classList.remove("oculto");
  }

  function mostrarTooltip(resultado) {
    const { ponto, ano, clientX, clientY } = resultado;
    const ehBrasil = resultado.tipo === "brasil";
    const ehVazio = resultado.tipo === "vazio";

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

    tooltip.appendChild(topo);

    if (ehVazio) {
      const vazio = criarHtml("div", "tt-vazio");
      vazio.textContent = "Sem nota neste ano";
      tooltip.appendChild(vazio);
    } else {
      const mediana = criarHtml("div", "tt-mediana");
      mediana.appendChild(criarHtml("span", null, "Mediana"));
      mediana.appendChild(
        criarHtml("strong", null, formatarBRL(ponto.med)),
      );

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
        const quantidade = ponto.n.toLocaleString("pt-BR");
        notas.appendChild(
          criarHtml(
            "strong",
            null,
            `${quantidade} ${ponto.n === 1 ? "nota" : "notas"}`,
          ),
        );
        notas.appendChild(document.createTextNode(" no ano"));

        tooltip.appendChild(minimo);
        tooltip.appendChild(maximo);
        tooltip.appendChild(notas);
      }
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

  /** Menor bolha que contem o ponto (a desenhada por cima). */
  function bolhaSob(local) {
    let achada = null;

    for (const bolha of bolhas) {
      if (ufTravada != null && bolha.uf !== ufTravada) continue;
      const dx = local.x - bolha.cx;
      const dy = local.y - bolha.cy;
      if (dx * dx + dy * dy <= bolha.r * bolha.r) {
        if (!achada || bolha.r < achada.r) achada = bolha;
      }
    }

    return achada;
  }

  function pontoDoEvento(evento) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;

    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    const local = ponto.matrixTransform(matriz.inverse());

    if (local.x < PLOT.x || local.x > PLOT.x + PLOT.w) return null;

    const ano = Math.max(
      ANO_MIN,
      Math.min(ANO_MAX, Math.round(anoEmX(local.x))),
    );

    // Faixa das barras: leitura nacional, nao disputa com as bolhas.
    if (local.y >= BARRAS_TOPO && local.y < BARRAS_BASE) {
      const dadosAno = brasil.get(ano);
      if (!dadosAno) return null;
      return {
        tipo: "brasil",
        ano,
        ponto: dadosAno,
        clientX: evento.clientX,
        clientY: evento.clientY,
      };
    }

    // As bolhas transbordam a linha: aceita um pouco acima/abaixo do plot.
    if (local.y < PLOT.y - 20 || local.y > baseY + 20) return null;

    const bolha = bolhaSob(local);
    if (bolha) {
      return {
        tipo: "uf",
        estado: bolha.estado,
        ponto: bolha.ponto,
        ano: bolha.ano,
        clientX: evento.clientX,
        clientY: evento.clientY,
      };
    }

    if (local.y < PLOT.y || local.y > baseY) return null;

    const indice = Math.min(
      linhas.length - 1,
      Math.max(0, Math.floor((local.y - PLOT.y) / alturaLinha)),
    );
    const estado = linhas[indice];

    // Com UF travada, so as bolhas/X dela respondem ao mouse.
    if (ufTravada != null && estado.uf !== ufTravada) return null;

    const dadosAno = estado.porAno.get(ano) ?? null;

    return {
      tipo: dadosAno ? "uf" : "vazio",
      estado,
      ponto: dadosAno,
      ano,
      clientX: evento.clientX,
      clientY: evento.clientY,
    };
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

    if (resultado.tipo === "uf" || resultado.tipo === "vazio") {
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

  // Clique (mouse ou toque) trava a UF da bolha; fora delas, solta.
  overlay.addEventListener("pointerdown", (evento) => {
    const resultado = pontoDoEvento(evento);

    // A faixa das barras nao trava nem destrava UF.
    if (resultado?.tipo === "brasil") {
      mostrarGuia(resultado);
      mostrarTooltip(resultado);
      return;
    }

    travarUf(resultado ? resultado.estado.uf : null);

    if (ufTravada == null || !resultado) return;
    aplicarDestaque(ufTravada);
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

  // Medidas usadas pela legenda: menor, mediana e maior preco do conjunto.
  const todasMedianas = linhas.flatMap((estado) =>
    estado.pontos.map((ponto) => ponto.med),
  );
  const medianaGlobal = medianaDe(todasMedianas);

  return {
    valorMin: medianaMin,
    valorMed: medianaGlobal,
    valorMax: medianaMax,
    raioMin: raioDe(medianaMin),
    raioMed: raioDe(medianaGlobal),
    raioMax: raioDe(medianaMax),
  };
}

function montarLegendaBolhas(escala) {
  const container = document.getElementById("legenda");
  if (!container) return;

  container.innerHTML = "";

  const svg = criarSvg("svg", {
    viewBox: "0 0 430 60",
    role: "img",
    "aria-label":
      "O tamanho da bolha é proporcional ao preço; X indica ano sem nota",
  });

  const titulo = criarSvg("text", {
    x: 8,
    y: 34,
    class: "leg-caption",
  });
  titulo.textContent = "TAMANHO = PREÇO";
  svg.appendChild(titulo);

  const amostras = [
    { x: 170, raio: escala.raioMin, valor: escala.valorMin },
    { x: 245, raio: escala.raioMed, valor: escala.valorMed },
    { x: 330, raio: escala.raioMax, valor: escala.valorMax },
  ];

  for (const amostra of amostras) {
    svg.appendChild(
      criarSvg("circle", {
        class: "leg-bolha",
        cx: amostra.x,
        cy: 28,
        r: amostra.raio.toFixed(2),
      }),
    );

    const valor = criarSvg("text", {
      x: amostra.x,
      y: 54,
      "text-anchor": "middle",
      class: "leg-valor",
    });
    valor.textContent = formatarBRL(amostra.valor);
    svg.appendChild(valor);
  }

  const x = 395;
  const d = 4;
  const exemploX = criarSvg("g", { class: "bolha-x" });
  exemploX.appendChild(
    criarSvg("line", {
      x1: x - d,
      y1: 28 - d,
      x2: x + d,
      y2: 28 + d,
    }),
  );
  exemploX.appendChild(
    criarSvg("line", {
      x1: x - d,
      y1: 28 + d,
      x2: x + d,
      y2: 28 - d,
    }),
  );
  svg.appendChild(exemploX);

  const semNota = criarSvg("text", {
    x,
    y: 54,
    "text-anchor": "middle",
    class: "leg-valor",
  });
  semNota.textContent = "sem nota";
  svg.appendChild(semNota);

  container.appendChild(svg);
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
  const escala = montarGrafico(dados, estados);
  montarLegendaBolhas(escala);

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
