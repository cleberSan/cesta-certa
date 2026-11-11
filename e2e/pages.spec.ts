import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { indexableRoutes, noindexRoutes, routes } from "./routes";

const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of routes) {
  test.describe(`página ${route}`, () => {
    test("abre com título, um h1 e descrição, sem erro no console", async ({
      page,
      consoleErrors,
    }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/Cesta Certa/);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      expect(consoleErrors).toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`não tem violações de acessibilidade no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(route);
        const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test("abre links externos em outra aba, só em https e sem vazar a origem", async ({ page }) => {
      await page.goto(route);
      const external = page.locator('a[href^="http"]');
      expect(await external.count()).toBeGreaterThan(0);
      for (const link of await external.all()) {
        await expect(link).toHaveAttribute("href", /^https:\/\//);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });

    test("não tem rolagem horizontal", async ({ page }) => {
      await page.goto(route);
      const sobra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sobra).toBeLessThanOrEqual(0);
    });
  });
}

for (const route of indexableRoutes) {
  test(`${route} declara o endereço canônico e entra no sitemap`, async ({ page, request }) => {
    await page.goto(route);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical!).pathname).toBe(route);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`<loc>${canonical}</loc>`);
  });
}

for (const route of noindexRoutes) {
  test(`${route} fica fora dos buscadores e do sitemap`, async ({ page, request }) => {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain(`${route}</loc>`);
  });
}

test("o robots.txt libera as páginas, tira a API e aponta o sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
});

test("o link de pular navegação leva ao conteúdo", async ({ page, isMobile }) => {
  test.skip(isMobile, "Navegação por teclado só no desktop.");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("o menu marca a página atual", async ({ page }) => {
  await page.goto("/sobre");
  const menu = page.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: "Sobre" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
});

// spec 0001 CA-37 (base)
test("a página declara o manifest e os ícones para instalar na tela inicial", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as { icons: { src: string }[]; display: string };
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touchIcon!)).status()).toBe(200);
});
