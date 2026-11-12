/** O que a função usa da janela do navegador; nos testes, um substituto. */
export interface Janela {
  addEventListener(
    tipo: "pageshow",
    ouvinte: (evento: { readonly persisted: boolean }) => void,
  ): void;
  removeEventListener(
    tipo: "pageshow",
    ouvinte: (evento: { readonly persisted: boolean }) => void,
  ): void;
  readonly location: { reload(): void };
}

/**
 * Recarrega a página quando o navegador a devolve do cache de voltar e avançar sem carregar
 * de novo (`pageshow` com `persisted`). Uma página devolvida assim mostra o que tinha em
 * memória quando a pessoa saiu, e os dados do aparelho podem ter mudado desde então, por
 * exemplo por uma importação. Devolve a função que desliga o aviso.
 */
export function recarregarAoVoltar(janela: Janela): () => void {
  const aoMostrar = (evento: { readonly persisted: boolean }) => {
    if (evento.persisted) janela.location.reload();
  };
  janela.addEventListener("pageshow", aoMostrar);
  return () => janela.removeEventListener("pageshow", aoMostrar);
}
