import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { ajustesGuardados, centro } from "./base-de-mercados";
import { abrirComparacao, hoje } from "./compra-de-exemplo";
import { expect, test as testeComFiscal } from "./fixtures";

/**
 * Assistente da compra (spec 0001, CA-26 a CA-35; ADR-0004), na compra de exemplo da
 * comparação. O servidor local responde com as gravações e um código sorteado a cada execução
 * (playwright.config.ts): nada chama a Anthropic. Os casos de falha trocam a resposta da rota
 * no próprio navegador.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const rota = "**/api/assistente";
const codigoDoE2E = process.env.E2E_ASSISTENTE_CODIGO ?? "";
const remoto = Boolean(process.env.E2E_BASE_URL);

/** Cada teste é um cliente próprio no limite de 10 pedidos por minuto (e2e/api.spec.ts). */
const test = testeComFiscal.extend({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    let hash = 7;
    for (const letra of `${testInfo.testId} ${testInfo.retry}`) {
      hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
    }
    await use({
      "CF-Connecting-IP": `10.${hash & 255}.${(hash >>> 8) & 255}.${(hash >>> 16) & 255}`,
    });
  },
});

const aceitoEm = "2026-11-13T12:00:00.000Z";
const comAceiteECodigo = [{ id: "assistente", aceitoEm, codigo: codigoDoE2E }];

const assistente = (page: Page) => page.getByRole("region", { name: "Assistente" });

async function abrirAssistente(page: Page, ajustes: readonly unknown[] = []) {
  await abrirComparacao(page, true, ajustes);
  await assistente(page).getByRole("button", { name: "Perguntar ao assistente" }).click();
}

async function perguntar(page: Page, pergunta: string) {
  const area = assistente(page);
  await area.getByRole("button", { name: pergunta }).click();
  await expect(area.getByRole("textbox", { name: "Sua pergunta" })).toHaveValue(pergunta);
  await area.getByRole("button", { name: "Perguntar", exact: true }).click();
}

function contarPedidos(page: Page) {
  const pedidos: Request[] = [];
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === "/api/assistente") pedidos.push(pedido);
  });
  return pedidos;
}

function responderCom(page: Page, status: number, corpo: unknown) {
  return page.route(rota, (route) =>
    route.fulfill({
      status,
      contentType: status === 200 ? "application/json" : "application/problem+json",
      body: JSON.stringify(corpo),
    }),
  );
}

const limite = { restantesHoje: 12, restantesMes: 200, voltaEm: null };

test.beforeEach(async ({ page }) => {
  test.skip(remoto, "O assistente da produção pede o código de acesso, que o E2E não tem.");
  await page.clock.setFixedTime(hoje);
});

