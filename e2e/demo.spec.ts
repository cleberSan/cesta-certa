import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { abrirComparacao, hoje, precos } from "./compra-de-exemplo";
import { expect, test } from "./fixtures";

/**
 * A demonstração (spec 0001, CA-35, CA-38 e CA-40; ADR-0007): bairro, mercados e preços
 * fictícios, separados dos dados da pessoa, com o assistente respondendo pelas gravações.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const comparacao = (page: Page) => page.getByRole("region", { name: "Onde comprar a lista" });
const opcoes = (page: Page) =>
  comparacao(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 4 }) });
const assistente = (page: Page) => page.getByRole("region", { name: "Assistente" });

const mercadosFicticios = [
  "Mercadinho Exemplo da Praça",
  "Sacolão Faz de Conta",
  "Supermercado Fictício Central",
  "Atacarejo Imaginário",
];

/** Tudo o que o app guardou no IndexedDB, armazém por armazém; vazio se o banco não existe. */
function bancoDoAparelho(page: Page): Promise<Record<string, unknown[]> | null> {
  return page.evaluate(async () => {
    const bancos = await indexedDB.databases();
    if (!bancos.some((banco) => banco.name === "cesta-certa")) return null;
    return new Promise<Record<string, unknown[]>>((resolver, rejeitar) => {
      const pedido = indexedDB.open("cesta-certa");
      pedido.onerror = () => rejeitar(pedido.error);
      pedido.onsuccess = () => {
        const banco = pedido.result;
        const nomes = [...banco.objectStoreNames];
        const transacao = banco.transaction(nomes, "readonly");
        const leituras = nomes.map((nome) => [nome, transacao.objectStore(nome).getAll()] as const);
        transacao.oncomplete = () => {
          banco.close();
          resolver(Object.fromEntries(leituras.map(([nome, leitura]) => [nome, leitura.result])));
        };
      };
    });
  });
}

function pedidosParaApi(page: Page): string[] {
  const pedidos: string[] = [];
  page.on("request", (pedido) => {
    const { pathname } = new URL(pedido.url());
    if (pathname === "/api" || pathname.startsWith("/api/")) pedidos.push(pathname);
  });
  return pedidos;
}

/** A comparação já vem pronta no HTML; os botões respondem depois que a ilha hidrata. */
async function abrirDemonstracao(page: Page) {
  await page.goto("/demonstracao");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(hoje);
});

