/** O que "Saber mais" mostra de um mercado (spec 0001, CA-09). */

export interface SiteParaMostrar {
  /** Nulo quando o site não usa https: o endereço aparece como texto, sem link. */
  readonly href: string | null;
  readonly texto: string;
}

const tamanhoDoTexto = 60;

/**
 * Endereço do site para a tela: sem "https://" nem "www.", cortado se for longo. O link só
 * existe para https, para o app não abrir página sem conexão segura (o site já foi conferido
 * como http ou https ao ler a base).
 */
export function siteParaMostrar(site: string): SiteParaMostrar | null {
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const caminho = url.pathname === "/" ? "" : url.pathname;
  const completo = `${url.hostname.replace(/^www\./, "")}${caminho}`;
  const texto =
    completo.length > tamanhoDoTexto ? `${completo.slice(0, tamanhoDoTexto - 1)}…` : completo;
  return { href: url.protocol === "https:" ? url.href : null, texto };
}
