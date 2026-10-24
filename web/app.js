// Frontend estatico: heatmap estados x anos.
// Le apenas os dados compilados (JSON) — nenhum backend.
//
// Arquitetura: o grid e montado UMA vez (todos os governos/anos/estados) e os
// filtros apenas mostram/escondem com CSS (classe .oculto) + repintam a escala.

import { GOVERNOS } from "./governos.js";

const BASE = "./dados";

// Rampa ciano (mais barato) -> azuis escuros -> preto (mais caro).
const PARADAS = [
  [0.0, [0, 255, 255]],
  [0.2, [0, 200, 235]],
  [0.4, [0, 130, 200]],
  [0.6, [0, 70, 140]],
  [0.8, [5, 30, 75]],
  [1.0, [0, 0, 0]],
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

function formatarBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Moedas por epoca (para formatar o valor nominal da epoca).
const MOEDAS = [
  { de: "1980-01", ate: "1986-02", simbolo: "Cr$", dec: 0 },
  { de: "1986-03", ate: "1989-01", simbolo: "Cz$", dec: 2 },
  { de: "1989-02", ate: "1990-03", simbolo: "NCz$", dec: 2 },
  { de: "1990-04", ate: "1993-07", simbolo: "Cr$", dec: 0 },
  { de: "1993-08", ate: "1994-06", simbolo: "CR$", dec: 0 },
  { de: "1994-07", ate: "2099-12", simbolo: "R$", dec: 2 },
];

function moedaDeData(data) {
  const anoMes = String(data).slice(0, 7);
  for (const m of MOEDAS) {
    if (anoMes >= m.de && anoMes <= m.ate) return m;
  }
  return MOEDAS[MOEDAS.length - 1];
}

function formatarNominal(valor, data) {
  const m = moedaDeData(data);
  const n = Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: m.dec,
    maximumFractionDigits: m.dec,
  });
  return `${m.simbolo} ${n}`;
}

function formatarData(data) {
  const [a, mes, dia] = String(data).split("-");
  return `${dia}/${mes}/${a}`;
}

function urlSefaz(chave) {
  return `https://www.nfce.fazenda.gov.br/portal/consulta?chave=${encodeURIComponent(chave)}`;
}

