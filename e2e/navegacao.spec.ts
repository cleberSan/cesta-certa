import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { routes } from "./routes";

/**
 * Navegação principal (spec 0002, CA-01 a CA-04): barra fixa no rodapé abaixo de 48 rem, menu
 * no topo a partir daí. O projeto "mobile" (Pixel 7) tem 412 px e o "desktop", 1280 px.
 */

const larguraDoMenuNoTopo = 768;
const ehCelular = (page: Page) => (page.viewportSize()?.width ?? 0) < larguraDoMenuNoTopo;
const menu = (page: Page) => page.getByRole("navigation", { name: "Principal" });

/** Página atual de cada destino do menu; as outras rotas não marcam nenhum item. */
const itemDaRota: Record<string, string> = {
  "/": "Início",
  "/lista": "Lista",
  "/nota": "Ler nota",
  "/mercados": "Mercados",
  "/precos": "Preços",
};

for (const route of routes) {
  test.describe(`navegação em ${route}`, () => {
    // spec 0002 CA-01
    test("no celular, a barra fica fixa no rodapé com os cinco destinos e marca a página atual", async ({
      page,
    }) => {
      test.skip(!ehCelular(page), "só no celular");
      await page.goto(route);

      const links = menu(page).getByRole("link");
      await expect(links).toHaveText(["Início", "Lista", "Ler nota", "Mercados", "Preços"]);
      const caixa = (await menu(page).boundingBox())!;
      const altura = page.viewportSize()!.height;
      expect(caixa.y + caixa.height).toBeCloseTo(altura, 0);

      await page.mouse.wheel(0, 2000);
      expect((await menu(page).boundingBox())!.y).toBeCloseTo(caixa.y, 0);

      const atual = itemDaRota[route];
      if (atual) {
        await expect(menu(page).getByRole("link", { name: atual })).toHaveAttribute(
          "aria-current",
          "page",
        );
        await expect(menu(page).locator('[aria-current="page"]:visible')).toHaveCount(1);
      } else {
        await expect(menu(page).locator('[aria-current="page"]:visible')).toHaveCount(0);
      }
    });

    // spec 0002 CA-02
    test("no celular, nada da página fica escondido atrás da barra ao rolar até o fim", async ({
      page,
    }) => {
      test.skip(!ehCelular(page), "só no celular");
      await page.goto(route);

      // As ilhas crescem a página depois de abrir: rola de novo até a medida ficar estável.
      await expect
        .poll(async () =>
          page.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const links = document.querySelectorAll("footer a");
            const ultimo = links[links.length - 1]!.getBoundingClientRect().bottom;
            const barra = document.querySelector('nav[aria-label="Principal"]')!;
            return ultimo <= barra.getBoundingClientRect().top;
          }),
        )
        .toBe(true);
    });

    // spec 0002 CA-03
    test("no computador, o menu fica no topo numa linha, com o botão Ler nota, e não há barra no rodapé", async ({
      page,
    }) => {
      test.skip(ehCelular(page), "só no computador");
      await page.goto(route);

      const links = menu(page).getByRole("link");
      await expect(links).toHaveText([
        "Início",
        "Lista",
        "Mercados",
        "Preços",
        "Sobre",
        "Ler nota",
      ]);
      const caixas = await links.evaluateAll((todos) =>
        todos.map((link) => link.getBoundingClientRect()),
      );
      const centros = caixas.map((caixa) => Math.round(caixa.top + caixa.height / 2));
      expect(new Set(centros).size).toBe(1);
      expect(caixas[0]!.top).toBeLessThan(100);

      await page.mouse.wheel(0, 2000);
      const posicao = await menu(page).evaluate((elemento) => getComputedStyle(elemento).position);
      expect(posicao).not.toBe("fixed");
    });

    // spec 0002 CA-04
    test("Sobre, Seus dados e Privacidade ficam a um toque", async ({ page }) => {
      await page.goto(route);

      const sobre = ehCelular(page)
        ? page.getByRole("banner").getByRole("link", { name: "Sobre o Cesta Certa" })
        : menu(page).getByRole("link", { name: "Sobre" });
      await expect(sobre).toBeVisible();
      await expect(sobre).toHaveAttribute("href", "/sobre");

      const rodape = page.getByRole("contentinfo");
      await expect(rodape.getByRole("link", { name: "Seus dados" })).toHaveAttribute(
        "href",
        "/dados",
      );
      await expect(rodape.getByRole("link", { name: "Privacidade" })).toHaveAttribute(
        "href",
        "/privacidade",
      );
      await expect(rodape.getByRole("link", { name: "Sobre" })).toHaveAttribute("href", "/sobre");
    });
  });
}