test.describe("demonstração", () => {
  // spec 0001 CA-38
  test("compara a lista de exemplo em mercados fictícios, com cada preço marcado e sem rota", async ({
    page,
    consoleErrors,
  }) => {
    await abrirDemonstracao(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Como o Cesta Certa compara a compra",
    );
    await expect(page.getByRole("note")).toContainText("Tudo nesta página é fictício");
    await expect(
      page.getByRole("heading", { name: "Mercados perto da Vila Exemplo, em Cidade Fictícia" }),
    ).toBeVisible();
    await expect(page.locator(".mercados-lista").getByRole("heading", { level: 3 })).toHaveText(
      mercadosFicticios,
    );
    await expect(page.locator(".mercados-lista")).toContainText(
      "Mercado de bairro · 600 m · fictício",
    );
    await expect(opcoes(page).getByRole("heading")).toHaveText([
      "Opção 1: Mercadinho Exemplo da Praça e Atacarejo Imaginário",
      "Opção 2: Supermercado Fictício Central e Atacarejo Imaginário",
      "Opção 3: Sacolão Faz de Conta e Atacarejo Imaginário",
    ]);
    const primeira = opcoes(page).first();
    await expect(primeira).toContainText("R$ 175,06");
    await expect(comparacao(page)).toContainText("Na demonstração não há rota");
    await expect(comparacao(page).getByRole("button", { name: /^Ir / })).toHaveCount(0);

    await primeira.getByRole("button", { name: /^O que comprar/ }).click();
    const compras = primeira.getByRole("listitem");
    await expect(compras).toHaveCount(8);
    for (const compra of await compras.all()) {
      await expect(compra).toContainText("Demonstração: preço fictício de");
    }
    await expect(primeira).toContainText("Antigo: visto há mais de 30 dias");
    await expect(primeira).toContainText("Outra marca");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-38
  test("não abre nem cria o banco do aparelho, e o objetivo mudado some ao sair", async ({
    page,
  }) => {
    await abrirDemonstracao(page);
    await comparacao(page).getByRole("button", { name: "Mudar o objetivo" }).click();
    await comparacao(page).getByLabel("Só 1 mercado").check();
    await comparacao(page).getByRole("button", { name: "Comparar" }).click();
    await expect(opcoes(page).first().getByRole("heading")).toHaveText(
      "Opção 1: Supermercado Fictício Central",
    );

    expect(await bancoDoAparelho(page)).toBeNull();

    await page.reload();
    await expect(opcoes(page).first().getByRole("heading")).toHaveText(
      "Opção 1: Mercadinho Exemplo da Praça e Atacarejo Imaginário",
    );
  });

  // spec 0001 CA-38
  test("não mistura os dados da pessoa com os fictícios, nem num sentido nem no outro", async ({
    page,
  }) => {
    await abrirComparacao(page);
    const antes = await bancoDoAparelho(page);
    expect(antes?.["observacoesDePreco"]).toHaveLength(precos.length);

    await abrirDemonstracao(page);
    await expect(opcoes(page)).toHaveCount(3);
    await expect(page.getByText("Tio João")).toHaveCount(0);
    await expect(page.getByText("Atacarejo Modelo")).toHaveCount(0);
    await comparacao(page).getByRole("button", { name: "Mudar o objetivo" }).click();
    await comparacao(page).getByLabel("Só 1 mercado").check();
    await comparacao(page).getByRole("button", { name: "Comparar" }).click();

    await page.goto("/precos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preços");
    await expect(page.getByText("Demonstração: preço fictício")).toHaveCount(0);
    await expect(page.getByText(mercadosFicticios[0]!)).toHaveCount(0);
    expect(await bancoDoAparelho(page)).toEqual(antes);
  });

  // spec 0001 CA-35
  test("o assistente responde com a gravação, sem aceite, sem código e sem chamar o servidor", async ({
    page,
  }) => {
    const pedidos = pedidosParaApi(page);
    await page.route("**/api/**", (rota) => rota.abort("blockedbyclient"));
    await abrirDemonstracao(page);

    await assistente(page).getByRole("button", { name: "Perguntar ao assistente" }).click();
    await expect(assistente(page).getByRole("button", { name: "Aceitar e continuar" })).toHaveCount(
      0,
    );
    await expect(assistente(page).getByRole("textbox", { name: "Código de acesso" })).toHaveCount(
      0,
    );
    await assistente(page).getByRole("button", { name: "Vale a pena ir a dois mercados?" }).click();
    await assistente(page).getByRole("button", { name: "Perguntar", exact: true }).click();

    const resposta = assistente(page).locator(".assistente-resposta");
    await expect(resposta).toContainText("Esta é uma resposta gravada.");
    await expect(resposta).toContainText(
      "Resposta gravada da demonstração: o assistente não foi chamado.",
    );
    await expect(assistente(page).getByRole("button", { name: /Esquecer o aceite/ })).toHaveCount(
      0,
    );
    expect(pedidos).toEqual([]);
  });

  // spec 0001 CA-40
  test("sem preço registrado, a tela de mercados leva à demonstração", async ({ page }) => {
    await abrirComparacao(page, false);

    await comparacao(page).getByRole("link", { name: "Ver a demonstração" }).click();

    await expect(page).toHaveURL(/\/demonstracao$/);
    await expect(opcoes(page)).toHaveCount(3);
  });

  test("a página inicial apresenta a demonstração", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Ver a demonstração" }).click();

    await expect(page).toHaveURL(/\/demonstracao$/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a demonstração com compras e resposta não tem violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await abrirDemonstracao(page);
      await opcoes(page)
        .first()
        .getByRole("button", { name: /^O que comprar/ })
        .click();
      await assistente(page).getByRole("button", { name: "Perguntar ao assistente" }).click();
      await assistente(page)
        .getByRole("button", { name: "Por que a primeira opção é a melhor?" })
        .click();
      await assistente(page).getByRole("button", { name: "Perguntar", exact: true }).click();
      await expect(assistente(page).locator(".assistente-resposta")).toBeVisible();

      const resultado = await new AxeBuilder({ page }).withTags(wcag).analyze();

      expect(resultado.violations).toEqual([]);
    });
  }
});