test.describe("primeiro uso do assistente", () => {
  // spec 0001 CA-28
  test("explica o envio à Anthropic e, sem o aceite, não envia nem guarda nada", async ({
    page,
  }) => {
    const pedidos = contarPedidos(page);
    await abrirAssistente(page);
    const area = assistente(page);

    const aceite = area.getByRole("group", { name: "Antes da primeira pergunta" });
    await expect(aceite).toContainText("Anthropic");
    await expect(aceite).toContainText("Não vão a sua localização");
    await expect(area.getByRole("textbox", { name: "Sua pergunta" })).toHaveCount(0);

    await aceite.getByRole("button", { name: "Agora não" }).click();

    await expect(aceite).toHaveCount(0);
    await expect(area.getByRole("button", { name: "Perguntar ao assistente" })).toBeFocused();
    expect(pedidos).toEqual([]);
    expect(await ajustesGuardados(page)).not.toContainEqual(
      expect.objectContaining({ id: "assistente" }),
    );
    await area.getByRole("button", { name: "Perguntar ao assistente" }).click();
    await expect(area.getByRole("group", { name: "Antes da primeira pergunta" })).toBeVisible();
  });

  // spec 0001 CA-26 CA-27 CA-28 CA-29
  test("depois do aceite e do código, envia a compra sem a localização e mostra a resposta", async ({
    page,
  }) => {
    await abrirAssistente(page);
    const area = assistente(page);
    await area.getByRole("button", { name: "Aceitar e continuar" }).click();

    const campo = area.getByRole("textbox", { name: "Código de acesso" });
    await expect(campo).toBeFocused();
    await campo.fill("curto");
    await area.getByRole("button", { name: "Guardar o código" }).click();
    await expect(area.getByText("O código tem pelo menos 32 caracteres")).toBeVisible();
    await expect(campo).toBeFocused();
    await campo.fill(codigoDoE2E);
    await area.getByRole("button", { name: "Guardar o código" }).click();

    const enviado = page.waitForRequest(rota);
    await perguntar(page, "Vale a pena ir a dois mercados?");
    const pedido = await enviado;

    expect(pedido.headers()["authorization"]).toBe(`Bearer ${codigoDoE2E}`);
    const corpo = pedido.postDataJSON();
    expect(corpo.pergunta).toBe("Vale a pena ir a dois mercados?");
    expect(corpo.contexto.objetivo).toMatchObject({ teto: null, ateMercados: 2 });
    expect(corpo.contexto.lista.map((item: { nome: string }) => item.nome)).toEqual([
      "Arroz",
      "Feijão",
      "Café",
      "Óleo",
    ]);
    expect(corpo.contexto.opcoes).toHaveLength(3);
    expect(corpo.contexto.opcoes[0].total).toBe("R$ 81,15");
    const texto = pedido.postData() ?? "";
    for (const coordenada of [centro.latitude, centro.longitude]) {
      expect(texto).not.toContain(String(coordenada).slice(0, 5));
    }
    expect(texto).not.toMatch(/"lat"|"lon"|São Paulo, SP|n101|w103/);

    const resposta = area.getByRole("heading", { name: "Resposta" }).locator("..");
    await expect(resposta).toContainText("Esta é uma resposta gravada.");
    await expect(area).toContainText(/Restam \d+ perguntas hoje e \d+ no mês\./);
    expect(await ajustesGuardados(page)).toContainEqual({
      id: "assistente",
      aceitoEm: hoje.toISOString(),
      codigo: codigoDoE2E,
    });
  });

  test("esquecer apaga o aceite e o código do aparelho", async ({ page }) => {
    await abrirAssistente(page, comAceiteECodigo);
    const area = assistente(page);
    await expect(area.getByRole("textbox", { name: "Sua pergunta" })).toBeVisible();

    await area.getByRole("button", { name: "Esquecer o aceite e o código neste aparelho" }).click();

    await expect
      .poll(() => ajustesGuardados(page))
      .not.toContainEqual(expect.objectContaining({ id: "assistente" }));
    await area.getByRole("button", { name: "Perguntar ao assistente" }).click();
    await expect(area.getByRole("group", { name: "Antes da primeira pergunta" })).toBeVisible();
  });
});

