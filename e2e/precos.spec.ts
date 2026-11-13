import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { abrirMercados, servirBase } from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Preços digitados (spec 0001, CA-15 e CA-16), com a base sintética de mercados servida pelo
 * Playwright e o relógio do navegador fixo, para a data e o "antigo" não dependerem do dia.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const hoje = new Date("2026-11-13T15:00:00-03:00");

const formulario = (page: Page) => page.getByRole("form", { name: "Digitar um preço" });
const produto = (page: Page, nome: string) => page.getByRole("region", { name: nome });

async function escolherSaoPaulo(page: Page) {
  await abrirMercados(page);
  await page.getByRole("button", { name: "Escolher cidade" }).click();
  await page.getByLabel("Nome da cidade").fill("são paulo");
  await page.getByRole("button", { name: "São Paulo, SP" }).click();
  await expect(page.getByRole("heading", { name: "Mercadinho da Praça" })).toBeVisible();
}

async function abrirPrecos(page: Page, endereco = "/precos") {
  await page.goto(endereco);
  await page.getByRole("link", { name: "Ler a nota fiscal de uma compra" }).waitFor();
}

async function digitar(
  page: Page,
  campos: { produto: string; marca?: string; tamanho?: string; preco: string; mercado?: string },
) {
  const form = formulario(page);
  await form.getByLabel("Produto").fill(campos.produto);
  await form.getByLabel("Marca (se tiver)").fill(campos.marca ?? "");
  await form.getByLabel("Tamanho (se tiver)").fill(campos.tamanho ?? "");
  await form.getByLabel("Preço da embalagem (R$)").fill(campos.preco);
  if (campos.mercado !== undefined) {
    await form.getByLabel("Mercado").selectOption({ label: campos.mercado });
  }
  await form.getByRole("button", { name: "Guardar preço" }).click();
}

/** Lê os preços guardados direto do IndexedDB do app. */
function precosGuardados(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolver, rejeitar) => {
        const pedido = indexedDB.open("cesta-certa");
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const leitura = banco
            .transaction("observacoesDePreco", "readonly")
            .objectStore("observacoesDePreco")
            .getAll();
          leitura.onsuccess = () => {
            banco.close();
            resolver(leitura.result as Record<string, unknown>[]);
          };
          leitura.onerror = () => rejeitar(leitura.error);
        };
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(hoje);
});

