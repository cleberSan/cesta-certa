import type { Page } from "@playwright/test";
import { gravar, hoje, itens, listaId, precos } from "./compra-de-exemplo";
import { expect, test } from "./fixtures";
import { itens as itensDaTela } from "./tela-da-lista";

/**
 * Uso sem internet (spec 0001, CA-36; ADR-0007). Só aqui o service worker fica liberado: nos
 * outros testes ele atenderia os pedidos fora do alcance do `page.route`.
 */
test.use({ serviceWorkers: "allow" });

const aviso = (page: Page) => page.locator("#aviso-sem-conexao");
const textoDoAviso =
  "Sem internet: a lista e os preços guardados neste aparelho continuam aqui, mas o mapa, a leitura da nota fiscal e o assistente precisam de conexão.";

/**
 * Primeira visita: abre os preços (que não criam lista sozinhos), grava a compra de exemplo e
 * espera o service worker ativo.
 */
async function primeiraVisita(page: Page) {
  await page.goto("/precos");
  await expect(page.getByRole("heading", { name: "Nenhum preço registrado" })).toBeVisible();
  await gravar(page, {
    listas: [
      {
        id: listaId,
        nome: "Novembro de 2026",
        criadaEm: "2026-11-01T12:00:00.000Z",
        atualizadaEm: "2026-11-01T12:00:00.000Z",
      },
    ],
    itens,
    observacoesDePreco: precos,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(aviso(page)).toBeEmpty();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(hoje);
});

test.describe("sem internet", () => {
  // spec 0001 CA-36
  test("depois da primeira visita, abre a lista e os preços guardados e avisa o que precisa de conexão", async ({
    page,
    context,
  }) => {
    await primeiraVisita(page);
    await context.setOffline(true);

    await page.goto("/lista");
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(aviso(page)).toHaveText(textoDoAviso);
    await expect(itensDaTela(page)).toHaveCount(itens.length);
    await expect(itensDaTela(page).first()).toContainText("Arroz");

    await page.goto("/precos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preços");
    await expect(page.getByRole("region", { name: "Arroz" })).toContainText("Atacarejo Modelo");
    await expect(aviso(page)).toHaveText(textoDoAviso);

    await page.goto("/nota");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ler a nota fiscal de uma compra",
    );
    await expect(aviso(page)).toHaveText(textoDoAviso);

    await page.goto("/demonstracao");
    await expect(page.getByRole("heading", { name: /^Opção 1:/ })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Onde a sua lista sai mais barata.",
    );
  });

  // spec 0001 CA-36
  test("o aviso some quando a conexão volta e aparece quando cai com a página aberta", async ({
    page,
    context,
  }) => {
    await primeiraVisita(page);

    await context.setOffline(true);
    await expect(aviso(page)).toHaveText(textoDoAviso);

    await context.setOffline(false);
    await expect(aviso(page)).toBeEmpty();
  });

  // spec 0002 CA-16
  test("sem internet, as páginas abrem com as fontes guardadas pelo service worker", async ({
    page,
    context,
  }) => {
    await primeiraVisita(page);
    await context.setOffline(true);

    await page.goto("/sobre");
    const familias = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((fonte) => fonte.status === "loaded")
        .map((fonte) => fonte.family.replaceAll('"', ""));
    });
    expect(familias.some((familia) => familia.startsWith("Bricolage Grotesque"))).toBe(true);
    expect(familias.some((familia) => familia.startsWith("Inter"))).toBe(true);
  });

  // spec 0001 CA-36
  test("página que o service worker não guarda mostra o erro de conexão do navegador", async ({
    page,
    context,
  }) => {
    await primeiraVisita(page);
    await context.setOffline(true);

    await expect(page.goto("/pagina-que-nao-existe")).rejects.toThrow(/ERR_/);
  });
});
