import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { routes } from "./routes";

/**
 * Fontes próprias (spec 0002, ADR-0009): Bricolage Grotesque nos títulos e Inter no texto,
 * servidas pelo próprio site. A fixture já falha qualquer pedido a outra origem.
 */

/** As famílias que a página carregou, sem o sufixo que o Astro acrescenta ao nome. */
async function familiasCarregadas(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((fonte) => fonte.status === "loaded")
      .map((fonte) => fonte.family.replaceAll('"', ""));
  });
}

for (const route of routes) {
  test.describe(`fontes em ${route}`, () => {
    // spec 0002 CA-14
    test("usa Bricolage Grotesque no título e Inter no texto, baixadas do próprio site", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto(route);

      const familias = await familiasCarregadas(page);
      expect(familias.some((familia) => familia.startsWith("Bricolage Grotesque"))).toBe(true);
      expect(familias.some((familia) => familia.startsWith("Inter"))).toBe(true);
      await expect(page.locator("h1")).toHaveCSS("font-family", /Bricolage Grotesque/);
      await expect(page.locator("body")).toHaveCSS("font-family", /Inter/);

      const arquivos = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entrada) => entrada.name)
          .filter((endereco) => endereco.endsWith(".woff2")),
      );
      expect(arquivos.length).toBeGreaterThanOrEqual(2);
      for (const arquivo of arquivos) {
        expect(new URL(arquivo).origin).toBe(new URL(page.url()).origin);
      }
      expect(consoleErrors).toEqual([]);
    });

    // spec 0002 CA-15
    test("mostra o texto na hora com uma fonte reserva ajustada enquanto a fonte chega", async ({
      request,
    }) => {
      const html = await (await request.get(route)).text();
      const faces = html.match(/@font-face\{[^}]*\}/g) ?? [];

      expect(faces.length).toBeGreaterThanOrEqual(4);
      for (const face of faces) expect(face).toContain("font-display:swap");
      const reservas = faces.filter((face) => face.includes("size-adjust:"));
      expect(reservas.some((face) => face.includes("Bricolage Grotesque"))).toBe(true);
      expect(reservas.some((face) => face.includes("Inter"))).toBe(true);
    });
  });
}
