import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { abrirMercados, centro, servirBase } from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Onde comprar a lista (spec 0001, CA-16, CA-19 a CA-22 e CA-24): ponto, lista e preços
 * gravados direto no IndexedDB do app, com a base sintética de mercados servida pelo
 * Playwright e o relógio fixo, para o "antigo" não depender do dia.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const hoje = new Date("2026-11-13T15:00:00-03:00");
const origemDoMapa = "https://tiles.openfreemap.org";
const listaId = "11111111-1111-4111-8111-111111111111";
const criadoEm = "2026-11-01T12:00:00.000Z";

let sequencia = 0;
const uuid = () => `22222222-2222-4222-8222-${String(++sequencia).padStart(12, "0")}`;

function item(nome: string, ordem: number, campos: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    listaId,
    nome,
    quantidade: 1,
    marca: null,
    tamanho: null,
    preferencia: "mais-barato",
    comprado: false,
    ordem,
    criadoEm,
    ...campos,
  };
}

const nomes: Record<string, string> = {
  n101: "Mercadinho da Praça",
  n102: "Supermercado Exemplo",
  w103: "Atacarejo Modelo",
};

function preco(
  mercadoId: string,
  produto: string,
  precoCentavos: number,
  campos: Record<string, unknown> = {},
) {
  return {
    id: uuid(),
    produto,
    marca: null,
    tamanho: null,
    descricao: null,
    precoCentavos,
    minimoAtacado: null,
    mercadoId,
    mercadoNome: nomes[mercadoId],
    fonte: "digitado",
    vistoEm: "2026-11-10",
    nota: null,
    criadoEm: "2026-11-10T12:00:00.000Z",
    ...campos,
  };
}

/**
 * Arroz só da marca escrita, feijão e café em quilos e gramas, óleo com atacado não alcançado.
 * Atacarejo sozinho: R$ 109,15; Mercadinho + Atacarejo: R$ 81,15 (economiza R$ 28,00).
 */
const itens = [
  item("Arroz", 0, { tamanho: "5 kg", marca: "Tio João", preferencia: "so-esta-marca" }),
  item("Feijão", 1, { quantidade: 2, tamanho: "1 kg" }),
  item("Café", 2, { quantidade: 2, tamanho: "500 g" }),
  item("Óleo", 3, { quantidade: 3, tamanho: "900 ml" }),
  item("Sabão", 4, { comprado: true }),
];
const precos = [
  preco("n101", "Arroz", 3290, { marca: "Tio João", tamanho: "5 kg" }),
  preco("n101", "Feijão", 899, { tamanho: "1 kg" }),
  preco("n101", "Café", 890, { tamanho: "500 g", vistoEm: "2026-10-01" }),
  preco("n102", "Arroz", 2990, { marca: "Tio João", tamanho: "5 kg" }),
  preco("n102", "Feijão", 849, { tamanho: "1 kg" }),
  preco("n102", "Café", 1990, { tamanho: "500 g" }),
  preco("n102", "Óleo", 799, { tamanho: "900 ml" }),
  preco("w103", "Arroz", 2490, { marca: "Tio João", tamanho: "5 kg" }),
  preco("w103", "Arroz", 1990, { marca: "Prato Fino", tamanho: "5 kg" }),
  preco("w103", "Feijão", 799, { tamanho: "1 kg" }),
  preco("w103", "Café", 2290, { tamanho: "500 g" }),
  preco("w103", "Óleo", 749, { tamanho: "900 ml" }),
  preco("w103", "Óleo", 649, { tamanho: "900 ml", minimoAtacado: 6 }),
];

/** Grava os registros nos armazéns do app, que já criou o banco ao abrir a página. */
async function gravar(page: Page, registros: Record<string, readonly unknown[]>) {
  await page.evaluate(
    (registros) =>
      new Promise<void>((resolver, rejeitar) => {
        const pedido = indexedDB.open("cesta-certa");
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const transacao = banco.transaction(Object.keys(registros), "readwrite");
          for (const [armazem, lista] of Object.entries(registros)) {
            for (const registro of lista) transacao.objectStore(armazem).put(registro);
          }
          transacao.oncomplete = () => {
            banco.close();
            resolver();
          };
          transacao.onerror = () => rejeitar(transacao.error);
        };
      }),
    registros,
  );
}

