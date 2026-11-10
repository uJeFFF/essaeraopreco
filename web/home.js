// Home: compara até três governos em barras (custo de 1 kg de carne em % do
// salário mínimo) e mostra as últimas notas sintéticas.
//
// Os gráficos leem web/dados/heatmap.json, a mesma base do gráfico 09
// (DIEESE + INPC/IPCA + complementos). A coluna de notas lê
// web/dados/notas-recentes.json, gerado a partir das amostras sintéticas.

import { GOVERNOS } from "./governos.js";

const URL_HEATMAP = "dados/heatmap.json";
const URL_NOTAS = "dados/notas-recentes.json";
const CAPITAL_PADRAO = "São Paulo";
const GOV_PADRAO_A = "BOLSONARO";
const GOV_PADRAO_B = "LULA 3";
const CORTE_PADRAO = "primeira";
const TEXTO_INFO_CARNE =
  "Para o DIEESE, “carne de primeira” é o preço médio de cortes bovinos de " +
  "primeira qualidade — coxão mole (chã de dentro) e mais dois cortes de preço " +
  "semelhante, como coxão duro ou patinho — pesquisados mensalmente em cada " +
  "capital. O DIEESE é o Departamento Intersindical de Estatística e Estudos " +
  "Socioeconômicos.";
const CORES_CORTES = ["#f2f2f2", "#cfcfcf", "#9e9e9e", "#5e5e5e", "#111111"];
const SVG_NS = "http://www.w3.org/2000/svg";
const tooltip = document.getElementById("tooltip");

const estado = {
  capital: CAPITAL_PADRAO,
  corte: CORTE_PADRAO,
  heatmapCapital: CAPITAL_PADRAO,
  governos: { a: GOV_PADRAO_A, b: GOV_PADRAO_B },
};

let dados = null;
let heatmapBruto = null;
let escala = { topo: 4, passo: 1 };

const el = (tag, classe, texto) => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto != null) elemento.textContent = texto;
  return elemento;
};

function criarSVG(tag, atributos = {}, texto = null) {
  const elemento = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    elemento.setAttribute(nome, String(valor));
  }
  if (texto != null) elemento.textContent = texto;
  return elemento;
}

async function buscarJson(caminho) {
  const resposta = await fetch(caminho, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`${resposta.status} ao buscar ${caminho}`);
  return resposta.json();
}

