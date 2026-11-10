export const routes = ["/", "/privacidade", "/sobre"];

/** Fora dos buscadores e do sitemap (src/config/site.ts). */
export const noindexRoutes: string[] = [];

export const indexableRoutes = routes.filter((route) => !noindexRoutes.includes(route));

/** Únicas páginas com JavaScript: as que têm ilha React (ADR-0001). */
export const islandRoutes: string[] = [];