test.describe("resposta e falhas do assistente", () => {
  // spec 0001 CA-33
  test("marca o valor em reais que não está nos dados enviados", async ({ page }) => {
    await responderCom(page, 200, {
      texto: "A primeira opção sai por R$ 81,15. Indo só ao Atacarejo, você gastaria R$ 99,90.",
      limite,
    });
    await abrirAssistente(page, comAceiteECodigo);

    await perguntar(page, "Por que a primeira opção é a melhor?");

    const area = assistente(page);
    const marcados = area.locator("mark");
    await expect(marcados).toHaveText(["R$ 99,90 (valor não conferido)"]);
    await expect(area).toContainText("A primeira opção sai por R$ 81,15.");
    await expect(area).toContainText("Confira no ranking antes de decidir.");
    await expect(area).toContainText("Restam 12 perguntas hoje e 200 no mês.");
  });

  // spec 0001 CA-30
  test("no limite, diz quando volta e mantém o ranking", async ({ page }) => {
    await responderCom(page, 429, {
      code: "assistente.limite",
      status: 429,
      detail: "Limite.",
      traceId: "trace-do-teste",
      limite: { restantesHoje: 0, restantesMes: 270, voltaEm: "2026-11-14T03:00:00.000Z" },
    });
    await abrirAssistente(page, comAceiteECodigo);

    await perguntar(page, "O que tirar para caber no teto?");

    const alerta = assistente(page).getByRole("alert");
    await expect(alerta).toContainText("O assistente chegou ao limite de perguntas de hoje.");
    await expect(alerta).toContainText("Volta em 14/11/2026 às 00:00, horário de Brasília.");
    await expect(alerta).toContainText("trace-do-teste");
    await expect(page.getByRole("heading", { name: /^Opção 1:/ })).toBeVisible();
  });

  // spec 0001 CA-32
  for (const [code, status, titulo] of [
    ["assistente.tempo-esgotado", 504, "O assistente demorou mais de 20 segundos."],
    ["assistente.indisponivel", 503, "O assistente não está disponível agora."],
    ["assistente.recusa", 422, "O assistente não respondeu a essa pergunta."],
  ] as const) {
    test(`na falha ${code}, avisa e mantém o ranking`, async ({ page }) => {
      await responderCom(page, status, { code, status, detail: "Falha.", traceId: "t", limite });
      await abrirAssistente(page, comAceiteECodigo);

      await perguntar(page, "Por que a primeira opção é a melhor?");

      await expect(assistente(page).getByRole("alert")).toContainText(titulo);
      await expect(page.getByRole("heading", { name: /^Opção 1:/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Opção 3:/ })).toBeVisible();
    });
  }

  // spec 0001 CA-29
  test("código recusado sai do aparelho e a tela pede de novo", async ({ page }) => {
    const errado = "e".repeat(40);
    await abrirAssistente(page, [{ id: "assistente", aceitoEm, codigo: errado }]);

    await perguntar(page, "Por que a primeira opção é a melhor?");

    const area = assistente(page);
    await expect(area.getByRole("alert")).toContainText("O código de acesso não confere.");
    await expect(area.getByRole("textbox", { name: "Código de acesso" })).toBeVisible();
    await expect
      .poll(() => ajustesGuardados(page))
      .toContainEqual({
        id: "assistente",
        aceitoEm,
        codigo: null,
      });
  });
});

test.describe("segredos fora do navegador", () => {
  // spec 0001 CA-34
  test("a página e os scripts entregues não trazem chave nem código", async ({ page }) => {
    const entregues: { endereco: string; texto: Promise<string> }[] = [];
    page.on("response", (resposta) => {
      const tipo = resposta.request().resourceType();
      if (tipo === "document" || tipo === "script") {
        entregues.push({ endereco: resposta.url(), texto: resposta.text() });
      }
    });

    await abrirComparacao(page);

    expect(entregues.filter(({ endereco }) => endereco.endsWith(".js")).length).toBeGreaterThan(0);
    for (const { endereco, texto } of entregues) {
      const conteudo = await texto;
      expect(conteudo, endereco).not.toMatch(/sk-ant-|ANTHROPIC_API_KEY/);
      expect(conteudo, endereco).not.toContain(codigoDoE2E);
    }
  });
});

test.describe("acessibilidade do assistente", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`o aceite e a resposta não têm violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await responderCom(page, 200, { texto: "Total de R$ 81,15, e não R$ 10,00.", limite });
      await abrirAssistente(page);
      const area = assistente(page);

      const noAceite = await new AxeBuilder({ page })
        .include(".assistente")
        .withTags(wcag)
        .analyze();
      expect(noAceite.violations).toEqual([]);

      await area.getByRole("button", { name: "Aceitar e continuar" }).click();
      await area.getByRole("textbox", { name: "Código de acesso" }).fill(codigoDoE2E);
      await area.getByRole("button", { name: "Guardar o código" }).click();
      await perguntar(page, "Por que a primeira opção é a melhor?");
      await expect(area.locator("mark")).toHaveText(["R$ 10,00 (valor não conferido)"]);

      const naResposta = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(naResposta.violations).toEqual([]);
    });
  }
});
