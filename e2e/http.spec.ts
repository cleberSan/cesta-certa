import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { islandRoutes, routes } from "./routes";

const sha256 = (content: string) =>
  `'sha256-${createHash("sha256").update(content).digest("base64")}'`;

const expectedHeaders = {
  "content-security-policy":
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy":
    "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()",
};

for (const route of routes) {
  test(`${route} responde com os cabeçalhos de segurança e CSP por hash`, async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(headers[name], name).toBe(value);
    }

    const html = await response.text();
    const meta = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html);
    expect(meta, "CSP no <meta>").not.toBeNull();
    const policy = meta![1]!;
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')*;/);
    expect(policy).not.toMatch(/unsafe-(inline|eval)/);

    // Script e estilo inline só os que o Astro gera para as ilhas, todos com hash na CSP.
    // As expressões ignoram maiúsculas e aceitam espaço ou atributo no fechamento, como o
    // navegador, para que nenhuma variação de tag escape da conferência.
    for (const [, attributes, body] of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi,
    )) {
      if (/\bsrc\s*=/i.test(attributes!)) continue;
      expect(policy, "script inline sem hash na CSP").toContain(sha256(body!));
    }
    for (const [, body] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)) {
      expect(policy, "estilo inline sem hash na CSP").toContain(sha256(body!));
    }
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);

    // Só as páginas com ilha carregam JavaScript.
    if (islandRoutes.includes(route)) {
      expect(html).toMatch(/<script\b/i);
    } else {
      expect(html).not.toMatch(/<script\b/i);
    }
  });
}

test("rota inexistente responde 404 com a página do site", async ({ page }) => {
  const response = await page.goto("/pagina-que-nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Essa página não está na lista");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("URL com barra no final redireciona para a versão sem barra", async ({ request }) => {
  const response = await request.get("/sobre/", { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(response.status());
  expect(response.headers()["location"]).toBe("/sobre");
});

test("arquivos com hash em /_astro ficam em cache por um ano", async ({ page, request }) => {
  await page.goto("/");
  const stylesheet = await page.locator('link[rel="stylesheet"]').first().getAttribute("href");
  expect(stylesheet).toMatch(/^\/_astro\//);
  const response = await request.get(stylesheet!);
  expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});

test("o código do Worker e a configuração não são servidos como arquivo", async ({ request }) => {
  for (const path of ["/worker/index.ts", "/wrangler.jsonc", "/package.json", "/_headers"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
