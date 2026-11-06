// Página /09/: heatmaps de preço real (R$/kg de set/2026) e de
// percentual do salário mínimo.
// Cima: carne bovina de primeira (DIEESE), 27 capitais x 1994-2026.
// Baixo: cortes, 27 capitais x 2008-2026, com aba por corte.
// Dados: web/dados/heatmap.json (gerado por scripts/gerar-heatmap.py).

const URL_DADOS = "../dados/heatmap.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LARGURA = 1220;
const MARGEM = { top: 30, right: 14, bottom: 6, left: 138 };
const ALTURA_LINHA = 21;

// Rampa azul: claro = mais barato / menor %; escuro = mais caro / maior %.
const PARADAS = [
  [0.0, [239, 246, 255]],
  [0.25, [191, 219, 254]],
  [0.5, [96, 165, 250]],
  [0.75, [37, 99, 235]],
  [1.0, [30, 58, 138]],
];

const tooltip = document.getElementById("tooltip");

function criar(tag, atributos = {}, texto = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    el.setAttribute(nome, String(valor));
  }
  if (texto != null) el.textContent = texto;
  return el;
}

function cor(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < PARADAS.length; i += 1) {
    const [p1, c1] = PARADAS[i - 1];
    const [p2, c2] = PARADAS[i];
    if (x <= p2) {
      const f = (x - p1) / (p2 - p1 || 1);
      const c = c1.map((v, j) => Math.round(v + (c2[j] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(30, 58, 138)";
}

function fmt(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtPct(valor) {
  return `${Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function mes(ym) {
  if (!ym) return "";
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
}

function mostrarTooltip(evento, html) {
  tooltip.innerHTML = html;
  tooltip.classList.remove("oculto");
  moverTooltip(evento);
}

function moverTooltip(evento) {
  const folga = 12;
  const caixa = tooltip.getBoundingClientRect();
  let x = evento.clientX + folga;
  let y = evento.clientY + folga;
  if (x + caixa.width > window.innerWidth - 8) {
    x = evento.clientX - caixa.width - folga;
  }
  if (y + caixa.height > window.innerHeight - 8) {
    y = evento.clientY - caixa.height - folga;
  }
  tooltip.style.left = `${Math.max(4, x)}px`;
  tooltip.style.top = `${Math.max(4, y)}px`;
}

function esconderTooltip() {
  tooltip.classList.add("oculto");
}

function atualizarLegenda(id, painel, formato) {
  const legenda = document.getElementById(id);
  const f = formato === "pct" ? fmtPct : fmt;
  legenda.querySelector(".leg-min").textContent = f(painel.min);
  legenda.querySelector(".leg-max").textContent = f(painel.max);
}

function criarAbas(container, cortes, aoSelecionar) {
  const botoes = new Map();
  for (const corte of cortes) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "aba";
    botao.setAttribute("role", "tab");
    botao.textContent = corte;
    botao.addEventListener("click", () => aoSelecionar(corte));
    container.appendChild(botao);
    botoes.set(corte, botao);
  }
  return botoes;
}

function render(container, painel, anos, capitais, opcoes) {
  container.replaceChildren();

  const formato = opcoes.formato || "preco";
  const altura = MARGEM.top + capitais.length * ALTURA_LINHA + MARGEM.bottom;
  const larguraCelula =
    (LARGURA - MARGEM.left - MARGEM.right) / anos.length;

  const svg = criar("svg", {
    viewBox: `0 0 ${LARGURA} ${altura}`,
    role: "img",
    "aria-label": opcoes.aria,
  });

  const defs = criar("defs");
  const padrao = criar("pattern", {
    id: `hatch-${opcoes.id}`,
    patternUnits: "userSpaceOnUse",
    width: 6,
    height: 6,
    patternTransform: "rotate(45)",
  });
  padrao.appendChild(criar("rect", { width: 6, height: 6, fill: "#e5e7eb" }));
  padrao.appendChild(
    criar("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: "#6b7280",
      "stroke-width": 1,
    }),
  );
  defs.appendChild(padrao);
  svg.appendChild(defs);

  // Anos no topo.
  for (let i = 0; i < anos.length; i += 1) {
    const x = MARGEM.left + (i + 0.5) * larguraCelula;
    svg.appendChild(
      criar(
        "text",
        { x, y: 18, "text-anchor": "middle", "font-size": 9 },
        String(anos[i]),
      ),
    );
  }

  // Capitais nas linhas.
  for (let j = 0; j < capitais.length; j += 1) {
    const y = MARGEM.top + (j + 0.5) * ALTURA_LINHA + 3.5;
    svg.appendChild(
      criar(
        "text",
        {
          x: MARGEM.left - 8,
          y,
          "text-anchor": "end",
          "font-size": 10,
        },
        capitais[j].nome,
      ),
    );
  }

  const { min, max } = painel;
  const intervalo = max - min || 1;

  for (let j = 0; j < capitais.length; j += 1) {
    for (let i = 0; i < anos.length; i += 1) {
      const valor = painel.valores[j][i];
      const referencia = painel.referencia?.[j]?.[i] || "";
      const fonte = painel.fonte?.[j]?.[i] || "";
      const natureza =
        painel.natureza_celula?.[j]?.[i] || opcoes.natureza || "";
      const margem = painel.margem;
      const margemTexto =
        natureza === "observado"
          ? fonte.startsWith("IEA") || fonte.startsWith("DIEESE")
            ? "dispersão não publicada pela fonte"
            : "amostra da fonte; dispersão não calculada"
          : margem && margem.total != null
            ? `margem ±${fmtPct(margem.total)} (nível ${fmtPct(margem.nivel)} + caminho ${fmtPct(margem.caminho)})`
            : margem && margem.caminho == null
              ? "sem INPC; dispersão não publicada"
              : "dispersão não publicada";
      const x = MARGEM.left + i * larguraCelula + 0.5;
      const y = MARGEM.top + j * ALTURA_LINHA + 0.5;
      const largura = larguraCelula - 1;
      const alturaCelula = ALTURA_LINHA - 1;
      const preenchimento =
        valor == null
          ? `url(#hatch-${opcoes.id})`
          : cor(max === min ? 0.5 : (valor - min) / intervalo);

      const celula = criar("rect", {
        x,
        y,
        width: largura,
        height: alturaCelula,
        rx: 2,
        fill: preenchimento,
      });

      const cidade = `${capitais[j].nome} (${capitais[j].uf})`;
      let conteudo;
      if (valor == null) {
        conteudo = `<strong>${cidade}</strong><br>${anos[i]} · sem dados`;
      } else {
        const valorTexto =
          formato === "pct"
            ? `${fmtPct(valor)} do salário mínimo`
            : `${fmt(valor)}/kg`;
        conteudo =
          `<strong>${cidade}</strong><br>${mes(referencia)} · ${valorTexto}<br>` +
          `${fonte} · ${natureza}<br>${margemTexto}`;
      }

      celula.addEventListener("mouseenter", (evento) =>
        mostrarTooltip(evento, conteudo),
      );
      celula.addEventListener("mousemove", moverTooltip);
      celula.addEventListener("mouseleave", esconderTooltip);
      svg.appendChild(celula);
    }
  }

  container.appendChild(svg);
}

async function iniciar() {
  const carregando = document.getElementById("carregando");
  const erro = document.getElementById("erro");

  try {
    const resposta = await fetch(URL_DADOS, { cache: "no-store" });
    if (!resposta.ok) {
      throw new Error(`${resposta.status} ao buscar ${URL_DADOS}`);
    }
    const dados = await resposta.json();
    carregando.classList.add("oculto");

    render(
      document.getElementById("heatmap-carne"),
      dados.carne,
      dados.anos_carne,
      dados.capitais,
      {
        id: "carne",
        formato: "preco",
        natureza: "observado",
        aria: "Heatmap do preço da carne bovina de primeira por capital e ano",
      },
    );
    atualizarLegenda("legenda-carne", dados.carne, "preco");

    render(
      document.getElementById("heatmap-carne-pct"),
      dados.carne.percentual,
      dados.anos_carne,
      dados.capitais,
      {
        id: "carne-pct",
        formato: "pct",
        natureza: "observado",
        aria: "Heatmap do percentual do salário mínimo para comprar 1 kg de carne bovina de primeira por capital e ano",
      },
    );
    atualizarLegenda("legenda-carne-pct", dados.carne.percentual, "pct");

    const cortes = Object.keys(dados.cortes);
    let ativo = cortes[0];

    const selecionar = (corte) => {
      ativo = corte;
      atualizarCortes();
    };
    const botoesPreco = criarAbas(
      document.getElementById("abas-cortes"),
      cortes,
      selecionar,
    );
    const botoesPct = criarAbas(
      document.getElementById("abas-cortes-pct"),
      cortes,
      selecionar,
    );

    function atualizarCortes() {
      const painel = dados.cortes[ativo];
      render(
        document.getElementById("heatmap-cortes"),
        painel,
        dados.anos_cortes,
        dados.capitais,
        {
          id: "cortes",
          formato: "preco",
          natureza: "estimado",
          aria: `Heatmap do preço de ${ativo} por capital e ano`,
        },
      );
      render(
        document.getElementById("heatmap-cortes-pct"),
        painel.percentual,
        dados.anos_cortes,
        dados.capitais,
        {
          id: "cortes-pct",
          formato: "pct",
          natureza: "estimado",
          aria: `Heatmap do percentual do salário mínimo para comprar 1 kg de ${ativo} por capital e ano`,
        },
      );
      atualizarLegenda("legenda-cortes", painel, "preco");
      atualizarLegenda("legenda-cortes-pct", painel.percentual, "pct");
      const rotulo = painel.cidades_com_serie === 1 ? "capital" : "capitais";
      document.getElementById("sub-cortes").textContent =
        `${painel.cidades_com_serie} ${rotulo} com dado · dezembro (2026: SP ago/2026; demais set/2026) · preço estimado`;
      document.getElementById("sub-cortes-pct").textContent =
        `${painel.cidades_com_serie} ${rotulo} com dado · dezembro (2026: SP ago/2026; demais set/2026) · % do salário mínimo`;
      for (const [corte, botao] of botoesPreco) {
        botao.setAttribute("aria-selected", String(corte === ativo));
      }
      for (const [corte, botao] of botoesPct) {
        botao.setAttribute("aria-selected", String(corte === ativo));
      }
    }

    atualizarCortes();
  } catch (falha) {
    carregando.classList.add("oculto");
    erro.textContent = `Não foi possível carregar os dados: ${falha.message}`;
    erro.classList.remove("oculto");
  }
}

iniciar();
