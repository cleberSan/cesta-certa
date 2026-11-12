export const routes = ["/", "/dados", "/lista", "/mercados", "/nota", "/privacidade", "/sobre"];

/** Fora dos buscadores e do sitemap (src/config/site.ts). */
export const noindexRoutes = ["/dados", "/lista", "/mercados", "/nota"];

export const indexableRoutes = routes.filter((route) => !noindexRoutes.includes(route));

/** Únicas páginas com JavaScript: as que têm ilha React (ADR-0001). */
export const islandRoutes = ["/dados", "/lista", "/mercados", "/nota"];

export const consultaRoute = "/api/nfce/consultar";

/** Chave de acesso sintética de São Paulo, com dígito verificador válido. */
export const chaveSintetica = "35261111222333000181650010000123451123456780";

export const linkSintetico = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${chaveSintetica}|2|1|1|A1B2C3D4E5F60718293A4B5C6D7E8F9012345678`;
