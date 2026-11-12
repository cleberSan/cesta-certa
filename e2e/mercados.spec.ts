import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  abrirMercados,
  ajustesGuardados,
  basePadrao,
  celulaDoCentro,
  centro,
  geradoEm,
  mercadosDeExemplo,
  servirBase,
} from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Mercados perto do ponto (spec 0001, CA-07 e CA-39), com a base sintética servida pelo
 * Playwright e a localização simulada pelo navegador.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const lista = (page: Page) => page.locator("ol.mercados-lista > li");
const raio = (page: Page) => page.getByLabel("Distância máxima");
const resumo = (page: Page) => page.getByRole("status").filter({ hasText: / km/ });

async function abrirNoCentro(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(centro);
  await abrirMercados(page);
  await page.getByRole("button", { name: "Usar minha localização" }).click();
}

test.describe("mercados perto do ponto", () => {
  // spec 0001 CA-07
  test("lista os mercados do raio do mais perto ao mais longe, com tipo e distância", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await abrirNoCentro(page);

    await expect(resumo(page)).toHaveText("3 mercados em até 5 km, do mais perto ao mais longe.");
    await expect(raio(page)).toHaveValue("5");
    await expect(lista(page).locator("h3")).toHaveText([
      "Mercadinho da Praça",
      "Supermercado Exemplo",
      "Atacarejo Modelo",
    ]);
    await expect(lista(page).locator("p")).toHaveText([
      "Mercado de bairro · 300 m",
      "Supermercado · 1,2 km",
      "Atacarejo · 3,4 km",
    ]);
    await expect(page.getByText("Mercados da base de novembro de 2026")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "colaboradores do OpenStreetMap" }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-07
  test("muda o raio sem baixar de novo a região e guarda a escolha no aparelho", async ({
    page,
  }) => {
    const { pedidos } = await servirBase(page);
    await abrirNoCentro(page);
    await expect(lista(page)).toHaveCount(3);

    await raio(page).selectOption("10");
    await expect(resumo(page)).toHaveText("4 mercados em até 10 km, do mais perto ao mais longe.");
    await raio(page).selectOption("30");
    await expect(lista(page)).toHaveCount(5);
    await raio(page).selectOption("1");
    await expect(lista(page).locator("h3")).toHaveText(["Mercadinho da Praça"]);

    expect(pedidos).toEqual([
      "/data/mercados/indice.json",
      `/data/mercados/${celulaDoCentro}.json`,
    ]);
    await expect.poll(() => ajustesGuardados(page)).toContainEqual({ id: "raio", km: 1 });
    await page.reload();
    await expect(raio(page)).toHaveValue("1");
  });

  // spec 0001 CA-39
  test("sem mercado no raio, diz isso e oferece aumentar a distância", async ({ page }) => {
    await servirBase(page);
    await abrirMercados(page);
    await page.getByRole("button", { name: "Escolher cidade" }).click();
    await page.getByLabel("Nome da cidade").fill("sem mercado");
    await page.getByRole("button", { name: "Cidade Sem Mercado, SP" }).click();

    await expect(page.getByText("Não há mercado da base em até 5 km deste ponto.")).toBeVisible();
    await expect(resumo(page)).toHaveText("Nenhum mercado da base em até 5 km.");
    await page.getByRole("button", { name: "Aumentar para 10 km" }).click();

    await expect(raio(page)).toHaveValue("10");
    await expect(page.getByText("Não há mercado da base em até 10 km deste ponto.")).toBeVisible();
  });

  // spec 0001 CA-39
  test("avisa quando o ponto está fora do Brasil", async ({ page }) => {
    const { pedidos } = await servirBase(page);
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 38.7223, longitude: -9.1393 });
    await abrirMercados(page);
    await page.getByRole("button", { name: "Usar minha localização" }).click();

    await expect(
      page.getByText("Este ponto parece estar fora do Brasil", { exact: false }),
    ).toBeVisible();
    // A região do ponto não está no índice: nada além dele é baixado.
    expect(pedidos).toEqual(["/data/mercados/indice.json"]);
  });

  test("mostra 50 mercados de cada vez", async ({ page }) => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({
      id: `n${2000 + i}`,
      nome: `Mercado ${String(i + 1).padStart(2, "0")}`,
      tipo: "bairro",
      // Um a cada 55 m, todos dentro dos 5 km do raio padrão.
      lat: Number((centro.latitude + (i + 1) / 2000).toFixed(5)),
      lon: centro.longitude,
    }));
    const base = basePadrao();
    await servirBase(page, {
      ...base,
      indice: {
        json: { versao: 1, geradoEm, celulas: { [celulaDoCentro]: 60 } },
      },
      celulas: {
        [celulaDoCentro]: { json: { versao: 1, celula: celulaDoCentro, mercados: muitos } },
      },
    });
    await abrirNoCentro(page);

    await expect(lista(page)).toHaveCount(50);
    await page.getByRole("button", { name: "Mostrar mais 10" }).click();
    await expect(lista(page)).toHaveCount(60);
    await expect(page.getByRole("button", { name: /^Mostrar mais/ })).toHaveCount(0);
  });

  test("mostra o nome que vem na base como texto, sem marcação", async ({
    page,
    consoleErrors,
  }) => {
    const base = basePadrao();
    const comMarcacao = [
      { ...mercadosDeExemplo[1]!, nome: '<img src=x onerror="alert(1)">Mercado' },
    ];
    await servirBase(page, {
      ...base,
      celulas: {
        [celulaDoCentro]: { json: { versao: 1, celula: celulaDoCentro, mercados: comMarcacao } },
      },
    });
    await abrirNoCentro(page);

    await expect(lista(page).locator("h3")).toHaveText(['<img src=x onerror="alert(1)">Mercado']);
    await expect(page.locator("ol.mercados-lista img")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("falhas ao baixar a base", () => {
  test("avisa quando a base ainda não foi publicada, sem oferecer tentar de novo", async ({
    page,
  }) => {
    await servirBase(page, { indice: "404" });
    await abrirNoCentro(page);

    await expect(page.getByRole("alert")).toHaveText(
      "A base de mercados ainda não foi publicada neste site.",
    );
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
  });

  test("sem conexão, deixa tentar de novo e lista quando a conexão volta", async ({ page }) => {
    const base = await servirBase(page, { ...basePadrao(), indice: "sem-conexao" });
    await abrirNoCentro(page);
    await expect(page.getByRole("alert")).toContainText("Sem conexão para baixar os mercados.");

    base.trocar(basePadrao());
    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(lista(page)).toHaveCount(3);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  for (const [caso, alterar] of [
    ["índice que não é JSON", { indice: "nao-e-json" }],
    ["índice de outra versão", { indice: { json: { versao: 2, geradoEm: "x", celulas: {} } } }],
    ["região do índice que não existe", { celulas: {} }],
    ["região fora do formato", { celulas: { [celulaDoCentro]: { json: { versao: 1 } } } }],
  ] as const) {
    test(`trata ${caso} como base fora do formato`, async ({ page }) => {
      await servirBase(page, { ...basePadrao(), ...alterar });
      await abrirNoCentro(page);

      await expect(page.getByRole("alert")).toContainText(
        "Os mercados desta região vieram num formato que o app não entende.",
      );
    });
  }
});

test.describe("acessibilidade e celular", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`a explicação, a busca de cidade e a lista não têm violações no tema ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await servirBase(page);
      await abrirMercados(page);
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

      await page.getByRole("button", { name: "Escolher cidade" }).click();
      await page.getByLabel("Nome da cidade").fill("são");
      await expect(page.getByRole("button", { name: "São Paulo, SP" })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

      await page.getByRole("button", { name: "São Paulo, SP" }).click();
      await expect(lista(page)).toHaveCount(3);
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
    });
  }

  test("dá para escolher a cidade e mudar o raio só pelo teclado", async ({ page }) => {
    await servirBase(page);
    await abrirMercados(page);

    await page.getByRole("button", { name: "Escolher cidade" }).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Nome da cidade").focus();
    await page.keyboard.type("são paulo");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "São Paulo, SP" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(lista(page)).toHaveCount(3);
    await raio(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(raio(page)).toHaveValue("10");
  });

  test("não tem rolagem horizontal com a lista aberta", async ({ page }) => {
    await servirBase(page);
    await abrirNoCentro(page);
    await expect(lista(page)).toHaveCount(3);

    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });
});
