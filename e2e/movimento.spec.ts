import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { abrir, adicionarEEsperar } from "./tela-da-lista";

/**
 * Movimento reduzido (spec 0002, CA-18): com o pedido do sistema, nenhum elemento da página tem
 * transição ou animação. Sem o pedido, as que existem aparecem, o que mostra que o teste mede algo.
 */

/** Elementos com transição ou animação, descritos pela tag e classe. */
async function comMovimento(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("*")].flatMap((elemento) => {
      const estilo = getComputedStyle(elemento);
      const transicao = estilo.transitionDuration.split(",").some((tempo) => parseFloat(tempo) > 0);
      const animacao = estilo.animationName.split(",").some((nome) => nome.trim() !== "none");
      if (!transicao && !animacao) return [];
      const classe = elemento.getAttribute("class") ?? "";
      return [`${elemento.tagName.toLowerCase()}.${classe.split(" ")[0]}`];
    }),
  );
}

async function visitar(page: Page): Promise<Record<string, string[]>> {
  const achados: Record<string, string[]> = {};
  await page.goto("/");
  achados["/"] = await comMovimento(page);
  await page.goto("/demonstracao");
  await expect(page.getByRole("heading", { name: /^Opção 1:/ })).toBeVisible();
  achados["/demonstracao"] = await comMovimento(page);
  await abrir(page);
  await adicionarEEsperar(page, "Arroz");
  achados["/lista"] = await comMovimento(page);
  return achados;
}

// spec 0002 CA-18
test("com movimento reduzido, nenhuma transição ou animação roda", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const achados = await visitar(page);

  expect(achados).toEqual({ "/": [], "/demonstracao": [], "/lista": [] });
  const rolagem = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  expect(rolagem).toBe("auto");
});

// spec 0002 CA-18
test("sem o pedido, botões, blocos, barras e itens têm movimento", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const achados = await visitar(page);

  expect(achados["/"]).toEqual(expect.arrayContaining(["a.atalho", "a.botao"]));
  expect(achados["/demonstracao"]).toEqual(expect.arrayContaining(["rect.comparar-barra-valor"]));
  expect(achados["/lista"]).toEqual(expect.arrayContaining(["li.lista-item"]));
});