// Regioes (IBGE) na ordem em que devem aparecer no eixo Y.
const REGIOES = [
  { nome: "NORTE", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
  { nome: "NORDESTE", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { nome: "CENTRO-OESTE", ufs: ["DF", "GO", "MS", "MT"] },
  { nome: "SUDESTE", ufs: ["ES", "MG", "RJ", "SP"] },
  { nome: "SUL", ufs: ["PR", "RS", "SC"] },
];

// Faixa completa de dados e janela padrao.
const ANO_MIN = 1980;
const ANO_MAX = 2026;
const JANELA_DE = 1990;
const JANELA_ATE = 2026;
const GOVERNOS_PADRAO = GOVERNOS.filter((g) => g.ate >= JANELA_DE && g.de <= JANELA_ATE);
const UFS_TODAS = REGIOES.flatMap((r) => r.ufs);

function governoDoAno(ano) {
  for (const gov of GOVERNOS) {
    if (ano >= gov.de && ano <= gov.ate) return gov;
  }
  return null;
}

async function buscarJson(caminho) {
  const resp = await fetch(caminho, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${resp.status} ao buscar ${caminho}`);
  return resp.json();
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

function nomeTransicao(prefixo, valor) {
  return `${prefixo}-${String(valor).replace(/[^A-Za-z0-9]/g, "")}`;
}

function larguraGrupo(quantidadeAnos) {
  return `calc(${quantidadeAnos} * var(--celula) + ${quantidadeAnos - 1} * var(--gap-celula))`;
}

// Estado dos filtros (mutavel).
const estadoFiltros = {
  anoDe: JANELA_DE,
  anoAte: JANELA_ATE,
  governos: new Set(GOVERNOS_PADRAO.map((g) => g.nome)),
  estados: new Set(UFS_TODAS),
};

async function main() {
  const container = document.getElementById("heatmap");
  const vazioEl = document.getElementById("vazio");
  const nota = document.getElementById("nota");

  let base;
  let estados;
  let estabelecimentos;
  let meta = null;

  try {
    base = await buscarJson(`${BASE}/base.json`);
    estados = base.estados;
    estabelecimentos = base.estabelecimentos;
    meta = { origem: base.origem, contagens: base.contagens };
  } catch (erro) {
    container.textContent = `Nao foi possivel carregar os dados: ${erro.message}`;
    return;
  }

  // Titulo: o rotulo do produto vem dos dados.
  const produto = base.produto;
  if (produto) {
    const rotulo =
      produto.rotulo ||
      `1${produto.unidadeBase || ""} DE ${produto.nome || ""}`.trim();
    document.getElementById("produto").textContent = rotulo;
  }

  const estadoPorUf = new Map(estados.map((e) => [e.uf, e]));
  const estabPorId = new Map(
    Object.entries(estabelecimentos || {}).map(([id, nome]) => [Number(id), nome]),
  );
  const porEstadoAno = new Map();
  const porEstadoNominal = new Map();
  const porEstadoN = new Map();
  const anos = base.anos;
  for (const estado of estados) {
    for (let i = 0; i < anos.length; i++) {
      const valor = estado.valores?.[i];
      if (!valor) continue;
      const chave = `${estado.id}:${anos[i]}`;
      porEstadoAno.set(chave, valor[0] / 100);
      porEstadoNominal.set(chave, valor[1] / 100);
      porEstadoN.set(chave, valor[2]);
    }
  }

  document.getElementById("legBarra").style.background = gradienteCss();

  // Escala atual (para colorir o histograma do popup).
  let escalaMin = 0;
  let escalaAmp = 1;

  // --- popup da celula (hover) -----------------------------------------

  const cacheResumos = new Map();

  async function obterResumo(uf) {
    if (cacheResumos.has(uf)) return cacheResumos.get(uf);
    const dados = await buscarJson(`${BASE}/estados/${uf}.json`);
    cacheResumos.set(uf, dados);
    return dados;
  }

  const popup = el("div", "popup oculto");
  const popupTopo = el("div", "popup-topo");
  const popupTitulo = el("div", "popup-titulo");
  const popupBtnFechar = el("button", "popup-fechar", "×");
  popupBtnFechar.type = "button";
  popupBtnFechar.title = "Fechar";
  popupTopo.appendChild(popupTitulo);
  popupTopo.appendChild(popupBtnFechar);
  const popupValores = el("div", "popup-valores");
  const popupHist = document.createElement("canvas");
  popupHist.width = 336;
  popupHist.height = 72;
  popupHist.className = "popup-hist";
  const popupRange = document.createElement("input");
  popupRange.type = "range";
  popupRange.className = "popup-range";
  const popupLista = el("div", "popup-lista");
  const popupFolha = el("div", "popup-folha");
  const popupPgInfo = el("span", "popup-pg-info");

  popupFolha.appendChild(popupPgInfo);
  popup.appendChild(popupTopo);
  popup.appendChild(popupValores);
  popup.appendChild(popupHist);
  popup.appendChild(popupRange);
  popup.appendChild(popupLista);
  popup.appendChild(popupFolha);
  document.body.appendChild(popup);

  let popupAberta = false;
  let popupCelula = null;
  let popupBins = [];
  let popupBin = 0;
  let popupFecharTimer = null;
  let popupFixado = false;
  let celulaFixada = null;

  function posicionarPopup(celula) {
    const r = celula.getBoundingClientRect();
    const largura = popup.offsetWidth || 360;
    const altura = popup.offsetHeight || 340;
    let left = r.left + r.width / 2 - largura / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - largura - 8));
    let top = r.bottom + 8;
    if (top + altura > window.innerHeight - 8) top = Math.max(8, r.top - altura - 8);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function desenharHistograma() {
    const ctx = popupHist.getContext("2d");
    const W = popupHist.width;
    const H = popupHist.height;
    ctx.clearRect(0, 0, W, H);
    if (!popupBins.length) return;
    const maxCount = Math.max(...popupBins.map((b) => b.total), 1);
    const bw = W / popupBins.length;
    for (let i = 0; i < popupBins.length; i++) {
      const bin = popupBins[i];
      const centro = (bin.de + bin.ate) / 2;
      const t = (centro - escalaMin) / (escalaAmp || 1);
      ctx.fillStyle = corDaEscala(t);
      const h = (bin.total / maxCount) * (H - 6);
      ctx.fillRect(i * bw + 1, H - h - 1, Math.max(1, bw - 2), h);
    }
    ctx.strokeStyle = "#1c2230";
    ctx.lineWidth = 2;
    ctx.strokeRect(popupBin * bw + 1, 0.5, Math.max(1, bw - 2), H - 1);
  }

  function renderizarLista() {
    const bin = popupBins[popupBin];
    const notas = bin ? bin.notas : [];
    const total = bin ? bin.total : 0;

    popupLista.innerHTML = "";
    if (!total) {
      popupLista.appendChild(el("p", "popup-vazio", "Nenhuma nota nessa faixa."));
    } else if (!notas.length) {
      popupLista.appendChild(el("p", "popup-vazio", "Sem exemplos nesta faixa."));
    } else {
      for (const nota of notas) {
        const [precoReal, precoNominal, data, chave, estabId] = nota;
        const nomeEstab = estabPorId.get(estabId);
        const linha = el("div", "popup-nota");
        const info = el("div", "popup-nota-info");
        info.appendChild(el("span", "popup-nota-data", formatarData(data)));
        info.appendChild(el("span", "popup-nota-estab", nomeEstab || `#${estabId}`));
        info.appendChild(
          el(
            "span",
            "popup-nota-preco",
            `${formatarBRL(precoReal)} • ${formatarNominal(precoNominal, data)}`,
          ),
        );
        const link = document.createElement("a");
        link.className = "popup-nota-link";
        link.href = urlSefaz(chave);
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "SEFAZ";
        linha.appendChild(info);
        linha.appendChild(link);
        popupLista.appendChild(linha);
      }
    }

    if (!total) {
      popupPgInfo.textContent = "";
    } else {
      popupPgInfo.textContent = `Exibindo ${notas.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} nota(s) nesta faixa`;
    }
  }

  function montarBins(dadosAno) {
    popupRange.value = "0";
    popupBin = 0;
    if (!dadosAno) {
      popupBins = [];
      popupRange.max = "0";
      popupHist.getContext("2d").clearRect(0, 0, popupHist.width, popupHist.height);
      return;
    }

    const [, minCentavos, maxCentavos, contagens, amostras] = dadosAno;
    const min = minCentavos / 100;
    const max = maxCentavos / 100;
    const passo = (max - min) / (contagens.length || 1) || 1;

    popupBins = contagens.map((total, i) => ({
      de: min + i * passo,
      ate: min + (i + 1) * passo,
      total,
      notas: (amostras[i] || []).map((nota) => [
        nota[0] / 100,
        nota[1] / 100,
        nota[2],
        nota[3],
        nota[4],
      ]),
    }));

    popupRange.max = String(Math.max(0, popupBins.length - 1));
    desenharHistograma();
  }

  async function abrirPopup(estado, ano, celula) {
    clearTimeout(popupFecharTimer);
    popupAberta = true;
    popupCelula = { estado, ano };
    popupBins = [];
    popupBin = 0;

    const chave = `${estado.id}:${ano}`;
    const real = porEstadoAno.get(chave);
    const nominal = porEstadoNominal.get(chave);
    const n = porEstadoN.get(chave) || 0;

    popupTitulo.textContent = `${estado.nome} • ${ano}`;
    popupValores.innerHTML = "";

    const precoPrincipal = el("div", "popup-preco-principal");
    precoPrincipal.appendChild(el("span", "popup-preco-rotulo", "Preço corrigido"));
    precoPrincipal.appendChild(
      el("strong", "popup-preco-valor", real != null ? formatarBRL(real) : "—"),
    );
    precoPrincipal.appendChild(el("span", "popup-preco-obs", "mediana em reais de 2026"));
    popupValores.appendChild(precoPrincipal);

    const precoSecundario = el("div", "popup-preco-secundario");
    precoSecundario.appendChild(
      el(
        "span",
        "popup-val-item",
        `Na época: ${nominal != null ? formatarNominal(nominal, `${ano}-07-01`) : "—"}`,
      ),
    );
    precoSecundario.appendChild(el("span", "popup-val-notas", `${n} nota(s)`));
    popupValores.appendChild(precoSecundario);

    popupLista.innerHTML = "";
    popupLista.appendChild(el("p", "popup-vazio", "Carregando notas…"));
    popupPgInfo.textContent = "";
    popupHist.getContext("2d").clearRect(0, 0, popupHist.width, popupHist.height);

    popup.classList.remove("oculto");
    posicionarPopup(celula);

    let resumo;
    try {
      resumo = await obterResumo(estado.uf);
    } catch {
      if (popupAberta) popupLista.innerHTML = "<p class='popup-vazio'>Falha ao carregar.</p>";
      return;
    }
    if (!popupAberta || !popupCelula || popupCelula.ano !== ano || popupCelula.estado !== estado) {
      return;
    }

    const dadosAno = (resumo.anos || []).find((linha) => linha[0] === ano);
    if (!dadosAno) {
      montarBins(null);
      popupLista.innerHTML = "<p class='popup-vazio'>Sem notas para este ano.</p>";
      popupPgInfo.textContent = "";
      return;
    }

    montarBins(dadosAno);
    renderizarLista();
    posicionarPopup(celula);
  }

  function fecharPopup() {
    clearTimeout(popupFecharTimer);
    popupAberta = false;
    popupCelula = null;
    popupFixado = false;
    if (celulaFixada) {
      celulaFixada.classList.remove("celula-fixada");
      celulaFixada = null;
    }
    popup.classList.remove("popup-fixado");
    popup.classList.add("oculto");
  }

  function fixarPopup(estado, ano, celula) {
    popupFixado = true;
    if (celulaFixada && celulaFixada !== celula) {
      celulaFixada.classList.remove("celula-fixada");
    }
    celulaFixada = celula;
    celula.classList.add("celula-fixada");
    popup.classList.add("popup-fixado");
    abrirPopup(estado, ano, celula);
  }

  function agendarFechar() {
    clearTimeout(popupFecharTimer);
    popupFecharTimer = setTimeout(fecharPopup, 220);
  }

  popupRange.addEventListener("input", () => {
    popupBin = Number(popupRange.value);
    desenharHistograma();
    renderizarLista();
  });
  popup.addEventListener("mouseenter", () => clearTimeout(popupFecharTimer));
  popup.addEventListener("mouseleave", () => {
    if (!popupFixado) agendarFechar();
  });

  popupBtnFechar.addEventListener("click", () => fecharPopup());

  let celulaHover = null;
  container.addEventListener("mouseover", (evento) => {
    if (popupFixado) return;
    const celula = evento.target.closest(".hm-celula");
    if (!celula || celula === celulaHover) return;
    celulaHover = celula;
    if (celula.classList.contains("oculto") || celula.classList.contains("sem-dados")) return;
    const estado = estadoPorUf.get(celula.dataset.uf);
    if (estado) abrirPopup(estado, Number(celula.dataset.ano), celula);
  });
  container.addEventListener("mouseout", (evento) => {
    if (popupFixado) return;
    const celula = evento.target.closest(".hm-celula");
    if (!celula) return;
    if (celulaHover === celula) celulaHover = null;
    agendarFechar();
  });
  container.addEventListener("click", (evento) => {
    const celula = evento.target.closest(".hm-celula");
    if (!celula) return;
    if (celulaFixada === celula) {
      fecharPopup();
      return;
    }
    if (celula.classList.contains("oculto") || celula.classList.contains("sem-dados")) return;
    const estado = estadoPorUf.get(celula.dataset.uf);
    if (estado) fixarPopup(estado, Number(celula.dataset.ano), celula);
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fecharPopup();
  });
  document.addEventListener("click", (evento) => {
    if (!popupFixado) return;
    if (popup.contains(evento.target)) return;
    if (evento.target.closest(".hm-celula")) return;
    fecharPopup();
  });

  // --- montagem unica do grid ------------------------------------------

  const rotuloPorGov = new Map();
  const mediaPorGov = new Map();

  function montarHeatmap() {
    const fragment = document.createDocumentFragment();

    // Linha 1: nomes dos governos
    const linhaGovernos = el("div", "hm-row");
    linhaGovernos.appendChild(el("div", "hm-canto hm-canto-gov", ""));
    for (const gov of GOVERNOS) {
      const rotulo = el("div", "hm-grupo-rotulo", gov.nome);
      rotulo.dataset.gov = gov.nome;
      rotulo.style.viewTransitionName = nomeTransicao("g", gov.nome);
      rotulo.addEventListener("mouseenter", () => ativarGoverno(gov.nome, true));
      rotulo.addEventListener("mouseleave", () => ativarGoverno(gov.nome, false));
      rotuloPorGov.set(gov.nome, rotulo);
      linhaGovernos.appendChild(rotulo);
    }
    fragment.appendChild(linhaGovernos);

    // Linha 2: mediana de todas as notas de cada governo
    const linhaMedianas = el("div", "hm-row hm-row-mediana");
    const cantoMediana = el("div", "hm-canto hm-canto-mediana", "MEDIANA");
    cantoMediana.title = "Mediana de todas as notas de cada governo";
    linhaMedianas.appendChild(cantoMediana);
    for (const gov of GOVERNOS) {
      const grupo = el("div", "hm-grupo hm-grupo-mediana");
      grupo.dataset.gov = gov.nome;
      grupo.style.width = larguraGrupo(gov.ate - gov.de + 1);

      const info = base.governos?.[gov.nome];
      const valor =
        info?.medianaCentavos != null ? formatarBRL(info.medianaCentavos / 100) : "—";

      const media = el("div", "hm-media");
      media.dataset.valor = valor;
      media.setAttribute(
        "aria-label",
        info?.nNotas
          ? `Mediana de ${info.nNotas.toLocaleString("pt-BR")} notas do governo ${gov.nome}`
          : `Sem notas no governo ${gov.nome}`,
      );
      media.appendChild(el("span", "hm-media-valor", valor));

      grupo.appendChild(media);
      linhaMedianas.appendChild(grupo);
      mediaPorGov.set(gov.nome, { grupo, media });
    }
    fragment.appendChild(linhaMedianas);

    // Linha 3: anos
    const linhaAnos = el("div", "hm-row");
    linhaAnos.appendChild(el("div", "hm-canto", "UF/ANO"));
    for (const gov of GOVERNOS) {
      const bloco = el("div", "hm-grupo");
      bloco.dataset.gov = gov.nome;
      for (let ano = gov.de; ano <= gov.ate; ano++) {
        const celulaAno = el("div", "hm-ano", String(ano));
        celulaAno.dataset.ano = String(ano);
        celulaAno.style.viewTransitionName = nomeTransicao("a", ano);
        bloco.appendChild(celulaAno);
      }
      linhaAnos.appendChild(bloco);
    }
    fragment.appendChild(linhaAnos);

    // Regioes -> estados -> anos
    for (const regiao of REGIOES) {
      const blocoRegiao = el("div", "regiao-bloco");
      blocoRegiao.dataset.regiao = regiao.nome;

      const nome = el("div", "regiao-nome");
      nome.style.viewTransitionName = nomeTransicao("r", regiao.nome);
      nome.appendChild(el("span", "regiao-nome-texto", regiao.nome));
      nome.addEventListener("mouseenter", () => blocoRegiao.classList.add("regiao-ativa"));
      nome.addEventListener("mouseleave", () => blocoRegiao.classList.remove("regiao-ativa"));
      blocoRegiao.appendChild(nome);

      const linhas = el("div", "regiao-linhas");
      for (const uf of regiao.ufs) {
        const estado = estadoPorUf.get(uf);
        if (!estado) continue;

        const linha = el("div", "hm-row");
        linha.dataset.uf = uf;

        const rotuloEstado = el("div", "hm-estado", uf);
        rotuloEstado.style.viewTransitionName = nomeTransicao("e", uf);
        rotuloEstado.addEventListener("mouseenter", () => linha.classList.add("estado-ativo"));
        rotuloEstado.addEventListener("mouseleave", () => linha.classList.remove("estado-ativo"));
        linha.appendChild(rotuloEstado);

        for (const gov of GOVERNOS) {
          const bloco = el("div", "hm-grupo");
          bloco.dataset.gov = gov.nome;
          for (let ano = gov.de; ano <= gov.ate; ano++) {
            const celula = el("div", "hm-celula");
            celula.dataset.ano = String(ano);
            celula.dataset.gov = gov.nome;
            celula.dataset.uf = uf;
            bloco.appendChild(celula);
          }
          linha.appendChild(bloco);
        }

        linhas.appendChild(linha);
      }

      blocoRegiao.appendChild(linhas);
      fragment.appendChild(blocoRegiao);
    }

    container.innerHTML = "";
    container.appendChild(fragment);
  }

  // --- interacoes de hover ---------------------------------------------

  function ativarGoverno(nome, ativo) {
    const seletor =
      `.hm-grupo[data-gov="${nome}"], .hm-grupo-rotulo[data-gov="${nome}"]`;
    for (const elemento of container.querySelectorAll(seletor)) {
      elemento.classList.toggle("gov-ativo", ativo);
    }
  }

  function atualizarMedianasEstreitas() {
    for (const { media } of mediaPorGov.values()) {
      media.classList.toggle("media-estreita", media.scrollWidth > media.clientWidth + 1);
    }
  }

  // --- filtros: apenas mostrar/esconder + repintar ---------------------

  function aplicarFiltros() {
    fecharPopup();

    const anosVisiveis = new Set();
    for (let ano = estadoFiltros.anoDe; ano <= estadoFiltros.anoAte; ano++) {
      const gov = governoDoAno(ano);
      if (gov && estadoFiltros.governos.has(gov.nome)) anosVisiveis.add(ano);
    }

    const anosPorGov = new Map();
    for (const gov of GOVERNOS) {
      let n = 0;
      for (const ano of anosVisiveis) if (ano >= gov.de && ano <= gov.ate) n++;
      anosPorGov.set(gov.nome, n);
    }

    // Escala de cor conforme o conjunto VISIVEL.
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const uf of estadoFiltros.estados) {
      const estado = estadoPorUf.get(uf);
      if (!estado) continue;
      for (const ano of anosVisiveis) {
        const preco = porEstadoAno.get(`${estado.id}:${ano}`);
        if (preco == null) continue;
        if (preco < minimo) minimo = preco;
        if (preco > maximo) maximo = preco;
      }
    }
    if (!Number.isFinite(minimo) || !Number.isFinite(maximo)) {
      minimo = 0;
      maximo = 1;
    }
    const amplitude = maximo - minimo || 1;
    escalaMin = minimo;
    escalaAmp = amplitude;

    // Governos sem nenhum ano visivel somem por completo.
    for (const gov of GOVERNOS) {
      const visivel = anosPorGov.get(gov.nome) > 0;
      const seletor = `.hm-grupo[data-gov="${gov.nome}"]`;
      for (const bloco of container.querySelectorAll(seletor)) {
        bloco.classList.toggle("oculto", !visivel);
      }
      const rotulo = rotuloPorGov.get(gov.nome);
      rotulo.classList.toggle("oculto", !visivel);
      const mediaGov = mediaPorGov.get(gov.nome);
      if (visivel) {
        const largura = larguraGrupo(anosPorGov.get(gov.nome));
        rotulo.style.width = largura;
        if (mediaGov) mediaGov.grupo.style.width = largura;
      }
    }

    // Celulas: visibilidade + repintura da escala.
    let celulasComDados = 0;
    const estadosVisiveis = new Set();
    for (const celula of container.querySelectorAll(".hm-celula")) {
      const uf = celula.dataset.uf;
      const ano = Number(celula.dataset.ano);
      const visivel =
        estadoFiltros.estados.has(uf) &&
        anosVisiveis.has(ano) &&
        anosPorGov.get(celula.dataset.gov) > 0;

      celula.classList.toggle("oculto", !visivel);
      if (!visivel) continue;

      estadosVisiveis.add(uf);
      const estado = estadoPorUf.get(uf);
      const preco = porEstadoAno.get(`${estado.id}:${ano}`);

      if (preco == null) {
        celula.classList.add("sem-dados");
        celula.style.background = "";
        celula.setAttribute("aria-label", `${estado.nome} • ${ano} • sem dados`);
      } else {
        celulasComDados++;
        celula.classList.remove("sem-dados");
        celula.style.background = corDaEscala((preco - minimo) / amplitude);
        celula.setAttribute("aria-label", `${estado.nome} • ${ano} • ${formatarBRL(preco)}`);
      }
    }

    // Celulas de ano.
    for (const celulaAno of container.querySelectorAll(".hm-ano")) {
      const ano = Number(celulaAno.dataset.ano);
      celulaAno.classList.toggle("oculto", !anosVisiveis.has(ano));
    }

    // Linhas por estado e blocos de regiao.
    for (const linha of container.querySelectorAll(".hm-row[data-uf]")) {
      linha.classList.toggle("oculto", !estadoFiltros.estados.has(linha.dataset.uf));
    }

    const regioesVisiveis = [];
    for (const bloco of container.querySelectorAll(".regiao-bloco")) {
      const temVisivel = [...bloco.querySelectorAll(".hm-row[data-uf]")].some(
        (l) => !l.classList.contains("oculto"),
      );
      bloco.classList.toggle("oculto", !temVisivel);
      if (temVisivel) regioesVisiveis.push(bloco);
    }
    for (const bloco of container.querySelectorAll(".regiao-bloco")) {
      bloco.classList.remove("regiao-primeira", "regiao-ultima");
    }
    if (regioesVisiveis.length) {
      regioesVisiveis[0].classList.add("regiao-primeira");
      regioesVisiveis[regioesVisiveis.length - 1].classList.add("regiao-ultima");
    }

    // Bordas de hover dos governos (primeiro/ultimo visivel).
    for (const elemento of container.querySelectorAll(".gov-primeiro, .gov-ultimo")) {
      elemento.classList.remove("gov-primeiro", "gov-ultimo");
    }
    const governosVisiveis = GOVERNOS.filter((g) => anosPorGov.get(g.nome) > 0);
    if (governosVisiveis.length) {
      const primeiro = governosVisiveis[0].nome;
      const ultimo = governosVisiveis[governosVisiveis.length - 1].nome;
      const selPrimeiro = `.hm-grupo[data-gov="${primeiro}"], .hm-grupo-rotulo[data-gov="${primeiro}"]`;
      const selUltimo = `.hm-grupo[data-gov="${ultimo}"], .hm-grupo-rotulo[data-gov="${ultimo}"]`;
      for (const elemento of container.querySelectorAll(selPrimeiro)) {
        elemento.classList.add("gov-primeiro");
      }
      for (const elemento of container.querySelectorAll(selUltimo)) {
        elemento.classList.add("gov-ultimo");
      }
    }

    // Estado vazio.
    const nada = !anosVisiveis.size || !estadoFiltros.estados.size;
    container.classList.toggle("oculto", nada);
    vazioEl.classList.toggle("oculto", !nada);
    if (nada) {
      vazioEl.textContent = !anosVisiveis.size
        ? "Nenhum governo selecionado na janela temporal."
        : "Nenhum estado selecionado.";
      nota.textContent = "";
      return;
    }

    nota.textContent =
      `${celulasComDados.toLocaleString("pt-BR")} células com dados • ` +
      `${anosVisiveis.size} anos × ${estadosVisiveis.size} estados • ` +
      `mediana real (R$ 2026)` +
      (meta && meta.origem ? ` • origem: ${meta.origem}` : "");

    requestAnimationFrame(atualizarMedianasEstreitas);
  }

  // --- filtros UI ------------------------------------------------------

  const selDe = document.getElementById("filtroDe");
  const selAte = document.getElementById("filtroAte");
  const painelGovernos = document.getElementById("painelGovernos");
  const painelEstados = document.getElementById("painelEstados");

  let transicao = null;

  function aplicarComAnimacao() {
    if (typeof document.startViewTransition !== "function") {
      aplicarFiltros();
      return;
    }
    if (transicao) transicao.skipTransition();
    const t = document.startViewTransition(() => aplicarFiltros());
    transicao = t;
    t.finished.finally(() => {
      if (transicao === t) transicao = null;
    });
  }

  for (let ano = ANO_MIN; ano <= ANO_MAX; ano++) {
    selDe.add(new Option(ano, ano));
    selAte.add(new Option(ano, ano));
  }
  selDe.value = estadoFiltros.anoDe;
  selAte.value = estadoFiltros.anoAte;

  selDe.addEventListener("change", () => {
    let de = Number(selDe.value);
    let ate = Number(selAte.value);
    if (de > ate) {
      ate = de;
      selAte.value = ate;
    }
    estadoFiltros.anoDe = de;
    estadoFiltros.anoAte = ate;
    aplicarComAnimacao();
  });

  selAte.addEventListener("change", () => {
    let de = Number(selDe.value);
    let ate = Number(selAte.value);
    if (ate < de) {
      de = ate;
      selDe.value = de;
    }
    estadoFiltros.anoDe = de;
    estadoFiltros.anoAte = ate;
    aplicarComAnimacao();
  });

  function ajustarJanelaAosGovernos() {
    const marcados = GOVERNOS.filter((g) => estadoFiltros.governos.has(g.nome));
    if (!marcados.length) return;
    estadoFiltros.anoDe = Math.min(...marcados.map((g) => g.de));
    estadoFiltros.anoAte = Math.max(...marcados.map((g) => g.ate));
    selDe.value = estadoFiltros.anoDe;
    selAte.value = estadoFiltros.anoAte;
  }

  for (const gov of GOVERNOS) {
    const label = el("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = estadoFiltros.governos.has(gov.nome);
    cb.dataset.governo = gov.nome;
    cb.addEventListener("change", () => {
      if (cb.checked) estadoFiltros.governos.add(gov.nome);
      else estadoFiltros.governos.delete(gov.nome);
      ajustarJanelaAosGovernos();
      aplicarComAnimacao();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(gov.nome));
    painelGovernos.appendChild(label);
  }

  const checkboxesEstado = new Map();
  const checkboxesRegiao = new Map();

  function atualizarCheckboxesEstados() {
    for (const [uf, cb] of checkboxesEstado) {
      cb.checked = estadoFiltros.estados.has(uf);
    }
    for (const regiao of REGIOES) {
      const cb = checkboxesRegiao.get(regiao.nome);
      const total = regiao.ufs.length;
      const marcados = regiao.ufs.filter((uf) => estadoFiltros.estados.has(uf)).length;
      cb.checked = marcados === total;
      cb.indeterminate = marcados > 0 && marcados < total;
    }
  }

  for (const regiao of REGIOES) {
    const cabecalho = el("label", "menu-regiao");
    const cbRegiao = document.createElement("input");
    cbRegiao.type = "checkbox";
    cbRegiao.dataset.regiao = regiao.nome;
    cbRegiao.addEventListener("change", () => {
      for (const uf of regiao.ufs) {
        if (cbRegiao.checked) estadoFiltros.estados.add(uf);
        else estadoFiltros.estados.delete(uf);
      }
      atualizarCheckboxesEstados();
      aplicarComAnimacao();
    });
    cabecalho.appendChild(cbRegiao);
    cabecalho.appendChild(document.createTextNode(regiao.nome));
    painelEstados.appendChild(cabecalho);

    const lista = el("div", "menu-estados-lista");
    for (const uf of regiao.ufs) {
      const label = el("label", "menu-estado");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.uf = uf;
      cb.addEventListener("change", () => {
        if (cb.checked) estadoFiltros.estados.add(uf);
        else estadoFiltros.estados.delete(uf);
        atualizarCheckboxesEstados();
        aplicarComAnimacao();
      });
      checkboxesEstado.set(uf, cb);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(uf));
      lista.appendChild(label);
    }
    checkboxesRegiao.set(regiao.nome, cbRegiao);
    painelEstados.appendChild(lista);
  }

  document.getElementById("limparFiltros").addEventListener("click", () => {
    estadoFiltros.anoDe = JANELA_DE;
    estadoFiltros.anoAte = JANELA_ATE;
    estadoFiltros.governos = new Set(GOVERNOS_PADRAO.map((g) => g.nome));
    estadoFiltros.estados = new Set(UFS_TODAS);

    selDe.value = JANELA_DE;
    selAte.value = JANELA_ATE;
    for (const cb of painelGovernos.querySelectorAll("input[data-governo]")) {
      cb.checked = estadoFiltros.governos.has(cb.dataset.governo);
    }
    atualizarCheckboxesEstados();
    aplicarComAnimacao();
  });

  document.addEventListener("click", (evento) => {
    for (const menu of document.querySelectorAll(".filtro-menu[open]")) {
      if (!menu.contains(evento.target)) menu.removeAttribute("open");
    }
  });

  window.addEventListener("resize", () => requestAnimationFrame(atualizarMedianasEstreitas));

  // --- inicio ----------------------------------------------------------

  montarHeatmap();
  atualizarCheckboxesEstados();
  aplicarFiltros();
}

main();
