import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { modulosDoQr, textoDoQr } from "../src/features/precos/nfce/fixtures/qr-da-nota";
import { abrirMercados, servirBase } from "./base-de-mercados";
import { expect, test } from "./fixtures";
import { chaveSintetica, consultaRoute, linkSintetico } from "./routes";
import { abrir as abrirLista, adicionarEEsperar } from "./tela-da-lista";

/**
 * A tela da nota (/nota). O que depende da Secretaria da Fazenda é respondido aqui
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
    await expect(page.getByText("Nota lida: 2 itens.")).toHaveRole("status");

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
    await expect(alerta.getByRole("link", { name: "Digitar os preços desta compra" })).toHaveCount(
      0,
    );
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
      // spec 0001 CA-13: a saída é digitar os preços da compra, com o formulário já aberto.
      await expect(
        alerta.getByRole("link", { name: "Digitar os preços desta compra" }),
      ).toHaveAttribute("href", "/precos#digitar");
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
    await expect(page.getByText("Consultando a nota na Secretaria da Fazenda.")).toHaveRole(
      "status",
    );
    liberar();
    await expect(page.getByRole("button", { name: "Ler nota" })).toBeEnabled();
    expect(chamadas).toBe(1);
  });
});

/** Ponto em São Paulo, com a base sintética de mercados, e itens na lista do mês. */
async function prepararAparelho(page: Page, itensDaLista: readonly string[]) {
  await servirBase(page);
  await abrirMercados(page);
  await page.getByRole("button", { name: "Escolher cidade" }).click();
  await page.getByLabel("Nome da cidade").fill("são paulo");
  await page.getByRole("button", { name: "São Paulo, SP" }).click();
  await expect(page.getByRole("heading", { name: "Mercadinho da Praça" })).toBeVisible();
  if (itensDaLista.length > 0) {
    await abrirLista(page);
    for (const nome of itensDaLista) await adicionarEEsperar(page, nome);
  }
}

const importacao = (page: Page) =>
  page.getByRole("region", { name: "Guardar os preços desta nota" });

/** Lê um armazém do app direto do IndexedDB. */
function armazem(page: Page, nome: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (nome) =>
      new Promise<Record<string, unknown>[]>((resolver, rejeitar) => {
        const pedido = indexedDB.open("cesta-certa");
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const leitura = banco.transaction(nome, "readonly").objectStore(nome).getAll();
          leitura.onsuccess = () => {
            banco.close();
            resolver(leitura.result as Record<string, unknown>[]);
          };
          leitura.onerror = () => rejeitar(leitura.error);
        };
      }),
    nome,
  );
}

/** Outra nota do mesmo mercado: o café de novo, o queijo e um produto novo. */
const segundaNota = {
  ...nota,
  emitidaEm: "2026-11-12T18:40:00",
  itens: [
    { ...nota.itens[0], precoUnitarioCentavos: 1799, totalCentavos: 1799, quantidade: "1" },
    nota.itens[1],
    {
      descricao: "ARROZ TIPO 1 5KG",
      codigo: "7890000000031",
      quantidade: "1",
      unidade: "UN",
      precoUnitarioCentavos: 2590,
      totalCentavos: 2590,
    },
  ],
};
const outroLink = linkSintetico.replace("000012345", "000067890");

