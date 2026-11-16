import { expect, test } from "./fixtures";

/** Página inicial em blocos (spec 0002, CA-05 a CA-07). */

// spec 0002 CA-05
test("a página inicial continua sem JavaScript", async ({ page, consoleErrors }) => {
  await page.goto("/");

  await expect(page.locator("script")).toHaveCount(0);
  await expect(page.locator("astro-island")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

// spec 0002 CA-06
test("a prévia da demonstração mostra o mesmo total da opção 1 da /demonstracao", async ({
  page,
}) => {
  await page.goto("/");
  const previa = page.getByRole("article", { name: /Mercadinho Exemplo da Praça/ });
  await expect(previa).toContainText("Demonstração · preços fictícios");
  const total = (await previa.locator(".previa-total").textContent())!.trim();
  expect(total).toMatch(/^R\$\s\d+,\d{2}$/);
  await expect(previa).toContainText(/a menos/);

  await previa.getByRole("link", { name: "Ver a demonstração" }).click();
  await expect(page).toHaveURL(/\/demonstracao$/);
  const opcao1 = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: /^Opção 1:/ }) });
  await expect(opcao1).toContainText(total);
});

// spec 0002 CA-07
test.describe("atalhos da página inicial", () => {
  const atalhos = [
    { nome: /^Montar a lista/, destino: /\/lista$/ },
    { nome: /^Ler a nota/, destino: /\/nota$/ },
    { nome: /^Mercados perto/, destino: /\/mercados$/ },
    { nome: /^Digitar um preço/, destino: /\/precos#digitar$/ },
  ];

  for (const { nome, destino } of atalhos) {
    test(`${nome.source.slice(1)} leva à tela certa, com alvo de toque de 44 px`, async ({
      page,
    }) => {
      await page.goto("/");
      const atalho = page
        .getByRole("navigation", { name: "Atalhos" })
        .getByRole("link", { name: nome });

      const caixa = (await atalho.boundingBox())!;
      expect(caixa.width).toBeGreaterThanOrEqual(44);
      expect(caixa.height).toBeGreaterThanOrEqual(44);

      await atalho.click();
      await expect(page).toHaveURL(destino);
    });
  }
});