test.describe("tela de preços", () => {
  test("sem preço, orienta a ler a nota ou digitar", async ({ page }) => {
    await abrirPrecos(page);

    await expect(page.getByRole("heading", { name: "Nenhum preço registrado" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ler a nota fiscal de uma compra" }),
    ).toHaveAttribute("href", "/nota");
    await expect(page.getByRole("button", { name: "Digitar um preço" })).toBeVisible();
  });

  // spec 0001 CA-15 CA-16
  test("guarda o preço digitado com mercado perto, fonte e data, e mantém depois de recarregar", async ({
    page,
  }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await abrirPrecos(page);
    await page.getByRole("button", { name: "Digitar um preço" }).click();

    await expect(formulario(page).getByLabel("Mercado")).toContainText(
      "Mercadinho da Praça (300 m)",
    );
    await digitar(page, {
      produto: "Arroz",
      marca: "Marca Exemplo",
      tamanho: "5 kg",
      preco: "25,90",
      mercado: "Mercadinho da Praça (300 m)",
    });

    await expect(page.getByRole("status").filter({ hasText: "Preço guardado" })).toHaveText(
      "Preço guardado: Arroz, R$ 25,90, em Mercadinho da Praça.",
    );
    await expect(formulario(page).getByLabel("Produto")).toBeFocused();
    await expect(formulario(page).getByLabel("Produto")).toHaveValue("");
    await expect(formulario(page).getByLabel("Mercado")).toHaveValue("n101");
    const arroz = produto(page, "Arroz");
    await expect(arroz).toContainText("R$ 25,90 · Marca Exemplo, 5 kg");
    // spec 0001 CA-17: o preço por kg aparece junto do preço da embalagem.
    await expect(arroz).toContainText("R$ 5,18 por kg");
    await expect(arroz).toContainText("Mercadinho da Praça");
    await expect(arroz).toContainText("Digitado em 13/11/2026");
    await expect(arroz).not.toContainText("Antigo");

    await page.reload();

    await expect(produto(page, "Arroz")).toContainText("Digitado em 13/11/2026");
    await expect(page.getByRole("heading", { name: "1 preço neste aparelho" })).toBeVisible();
    expect(await precosGuardados(page)).toEqual([
      expect.objectContaining({
        produto: "Arroz",
        marca: "Marca Exemplo",
        tamanho: "5 kg",
        precoCentavos: 2590,
        mercadoId: "n101",
        mercadoNome: "Mercadinho da Praça",
        fonte: "digitado",
        vistoEm: "2026-11-13",
        minimoAtacado: null,
      }),
    ]);
  });

  // spec 0001 CA-17
  test("mostra o preço por litro do fardo e nada quando o tamanho não é reconhecido", async ({
    page,
  }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await abrirPrecos(page, "/precos#digitar");

    await digitar(page, {
      produto: "Leite",
      tamanho: "12x1L",
      preco: "59,88",
      mercado: "Mercadinho da Praça (300 m)",
    });
    await digitar(page, { produto: "Pão", tamanho: "pacote", preco: "8,50" });

    await expect(produto(page, "Leite")).toContainText("R$ 59,88 · 12x1L");
    await expect(produto(page, "Leite")).toContainText("R$ 4,99 por litro");
    await expect(produto(page, "Pão")).toContainText("R$ 8,50 · pacote");
    await expect(produto(page, "Pão")).not.toContainText(" por ");
  });

  // spec 0001 CA-15 CA-18
  test("guarda o preço de atacado e mostra a partir de quantas unidades", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await abrirPrecos(page, "/precos#digitar");

    await formulario(page).getByLabel("Atacado: a partir de quantas unidades?").fill("3");
    await digitar(page, {
      produto: "Óleo",
      preco: "6,49",
      mercado: "Atacarejo Modelo (3,4 km)",
    });

    await expect(produto(page, "Óleo")).toContainText("Preço de atacado: a partir de 3 unidades");
  });

  // spec 0001 CA-15
  test("diz o que falta e não guarda o preço incompleto", async ({ page }) => {
    await abrirPrecos(page, "/precos#digitar");
    const erro = formulario(page).getByRole("alert");

    await formulario(page).getByRole("button", { name: "Guardar preço" }).click();
    await expect(erro).toHaveText("Escreva o produto, por exemplo Arroz.");

    await digitar(page, { produto: "Arroz", preco: "barato" });
    await expect(erro).toHaveText("Escreva o preço em reais, maior que zero, por exemplo 12,90.");

    await digitar(page, { produto: "Arroz", preco: "12,90" });
    await expect(erro).toHaveText("Escolha o mercado onde você viu o preço.");
    await expect(page.getByRole("heading", { name: "Nenhum preço registrado" })).toBeVisible();
  });

  test("sem ponto da busca, explica onde escolher e oferece os mercados cadastrados", async ({
    page,
  }) => {
    await abrirPrecos(page, "/precos#digitar");

    await expect(formulario(page).getByText("Para ver os mercados perto")).toBeVisible();
    await expect(formulario(page).getByRole("link", { name: "Mercados" })).toHaveAttribute(
      "href",
      "/mercados",
    );
  });

  // spec 0001 CA-16
  test("marca como antigo o preço visto há mais de 30 dias", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await abrirPrecos(page, "/precos#digitar");
    await digitar(page, {
      produto: "Café",
      preco: "18,00",
      mercado: "Mercadinho da Praça (300 m)",
    });
    await expect(produto(page, "Café")).toContainText("Digitado em 13/11/2026");

    await page.clock.setFixedTime(new Date("2026-12-15T10:00:00-03:00"));
    await page.reload();

    await expect(produto(page, "Café")).toContainText("Antigo: visto há mais de 30 dias");
  });

  test("exclui um preço depois de confirmar", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await abrirPrecos(page, "/precos#digitar");
    await digitar(page, {
      produto: "Café",
      preco: "18,00",
      mercado: "Mercadinho da Praça (300 m)",
    });

    await page
      .getByRole("button", { name: "Excluir o preço de R$ 18,00 em Mercadinho da Praça" })
      .click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(produto(page, "Café")).toBeVisible();
    await page.getByRole("button", { name: /Excluir o preço de R\$ 18,00/ }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Nenhum preço registrado" })).toBeVisible();
    expect(await precosGuardados(page)).toEqual([]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a tela com formulário, erro e preço antigo não tem violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await servirBase(page);
      await escolherSaoPaulo(page);
      await abrirPrecos(page, "/precos#digitar");
      await formulario(page).getByLabel("Atacado: a partir de quantas unidades?").fill("2");
      await digitar(page, {
        produto: "Café",
        marca: "Exemplo",
        preco: "18,00",
        mercado: "Mercadinho da Praça (300 m)",
      });
      await page.clock.setFixedTime(new Date("2026-12-15T10:00:00-03:00"));
      // O endereço ainda tem #digitar: o formulário abre sozinho depois de recarregar.
      await page.reload();
      await formulario(page).getByRole("button", { name: "Guardar preço" }).click();
      await expect(formulario(page).getByRole("alert")).toBeVisible();
      await page.getByRole("button", { name: /Excluir o preço/ }).click();

      const results = await new AxeBuilder({ page }).withTags(wcag).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
