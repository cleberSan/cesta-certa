import { readFile } from "node:fs/promises";
import { ajustesGuardados, celulaDoCentro, servirBase } from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * A localização não sai do aparelho (spec 0001, CA-06): nenhum pedido leva a coordenada, em
 * nenhuma precisão, e a cópia exportada em Seus dados não leva o ponto.
 */
const ponto = { latitude: -23.55123, longitude: -46.63456 };

/** Qualquer pedaço da coordenada com pelo menos uma casa decimal, com ponto ou vírgula. */
const coordenada = /23[.,]5|46[.,]6|2355|4663/;

test.describe("privacidade da localização", () => {
  // spec 0001 CA-06
  test("nenhum pedido leva a coordenada; o site só sabe a região baixada", async ({
    page,
    context,
    consoleErrors,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(ponto);
    const enviados: string[] = [];
    page.on("request", (pedido) => {
      enviados.push(`${pedido.method()} ${pedido.url()} ${pedido.postData() ?? ""}`);
    });
    const { pedidos } = await servirBase(page);

    await page.goto("/mercados");
    await page.getByRole("button", { name: "Usar minha localização" }).click();
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
    await page.getByLabel("Distância máxima").selectOption("30");
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(5);
    await page.reload();
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(5);

    expect(enviados.length).toBeGreaterThan(0);
    expect(enviados.filter((linha) => coordenada.test(linha))).toEqual([]);
    expect(new Set(pedidos)).toEqual(
      new Set(["/data/mercados/indice.json", `/data/mercados/${celulaDoCentro}.json`]),
    );
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-06
  test("o ponto fica no aparelho e não entra na cópia exportada", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(ponto);
    await servirBase(page);
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Usar minha localização" }).click();
    await expect(page.locator("ol.mercados-lista > li")).toHaveCount(3);
    await expect
      .poll(() => ajustesGuardados(page))
      .toContainEqual({
        id: "ponto",
        lat: ponto.latitude,
        lon: ponto.longitude,
        origem: "localizacao",
        rotulo: null,
      });

    await page.goto("/dados");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar cópia" }).click(),
    ]);
    const texto = await readFile(await download.path(), "utf8");

    const dados = (JSON.parse(texto) as { dados: Record<string, unknown> }).dados;
    expect(Object.keys(dados)).toEqual(["listas", "itens", "mercadosProprios"]);
    expect(dados["mercadosProprios"]).toEqual([]);
    expect(texto).not.toMatch(coordenada);
    expect(texto).not.toContain("ajustes");
  });
});