async function abrirComparacao(page: Page, comPrecos = true) {
  await servirBase(page);
  await abrirMercados(page);
  await page.getByRole("button", { name: "Escolher cidade" }).waitFor();
  await gravar(page, {
    ajustes: [
      {
        id: "ponto",
        lat: centro.latitude,
        lon: centro.longitude,
        origem: "cidade",
        rotulo: "São Paulo, SP",
      },
    ],
    listas: [{ id: listaId, nome: "Novembro de 2026", criadaEm: criadoEm, atualizadaEm: criadoEm }],
    itens,
    observacoesDePreco: comPrecos ? precos : [],
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Atacarejo Modelo", exact: true })).toBeVisible();
}

const comparacao = (page: Page) => page.getByRole("region", { name: "Onde comprar a lista" });
const opcoes = (page: Page) =>
  comparacao(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 4 }) });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(hoje);
});

test.describe("onde comprar a lista", () => {
  // spec 0001 CA-19 CA-21 CA-22
  test("ordena as opções, diz o que comprar em cada mercado e quanto economiza", async ({
    page,
  }) => {
    await abrirComparacao(page);
    const area = comparacao(page);

    await expect(area.getByRole("status")).toHaveText(
      "5 opções para 4 itens da lista, da mais barata para a mais cara.",
    );
    await expect(area).toContainText(
      "Sem teto · O mais barato · Até 2 mercados · De carro, até 5 km",
    );
    await expect(opcoes(page).getByRole("heading")).toHaveText([
      "Opção 1: Mercadinho da Praça e Atacarejo Modelo",
      "Opção 2: Mercadinho da Praça e Supermercado Exemplo",
      "Opção 3: Atacarejo Modelo",
    ]);
    const primeira = opcoes(page).first();
    await expect(primeira).toContainText("R$ 81,15");
    await expect(primeira).toContainText(
      "Economiza R$ 28,00 em relação a comprar tudo em Atacarejo Modelo.",
    );
    await expect(primeira).toContainText("passando pelos 2 mercados");

    await primeira.getByRole("button", { name: /^O que comprar/ }).click();
    const mercadinho = primeira.getByRole("region", { name: "Em Mercadinho da Praça" });
    await expect(mercadinho.getByRole("heading")).toHaveText("Em Mercadinho da Praça: R$ 17,80");
    await expect(mercadinho.getByRole("listitem")).toHaveText([
      "Café (500 g): 2 × R$ 8,90 = R$ 17,80Digitado em 01/10/2026 · Antigo: visto há mais de 30 dias",
    ]);
    const atacarejo = primeira.getByRole("region", { name: "Em Atacarejo Modelo" });
    await expect(atacarejo.getByRole("listitem")).toHaveText([
      "Arroz (Tio João, 5 kg): R$ 24,90Digitado em 10/11/2026",
      "Feijão (1 kg): 2 × R$ 7,99 = R$ 15,98Digitado em 10/11/2026",
      "Óleo (900 ml): 3 × R$ 7,49 = R$ 22,47Digitado em 10/11/2026",
    ]);

    await area.getByRole("button", { name: "Mostrar mais 2 opções" }).click();
    await expect(opcoes(page).nth(4)).toContainText("Falta preço de 1 item: Óleo.");
    await expect(
      page
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name: "Atacarejo Modelo", level: 3 }) }),
    ).toContainText("Sua lista aqui: R$ 109,15");
    await expect(
      page
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name: "Mercadinho da Praça", level: 3 }) }),
    ).toContainText("Sua lista aqui: R$ 68,68, sem preço de 1 item");
  });

  // spec 0001 CA-24 CA-25
  test("o Ir da combinação abre a rota com as paradas em ordem e o modo do objetivo", async ({
    page,
  }) => {
    await abrirComparacao(page);
    const primeira = opcoes(page).first();

    await primeira.getByRole("button", { name: /^Ir/ }).click();

    const rota = primeira.getByRole("group", {
      name: "Rota até Mercadinho da Praça e Atacarejo Modelo",
    });
    await expect(rota.getByLabel("De carro")).toBeChecked();
    const link = new URL(
      (await rota.getByRole("link", { name: /Abrir no Google Maps/ }).getAttribute("href"))!,
    );
    expect(link.searchParams.get("travelmode")).toBe("driving");
    expect(link.searchParams.get("waypoints")).toMatch(/^-23\.547/);
    expect(link.searchParams.get("destination")).toMatch(/^-23\.519/);
  });

  // spec 0001 CA-19 CA-20
  test("muda o objetivo, guarda no aparelho e mostra o que fazer para caber no teto", async ({
    page,
  }) => {
    await abrirComparacao(page);
    const area = comparacao(page);

    await area.getByRole("button", { name: "Mudar o objetivo" }).click();
    const form = area.getByRole("form", { name: "Objetivo da compra" });
    await form.getByLabel("Quanto quer gastar no máximo?").fill("abc");
    await form.getByRole("button", { name: "Comparar" }).click();
    await expect(form.getByLabel("Quanto quer gastar no máximo?")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(form).toContainText("Escreva o valor em reais, como 600 ou 650,50");

    await form.getByLabel("Quanto quer gastar no máximo?").fill("75");
    await form.getByLabel("A pé").check();
    await form.getByRole("button", { name: "Comparar" }).click();

    await expect(form).toBeHidden();
    await expect(area.getByRole("button", { name: "Mudar o objetivo" })).toBeFocused();
    const ajuste = area.getByRole("region", { name: "Para caber no teto" });
    await expect(ajuste).toContainText("A opção mais barata passa do teto de R$ 75,00 em R$ 6,15.");
    await expect(ajuste.getByRole("listitem")).toHaveText([
      "Trocar Arroz (Tio João, 5 kg) por Prato Fino, 5 kg em Atacarejo Modelo: economiza R$ 5,00.",
      "Tirar Feijão da compra: economiza R$ 15,98.",
    ]);
    await expect(ajuste).toContainText("Com isso, a compra fica em R$ 60,17.");
    await expect(opcoes(page).first()).toContainText("Passa do teto em R$ 6,15.");

    await page.reload();
    await expect(comparacao(page)).toContainText(
      "Até R$ 75,00 · O mais barato · Até 2 mercados · A pé, até 5 km",
    );

    await comparacao(page).getByRole("button", { name: "Mudar o objetivo" }).click();
    await comparacao(page).getByLabel("Só 1 mercado").check();
    await comparacao(page).getByRole("button", { name: "Comparar" }).click();
    await expect(opcoes(page).getByRole("heading")).toHaveText([
      "Opção 1: Atacarejo Modelo",
      "Opção 2: Supermercado Exemplo",
      "Opção 3: Mercadinho da Praça",
    ]);
  });

  // spec 0001 CA-40
  test("sem preço, orienta a ler a nota ou digitar", async ({ page }) => {
    await abrirComparacao(page, false);
    const area = comparacao(page);

    await expect(area).toContainText("Você ainda não registrou nenhum preço.");
    await expect(area.getByRole("link", { name: "Ler uma nota fiscal" })).toHaveAttribute(
      "href",
      "/nota",
    );
    await expect(area.getByRole("link", { name: "Digitar um preço" })).toHaveAttribute(
      "href",
      "/precos#digitar",
    );
    await expect(area.getByRole("status")).toHaveText("");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a comparação com objetivo, compras e teto não tem violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await abrirComparacao(page);
      const area = comparacao(page);
      await area.getByRole("button", { name: "Mudar o objetivo" }).click();
      await area.getByLabel("Quanto quer gastar no máximo?").fill("75");
      await area.getByRole("button", { name: "Comparar" }).click();
      await opcoes(page)
        .first()
        .getByRole("button", { name: /^O que comprar/ })
        .click();
      await opcoes(page).first().getByRole("button", { name: /^Ir/ }).click();
      await area.getByRole("button", { name: "Mudar o objetivo" }).click();
      await area.getByLabel("Quanto quer gastar no máximo?").fill("x");
      await area.getByRole("button", { name: "Comparar" }).click();

      const results = await new AxeBuilder({ page }).withTags(wcag).analyze();

      expect(results.violations).toEqual([]);
    });
  }

  test.describe("no mapa", () => {
    test.use({ outrasOrigens: [origemDoMapa] });

    // spec 0001 CA-19
    test("escreve o total da lista sobre o pino do mapa", async ({ page }) => {
      await page.route(`${origemDoMapa}/**`, (route) =>
        route.fulfill({
          json: {
            version: 8,
            sources: {},
            layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8e4d8" } }],
          },
        }),
      );
      await abrirComparacao(page);

      await page.getByRole("button", { name: "Mostrar no mapa" }).click();

      await expect(page.locator(".mapa-total")).toHaveText(
        ["R$ 68,68 (falta 1)", "R$ 110,65", "R$ 109,15"],
        { timeout: 15_000 },
      );
      await expect(page.locator(".mapa-total").first()).toHaveAttribute("aria-hidden", "true");
    });
  });
});
