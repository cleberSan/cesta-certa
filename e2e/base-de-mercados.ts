import type { Page, Route } from "@playwright/test";

/**
 * Base de mercados sintética para os testes da tela /mercados (ADR-0005). O site de verdade
 * ainda não tem `public/data` (a base vem do workflow mensal), então os testes servem os
 * arquivos pelo próprio Playwright, no mesmo endereço que o app pede.
 */
export const centro = { latitude: -23.5503, longitude: -46.6339 };

/** Célula de 1 grau que contém o centro (`celulaDe`). */
export const celulaDoCentro = "-24_-47";

/** Ponto `km` quilômetros ao norte do centro, com 5 casas como na base. */
function aoNorte(km: number) {
  return { lat: Number((centro.latitude + km / 111.195).toFixed(5)), lon: centro.longitude };
}

export const mercadosDeExemplo = [
  { id: "w103", nome: "Atacarejo Modelo", tipo: "atacarejo", ...aoNorte(3.4) },
  {
    id: "n101",
    nome: "Mercadinho da Praça",
    tipo: "bairro",
    ...aoNorte(0.3),
    site: "http://mercadinho.example/",
  },
  { id: "n105", nome: "Mercado da Serra", tipo: "bairro", ...aoNorte(25) },
  {
    id: "n102",
    nome: "Supermercado Exemplo",
    tipo: "supermercado",
    ...aoNorte(1.2),
    horario: "Mo-Sa 08:00-22:00; Su 08:00-14:00",
    site: "https://www.supermercado.example/loja/centro",
  },
  { id: "n104", nome: "Supermercado Distante", tipo: "supermercado", ...aoNorte(8) },
];

export const cidadesDeExemplo = [
  { nome: "Cidade Sem Mercado", uf: "SP", lat: -23.7, lon: -46.9 },
  { nome: "São Paulo", uf: "SP", lat: -23.5503, lon: -46.6339 },
  { nome: "São Pedro", uf: "SP", lat: -22.5483, lon: -47.9136 },
];

export const geradoEm = "2026-11-03T09:23:00.000Z";

type Resposta = "404" | "500" | "sem-conexao" | "nao-e-json" | { json: unknown };

export interface Base {
  indice?: Resposta;
  celulas?: Record<string, Resposta>;
  cidades?: Resposta;
}

export const basePadrao = (): Required<Base> => ({
  indice: {
    json: { versao: 1, geradoEm, celulas: { [celulaDoCentro]: mercadosDeExemplo.length } },
  },
  celulas: {
    [celulaDoCentro]: {
      json: { versao: 1, celula: celulaDoCentro, mercados: mercadosDeExemplo },
    },
  },
  cidades: { json: { versao: 1, geradoEm, cidades: cidadesDeExemplo } },
});

async function responder(route: Route, resposta: Resposta | undefined) {
  if (resposta === undefined || resposta === "404") {
    await route.fulfill({ status: 404, contentType: "text/html", body: "<h1>Não encontrada</h1>" });
  } else if (resposta === "500") {
    await route.fulfill({ status: 500, contentType: "text/plain", body: "erro" });
  } else if (resposta === "sem-conexao") {
    await route.abort("internetdisconnected");
  } else if (resposta === "nao-e-json") {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{ não é json" });
  } else {
    await route.fulfill({ status: 200, json: resposta.json });
  }
}

/**
 * Serve `/data/...` com a base dada e devolve a lista dos caminhos pedidos, na ordem. A base
 * pode ser trocada no meio do teste (por exemplo, para a conexão voltar).
 */
export async function servirBase(page: Page, base: Base = basePadrao()) {
  const pedidos: string[] = [];
  const atual = { base };
  await page.route("**/data/**", async (route) => {
    const caminho = new URL(route.request().url()).pathname;
    pedidos.push(caminho);
    const { indice, celulas, cidades } = atual.base;
    if (caminho === "/data/mercados/indice.json") return responder(route, indice);
    if (caminho === "/data/cidades.json") return responder(route, cidades);
    const celula = /^\/data\/mercados\/(-?\d+_-?\d+)\.json$/.exec(caminho)?.[1];
    return responder(route, celula === undefined ? undefined : celulas?.[celula]);
  });
  return {
    pedidos,
    trocar(nova: Base) {
      atual.base = nova;
    },
  };
}

/** Lê o armazém dos ajustes (ponto e raio) direto do IndexedDB do app. */
export function ajustesGuardados(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolver, rejeitar) => {
        const pedido = indexedDB.open("cesta-certa");
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const leitura = banco.transaction("ajustes", "readonly").objectStore("ajustes").getAll();
          leitura.onsuccess = () => {
            banco.close();
            resolver(leitura.result);
          };
          leitura.onerror = () => rejeitar(leitura.error);
        };
      }),
  );
}

/** Conta as chamadas a `getCurrentPosition`, para provar que nada é pedido antes do toque. */
export async function contarPedidosDeLocalizacao(page: Page) {
  await page.addInitScript(() => {
    const janela = window as unknown as { pedidosDeLocalizacao: number };
    janela.pedidosDeLocalizacao = 0;
    const original = Geolocation.prototype.getCurrentPosition;
    Geolocation.prototype.getCurrentPosition = function (...argumentos) {
      janela.pedidosDeLocalizacao += 1;
      return original.apply(this, argumentos);
    };
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { pedidosDeLocalizacao: number }).pedidosDeLocalizacao,
    );
}

/** Abre /mercados e espera a tela sair do "Abrindo…". */
export async function abrirMercados(page: Page) {
  await page.goto("/mercados");
  await page
    .getByRole("button", { name: /Usar minha localização|Trocar o ponto/ })
    .waitFor({ state: "visible" });
}

/** Lê os mercados cadastrados pela pessoa, direto do IndexedDB do app. */
export function mercadosGuardados(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolver, rejeitar) => {
        const pedido = indexedDB.open("cesta-certa");
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const leitura = banco
            .transaction("mercadosProprios", "readonly")
            .objectStore("mercadosProprios")
            .getAll();
          leitura.onsuccess = () => {
            banco.close();
            resolver(leitura.result);
          };
          leitura.onerror = () => rejeitar(leitura.error);
        };
      }),
  );
}
