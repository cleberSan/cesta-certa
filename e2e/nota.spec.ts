import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { consultaRoute, linkSintetico } from "./routes";

/**
 * A tela de teste da nota (/nota). O que depende da Secretaria da Fazenda é respondido aqui
 * pelo próprio teste, no lugar do servidor: a suíte não consulta site de terceiro. O que o
 * servidor recusa sozinho (link fora da lista) passa pelo Worker de verdade.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const traceId = "0b9d6f0e-1111-4222-8333-444455556666";

const nota = {
  uf: "SP",
  mercado: {
    cnpj: "11222333000181",
    nome: "MERCADO EXEMPLO LTDA",
    endereco: "RUA DAS FLORES, 100, CENTRO, SAO PAULO, SP",
  },
  emitidaEm: "2026-11-07T10:15:30",
  itens: [
    {
      descricao: "CAFE SOLUVEL 200G",
      codigo: "7890000000017",
      quantidade: "2",
      unidade: "UN",
      precoUnitarioCentavos: 1899,
      totalCentavos: 3798,
    },
    {
      descricao: "QUEIJO MUCARELA KG",
      codigo: "2000340",
      quantidade: "0.345",
      unidade: "KG",
      precoUnitarioCentavos: 3890,
      totalCentavos: 1342,
    },
  ],
  itensNaoLidos: 0,
};

const reais = (texto: string) => new RegExp(`R\\$\\s${texto.replace(".", "\\.")}`);

async function abrir(page: Page) {
  await page.goto("/nota");
  // O botão liga quando a ilha termina de carregar.
  await expect(page.getByRole("button", { name: "Ler nota" })).toBeEnabled();
}

async function consultar(page: Page, link: string) {
  await page.getByLabel("Link do QR Code da nota").fill(link);
  await page.getByRole("button", { name: "Ler nota" }).click();
}

function responder(page: Page, tratar: (route: Route) => Promise<void>) {
  return page.route(`**${consultaRoute}`, tratar);
}

function comJson(route: Route, status: number, corpo: unknown) {
  return route.fulfill({
    status,
    contentType: status === 200 ? "application/json" : "application/problem+json",
    headers: { "X-Correlation-Id": traceId },
    body: JSON.stringify(corpo),
  });
}

function problema(status: number, code: string, extras: Record<string, unknown> = {}) {
  return {
    type: "about:blank",
    title: "Erro",
    status,
    detail: "Detalhe.",
    code,
    traceId,
    ...extras,
  };
}

test.describe("nota lida", () => {
  test("mostra o mercado, a data e os itens com preço", async ({
    page,
    consoleErrors,
    isMobile,
  }) => {
    const enviados: unknown[] = [];
    await responder(page, async (route) => {
      enviados.push(route.request().postDataJSON());
      await comJson(route, 200, nota);
    });
    await abrir(page);

    await consultar(page, `  ${linkSintetico}  `);

    await expect(page.getByRole("heading", { name: "MERCADO EXEMPLO LTDA" })).toBeVisible();
    await expect(page.getByText("11.222.333/0001-81")).toBeVisible();
    await expect(page.getByText("07/11/2026 às 10:15")).toBeVisible();
    await expect(page.getByText(reais("51,40"))).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Nota lida: 2 itens.");

    const itens = page.getByRole("region", { name: "Itens da nota" });
    await expect(itens.getByRole("row")).toHaveCount(3);
    const queijo = itens.getByRole("row", { name: /QUEIJO MUCARELA KG/ });
    const conta = queijo.locator(".consulta-conta-do-item");
    if (isMobile) {
      // No celular a conta do item fica embaixo do nome e só o total tem coluna.
      await expect(conta).toHaveText(/^0,345 KG × R\$\s38,90$/);
      await expect(queijo.getByRole("cell")).toHaveCount(1);
      await expect(queijo.getByRole("cell")).toHaveText(reais("13,42"));
    } else {
      await expect(conta).toBeHidden();
      await expect(queijo.getByRole("cell").nth(0)).toHaveText("0,345");
      await expect(queijo.getByRole("cell").nth(1)).toHaveText("KG");
      await expect(queijo.getByRole("cell").nth(2)).toHaveText(reais("38,90"));
      await expect(queijo.getByRole("cell").nth(3)).toHaveText(reais("13,42"));
    }

    // O app manda só o link, sem espaço em volta.
    expect(enviados).toEqual([{ url: linkSintetico }]);
    expect(consoleErrors).toEqual([]);
  });

  test("a tela com a nota não tem violações de acessibilidade nem rolagem horizontal", async ({
    page,
  }) => {
    // Item de valor alto e nome comprido: o caso que mais aperta a tabela no celular.
    const caro = {
      descricao: "LEITE INTEGRAL LONGA VIDA CAIXA COM 12 UNIDADES DE 1 LITRO",
      codigo: "7890000000024",
      quantidade: "12.5",
      unidade: "CX",
      precoUnitarioCentavos: 1_059_90,
      totalCentavos: 13_248_75,
    };
    await responder(page, (route) =>
      comJson(route, 200, { ...nota, itens: [...nota.itens, caro] }),
    );
    await abrir(page);
    await consultar(page, linkSintetico);
    const itens = page.getByRole("region", { name: "Itens da nota" });
    await expect(itens.getByRole("row", { name: /LEITE INTEGRAL/ })).toContainText(
      reais("13.248,75"),
    );

    const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(results.violations).toEqual([]);
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
    // Os preços aparecem inteiros: a tabela cabe na largura, sem rolar para o lado.
    const sobraDaTabela = await itens.evaluate((area) => area.scrollWidth - area.clientWidth);
    expect(sobraDaTabela).toBeLessThanOrEqual(0);
  });

  test("mostra como texto a descrição que traz marcação, sem executar nada", async ({
    page,
    consoleErrors,
  }) => {
    const malicioso = '<img src=x onerror="document.title=1"><script>document.title=2</script>';
    await responder(page, (route) =>
      comJson(route, 200, {
        ...nota,
        mercado: { ...nota.mercado, nome: "<b>MERCADO</b>" },
        itens: [{ ...nota.itens[0], descricao: malicioso }],
      }),
    );
    let dialogos = 0;
    page.on("dialog", () => dialogos++);
    await abrir(page);
    const titulo = await page.title();

    await consultar(page, linkSintetico);

    const itens = page.getByRole("region", { name: "Itens da nota" });
    await expect(itens.getByText(malicioso)).toBeVisible();
    await expect(page.getByRole("heading", { name: "<b>MERCADO</b>" })).toBeVisible();
    await expect(page.locator(".consulta img, .consulta script, .consulta b")).toHaveCount(0);
    expect(await page.title()).toBe(titulo);
    expect(dialogos).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test("avisa quando algum item ficou de fora e limpa a tela no botão Limpar", async ({ page }) => {
    await responder(page, (route) => comJson(route, 200, { ...nota, itensNaoLidos: 2 }));
    await abrir(page);
    await consultar(page, linkSintetico);
    await expect(page.getByText("2 itens da nota não puderam ser lidos")).toBeVisible();

    await page.getByRole("button", { name: "Limpar" }).click();

    await expect(page.getByLabel("Link do QR Code da nota")).toHaveValue("");
    await expect(page.getByRole("region", { name: "Itens da nota" })).toHaveCount(0);
  });
});

test.describe("nota que não pôde ser lida", () => {
  // spec 0001 CA-12
  test("link de outro site é recusado pelo servidor e a tela explica o motivo", async ({
    page,
  }) => {
    await abrir(page);

    await consultar(page, linkSintetico.replace("www.nfce.fazenda.sp.gov.br", "evil.example"));

    const alerta = page.getByRole("alert");
    await expect(
      alerta.getByRole("heading", { name: "Esse endereço não é o da consulta de nota fiscal" }),
    ).toBeVisible();
    await expect(alerta).toContainText("nfce.host-nao-permitido");
    await expect(alerta).toContainText(/Consulta: [0-9a-f]{8}-[0-9a-f]{4}-/);
    await expect(alerta).not.toContainText("evil.example");
    await expect(alerta).not.toContainText("guarde o cupom");
  });

  test("campo vazio pede o link sem chamar o servidor", async ({ page, consoleErrors }) => {
    let chamadas = 0;
    await responder(page, async (route) => {
      chamadas++;
      await route.abort();
    });
    await abrir(page);

    await page.getByRole("button", { name: "Ler nota" }).click();

    await expect(page.getByRole("alert")).toContainText("Cole o link da nota");
    expect(chamadas).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-13
  for (const [caso, status, code, titulo] of [
    ["captcha", 502, "nfce.captcha", "A Secretaria da Fazenda pediu uma verificação"],
    [
      "formato desconhecido",
      502,
      "nfce.formato-desconhecido",
      "A página da nota veio num formato que o app ainda não conhece",
    ],
    [
      "tempo esgotado",
      504,
      "nfce.tempo-esgotado",
      "A Secretaria da Fazenda demorou mais de 8 segundos",
    ],
    [
      "consulta fora do ar",
      502,
      "nfce.indisponivel",
      "A consulta da Secretaria da Fazenda não respondeu como esperado",
    ],
  ] as const) {
    test(`${caso}: avisa, mostra o código e aponta a saída de digitar os preços`, async ({
      page,
    }) => {
      const diagnostico = { status: 200, sinais: { captcha: code === "nfce.captcha" } };
      await responder(page, (route) =>
        comJson(route, status, problema(status, code, { diagnostico })),
      );
      await abrir(page);

      await consultar(page, linkSintetico);

      const alerta = page.getByRole("alert");
      await expect(alerta.getByRole("heading", { name: titulo })).toBeVisible();
      await expect(alerta).toContainText("os preços desta compra poderão ser digitados");
      await expect(alerta).toContainText(code);
      await expect(alerta).toContainText(traceId);

      await alerta.getByText("Diagnóstico técnico (sem conteúdo da nota)").click();
      await expect(alerta.locator("pre")).toContainText('"captcha"');
      await expect(page.getByRole("region", { name: "Itens da nota" })).toHaveCount(0);

      const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("sem conexão avisa e deixa tentar de novo", async ({ page }) => {
    let tentativas = 0;
    await responder(page, async (route) => {
      tentativas++;
      if (tentativas === 1) await route.abort("internetdisconnected");
      else await comJson(route, 200, nota);
    });
    await abrir(page);

    await consultar(page, linkSintetico);
    await expect(page.getByRole("alert")).toContainText("Sem conexão com o Cesta Certa");

    await page.getByRole("button", { name: "Ler nota" }).click();
    await expect(page.getByRole("heading", { name: "MERCADO EXEMPLO LTDA" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("resposta fora do contrato vira aviso, sem mostrar o conteúdo recebido", async ({
    page,
  }) => {
    await responder(page, (route) =>
      comJson(route, 200, { uf: "SP", mercado: { cnpj: "<script>" }, itens: "muitos" }),
    );
    await abrir(page);

    await consultar(page, linkSintetico);

    const alerta = page.getByRole("alert");
    await expect(alerta).toContainText("O servidor respondeu de um jeito inesperado");
    await expect(alerta).toContainText("app.resposta-inesperada");
    await expect(page.locator(".consulta")).not.toContainText("muitos");
  });

  test("não deixa enviar duas vezes enquanto consulta", async ({ page }) => {
    let liberar = () => {};
    const espera = new Promise<void>((resolver) => (liberar = resolver));
    let chamadas = 0;
    await responder(page, async (route) => {
      chamadas++;
      await espera;
      await comJson(route, 200, nota);
    });
    await abrir(page);

    await consultar(page, linkSintetico);

    await expect(page.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Limpar" })).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText(
      "Consultando a nota na Secretaria da Fazenda.",
    );
    liberar();
    await expect(page.getByRole("button", { name: "Ler nota" })).toBeEnabled();
    expect(chamadas).toBe(1);
  });
});
