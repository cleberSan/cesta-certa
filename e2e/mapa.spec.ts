import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page, Request } from "@playwright/test";
import { limitesDoRaio } from "../src/features/mapa/geojson";
import {
  abrirMercados,
  ajustesGuardados,
  centro,
  mercadosDeExemplo,
  mercadosGuardados,
  servirBase,
} from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Mapa sob demanda (spec 0001, T10; ADR-0005). O OpenFreeMap não é alcançável no CI, então o
 * estilo é servido pelo Playwright: só um fundo, sem quadros, fontes nem ícones. O que importa
 * aqui é o que o app faz: quando baixa o mapa, o que desenha e se a lista diz o mesmo.
 */
const origemDoMapa = "https://tiles.openfreemap.org";
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.use({ outrasOrigens: [origemDoMapa] });

const estiloDeTeste = {
  version: 8,
  sources: {},
  layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8e4d8" } }],
};

/** Serve o estilo do mapa e devolve os endereços pedidos ao provedor. */
async function servirMapa(page: Page, status = 200) {
  const pedidos: string[] = [];
  await page.route(`${origemDoMapa}/**`, async (route) => {
    pedidos.push(route.request().url());
    await (status === 200
      ? route.fulfill({ json: estiloDeTeste })
      : route.fulfill({ status, body: "indisponível" }));
  });
  return pedidos;
}

/** Arquivos de código e de estilo do mapa pedidos ao próprio site. */
function vigiarCodigoDoMapa(page: Page) {
  const pedidos: string[] = [];
  page.on("request", (pedido: Request) => {
    const caminho = new URL(pedido.url()).pathname;
    if (/\/_astro\/(motor|MapaDosMercados|MiraNoMapa|maplibre)/.test(caminho)) {
      pedidos.push(caminho);
    }
  });
  return pedidos;
}

const ponto = { lat: centro.latitude, lon: centro.longitude };

async function escolherSaoPaulo(page: Page) {
  await abrirMercados(page);
  await page.getByRole("button", { name: "Escolher cidade" }).click();
  await page.getByLabel("Nome da cidade").fill("são paulo");
  await page.getByRole("button", { name: "São Paulo, SP" }).click();
  await expect(page.locator("ol.mercados-lista > li").first()).toBeVisible();
}

const telaDoMapa = (page: Page, nome: string) => page.getByRole("region", { name: nome });

/**
 * Onde um lugar aparece na tela depois de o mapa enquadrar o raio: Web Mercator, com o centro
 * no meio da caixa do raio e o zoom que cabe nela com 24 px de folga, como o MapLibre faz.
 */
async function pixelDe(canvas: Locator, lugar: { lat: number; lon: number }, raioKm: number) {
  await canvas.scrollIntoViewIfNeeded();
  const caixa = (await canvas.boundingBox())!;
  const x = (lon: number) => (lon + 180) / 360;
  const y = (lat: number) => {
    const seno = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI);
  };
  const [[oeste, sul], [leste, norte]] = limitesDoRaio(ponto, raioKm);
  const folga = 24;
  const escala = Math.min(
    (caixa.width - 2 * folga) / (x(leste) - x(oeste)),
    (caixa.height - 2 * folga) / (y(sul) - y(norte)),
  );
  return {
    x: caixa.x + caixa.width / 2 + (x(lugar.lon) - (x(oeste) + x(leste)) / 2) * escala,
    y: caixa.y + caixa.height / 2 + (y(lugar.lat) - (y(norte) + y(sul)) / 2) * escala,
  };
}

