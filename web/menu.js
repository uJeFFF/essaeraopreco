// Menu lateral compartilhado por todas as paginas do site.
// Monta a aba fixa da borda esquerda e os links para os graficos. Os hrefs
// sao resolvidos a partir deste arquivo (import.meta.url), entao funcionam
// tanto na raiz quanto nas subpastas, no servidor local e na Vercel.
//
// O /05/ e uma copia exata do /03/ e fica fora do menu de proposito.

const ITENS = [
  { id: "01", rotulo: "Heatmap estado × ano", href: new URL("01/", import.meta.url) },
  { id: "02", rotulo: "Streamgraph UF × ano", href: new URL("02/", import.meta.url) },
  { id: "03", rotulo: "Heatmap UF × ano", href: new URL("03/", import.meta.url) },
  { id: "04", rotulo: "Barras + linhas", href: new URL("04/", import.meta.url) },
  { id: "06", rotulo: "Regiões", href: new URL("06/", import.meta.url) },
  { id: "07", rotulo: "Bolhas por UF", href: new URL("07/", import.meta.url) },
  { id: "08", rotulo: "Radial UF × ano", href: new URL("08/", import.meta.url) },
  { id: "09", rotulo: "Heatmap capitais × ano", href: new URL("09/", import.meta.url) },
];

/** Normaliza a URL para comparar a pagina atual com os itens do menu. */
function caminhoNormalizado(url) {
  const caminho = new URL(url, import.meta.url).pathname.replace(
    /index\.html$/,
    "",
  );
  return caminho.endsWith("/") ? caminho : `${caminho}/`;
}

const atual = caminhoNormalizado(window.location.href);

function montarMenu() {
  if (document.querySelector(".menu-lateral")) return;

  const menu = document.createElement("div");
  menu.className = "menu-lateral";

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "menu-aba";
  botao.setAttribute("aria-label", "Abrir menu de gráficos");
  botao.setAttribute("aria-expanded", "false");
  botao.setAttribute("aria-controls", "menu-graficos");
  botao.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" />' +
    '<rect x="6.5" y="5" width="3" height="9" rx="1" fill="currentColor" />' +
    '<rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" />' +
    "</svg>";

  const painel = document.createElement("nav");
  painel.className = "menu-painel";
  painel.id = "menu-graficos";
  painel.setAttribute("aria-label", "Gráficos");

  const titulo = document.createElement("p");
  titulo.className = "menu-titulo";
  titulo.textContent = "GRÁFICOS";
  painel.appendChild(titulo);

  const lista = document.createElement("ul");
  lista.className = "menu-lista";

  for (const item of ITENS) {
    const entrada = document.createElement("li");
    const link = document.createElement("a");
    link.className = "menu-item";
    link.href = item.href.href;

    if (caminhoNormalizado(item.href) === atual) {
      link.setAttribute("aria-current", "page");
    }

    const numero = document.createElement("span");
    numero.className = "menu-num";
    numero.textContent = item.id;

    const nome = document.createElement("span");
    nome.className = "menu-nome";
    nome.textContent = item.rotulo;

    link.append(numero, nome);
    entrada.appendChild(link);
    lista.appendChild(entrada);
  }

  painel.appendChild(lista);
  menu.append(botao, painel);
  document.body.prepend(menu);

  // O visual e controlado pelo CSS (:hover/:focus-within). Aqui so mantemos
  // o aria-expanded coerente com o que esta visivel.
  const temHover = window.matchMedia("(hover: hover)");

  const estaAberto = () =>
    (temHover.matches && menu.matches(":hover")) ||
    menu.matches(":focus-within") ||
    menu.classList.contains("aberto");

  const sincronizar = () => {
    botao.setAttribute("aria-expanded", estaAberto() ? "true" : "false");
  };

  menu.addEventListener("pointerenter", sincronizar);
  menu.addEventListener("pointerleave", () => requestAnimationFrame(sincronizar));
  menu.addEventListener("focusin", sincronizar);
  menu.addEventListener("focusout", () => requestAnimationFrame(sincronizar));

  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || !estaAberto()) return;
    menu.classList.remove("aberto");
    if (menu.contains(document.activeElement)) botao.blur();
    sincronizar();
  });

  botao.addEventListener("click", (evento) => {
    // Com mouse, o hover ja controla o painel. O blur evita que o clique
    // deixe o menu preso aberto por causa do :focus-within.
    if (temHover.matches) {
      if (evento.detail > 0) botao.blur();
      return;
    }

    // Em telas sem hover (toque), o clique abre e fecha o painel.
    menu.classList.toggle("aberto");
    if (!menu.classList.contains("aberto")) botao.blur();
    sincronizar();
  });
}

montarMenu();
