// Frontend /06/: heatmap de precos reais por regiao x ano, com drill-down
// para os estados da regiao. Mesma base do /05/ (barras da mediana nacional,
// faixa de governos, eixo de anos e travamento por clique), mas as linhas
// iniciais sao as cinco regioes do IBGE. Clicar no nome da regiao troca a
// linha da regiao pelo cabecalho + estados daquela regiao.
// Le apenas web/dados/ondas.json (gerado por src/compilar-ondas.js).
// A janela exibida comeca em 1995 e vai ate o ultimo ano dos dados.

import { GOVERNOS } from "../governos.js";

const URL_DADOS = "../dados/ondas.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1220;
const ALTURA = 714;
// Margem esquerda maior para caber "CENTRO-OESTE" e o chevron.
const MARGEM = { top: 156, right: 34, bottom: 50, left: 104 };
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

// Altura fixa dos cabecalhos de regiao expandida (em px do SVG).
const ALTURA_CABECALHO = 22;

// Ano inicial da janela exibida. O restante dos dados continua disponivel
// para interpolacao, mas o heatmap e as barras comecam em 1995.
const ANO_INICIAL = 1995;

// Rampa de cor da home: ciano (mais barato) -> azuis escuros -> preto (caro).
const PARADAS = [
  [0.0, [0, 255, 255]],
  [0.2, [0, 200, 235]],
  [0.4, [0, 130, 200]],
  [0.6, [0, 70, 140]],
  [0.8, [5, 30, 75]],
  [1.0, [0, 0, 0]],
];