test.beforeEach(async ({ page }) => {
  // Sem animação, o mapa para logo em cada movimento e os testes não dependem de tempo.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.describe("mapa dos mercados", () => {
  // spec 0001 CA-06, CA-37
  test("a lista é a padrão e nada do mapa é baixado antes do toque", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    const doProvedor = await servirMapa(page);
    const codigo = vigiarCodigoDoMapa(page);
    await escolherSaoPaulo(page);

    const alternar = page.getByRole("button", { name: "Mostrar no mapa" });
    await expect(alternar).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText("O mapa baixa do OpenFreeMap as imagens da área na tela."),
    ).toBeVisible();
    expect(doProvedor).toEqual([]);
    expect(codigo).toEqual([]);

    await alternar.click();
    await expect(page.getByRole("button", { name: "Esconder o mapa" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(telaDoMapa(page, "Mapa dos mercados")).toBeVisible();
    await expect(page.getByText("Abrindo o mapa…")).toBeHidden();

    // Do provedor, só o estilo: nada com o ponto. O código e o CSS do mapa vêm do próprio site.
    expect(doProvedor).toEqual([`${origemDoMapa}/styles/liberty`]);
    expect(codigo.some((caminho) => caminho.includes("/_astro/motor"))).toBe(true);
    expect(codigo.some((caminho) => /maplibre-gl-worker\.[\w-]+\.mjs$/.test(caminho))).toBe(true);
    expect(codigo.some((caminho) => /maplibre-gl\.[\w-]+\.css$/.test(caminho))).toBe(true);
    // A lista continua inteira abaixo do mapa (CA-37).
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-37
  test("o mapa tem nome, legenda em texto e botões em português, sem violações de acessibilidade", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await servirMapa(page);
    await escolherSaoPaulo(page);
    await page.getByRole("button", { name: "Mostrar no mapa" }).click();

    const mapa = telaDoMapa(page, "Mapa dos mercados");
    await expect(mapa).toBeVisible();
    await expect(page.getByText("Abrindo o mapa…")).toBeHidden();
    await expect(mapa).toHaveAccessibleDescription(
      /pessoinha marca o ponto da busca\. Mercado da base\..*miolo branco/,
    );
    await expect(page.getByRole("button", { name: "Aproximar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Afastar" })).toBeVisible();

    // O mapa recebe o foco pelo teclado e se move com as setas.
    await mapa.focus();
    await expect(mapa).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("+");

    const resultado = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(resultado.violations).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-09, CA-37
  test("tocar num pino abre a folha com o mesmo Saber mais da lista", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await servirMapa(page);
    await escolherSaoPaulo(page);
    await page.getByRole("button", { name: "Mostrar no mapa" }).click();
    const mapa = telaDoMapa(page, "Mapa dos mercados");
    await expect(page.getByText("Abrindo o mapa…")).toBeHidden();

    const mercadinho = mercadosDeExemplo.find((mercado) => mercado.id === "n101")!;
    const folha = page.getByRole("region", { name: "Mercadinho da Praça" });
    const alvo = await pixelDe(mapa, mercadinho, 5);
    // Os pinos chegam ao mapa um instante depois de ele abrir: tenta até a folha aparecer.
    await expect(async () => {
      await page.mouse.click(alvo.x, alvo.y);
      await expect(folha).toBeVisible({ timeout: 500 });
    }).toPass();

    await expect(folha).toBeFocused();
    await expect(folha.getByText("Mercado de bairro · 300 m")).toBeVisible();
    await expect(folha.getByRole("group", { name: "Ir até Mercadinho da Praça" })).toBeVisible();
    await expect(folha.getByRole("link", { name: /Ver o lugar no Google Maps/ })).toHaveAttribute(
      "href",
      `https://www.google.com/maps/search/?api=1&query=${mercadinho.lat}%2C${mercadinho.lon}`,
    );

    await folha.getByRole("button", { name: "Fechar os detalhes de Mercadinho da Praça" }).click();
    await expect(folha).toBeHidden();
    await expect(page.getByRole("button", { name: "Esconder o mapa" })).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test("esconder o mapa tira o mapa da tela e mantém a lista", async ({ page, consoleErrors }) => {
    await servirBase(page);
    await servirMapa(page);
    await escolherSaoPaulo(page);
    await page.getByRole("button", { name: "Mostrar no mapa" }).click();
    await expect(telaDoMapa(page, "Mapa dos mercados")).toBeVisible();

    await page.getByRole("button", { name: "Esconder o mapa" }).click();

    await expect(telaDoMapa(page, "Mapa dos mercados")).toHaveCount(0);
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-37
  test("sem WebGL, avisa e aponta a lista", async ({ page, consoleErrors }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        tipo: string,
        ...resto: unknown[]
      ) {
        if (tipo.startsWith("webgl")) return null;
        return (original as (...argumentos: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof original;
    });
    await servirBase(page);
    await servirMapa(page);
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Mostrar no mapa" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Este aparelho não conseguiu desenhar o mapa. A lista abaixo tem as mesmas informações.",
    );
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
    expect(consoleErrors).toEqual([]);
  });

  test("com o provedor do mapa fora do ar, avisa e aponta a lista", async ({ page }) => {
    await servirBase(page);
    await servirMapa(page, 503);
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Mostrar no mapa" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "O mapa não abriu. Confira a conexão e tente de novo mais tarde. A lista abaixo tem as mesmas informações.",
    );
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
  });

  test("se o código do mapa não chegar, avisa e aponta a lista", async ({ page }) => {
    await servirBase(page);
    await servirMapa(page);
    await page.route("**/_astro/MapaDosMercados.*.js", (route) => route.abort());
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Mostrar no mapa" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "O mapa não abriu. Confira a conexão e tente de novo mais tarde. A lista abaixo tem as mesmas informações.",
    );
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
  });
});

test.describe("marcar no mapa", () => {
  // spec 0001 CA-05
  test("escolhe o ponto com a mira, partindo do Brasil inteiro", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    const doProvedor = await servirMapa(page);
    await abrirMercados(page);
    await expect(
      page.getByText("Se você abrir um mapa, ele baixa do OpenFreeMap as imagens da área"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Marcar no mapa" }).click();
    const mapa = telaDoMapa(page, "Mapa para marcar o ponto");
    await expect(mapa).toBeVisible();
    await expect(mapa).toHaveAccessibleDescription(/Mova o mapa até a mira ficar sobre o lugar/);
    const usar = page.getByRole("button", { name: "Usar este ponto" });
    await expect(usar).toBeEnabled();

    // Uma seta para a direita leva a mira para o leste.
    await mapa.focus();
    await page.keyboard.press("ArrowRight");
    await expect(async () => {
      await usar.click();
      await expect(page.getByText("Ponto: escolhido no mapa.")).toBeVisible({ timeout: 500 });
    }).toPass();

    const [guardado] = (await ajustesGuardados(page)).filter(
      (registro) => (registro as { id: string }).id === "ponto",
    ) as { origem: string; lat: number; lon: number }[];
    expect(guardado?.origem).toBe("mapa");
    expect(guardado?.lat).toBeCloseTo(-14.24, 1);
    expect(guardado?.lon).toBeGreaterThan(-51.93);
    expect(guardado?.lon).toBeLessThan(-40);
    expect(doProvedor).toEqual([`${origemDoMapa}/styles/liberty`]);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-08
  test("cadastra o mercado no lugar marcado com a mira", async ({ page, consoleErrors }) => {
    await servirBase(page);
    await servirMapa(page);
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Cadastrar mercado" }).click();
    const formulario = page.getByRole("form", { name: "Cadastrar mercado" });
    await formulario.getByLabel("Nome do mercado").fill("Quitanda da Esquina");
    await formulario.getByRole("radio", { name: "Marcar no mapa" }).check();
    const mapa = telaDoMapa(page, "Mapa para marcar o mercado");
    await expect(mapa).toBeVisible();
    await expect(formulario.getByText("Abrindo o mapa…")).toBeHidden();

    // Uma seta para cima leva a mira para o norte do ponto da busca.
    await mapa.focus();
    await page.keyboard.press("ArrowUp");
    await expect(async () => {
      await formulario.getByRole("button", { name: "Cadastrar" }).click();
      await expect(formulario).toBeHidden({ timeout: 500 });
    }).toPass();

    const [mercado] = (await mercadosGuardados(page)) as { lat: number; lon: number }[];
    expect(mercado?.lat).toBeGreaterThan(ponto.lat);
    expect(mercado?.lat).toBeLessThan(ponto.lat + 0.01);
    expect(mercado?.lon).toBeCloseTo(ponto.lon, 3);
    await expect(
      page.locator("ol.mercados-lista > li").filter({ hasText: "Quitanda da Esquina" }),
    ).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("sem mapa, o cadastro pede outra opção de lugar", async ({ page }) => {
    await servirBase(page);
    await servirMapa(page, 503);
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Cadastrar mercado" }).click();
    const formulario = page.getByRole("form", { name: "Cadastrar mercado" });
    await formulario.getByLabel("Nome do mercado").fill("Quitanda da Esquina");
    await formulario.getByRole("radio", { name: "Marcar no mapa" }).check();
    await expect(formulario.getByRole("alert")).toHaveText(
      "O mapa não abriu. Confira a conexão e tente de novo mais tarde. Escolha outra opção de lugar.",
    );

    await formulario.getByRole("button", { name: "Cadastrar" }).click();

    await expect(
      formulario.getByText(
        "Espere o mapa abrir e mova a mira até o lugar, ou escolha outra opção.",
      ),
    ).toBeVisible();
    expect(await mercadosGuardados(page)).toEqual([]);
  });
});