test.describe("guardar os preços da nota", () => {
  // spec 0001 CA-10, CA-11
  test("guarda os preços com o mercado e os itens da lista escolhidos, sem guardar o link", async ({
    page,
    consoleErrors,
  }) => {
    await prepararAparelho(page, ["Café", "Queijo"]);
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);
    await consultar(page, linkSintetico);

    const area = importacao(page);
    await area.getByLabel("Mercado desta nota").selectOption("n101");
    await area.getByLabel("CAFE SOLUVEL 200G").selectOption({ label: "Café" });
    await expect(area.getByText("Falta escolher 1 produto.")).toBeVisible();
    await area.getByLabel("QUEIJO MUCARELA KG").selectOption({ label: "Queijo" });
    await area.getByRole("button", { name: "Guardar 2 preços" }).click();

    await expect(page.getByRole("heading", { name: "Preços guardados" })).toBeVisible();
    await expect(page.getByText("2 preços de Mercadinho da Praça guardados.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver os preços" })).toHaveAttribute(
      "href",
      "/precos",
    );

    // O IndexedDB devolve na ordem do id, que é sorteado: aqui, em ordem de produto.
    const precos = (await armazem(page, "observacoesDePreco")).sort((a, b) =>
      String(a["produto"]).localeCompare(String(b["produto"])),
    );
    expect(precos).toEqual([
      expect.objectContaining({
        produto: "Café",
        descricao: "CAFE SOLUVEL 200G",
        precoCentavos: 1899,
        tamanho: null,
        mercadoId: "n101",
        mercadoNome: "Mercadinho da Praça",
        fonte: "nota",
        vistoEm: "2026-11-07",
        nota: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      // Vendido a peso: o preço guardado é o de 1 kg.
      expect.objectContaining({ produto: "Queijo", precoCentavos: 3890, tamanho: "1 kg" }),
    ]);
    // spec 0001 CA-11: nem o link nem a chave de acesso ficam no aparelho.
    const tudo = JSON.stringify([precos, await armazem(page, "associacoes")]);
    expect(tudo).not.toContain(chaveSintetica);
    expect(tudo).not.toContain("nfce.fazenda");

    await page.getByRole("link", { name: "Ver os preços" }).click();
    const cafe = page.getByRole("region", { name: "Café" });
    await expect(cafe).toContainText("Mercadinho da Praça");
    await expect(cafe).toContainText("Nota fiscal de 07/11/2026");
    // spec 0001 CA-17: o tamanho vem da descrição da nota ("200G").
    await expect(cafe).toContainText("R$ 94,95 por kg");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-14
  test("pede a escolha de cada produto e do mercado antes de guardar", async ({ page }) => {
    await prepararAparelho(page, ["Café"]);
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);
    await consultar(page, linkSintetico);
    const area = importacao(page);
    const guardar = area.getByRole("button", { name: /^Guardar/ });

    await expect(area.getByText("Faltam escolher 2 produtos.")).toBeVisible();
    await guardar.click();
    await expect(area.getByRole("alert")).toHaveText("Escolha o mercado desta nota.");

    await area.getByLabel("Mercado desta nota").selectOption("n101");
    await guardar.click();
    await expect(area.getByRole("alert")).toContainText("Faltam escolher 2 produtos.");
    expect(await armazem(page, "observacoesDePreco")).toEqual([]);

    await area.getByRole("button", { name: "Ignorar os que faltam" }).click();
    await expect(area.getByLabel("CAFE SOLUVEL 200G")).toHaveValue("ignorar");
    await expect(area.getByRole("button", { name: "Ignorar os que faltam" })).toHaveCount(0);
    await area.getByRole("button", { name: "Guardar as escolhas" }).click();

    await expect(
      page.getByText("Nenhum preço guardado de Mercadinho da Praça. 2 produtos ignorados."),
    ).toBeVisible();
    expect(await armazem(page, "observacoesDePreco")).toEqual([]);
  });

  // spec 0001 CA-14
  test("lembra o mercado e as escolhas na nota seguinte da mesma loja", async ({ page }) => {
    await prepararAparelho(page, ["Café", "Arroz"]);
    let resposta: unknown = nota;
    await responder(page, (route) => comJson(route, 200, resposta));
    await abrir(page);
    await consultar(page, linkSintetico);
    const area = importacao(page);
    await area.getByLabel("Mercado desta nota").selectOption("n101");
    await area.getByLabel("CAFE SOLUVEL 200G").selectOption({ label: "Café" });
    await area.getByLabel("QUEIJO MUCARELA KG").selectOption({ label: "Ignorar este produto" });
    await area.getByRole("button", { name: "Guardar 1 preço" }).click();
    await expect(page.getByRole("heading", { name: "Preços guardados" })).toBeVisible();

    // Outro dia, outra nota do mesmo CNPJ: a página é aberta de novo.
    resposta = segundaNota;
    await page.reload();
    await expect(page.getByRole("button", { name: "Ler nota" })).toBeEnabled();
    await consultar(page, outroLink);

    await expect(area.getByLabel("Mercado desta nota")).toHaveValue("n101");
    const cafe = area.getByLabel("CAFE SOLUVEL 200G");
    await expect(cafe).toHaveValue(/^p\d+$/);
    await expect(cafe.locator("option:checked")).toHaveText("Café");
    await expect(area.getByLabel("QUEIJO MUCARELA KG")).toHaveValue("ignorar");
    await expect(area.getByLabel("ARROZ TIPO 1 5KG")).toHaveValue("");
    await expect(area.getByText("Falta escolher 1 produto.")).toBeVisible();
    await expect(area.getByText("escolha lembrada da última nota")).toHaveCount(2);

    await area.getByLabel("ARROZ TIPO 1 5KG").selectOption({ label: "Arroz" });
    await area.getByRole("button", { name: "Guardar 2 preços" }).click();
    await expect(page.getByText("2 preços de Mercadinho da Praça guardados.")).toBeVisible();

    const precos = await armazem(page, "observacoesDePreco");
    expect(
      // O IndexedDB devolve na ordem do id, que é sorteado: a comparação ignora a ordem.
      precos.map((preco) => [preco["produto"], preco["precoCentavos"], preco["vistoEm"]]).sort(),
    ).toEqual([
      ["Arroz", 2590, "2026-11-12"],
      ["Café", 1799, "2026-11-12"],
      ["Café", 1899, "2026-11-07"],
    ]);
  });

  test("a mesma nota lida de novo troca os preços dela, sem repetir", async ({ page }) => {
    await prepararAparelho(page, ["Café", "Queijo"]);
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);
    for (const vez of [1, 2]) {
      await consultar(page, linkSintetico);
      const area = importacao(page);
      if (vez === 1) {
        await area.getByLabel("Mercado desta nota").selectOption("n101");
        await area.getByLabel("CAFE SOLUVEL 200G").selectOption({ label: "Café" });
        await area.getByLabel("QUEIJO MUCARELA KG").selectOption({ label: "Queijo" });
      } else {
        await expect(area).toContainText(
          "Esta nota já foi importada (2 preços). Guardar de novo troca os preços dela pelos desta vez, sem repetir.",
        );
      }
      await area.getByRole("button", { name: "Guardar 2 preços" }).click();
      await expect(page.getByRole("heading", { name: "Preços guardados" })).toBeVisible();
    }

    expect(await armazem(page, "observacoesDePreco")).toHaveLength(2);
  });

  test("sem itens na lista, avisa e deixa só ignorar", async ({ page }) => {
    await prepararAparelho(page, []);
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);
    await consultar(page, linkSintetico);

    const area = importacao(page);
    await expect(area.getByText("Sua lista ainda não tem itens.")).toBeVisible();
    await expect(area.getByRole("link", { name: "Lista" })).toHaveAttribute("href", "/lista");
    await expect(area.getByLabel("CAFE SOLUVEL 200G").locator("option")).toHaveText([
      "Escolha o item da lista",
      "Ignorar este produto",
    ]);
  });

  test("a área de guardar não tem violações de acessibilidade nem rolagem horizontal", async ({
    page,
  }) => {
    await prepararAparelho(page, ["Café", "Queijo"]);
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);
    await consultar(page, linkSintetico);
    await expect(importacao(page).getByLabel("Mercado desta nota")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(results.violations).toEqual([]);
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });
});

