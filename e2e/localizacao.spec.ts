import type { Page } from "@playwright/test";
import {
  abrirMercados,
  ajustesGuardados,
  basePadrao,
  centro,
  contarPedidosDeLocalizacao,
  servirBase,
} from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Primeiro acesso a /mercados (spec 0001, CA-05): a tela explica antes de pedir, só pede a
 * localização depois do toque e sempre oferece a cidade como caminho.
 */
const usarLocalizacao = (page: Page) =>
  page.getByRole("button", { name: "Usar minha localização" });
const escolherCidade = (page: Page) => page.getByRole("button", { name: "Escolher cidade" });
const trocarPonto = (page: Page) => page.getByRole("button", { name: "Trocar o ponto" });
const titulo = (page: Page) => page.getByRole("heading", { level: 2 }).first();

async function escolherSaoPaulo(page: Page) {
  await escolherCidade(page).click();
  await page.getByLabel("Nome da cidade").fill("sao paulo");
  await page.getByRole("button", { name: "São Paulo, SP" }).click();
}

test.describe("primeiro acesso aos mercados", () => {
  // spec 0001 CA-05
  test("explica o motivo e só pede a localização depois do toque", async ({
    page,
    context,
    consoleErrors,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(centro);
    const pedidos = await contarPedidosDeLocalizacao(page);
    await servirBase(page);

    await abrirMercados(page);

    await expect(titulo(page)).toHaveText("Para achar os mercados perto de você");
    await expect(page.getByText("O ponto fica só neste aparelho.", { exact: false })).toBeVisible();
    await expect(escolherCidade(page)).toBeVisible();
    expect(await pedidos()).toBe(0);

    await usarLocalizacao(page).click();

    await expect(titulo(page)).toHaveText("Mercados perto de você");
    await expect(page.getByText("Ponto: a sua localização.")).toBeVisible();
    expect(await pedidos()).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-05
  test("com a permissão negada, diz o motivo e oferece a cidade", async ({ page, context }) => {
    await context.clearPermissions();
    await abrirMercados(page);

    await usarLocalizacao(page).click();

    await expect(page.getByRole("alert")).toHaveText(
      "O navegador não deu permissão para usar a localização. Escolha a cidade.",
    );
    await expect(escolherCidade(page)).toBeEnabled();
    await expect(usarLocalizacao(page)).toBeEnabled();
  });

  // spec 0001 CA-05
  test("desiste em 10 segundos quando o navegador não responde", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => {
      // Navegador que deixa a pergunta de permissão na tela e nunca responde.
      Geolocation.prototype.getCurrentPosition = () => undefined;
    });
    await abrirMercados(page);

    await usarLocalizacao(page).click();
    await expect(page.getByRole("status").first()).toHaveText(
      "Pedindo a localização ao navegador…",
    );
    await expect(usarLocalizacao(page)).toBeDisabled();

    await page.clock.runFor(9_000);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.clock.runFor(1_000);

    await expect(page.getByRole("alert")).toHaveText(
      "A localização não chegou em 10 segundos. Escolha a cidade ou tente de novo.",
    );
    await expect(usarLocalizacao(page)).toBeEnabled();
  });

  // spec 0001 CA-05
  test("num navegador sem localização, oferece a cidade", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { value: undefined });
    });
    await abrirMercados(page);

    await usarLocalizacao(page).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Este aparelho não informou a localização. Escolha a cidade.",
    );
  });

  // spec 0001 CA-05
  test("guarda a cidade escolhida no aparelho e mantém depois de recarregar", async ({
    page,
    consoleErrors,
  }) => {
    const pedidos = await contarPedidosDeLocalizacao(page);
    await servirBase(page);
    await abrirMercados(page);

    await escolherSaoPaulo(page);

    await expect(titulo(page)).toHaveText("Mercados perto de São Paulo, SP");
    await page.reload();
    await expect(titulo(page)).toHaveText("Mercados perto de São Paulo, SP");
    await expect(page.getByText("Ponto: São Paulo, SP.")).toBeVisible();
    expect(await pedidos()).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-05
  test("trocar o ponto apaga o ponto guardado e volta à explicação", async ({ page }) => {
    await servirBase(page);
    await abrirMercados(page);
    await escolherSaoPaulo(page);
    await expect(trocarPonto(page)).toBeVisible();

    await trocarPonto(page).click();

    await expect(titulo(page)).toHaveText("Para achar os mercados perto de você");
    await expect.poll(() => ajustesGuardados(page)).toEqual([]);
    await page.reload();
    await expect(usarLocalizacao(page)).toBeVisible();
  });

  // spec 0001 CA-05
  test("busca a cidade no aparelho, sem mandar o que foi digitado", async ({ page }) => {
    const { pedidos } = await servirBase(page);
    await abrirMercados(page);

    await escolherCidade(page).click();
    const busca = page.getByLabel("Nome da cidade");
    await busca.fill("s");
    await expect(page.getByRole("button", { name: /, SP$/ })).toHaveCount(0);
    await busca.fill("são p");

    await expect(page.getByRole("status")).toHaveText("2 cidades encontradas.");
    await expect(page.getByRole("button", { name: /, SP$/ })).toHaveText([
      "São Paulo, SP",
      "São Pedro, SP",
    ]);
    await busca.fill("xyz");
    await expect(page.getByRole("status")).toHaveText("Nenhuma cidade com esse nome.");
    expect(pedidos).toEqual(["/data/cidades.json"]);

    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(usarLocalizacao(page)).toBeVisible();
  });

  // spec 0001 CA-05
  test("oferece tentar de novo quando a lista de cidades não baixa", async ({ page }) => {
    const base = await servirBase(page, { cidades: "sem-conexao" });
    await abrirMercados(page);

    await escolherCidade(page).click();
    await expect(page.getByRole("alert")).toContainText(
      "Sem conexão para baixar a lista de cidades.",
    );

    base.trocar(basePadrao());
    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(page.getByLabel("Nome da cidade")).toBeVisible();
  });
});