// Regioes (IBGE) na ordem em que aparecem no eixo Y.
const REGIOES = [
  { nome: "NORTE", sigla: "N", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
  { nome: "NORDESTE", sigla: "NE", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { nome: "CENTRO-OESTE", sigla: "CO", ufs: ["DF", "GO", "MS", "MT"] },
  { nome: "SUDESTE", sigla: "SE", ufs: ["ES", "MG", "RJ", "SP"] },
  { nome: "SUL", sigla: "S", ufs: ["PR", "RS", "SC"] },
];

function corDaEscala(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < PARADAS.length; i++) {
    const [p1, c1] = PARADAS[i - 1];
    const [p2, c2] = PARADAS[i];
    if (x <= p2) {
      const f = (x - p1) / (p2 - p1 || 1);
      const c = c1.map((v, j) => Math.round(v + (c2[j] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  const ultima = PARADAS[PARADAS.length - 1][1];
  return `rgb(${ultima[0]}, ${ultima[1]}, ${ultima[2]})`;
}

function gradienteCss() {
  const partes = PARADAS.map(
    ([p, c]) => `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${Math.round(p * 100)}%`,
  );
  return `linear-gradient(90deg, ${partes.join(", ")})`;
}

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

function mediana(valores) {
  if (!valores.length) return null;
  const ordenados = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Serie de cada regiao: mediana das medianas estaduais por ano.
 * Os pontos de estado ja incluem anos interpolados; n=0 marca ano sem notas.
 */
function prepararRegioes(estados, anos) {
  const porUf = new Map(estados.map((estado) => [estado.uf, estado]));

  return REGIOES.map((regiao) => {
    const membros = regiao.ufs.map((uf) => porUf.get(uf)).filter(Boolean);
    const pontos = [];

    for (const ano of anos) {
      const ativos = membros
        .map((estado) => estado.porAno.get(ano))
        .filter(Boolean);

      if (!ativos.length) continue;

      const n = ativos.reduce((soma, ponto) => soma + ponto.n, 0);

      pontos.push({
        ano,
        med: mediana(ativos.map((ponto) => ponto.med)),
        min: Math.min(...ativos.map((ponto) => ponto.min)),
        max: Math.max(...ativos.map((ponto) => ponto.max)),
        n,
        ufs: ativos.filter((ponto) => ponto.n > 0).length,
        interpolado: n === 0,
      });
    }

    return {
      ...regiao,
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

    serie.set(ano, {
      ano,
      med: mediana(valores),
      ufs: valores.length,
    });
  }

  return serie;
}

function montarGrafico(estados, regioes, anos) {
  const container = document.getElementById("grafico");
  container.innerHTML = "";

  const svg = criarSvg("svg", {
    viewBox: `0 0 ${LARGURA} ${ALTURA}`,
    role: "img",
    "aria-label":
      "Heatmap de preços reais por região e por estado, com as barras da " +
      "mediana nacional por ano entre 1995 e 2026. Clique no nome de uma " +
      "região para ver os estados.",
  });

  const ANO_MIN = anos[0];
  const ANO_MAX = anos[anos.length - 1];

  // Cada ano ocupa uma faixa de 1 ano e fica no centro dela: assim 1995 e 2026
  // nao encostam nas bordas e a primeira/ultima barra ficam dentro do plot.
  const totalAnos = ANO_MAX - ANO_MIN + 1;
  const passoAno = PLOT.w / totalAnos;

  const escalaX = (ano) =>
    PLOT.x + (ano - ANO_MIN + 0.5) * passoAno;
  const anoEmX = (px) =>
    ANO_MIN + (px - PLOT.x) / passoAno - 0.5;

  const baseY = PLOT.y + PLOT.h;
  const larguraBarra = Math.max(3, passoAno * 0.62);
  const larguraCelula = passoAno - 2;

  // --- escala de cor do heatmap ------------------------------------------
  let medianaMin = Infinity;
  let medianaMax = -Infinity;

  for (const ano of anos) {
    for (const estado of estados) {
      const ponto = estado.porAno.get(ano);
      if (!ponto) continue;
      medianaMin = Math.min(medianaMin, ponto.med);
      medianaMax = Math.max(medianaMax, ponto.med);
    }
  }

  const amplitudeMediana = medianaMax - medianaMin || 1;

  // --- barras da mediana nacional ----------------------------------------
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
      x: PLOT.x,
      y: BARRAS_TOPO,
      width: PLOT.w,
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

  // Barras da mediana nacional, na faixa entre os governos e o heatmap.
  const barras = new Map();

  svg.appendChild(
    criarSvg("line", {
      x1: PLOT.x,
      y1: BARRAS_BASE,
      x2: PLOT.x + PLOT.w,
      y2: BARRAS_BASE,
      class: "barras-base",
    }),
  );

  // Regua de preco da faixa das barras.
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

  // --- heatmap ------------------------------------------------------------
  const grupoHeatmap = criarSvg("g", { class: "heatmap" });
  svg.appendChild(grupoHeatmap);

  // --- estado da interface ------------------------------------------------
  const expandidas = new Set();
  const estadosPorUf = new Map(estados.map((estado) => [estado.uf, estado]));
  const regiaoDoUf = new Map();
  for (const regiao of regioes) {
    for (const uf of regiao.ufs) regiaoDoUf.set(uf, regiao.nome);
  }

  const chips = new Map();
  for (const chip of document.querySelectorAll(".uf")) {
    chips.set(chip.dataset.regiao, chip);
  }

  const gruposLinha = new Map();
  const gruposCabecalho = new Map();
  const celulas = new Map();
  let layout = [];
  let linhaAtiva = null;
  let linhaTravada = null;
  let celulaAtiva = null;

  const idDaRegiao = (regiao) => `regiao:${regiao.nome}`;

  function regiaoDoId(id) {
    if (id == null) return null;
    if (id.startsWith("regiao:")) return id.slice("regiao:".length);
    if (id.startsWith("uf:")) return regiaoDoUf.get(id.slice("uf:".length));
    return null;
  }

  function aplicarDestaque(id) {
    for (const [idLinha, grupo] of gruposLinha) {
      const destacado = id != null && idLinha === id;
      const travada = linhaTravada != null && idLinha === linhaTravada;
      grupo.classList.toggle("destaque", destacado);
      grupo.classList.toggle("travada", travada);
      if (destacado && grupoHeatmap.lastElementChild !== grupo) {
        grupoHeatmap.appendChild(grupo);
      }
    }

    const regiaoAtiva = regiaoDoId(id);
    const regiaoTravada = regiaoDoId(linhaTravada);

    for (const [nome, grupo] of gruposCabecalho) {
      grupo.classList.toggle("destaque", regiaoAtiva === nome);
      grupo.classList.toggle("travada", regiaoTravada === nome);
    }

    for (const [nome, chip] of chips) {
      chip.classList.toggle("ativa", regiaoAtiva === nome);
    }
  }

  function atualizarChips() {
    for (const [nome, chip] of chips) {
      const aberta = expandidas.has(nome);
      chip.classList.toggle("aberta", aberta);
      chip.setAttribute("aria-expanded", aberta ? "true" : "false");
      chip.title =
        `${nome} — ` +
        (aberta ? "clique para recolher" : "clique para expandir");
      chip.setAttribute(
        "aria-label",
        `${nome} — ${aberta ? "recolher estados" : "expandir estados"}`,
      );
    }
  }

  function destacarBarra(ano) {
    for (const [anoBarra, barra] of barras) {
      barra.classList.toggle("ativa", anoBarra === ano);
    }
  }

  function destacarCelula(id, ano) {
    if (celulaAtiva) celulaAtiva.classList.remove("ativa");
    celulaAtiva =
      id == null || ano == null ? null : celulas.get(`${id}:${ano}`) ?? null;
    if (celulaAtiva) celulaAtiva.classList.add("ativa");
  }

  function esconderGuia() {
    guia.classList.add("oculto");
    tooltip.classList.add("oculto");
    destacarBarra(null);
    destacarCelula(null, null);
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
    destacarCelula(resultado.id ?? null, ano);

    guia.classList.remove("oculto");
  }

  function mostrarTooltip(resultado) {
    const { ponto, ano, clientX, clientY } = resultado;
    const ehBrasil = resultado.tipo === "brasil";
    const ehRegiao =
      resultado.tipo === "regiao" || resultado.tipo === "cabecalho";

    tooltip.innerHTML = "";
    tooltip.classList.remove("oculto");

    const topo = criarHtml("div", "tt-topo");
    if (ehBrasil) {
      topo.appendChild(criarHtml("span", "tt-uf tt-brasil", "BR"));
      topo.appendChild(
        criarHtml("span", "tt-nome", "Brasil · mediana das UFs"),
      );
    } else if (ehRegiao) {
      topo.appendChild(
        criarHtml("span", "tt-uf tt-regiao", resultado.regiao.sigla),
      );
      topo.appendChild(
        criarHtml(
          "span",
          "tt-nome",
          `${resultado.regiao.nome} · mediana das UFs`,
        ),
      );
    } else {
      topo.appendChild(criarHtml("span", "tt-uf", resultado.estado.uf));
      topo.appendChild(criarHtml("span", "tt-nome", resultado.estado.nome));
    }
    topo.appendChild(criarHtml("span", "tt-ano", String(ano)));

    const medianaEl = criarHtml("div", "tt-mediana");
    medianaEl.appendChild(criarHtml("span", null, "Mediana"));
    medianaEl.appendChild(criarHtml("strong", null, formatarBRL(ponto.med)));

    tooltip.appendChild(topo);
    tooltip.appendChild(medianaEl);

    if (ehBrasil) {
      const notas = criarHtml("div", "tt-notas");
      notas.appendChild(criarHtml("strong", null, `${ponto.ufs} UFs`));
      notas.appendChild(document.createTextNode(" com dados no ano"));
      tooltip.appendChild(notas);
    } else if (ehRegiao) {
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
        notas.appendChild(
          document.createTextNode(
            ` · ${ponto.ufs} ${ponto.ufs === 1 ? "UF" : "UFs"}`,
          ),
        );
      }

      tooltip.appendChild(minimo);
      tooltip.appendChild(maximo);
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
    linhaAtiva = null;
    aplicarDestaque(null);
    esconderGuia();
  }

  function alternarRegiao(nome) {
    if (expandidas.has(nome)) {
      expandidas.delete(nome);
      if (
        linhaTravada != null &&
        linhaTravada.startsWith("uf:") &&
        regiaoDoUf.get(linhaTravada.slice("uf:".length)) === nome
      ) {
        linhaTravada = null;
      }
    } else {
      expandidas.add(nome);
    }

    linhaAtiva = `regiao:${nome}`;
    renderLinhas();
    esconderGuia();
  }

  // --- desenho das linhas do heatmap -------------------------------------

  function desenharLinhaRegiao(spec) {
    const { regiao, y, altura } = spec;
    const id = idDaRegiao(regiao);

    const grupo = criarSvg("g", {
      class: "hm-linha hm-regiao",
      "data-id": id,
      "data-regiao": regiao.nome,
      role: "button",
      tabindex: "0",
      "aria-expanded": "false",
      "aria-label": `${regiao.nome} — expandir estados`,
    });

    grupo.appendChild(
      criarSvg("rect", {
        class: "hm-fundo",
        x: PLOT.x,
        y: y.toFixed(2),
        width: PLOT.w,
        height: altura.toFixed(2),
      }),
    );

    for (const ano of anos) {
      const ponto = regiao.porAno.get(ano);
      const celula = criarSvg("rect", {
        class: ponto ? "hm-celula" : "hm-celula sem-dados",
        x: (escalaX(ano) - larguraCelula / 2).toFixed(2),
        y: (y + 1).toFixed(2),
        width: larguraCelula.toFixed(2),
        height: Math.max(1, altura - 2).toFixed(2),
        rx: 2,
      });

      if (ponto) {
        const t = (ponto.med - medianaMin) / amplitudeMediana;
        celula.setAttribute("fill", corDaEscala(t));
        celula.dataset.ano = String(ano);
        celulas.set(`${id}:${ano}`, celula);
      }

      grupo.appendChild(celula);
    }

    const rotulo = criarSvg("text", {
      class: "hm-regiao-rotulo",
      x: PLOT.x - 10,
      y: (y + altura / 2 + 3.5).toFixed(2),
      "text-anchor": "end",
    });
    rotulo.textContent = `▸ ${regiao.nome}`;
    grupo.appendChild(rotulo);

    grupo.appendChild(
      criarSvg("rect", {
        class: "hm-contorno",
        x: PLOT.x,
        y: y.toFixed(2),
        width: PLOT.w,
        height: altura.toFixed(2),
        rx: 2,
      }),
    );

    grupo.addEventListener("click", () => alternarRegiao(regiao.nome));
    grupo.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter" && evento.key !== " ") return;
      evento.preventDefault();
      alternarRegiao(regiao.nome);
    });

    grupoHeatmap.appendChild(grupo);
    gruposLinha.set(id, grupo);
  }

  function desenharCabecalho(spec) {
    const { regiao, y, altura } = spec;
    const id = idDaRegiao(regiao);

    const grupo = criarSvg("g", {
      class: "hm-cabecalho",
      "data-id": id,
      "data-regiao": regiao.nome,
      role: "button",
      tabindex: "0",
      "aria-expanded": "true",
      "aria-label": `${regiao.nome} — recolher estados`,
    });

    grupo.appendChild(
      criarSvg("rect", {
        class: "hm-cabecalho-fundo",
        x: PLOT.x,
        y: y.toFixed(2),
        width: PLOT.w,
        height: altura.toFixed(2),
      }),
    );

    grupo.appendChild(
      criarSvg("line", {
        class: "hm-cabecalho-linha",
        x1: PLOT.x,
        y1: (y + altura).toFixed(2),
        x2: PLOT.x + PLOT.w,
        y2: (y + altura).toFixed(2),
      }),
    );

    const rotulo = criarSvg("text", {
      class: "hm-regiao-rotulo",
      x: PLOT.x - 10,
      y: (y + altura / 2 + 3.5).toFixed(2),
      "text-anchor": "end",
    });
    rotulo.textContent = `▾ ${regiao.nome}`;
    grupo.appendChild(rotulo);

    const info = criarSvg("text", {
      class: "hm-cabecalho-info",
      x: PLOT.x + PLOT.w - 4,
      y: (y + altura / 2 + 3.5).toFixed(2),
      "text-anchor": "end",
    });
    info.textContent = `${regiao.ufs.length} UFs`;
    grupo.appendChild(info);

    grupo.addEventListener("click", () => alternarRegiao(regiao.nome));
    grupo.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter" && evento.key !== " ") return;
      evento.preventDefault();
      alternarRegiao(regiao.nome);
    });

    grupoHeatmap.appendChild(grupo);
    gruposCabecalho.set(regiao.nome, grupo);
  }

  function desenharLinhaUf(spec) {
    const { estado, regiao, y, altura } = spec;
    const id = `uf:${estado.uf}`;

    const grupo = criarSvg("g", {
      class: "hm-linha hm-estado",
      "data-id": id,
      "data-uf": estado.uf,
      "data-regiao": regiao.nome,
    });

    grupo.appendChild(
      criarSvg("rect", {
        class: "hm-fundo",
        x: PLOT.x,
        y: y.toFixed(2),
        width: PLOT.w,
        height: altura.toFixed(2),
      }),
    );

    for (const ano of anos) {
      const ponto = estado.porAno.get(ano);
      const celula = criarSvg("rect", {
        class: ponto ? "hm-celula" : "hm-celula sem-dados",
        x: (escalaX(ano) - larguraCelula / 2).toFixed(2),
        y: (y + 1).toFixed(2),
        width: larguraCelula.toFixed(2),
        height: Math.max(1, altura - 2).toFixed(2),
        rx: 2,
      });

      if (ponto) {
        const t = (ponto.med - medianaMin) / amplitudeMediana;
        celula.setAttribute("fill", corDaEscala(t));
        celula.dataset.ano = String(ano);
        celulas.set(`${id}:${ano}`, celula);
      }

      grupo.appendChild(celula);
    }

    const rotulo = criarSvg("text", {
      class: "hm-rotulo hm-uf-rotulo",
      x: PLOT.x - 24,
      y: (y + altura / 2 + 3.5).toFixed(2),
      "text-anchor": "end",
    });
    rotulo.textContent = estado.uf;
    grupo.appendChild(rotulo);

    grupo.appendChild(
      criarSvg("rect", {
        class: "hm-contorno",
        x: PLOT.x,
        y: y.toFixed(2),
        width: PLOT.w,
        height: altura.toFixed(2),
        rx: 2,
      }),
    );

    grupoHeatmap.appendChild(grupo);
    gruposLinha.set(id, grupo);
  }

  function renderLinhas() {
    while (grupoHeatmap.firstChild) {
      grupoHeatmap.removeChild(grupoHeatmap.firstChild);
    }
    gruposLinha.clear();
    gruposCabecalho.clear();
    celulas.clear();
    layout = [];

    const specs = [];
    for (const regiao of regioes) {
      if (expandidas.has(regiao.nome)) {
        specs.push({ tipo: "cabecalho", regiao });
        for (const uf of regiao.ufs) {
          const estado = estadosPorUf.get(uf);
          if (estado) specs.push({ tipo: "uf", estado, regiao });
        }
      } else {
        specs.push({ tipo: "regiao", regiao });
      }
    }

    const idsValidos = new Set(
      specs.map((spec) =>
        spec.tipo === "uf" ? `uf:${spec.estado.uf}` : idDaRegiao(spec.regiao),
      ),
    );
    if (linhaAtiva != null && !idsValidos.has(linhaAtiva)) linhaAtiva = null;
    if (linhaTravada != null && !idsValidos.has(linhaTravada)) {
      linhaTravada = null;
    }

    const qtdCabecalhos = specs.filter(
      (spec) => spec.tipo === "cabecalho",
    ).length;
    const qtdNormais = specs.length - qtdCabecalhos;
    const alturaNormal =
      (PLOT.h - qtdCabecalhos * ALTURA_CABECALHO) / qtdNormais;

    let y = PLOT.y;
    for (const spec of specs) {
      const altura =
        spec.tipo === "cabecalho" ? ALTURA_CABECALHO : alturaNormal;
      spec.y = y;
      spec.altura = altura;
      y += altura;
    }
    const ultima = specs[specs.length - 1];
    ultima.altura = PLOT.y + PLOT.h - ultima.y;
    layout = specs;

    for (const spec of layout) {
      if (spec.tipo === "cabecalho") desenharCabecalho(spec);
      else if (spec.tipo === "regiao") desenharLinhaRegiao(spec);
      else desenharLinhaUf(spec);
    }

    aplicarDestaque(linhaAtiva);
    atualizarChips();
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
      local.y < BARRAS_TOPO ||
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

    // Faixa das barras: leitura nacional, nao disputa com o heatmap.
    if (local.y < PLOT.y) {
      const dadosAno = brasil.get(ano);
      if (!dadosAno) return null;
      return { tipo: "brasil", ponto: dadosAno, ...eventos };
    }

    const spec = layout.find(
      (linha) => local.y >= linha.y && local.y < linha.y + linha.altura,
    );
    if (!spec) return null;

    const id =
      spec.tipo === "uf"
        ? `uf:${spec.estado.uf}`
        : idDaRegiao(spec.regiao);

    if (linhaTravada != null && !ignorarTrava && id !== linhaTravada) {
      return null;
    }

    const dadosAno =
      spec.tipo === "uf"
        ? spec.estado.porAno.get(ano)
        : spec.regiao.porAno.get(ano);
    if (!dadosAno) return null;

    return {
      tipo: spec.tipo,
      regiao: spec.regiao,
      estado: spec.estado,
      ponto: dadosAno,
      id,
      ...eventos,
    };
  }

  // Camada transparente que captura o mouse na faixa das barras e no grafico.
  // Criada antes dos eventos; e recolocada no topo depois do eixo/guia.
  const overlay = criarSvg("rect", {
    x: PLOT.x,
    y: BARRAS_TOPO,
    width: PLOT.w,
    height: baseY - BARRAS_TOPO,
    class: "overlay",
  });
  svg.appendChild(overlay);

  // --- eventos ------------------------------------------------------------

  overlay.addEventListener("pointermove", (evento) => {
    const resultado = pontoDoEvento(evento);

    if (!resultado) {
      if (linhaTravada == null) limpar();
      else esconderGuia();
      return;
    }

    if (resultado.tipo === "brasil") {
      linhaAtiva = null;
      if (linhaTravada == null) aplicarDestaque(null);
    } else {
      linhaAtiva = resultado.id;
      aplicarDestaque(resultado.id);
    }

    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  overlay.addEventListener("pointerleave", (evento) => {
    if (evento.pointerType !== "mouse") return;
    if (linhaTravada == null) limpar();
    else esconderGuia();
  });

  // Clique trava a regiao/UF da celula. No cabecalho, abre/fecha a regiao.
  overlay.addEventListener("pointerdown", (evento) => {
    const resultado = pontoDoEvento(evento, true);

    if (resultado?.tipo === "cabecalho") {
      alternarRegiao(resultado.regiao.nome);
      return;
    }

    if (resultado?.tipo === "brasil") {
      linhaAtiva = null;
      aplicarDestaque(null);
      mostrarGuia(resultado);
      mostrarTooltip(resultado);
      return;
    }

    if (!resultado) {
      linhaTravada = null;
      limpar();
      return;
    }

    linhaTravada =
      linhaTravada === resultado.id ? null : resultado.id;

    if (linhaTravada == null) {
      limpar();
      return;
    }

    linhaAtiva = resultado.id;
    aplicarDestaque(resultado.id);
    mostrarGuia(resultado);
    mostrarTooltip(resultado);
  });

  window.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || linhaTravada == null) return;
    linhaTravada = null;
    limpar();
  });

  // Chips das regioes: clique expande/recolhe; hover destaca a regiao.
  for (const [nome, chip] of chips) {
    chip.addEventListener("click", () => {
      alternarRegiao(nome);
    });

    chip.addEventListener("keydown", (evento) => {
      if (evento.key !== "Enter" && evento.key !== " ") return;
      evento.preventDefault();
      alternarRegiao(nome);
    });

    chip.addEventListener("pointerenter", () => {
      if (linhaTravada != null) return;
      aplicarDestaque(`regiao:${nome}`);
      esconderGuia();
    });

    chip.addEventListener("pointerleave", () => {
      if (linhaTravada == null) limpar();
    });

    chip.addEventListener("focus", () => {
      if (linhaTravada != null || !chip.matches(":focus-visible")) return;
      aplicarDestaque(`regiao:${nome}`);
      esconderGuia();
    });

    chip.addEventListener("blur", () => {
      if (linhaTravada == null) limpar();
    });
  }

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

  // Divisorias dos governos: pontilhadas, dos governos ate o eixo dos anos.
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

  // Guia acima das divisorias/eixo; o overlay fica por cima de tudo.
  svg.appendChild(guia);

  // Recoloca o overlay no topo, acima da guia e do eixo.
  svg.appendChild(overlay);

  container.appendChild(svg);

  renderLinhas();
}

function montarLegenda(regioes) {
  const lista = document.getElementById("listaUfs");
  lista.innerHTML = "";

  for (const regiao of regioes) {
    const chip = document.createElement("span");
    chip.className = "uf";
    chip.dataset.regiao = regiao.nome;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-expanded", "false");
    chip.dataset.nome = regiao.nome;
    chip.title = `${regiao.nome} — clique para expandir`;
    chip.textContent = regiao.nome;
    chip.setAttribute("aria-label", `${regiao.nome} — expandir estados`);
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

  const anos = dados.anos.filter((ano) => ano >= ANO_INICIAL);
  const regioes = prepararRegioes(estados, anos);

  const produto = dados.produto;
  if (produto) {
    const rotulo =
      produto.rotulo ||
      `1${produto.unidadeBase || ""} DE ${produto.nome || ""}`.trim();
    document.getElementById("produto").textContent = rotulo;
  }

  montarLegenda(regioes);
  montarGrafico(estados, regioes, anos);

  const legenda = document.getElementById("legBarra");
  if (legenda) legenda.style.background = gradienteCss();

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