/**
 * Câmera simulada: o `getUserMedia` devolve o vídeo de um canvas com o QR Code do link
 * sintético, desenhado a partir dos módulos. O Chromium de teste não tem `BarcodeDetector`, então
 * a leitura passa pelo jsQR, o caminho do Safari no iPhone.
 */
async function simularCamera(page: Page, modo: "qr" | "sem-qr" | "negada") {
  await page.addInitScript(
    ({ modo, modulos }) => {
      const registro = { pedidos: 0, desligadas: 0 };
      Object.assign(window, { __camera: registro });
      navigator.mediaDevices.getUserMedia = async () => {
        registro.pedidos += 1;
        if (modo === "negada") throw new DOMException("negada", "NotAllowedError");
        const escala = 6;
        const margem = 4;
        const lado = (modulos.length + margem * 2) * escala;
        const tela = document.createElement("canvas");
        tela.width = lado;
        tela.height = lado;
        const contexto = tela.getContext("2d")!;
        const desenhar = () => {
          contexto.fillStyle = "#fff";
          contexto.fillRect(0, 0, lado, lado);
          contexto.fillStyle = "#000";
          modulos.forEach((linha, y) => {
            [...linha].forEach((modulo, x) => {
              if (modulo === "1") {
                contexto.fillRect((x + margem) * escala, (y + margem) * escala, escala, escala);
              }
            });
          });
        };
        desenhar();
        setInterval(desenhar, 100);
        const fluxo = tela.captureStream(10);
        for (const trilha of fluxo.getTracks()) {
          const parar = trilha.stop.bind(trilha);
          trilha.stop = () => {
            registro.desligadas += 1;
            parar();
          };
        }
        return fluxo;
      };
    },
    { modo, modulos: modo === "qr" ? modulosDoQr : [] },
  );
}