function formatarBRL(centavos) {
  return (Number(centavos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarPct(valor) {
  return `${Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatarPctEixo(valor) {
  return `${Number(valor).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}

function formatarMes(anoMes) {
  if (!anoMes) return "";
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${meses[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(0, 4)}`;
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

function mostrarTooltip(evento, conteudo, classe = "") {
  tooltip.className = classe ? `tooltip ${classe}` : "tooltip";
  tooltip.innerHTML = conteudo;
  moverTooltip(evento);
}

function esconderTooltip() {
  tooltip.classList.add("oculto");
}

function urlSefaz(chave) {
  return `https://www.nfce.fazenda.gov.br/portal/consulta?chave=${encodeURIComponent(chave)}`;
}

function prepararSerie(anos, percentual, reais, indiceCapital, salarioMinimo) {
  const valoresPct = {};
  const valoresReais = {};
  const valoresSalario = {};
  anos.forEach((ano, j) => {
    valoresPct[ano] = percentual[indiceCapital]?.[j] ?? null;
    valoresReais[ano] = reais[indiceCapital]?.[j] ?? null;
    valoresSalario[ano] = salarioMinimo[ano] ?? null;
  });
  return {
    percentual: valoresPct,
    reais: valoresReais,
    salario: valoresSalario,
  };
}

function prepararDados(heatmap) {
  const anos = heatmap.anos_carne;
  const anosCortes = heatmap.anos_cortes;
  const capitais = heatmap.capitais;
  const percentual = heatmap.carne?.percentual?.valores;
  const reais = heatmap.carne?.valores;
  const salarioMinimo = heatmap.salario_minimo?.valores ?? {};

  if (
    !Array.isArray(anos) ||
    !Array.isArray(anosCortes) ||
    !Array.isArray(capitais) ||
    !Array.isArray(percentual) ||
    !Array.isArray(reais)
  ) {
    throw new Error("heatmap.json sem os campos de carne esperados.");
  }

  const cortes = Object.entries(heatmap.cortes ?? {}).map(([nome, corte]) => ({
    nome,
    percentual: corte.percentual?.valores ?? [],
    reais: corte.valores ?? [],
  }));

  const porCapital = new Map();
  capitais.forEach((capital, i) => {
    const seriesCortes = {};
    for (const corte of cortes) {
      seriesCortes[corte.nome] = prepararSerie(
        anosCortes,
        corte.percentual,
        corte.reais,
        i,
        salarioMinimo,
      );
    }
    porCapital.set(capital.nome, {
      ...capital,
      carne: prepararSerie(anos, percentual, reais, i, salarioMinimo),
      cortes: seriesCortes,
    });
  });

  return {
    anos,
    anosCortes,
    capitais,
    cortes: cortes.map((corte) => corte.nome),
    porCapital,
  };
}

function dadosDaCapital(nome) {
  return dados?.porCapital.get(nome) || null;
}

function serieDaCapital(capital) {
  const info = dadosDaCapital(capital);
  if (!info) return null;
  if (estado.corte === CORTE_PADRAO) return info.carne;
  return info.cortes[estado.corte] || null;
}

function governosDisponiveis() {
  return GOVERNOS;
}

function valoresDoGoverno(capital, nomeGoverno) {
  const serie = serieDaCapital(capital);
  const governo = GOVERNOS.find((item) => item.nome === nomeGoverno);
  if (!serie || !governo) return [];

  const anos = [];
  for (let ano = governo.de; ano <= governo.ate; ano++) {
    anos.push({
      ano,
      valor: serie.percentual[ano] ?? null,
      real: serie.reais[ano] ?? null,
      salario: serie.salario[ano] ?? null,
    });
  }
  return anos;
}

function idsGovernosAtivos() {
  return Array.from(
    document.querySelectorAll(".gov-dropdown[data-grafico]"),
    (dropdown) => dropdown.dataset.grafico,
  );
}

function escolherGovernoPadrao(id, disponiveis) {
  if (!disponiveis.length) return null;
  if (id === "a") {
    return disponiveis[Math.max(0, disponiveis.length - 2)].nome;
  }
  if (id === "c") {
    return disponiveis[Math.max(0, disponiveis.length - 3)].nome;
  }
  return disponiveis[disponiveis.length - 1].nome;
}

function calcularEscala() {
  const valores = [];
  for (const id of idsGovernosAtivos()) {
    for (const item of valoresDoGoverno(
      estado.capital,
      estado.governos[id],
    )) {
      if (item.valor != null) valores.push(item.valor);
    }
  }

  const maximo = valores.length ? Math.max(...valores) : 4;
  const passo = maximo <= 6 ? 1 : 2;
  const topo = Math.max(4, Math.ceil(maximo / passo) * passo);
  return { topo, passo };
}

function montarSeletorCapital() {
  const select = document.getElementById("capital");
  select.replaceChildren();

  for (const capital of dados.capitais) {
    const opcao = document.createElement("option");
    opcao.value = capital.nome;
    opcao.textContent = `${capital.nome} (${capital.uf})`;
    select.appendChild(opcao);
  }

  const padrao = dados.capitais.some((c) => c.nome === CAPITAL_PADRAO)
    ? CAPITAL_PADRAO
    : dados.capitais[0]?.nome;
  if (padrao) {
    estado.capital = padrao;
    select.value = padrao;
  }

  select.disabled = false;
}

function montarSeletorCorte() {
  const select = document.getElementById("corte");
  select.replaceChildren();

  const padrao = document.createElement("option");
  padrao.value = CORTE_PADRAO;
  padrao.textContent = "Carne de Primeira";
  select.appendChild(padrao);

  for (const corte of dados.cortes) {
    const opcao = document.createElement("option");
    opcao.value = corte;
    opcao.textContent = corte.charAt(0).toUpperCase() + corte.slice(1);
    select.appendChild(opcao);
  }

  select.value = estado.corte;
  select.disabled = false;
}

function montarSeletorCidadeHeatmap() {
  const select = document.getElementById("cidade-heatmap");
  select.replaceChildren();

  for (const capital of dados.capitais) {
    const opcao = document.createElement("option");
    opcao.value = capital.nome;
    opcao.textContent = `${capital.nome} (${capital.uf})`;
    select.appendChild(opcao);
  }

  const padrao = dados.capitais.some(
    (capital) => capital.nome === estado.heatmapCapital,
  )
    ? estado.heatmapCapital
    : dados.capitais[0]?.nome;
  if (padrao) {
    estado.heatmapCapital = padrao;
    select.value = padrao;
  }

  select.disabled = false;
}

function atualizarResumo(id) {
  const dropdown = document.querySelector(
    `.gov-dropdown[data-grafico="${id}"]`,
  );
  const nomeEl = dropdown.querySelector(".gov-nome");
  const opcoesEl = dropdown.querySelector(".gov-opcoes");
  const disponiveis = governosDisponiveis();
  const nomesDisponiveis = new Set(disponiveis.map((governo) => governo.nome));

  if (!nomesDisponiveis.has(estado.governos[id])) {
    estado.governos[id] = escolherGovernoPadrao(id, disponiveis);
  }

  nomeEl.textContent = estado.governos[id] || "Sem dados";
  opcoesEl.replaceChildren();

  if (!disponiveis.length) {
    opcoesEl.appendChild(el("p", "aviso", "Sem dados para esta capital."));
    return;
  }

  for (const governo of disponiveis) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "gov-opcao";
    botao.setAttribute("role", "option");
    botao.setAttribute(
      "aria-selected",
      governo.nome === estado.governos[id] ? "true" : "false",
    );
    botao.dataset.governo = governo.nome;
    botao.textContent = governo.nome;
    opcoesEl.appendChild(botao);
  }
}

function ultimoValorDoGrupo(grupo) {
  for (let i = grupo.anos.length - 1; i >= 0; i -= 1) {
    if (grupo.anos[i].valor != null) return grupo.anos[i];
  }
  return null;
}

function renderizarComparacao() {
  esconderTooltip();
  const container = document.querySelector(".grafico-svg");
  const ids = idsGovernosAtivos();
  const grupos = ids.map((id) => ({
    id,
    governo: estado.governos[id],
    anos: valoresDoGoverno(estado.capital, estado.governos[id]),
  }));
  container.dataset.grupos = String(ids.length);

  const temGoverno = grupos.some(
    (grupo) => grupo.governo && grupo.anos.length > 0,
  );

  if (!temGoverno) {
    container.replaceChildren(
      el("p", "grafico-vazio", "Sem dados para esta capital e governos."),
    );
    container.setAttribute("aria-label", "Sem dados para este gráfico");
    return;
  }

  const largura = Math.max(320, container.clientWidth || 680);
  const altura = 330;
  const margem = { top: 18, right: 10, bottom: 32, left: 38 };
  const larguraPlot = largura - margem.left - margem.right;
  const alturaPlot = altura - margem.top - margem.bottom;
  const base = margem.top + alturaPlot;
  const larguraGrupo = larguraPlot / grupos.length;
  const minimoBarra = grupos.length >= 3 ? 10 : 18;

  let menor = null;
  let maior = null;
  grupos.forEach((grupo, indiceGrupo) => {
    grupo.anos.forEach((item, indiceAno) => {
      if (item.valor == null) return;
      const candidato = {
        grupo: indiceGrupo,
        indice: indiceAno,
        valor: item.valor,
      };
      if (!menor || item.valor < menor.valor) menor = candidato;
      if (!maior || item.valor > maior.valor) maior = candidato;
    });
  });
  const corMin = menor?.valor ?? 0;
  const corMax = maior?.valor ?? 1;
  const intervaloCor = corMax - corMin || 1;

  const completos = grupos.every(
    (grupo) =>
      grupo.governo &&
      grupo.anos.length > 0 &&
      grupo.anos.every((item) => item.valor != null),
  );
  const ultimos = grupos.map(ultimoValorDoGrupo);
  const etiquetas = [];

  const svg = criarSVG("svg", {
    viewBox: `0 0 ${largura} ${altura}`,
    role: "presentation",
    "aria-hidden": "true",
    focusable: "false",
  });

  for (let valor = 0; valor <= escala.topo + 0.001; valor += escala.passo) {
    const y = base - (valor / escala.topo) * alturaPlot;
    svg.appendChild(
      criarSVG("line", {
        class: "grade",
        x1: margem.left,
        x2: largura - margem.right,
        y1: y,
        y2: y,
      }),
    );
    svg.appendChild(
      criarSVG(
        "text",
        {
          class: "eixo",
          x: margem.left - 8,
          y: y + 4,
          "text-anchor": "end",
        },
        formatarPctEixo(valor),
      ),
    );
  }

  for (let i = 1; i < grupos.length; i += 1) {
    const x = margem.left + i * larguraGrupo;
    svg.appendChild(
      criarSVG("line", {
        class: "divisor-governos",
        x1: x,
        x2: x,
        y1: margem.top,
        y2: base,
      }),
    );
  }

  const rotuloCorte =
    estado.corte === CORTE_PADRAO ? "carne de primeira" : estado.corte;
  const descricao = [
    `Custo de 1 kg de ${rotuloCorte} em % do salário mínimo`,
  ];

  grupos.forEach((grupo, indice) => {
    const x0 = margem.left + indice * larguraGrupo;

    if (!grupo.governo || !grupo.anos.length) {
      svg.appendChild(
        criarSVG(
          "text",
          {
            class: "sem-dado",
            x: x0 + larguraGrupo / 2,
            y: base - 18,
            "text-anchor": "middle",
          },
          "Sem dados",
        ),
      );
      descricao.push("Sem dados");
      return;
    }

    const outroIndice =
      grupos.length > 1 ? (indice > 0 ? indice - 1 : 1) : -1;
    const outroGrupo = outroIndice >= 0 ? grupos[outroIndice] : null;
    const referencia = outroIndice >= 0 ? ultimos[outroIndice] : null;
    const banda = larguraGrupo / grupo.anos.length;
    const larguraBarra = Math.max(
      minimoBarra,
      Math.min(54, banda * 0.62, larguraGrupo - 8),
    );
    const valores = [];

    grupo.anos.forEach((item, i) => {
      const centro = x0 + banda * i + banda / 2;
      const x = centro - larguraBarra / 2;

      if (item.valor == null) {
        const rotacionar = banda < 46;
        const etiqueta = criarSVG(
          "text",
          {
            class: "sem-dado sem-dado-barra",
            x: centro,
            y: base - 6,
            "text-anchor": rotacionar ? "start" : "middle",
          },
          "sem dados",
        );
        if (rotacionar) {
          etiqueta.setAttribute(
            "transform",
            `rotate(-90 ${centro} ${base - 6})`,
          );
        }
        etiqueta.appendChild(
          criarSVG("title", {}, `${grupo.governo} • ${item.ano} • sem dados`),
        );
        svg.appendChild(etiqueta);
      } else {
        const alturaBarra = (item.valor / escala.topo) * alturaPlot;
        const y = base - alturaBarra;
        const corBarra =
          corMax === corMin
            ? corCorte(0.5)
            : corCorte((item.valor - corMin) / intervaloCor);
        const classeBarra =
          CORES_CORTES.indexOf(corBarra) >= 4
            ? "barra barra-muito-escura"
            : "barra";
        const retangulo = criarSVG("rect", {
          class: classeBarra,
          x,
          y,
          width: larguraBarra,
          height: Math.max(1, alturaBarra),
          rx: 3,
          fill: corBarra,
        });

        let destaque = "";
        let complemento = "";
        if (outroGrupo?.governo && referencia && referencia.valor) {
          const variacao =
            ((item.valor - referencia.valor) / referencia.valor) * 100;
          const diferenca = Math.abs(variacao);
          destaque =
            diferenca < 0.05
              ? "Mesmo valor"
              : `${formatarPct(diferenca)} mais ${
                  variacao < 0 ? "barato" : "caro"
                }`;
          complemento = `que ao fim do governo ${outroGrupo.governo}`;
        }

        const colunaAtual = {
          governo: grupo.governo,
          ano: item.ano,
          valor: item.valor,
          real: item.real,
          salario: item.salario,
          emFoco: true,
        };
        const colunaOutra =
          outroGrupo?.governo && referencia
            ? {
                governo: outroGrupo.governo,
                ano: referencia.ano,
                valor: referencia.valor,
                real: referencia.real,
                salario: referencia.salario,
                emFoco: false,
              }
            : null;
        const indiceAtual = GOVERNOS.findIndex(
          (governo) => governo.nome === grupo.governo,
        );
        const indiceOutro = GOVERNOS.findIndex(
          (governo) => governo.nome === outroGrupo?.governo,
        );
        const atualAntes =
          indiceAtual >= 0 && indiceOutro >= 0
            ? indiceAtual <= indiceOutro
            : true;
        const colunas = colunaOutra
          ? atualAntes
            ? [colunaAtual, colunaOutra]
            : [colunaOutra, colunaAtual]
          : [colunaAtual];

        const colunasHtml = colunas
          .map((coluna) => {
            const nome = coluna.emFoco
              ? `<strong>${coluna.governo}</strong>`
              : coluna.governo;
            const itens = [
              `<div class="popup-barra-governo">${nome} • ${coluna.ano}</div>`,
              `<div class="popup-barra-valor">${formatarPct(
                coluna.valor,
              )} do salário mínimo</div>`,
            ];
            if (coluna.real != null) {
              itens.push(
                `<div class="popup-barra-valor">${formatarMoeda(
                  coluna.real,
                )}/kg</div>`,
              );
            }
            if (coluna.salario != null) {
              itens.push(
                `<div class="popup-barra-salario">Salário mínimo: ${formatarMoeda(
                  coluna.salario,
                )}</div>`,
              );
            }
            return `<div class="popup-barra-coluna">${itens.join("")}</div>`;
          })
          .join("");

        const classesColunas =
          colunas.length > 1
            ? "popup-barra-colunas"
            : "popup-barra-colunas popup-barra-colunas-unica";

        const linhasPopup = [];
        if (destaque) {
          linhasPopup.push(
            `<strong class="popup-barra-destaque">${destaque}</strong>`,
          );
          linhasPopup.push(
            `<div class="popup-barra-destaque-sub">${complemento}</div>`,
          );
          linhasPopup.push('<div class="popup-barra-divisor"></div>');
        }
        linhasPopup.push(
          `<div class="${classesColunas}">${colunasHtml}</div>`,
        );
        const conteudoPopup = linhasPopup.join("");

        retangulo.addEventListener("mouseenter", (evento) =>
          mostrarTooltip(evento, conteudoPopup, "popup-barra"),
        );
        retangulo.addEventListener("mousemove", moverTooltip);
        retangulo.addEventListener("mouseleave", esconderTooltip);

        svg.appendChild(retangulo);
        svg.appendChild(
          criarSVG(
            "text",
            {
              class: "valor",
              x: centro,
              y: Math.max(12, y - 6),
              "text-anchor": "middle",
            },
            formatarPct(item.valor),
          ),
        );

        if (completos && menor && indice === menor.grupo && i === menor.indice) {
          etiquetas.push({
            texto: "MAIS BARATO",
            centroBarra: centro,
            centroY: y + alturaBarra / 2,
          });
        }
        if (completos && maior && indice === maior.grupo && i === maior.indice) {
          etiquetas.push({
            texto: "MAIS CARO",
            centroBarra: centro,
            centroY: y + alturaBarra / 2,
          });
        }

        valores.push(`${item.ano}: ${formatarPct(item.valor)}`);
      }

      svg.appendChild(
        criarSVG(
          "text",
          {
            class: "ano",
            x: centro,
            y: altura - 9,
            "text-anchor": "middle",
          },
          String(item.ano),
        ),
      );
    });

    descricao.push(`${grupo.governo}: ${valores.join(", ") || "sem dados"}`);
  });

  if (completos && menor && maior) {
    const grupoMenor = grupos[menor.grupo];
    const grupoMaior = grupos[maior.grupo];
    descricao.push(
      `Mais barato: ${grupoMenor.governo} ${grupoMenor.anos[menor.indice].ano} (${formatarPct(menor.valor)})`,
    );
    descricao.push(
      `Mais caro: ${grupoMaior.governo} ${grupoMaior.anos[maior.indice].ano} (${formatarPct(maior.valor)})`,
    );
  }

  desenharEtiquetas(svg, etiquetas, largura, altura);

  container.replaceChildren(svg);
  container.setAttribute("aria-label", descricao.join(" | "));
}

function desenharEtiquetas(svg, etiquetas, largura, altura) {
  if (!etiquetas.length) return;

  const compacto = largura < 560;
  const LARGURA = compacto ? 64 : 82;
  const ALTURA = compacto ? 13 : 16;

  for (const etiqueta of etiquetas) {
    etiqueta.largura = LARGURA;
    etiqueta.altura = ALTURA;
    etiqueta.cx = etiqueta.centroBarra;
    etiqueta.cy = etiqueta.centroY;
    etiqueta.x = Math.max(
      2,
      Math.min(largura - LARGURA - 2, etiqueta.cx - LARGURA / 2),
    );
    etiqueta.y = etiqueta.cy - ALTURA / 2;
  }

  if (etiquetas.length === 2) {
    const [superior, inferior] = etiquetas
      .slice()
      .sort((a, b) => a.cy - b.cy);
    const sobrepoeX =
      superior.x < inferior.x + LARGURA &&
      superior.x + LARGURA > inferior.x;
    const sobrepoeY =
      superior.y < inferior.y + ALTURA &&
      superior.y + ALTURA > inferior.y;

    if (sobrepoeX && sobrepoeY) {
      superior.y -= ALTURA / 2 + 2;
      inferior.y += ALTURA / 2 + 2;
    }
  }

  for (const etiqueta of etiquetas) {
    const centroTexto = etiqueta.x + LARGURA / 2;
    const y = Math.max(2, Math.min(altura - ALTURA - 2, etiqueta.y));

    svg.appendChild(
      criarSVG("rect", {
        class: "etiqueta-fundo",
        x: etiqueta.x,
        y,
        width: LARGURA,
        height: ALTURA,
        rx: 3,
      }),
    );
    svg.appendChild(
      criarSVG(
        "text",
        {
          class: compacto ? "etiqueta-texto compacta" : "etiqueta-texto",
          x: centroTexto,
          y: y + ALTURA / 2 + (compacto ? 2.5 : 3),
          "text-anchor": "middle",
        },
        etiqueta.texto,
      ),
    );
  }
}

function atualizarInfoCorte() {
  const info = document.getElementById("info-carne");
  const ehCarneDePrimeira = estado.corte === CORTE_PADRAO;
  if (!ehCarneDePrimeira && !info.classList.contains("oculto")) {
    esconderTooltip();
  }
  info.classList.toggle("oculto", !ehCarneDePrimeira);
}

function renderizarTudo() {
  if (!dados) return;

  atualizarInfoCorte();
  for (const id of idsGovernosAtivos()) atualizarResumo(id);
  escala = calcularEscala();
  renderizarComparacao();
}

function mostrarErroGraficos(mensagem) {
  for (const container of document.querySelectorAll(".grafico-svg")) {
    container.replaceChildren(el("p", "aviso erro", mensagem));
  }
}

function criarNota(nota) {
  const item = el("article", "nota-item");

  const linha = el("div", "nota-linha");
  linha.appendChild(el("div", "nota-estab", nota.estabelecimento));
  linha.appendChild(el("span", "nota-uf", nota.uf));
  item.appendChild(linha);

  const precos = el("div", "nota-precos");
  precos.appendChild(
    el("strong", "nota-preco", formatarBRL(nota.precoRealCentavos)),
  );

  const link = document.createElement("a");
  link.className = "nota-ver";
  link.href = urlSefaz(nota.chave);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "VER NOTA";
  precos.appendChild(link);

  item.appendChild(precos);

  return item;
}

async function carregarNotas() {
  const alvo = document.getElementById("notas");
  try {
    const dadosNotas = await buscarJson(URL_NOTAS);
    const notas = Array.isArray(dadosNotas.notas) ? dadosNotas.notas : [];
    if (!notas.length) {
      alvo.replaceChildren(el("p", "aviso", "Nenhuma nota recente."));
      return;
    }

    const fragmento = document.createDocumentFragment();
    for (const nota of notas) fragmento.appendChild(criarNota(nota));
    alvo.replaceChildren(fragmento);
  } catch (erro) {
    alvo.replaceChildren(
      el("p", "aviso erro", `Falha ao carregar as notas: ${erro.message}`),
    );
  }
}

function corCorte(t) {
  const x = Math.max(0, Math.min(0.999999, t));
  const indice = Math.min(
    CORES_CORTES.length - 1,
    Math.floor(x * CORES_CORTES.length),
  );
  return CORES_CORTES[indice];
}

function mostrarErroCortes(mensagem) {
  const alvo = document.getElementById("erro-cortes");
  alvo.textContent = mensagem;
  alvo.classList.remove("oculto");
  document.getElementById("heatmap-cortes").replaceChildren();
}

function renderizarHeatmapCortes(heatmap) {
  const container = document.getElementById("heatmap-cortes");
  const erroEl = document.getElementById("erro-cortes");

  erroEl.classList.add("oculto");
  container.replaceChildren();

  const anos = heatmap.anos_cortes;
  const capitais = heatmap.capitais;
  const cortes = Object.entries(heatmap.cortes ?? {});
  const indiceCapital = Array.isArray(capitais)
    ? capitais.findIndex((capital) => capital.nome === estado.heatmapCapital)
    : -1;

  if (!Array.isArray(anos) || !cortes.length || indiceCapital < 0) {
    throw new Error("heatmap.json sem os cortes esperados para esta cidade.");
  }

  const valores = [];
  for (const [, corte] of cortes) {
    for (const valor of corte.percentual?.valores?.[indiceCapital] ?? []) {
      if (valor != null) valores.push(valor);
    }
  }

  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 1;
  const intervalo = max - min || 1;
  const capitalSelecionada = capitais[indiceCapital];
  const rotuloAria = valores.length
    ? `Heatmap de cortes de carne em percentual do salário mínimo em ${capitalSelecionada.nome}, ${anos[0]} a ${anos[anos.length - 1]}`
    : `Heatmap de cortes de carne sem dados para ${capitalSelecionada.nome}`;

  const LARGURA = 1220;
  const MARGEM = { top: 34, right: 14, bottom: 6, left: 140 };
  const ALTURA_LINHA = 22;
  const larguraCelula = (LARGURA - MARGEM.left - MARGEM.right) / anos.length;
  const altura = MARGEM.top + cortes.length * ALTURA_LINHA + MARGEM.bottom;

  const svg = criarSVG("svg", {
    viewBox: `0 0 ${LARGURA} ${altura}`,
    role: "img",
    "aria-label": rotuloAria,
  });

  const defs = criarSVG("defs");
  const padrao = criarSVG("pattern", {
    id: "hatch-cortes",
    patternUnits: "userSpaceOnUse",
    width: 6,
    height: 6,
    patternTransform: "rotate(45)",
  });
  padrao.appendChild(
    criarSVG("rect", { width: 6, height: 6, fill: "#f2f2f2" }),
  );
  padrao.appendChild(
    criarSVG("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: "#999",
      "stroke-width": 1,
    }),
  );
  defs.appendChild(padrao);
  svg.appendChild(defs);

  for (let i = 0; i < anos.length; i += 1) {
    svg.appendChild(
      criarSVG(
        "text",
        {
          x: MARGEM.left + (i + 0.5) * larguraCelula,
          y: 18,
          "text-anchor": "middle",
          "font-size": 9,
        },
        String(anos[i]),
      ),
    );
  }

  cortes.forEach(([nome, corte], j) => {
    svg.appendChild(
      criarSVG(
        "text",
        {
          x: MARGEM.left - 8,
          y: MARGEM.top + (j + 0.5) * ALTURA_LINHA + 3.5,
          "text-anchor": "end",
          "font-size": 10,
        },
        nome,
      ),
    );

    const pct = corte.percentual ?? {};
    const linhaValores = pct.valores?.[indiceCapital] ?? [];
    const referencias = pct.referencia?.[indiceCapital] ?? [];
    const fontes = pct.fonte?.[indiceCapital] ?? [];
    const naturezas = pct.natureza_celula?.[indiceCapital] ?? [];

    for (let i = 0; i < anos.length; i += 1) {
      const valor = linhaValores[i];
      const referencia = referencias[i] || "";
      const fonte = fontes[i] || "";
      const natureza = naturezas[i] || "";
      const x = MARGEM.left + i * larguraCelula + 0.5;
      const y = MARGEM.top + j * ALTURA_LINHA + 0.5;
      const largura = larguraCelula - 1;
      const alturaCelula = ALTURA_LINHA - 1;
      const preenchimento =
        valor == null
          ? "url(#hatch-cortes)"
          : corCorte((valor - min) / intervalo);

      const celula = criarSVG("rect", {
        x,
        y,
        width: largura,
        height: alturaCelula,
        rx: 2,
        fill: preenchimento,
      });

      const conteudoHtml =
        valor == null
          ? `<strong>${nome}</strong><br>${anos[i]} · sem dados`
          : `<strong>${nome}</strong><br>${anos[i]} · ${formatarPct(valor)} do salário mínimo<br>` +
            `${referencia ? `${formatarMes(referencia)} · ` : ""}${fonte}` +
            `${natureza ? ` · ${natureza}` : ""}`;

      celula.appendChild(
        criarSVG(
          "title",
          {},
          valor == null
            ? `${nome} · ${anos[i]} · sem dados`
            : `${nome} · ${anos[i]} · ${formatarPct(valor)} do salário mínimo`,
        ),
      );
      celula.addEventListener("mouseenter", (evento) =>
        mostrarTooltip(evento, conteudoHtml),
      );
      celula.addEventListener("mousemove", moverTooltip);
      celula.addEventListener("mouseleave", esconderTooltip);

      svg.appendChild(celula);
    }
  });

  container.appendChild(svg);
}

function atualizarHeatmapCortes() {
  if (!heatmapBruto) return;
  try {
    renderizarHeatmapCortes(heatmapBruto);
  } catch (erro) {
    mostrarErroCortes(`Falha ao carregar o heatmap de cortes: ${erro.message}`);
  }
}

function ligarDropdown(dropdown) {
  const id = dropdown.dataset.grafico;
  const opcoes = dropdown.querySelector(".gov-opcoes");

  opcoes.addEventListener("click", (evento) => {
    const botao = evento.target.closest(".gov-opcao");
    if (!botao) return;
    estado.governos[id] = botao.dataset.governo;
    dropdown.open = false;
    renderizarTudo();
  });

  dropdown.addEventListener("toggle", () => {
    if (!dropdown.open) return;
    for (const outro of document.querySelectorAll(".gov-dropdown[open]")) {
      if (outro !== dropdown) outro.open = false;
    }
  });
}

function alternarGoverno() {
  if (!dados) return;

  const botao = document.getElementById("adicionar-governo");
  const topo = document.querySelector(".comparacao-topo");
  const existente = document.querySelector('.gov-dropdown[data-grafico="c"]');

  if (existente) {
    existente.remove();
    topo.classList.remove("tres-governos");
    delete estado.governos.c;
    botao.textContent = "Adicionar governo";
    renderizarTudo();
    return;
  }

  const modelo = document.getElementById("modelo-gov");
  const dropdown = modelo.content.firstElementChild.cloneNode(true);
  dropdown.dataset.grafico = "c";
  dropdown
    .querySelector(".gov-resumo")
    .setAttribute("aria-label", "Selecionar governo do terceiro bloco");
  dropdown
    .querySelector(".gov-opcoes")
    .setAttribute("aria-label", "Governos do terceiro bloco");

  topo.insertBefore(
    dropdown,
    topo.querySelector('.gov-dropdown[data-grafico="a"]'),
  );
  topo.classList.add("tres-governos");
  botao.textContent = "Remover";

  ligarDropdown(dropdown);
  renderizarTudo();
}

function ligarInteracoes() {
  document.getElementById("capital").addEventListener("change", (evento) => {
    estado.capital = evento.target.value;
    renderizarTudo();
  });

  document.getElementById("corte").addEventListener("change", (evento) => {
    estado.corte = evento.target.value;
    renderizarTudo();
  });

  document
    .getElementById("cidade-heatmap")
    .addEventListener("change", (evento) => {
      estado.heatmapCapital = evento.target.value;
      atualizarHeatmapCortes();
    });

  for (const dropdown of document.querySelectorAll(
    ".gov-dropdown[data-grafico]",
  )) {
    ligarDropdown(dropdown);
  }

  document
    .getElementById("adicionar-governo")
    .addEventListener("click", alternarGoverno);

  const infoCarne = document.getElementById("info-carne");
  const mostrarInfoCarne = (evento) => {
    mostrarTooltip(evento, TEXTO_INFO_CARNE, "tooltip-info");
  };
  const mostrarInfoCarneNoElemento = () => {
    const caixa = infoCarne.getBoundingClientRect();
    mostrarInfoCarne({ clientX: caixa.left, clientY: caixa.bottom });
  };
  infoCarne.addEventListener("mouseenter", mostrarInfoCarne);
  infoCarne.addEventListener("mousemove", moverTooltip);
  infoCarne.addEventListener("mouseleave", esconderTooltip);
  infoCarne.addEventListener("focus", mostrarInfoCarneNoElemento);
  infoCarne.addEventListener("blur", esconderTooltip);
  infoCarne.addEventListener("click", mostrarInfoCarneNoElemento);

  document.addEventListener("click", (evento) => {
    for (const dropdown of document.querySelectorAll(".gov-dropdown[open]")) {
      if (!dropdown.contains(evento.target)) dropdown.open = false;
    }
    if (!infoCarne.contains(evento.target)) esconderTooltip();
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;
    for (const dropdown of document.querySelectorAll(".gov-dropdown[open]")) {
      dropdown.open = false;
    }
    esconderTooltip();
  });

  let timerRedimensionar = null;
  window.addEventListener("resize", () => {
    clearTimeout(timerRedimensionar);
    timerRedimensionar = setTimeout(() => {
      if (dados) renderizarTudo();
    }, 120);
  });
}

async function carregar() {
  try {
    const heatmap = await buscarJson(URL_HEATMAP);
    heatmapBruto = heatmap;
    dados = prepararDados(heatmap);
    montarSeletorCapital();
    montarSeletorCorte();
    montarSeletorCidadeHeatmap();
    document.getElementById("adicionar-governo").disabled = false;
    renderizarTudo();
    atualizarHeatmapCortes();
  } catch (erro) {
    mostrarErroGraficos(
      `Não foi possível carregar os dados: ${erro.message}`,
    );
    mostrarErroCortes(
      `Falha ao carregar o heatmap de cortes: ${erro.message}`,
    );
  }

  carregarNotas();
}

ligarInteracoes();
carregar();