const camera = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __camera: { pedidos: number; desligadas: number } }).__camera,
  );

test.describe("QR Code pela câmera", () => {
  // spec 0001 CA-10
  test("lê o QR Code do cupom, desliga a câmera e consulta a nota", async ({
    page,
    consoleErrors,
  }) => {
    await simularCamera(page, "qr");
    const enviados: unknown[] = [];
    await responder(page, async (route) => {
      enviados.push(route.request().postDataJSON());
      await comJson(route, 200, nota);
    });
    await abrir(page);
    expect((await camera(page)).pedidos).toBe(0);

    await page.getByRole("button", { name: "Ler o QR Code com a câmera" }).click();

    await expect(page.getByRole("heading", { name: "MERCADO EXEMPLO LTDA" })).toBeVisible();
    expect(enviados).toEqual([{ url: textoDoQr }]);
    await expect(page.getByLabel("Link do QR Code da nota")).toHaveValue(textoDoQr);
    await expect(page.getByLabel("Imagem da câmera para ler o QR Code")).toHaveCount(0);
    expect(await camera(page)).toEqual({ pedidos: 1, desligadas: 1 });
    expect(consoleErrors).toEqual([]);
  });

  test("a câmera aberta não tem violações de acessibilidade e fecha no botão", async ({ page }) => {
    await simularCamera(page, "sem-qr");
    await abrir(page);

    await page.getByRole("button", { name: "Ler o QR Code com a câmera" }).click();

    await expect(page.getByLabel("Imagem da câmera para ler o QR Code")).toBeVisible();
    await expect(page.getByText("Aponte a câmera para o QR Code do cupom.")).toHaveRole("status");
    const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Fechar a câmera" }).click();
    await expect(page.getByLabel("Imagem da câmera para ler o QR Code")).toHaveCount(0);
    expect(await camera(page)).toEqual({ pedidos: 1, desligadas: 1 });
  });

  test("sem o leitor de QR Code, desliga a câmera e aponta o link colado", async ({ page }) => {
    await simularCamera(page, "qr");
    await page.route("**/_astro/jsQR*", (route) => route.abort());
    await abrir(page);

    await page.getByRole("button", { name: "Ler o QR Code com a câmera" }).click();

    await expect(page.getByRole("alert")).toContainText("O leitor de QR Code não carregou.");
    await expect(page.getByRole("alert")).toContainText("cole o link da nota");
    expect(await camera(page)).toEqual({ pedidos: 1, desligadas: 1 });
  });

  test("câmera negada explica e deixa colar o link", async ({ page }) => {
    await simularCamera(page, "negada");
    await responder(page, (route) => comJson(route, 200, nota));
    await abrir(page);

    await page.getByRole("button", { name: "Ler o QR Code com a câmera" }).click();

    await expect(page.getByRole("alert")).toContainText("O navegador não deixou usar a câmera.");
    await expect(page.getByRole("button", { name: "Ler o QR Code com a câmera" })).toBeVisible();
    await consultar(page, linkSintetico);
    await expect(page.getByRole("heading", { name: "MERCADO EXEMPLO LTDA" })).toBeVisible();
  });
});
