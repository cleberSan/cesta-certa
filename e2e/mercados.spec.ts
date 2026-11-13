import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  abrirMercados,
  ajustesGuardados,
  basePadrao,
  celulaDoCentro,
  centro,
  geradoEm,
  mercadosDeExemplo,
  mercadosGuardados,
  servirBase,
} from "./base-de-mercados";
import { expect, test } from "./fixtures";

/**
 * Mercados perto do ponto (spec 0001, CA-07 e CA-39), com a base sintética servida pelo
 * Playwright e a localização simulada pelo navegador.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const lista = (page: Page) => page.locator("ol.mercados-lista > li");
const raio = (page: Page) => page.getByLabel("Distância máxima");
const resumo = (page: Page) => page.getByRole("status").filter({ hasText: / km/ });

const item = (page: Page, nome: string) =>
  lista(page).filter({ has: page.getByRole("heading", { name: nome }) });
const formulario = (page: Page) => page.getByRole("form", { name: "Cadastrar mercado" });

async function escolherSaoPaulo(page: Page) {
  await abrirMercados(page);
  await page.getByRole("button", { name: "Escolher cidade" }).click();
  await page.getByLabel("Nome da cidade").fill("são paulo");
  await page.getByRole("button", { name: "São Paulo, SP" }).click();
}

async function cadastrar(page: Page, nome: string, tipo = "Mercado de bairro") {
  await page.getByRole("button", { name: "Cadastrar mercado" }).click();
  await formulario(page).getByLabel("Nome do mercado").fill(nome);
  await formulario(page).getByLabel("Tipo").selectOption({ label: tipo });
  await formulario(page).getByRole("button", { name: "Cadastrar" }).click();
}

async function abrirNoCentro(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(centro);
  await abrirMercados(page);
  await page.getByRole("button", { name: "Usar minha localização" }).click();
}

test.describe("mercados perto do ponto", () => {
  // spec 0001 CA-07
  test("lista os mercados do raio do mais perto ao mais longe, com tipo e distância", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await abrirNoCentro(page);

    await expect(resumo(page)).toHaveText("3 mercados em até 5 km, do mais perto ao mais longe.");
    await expect(raio(page)).toHaveValue("5");
    await expect(lista(page).locator("h3")).toHaveText([
      "Mercadinho da Praça",
      "Supermercado Exemplo",
      "Atacarejo Modelo",
    ]);
    await expect(lista(page).locator("p")).toHaveText([
      "Mercado de bairro · 300 m",
      "Supermercado · 1,2 km",
      "Atacarejo · 3,4 km",
    ]);
    await expect(page.getByText("Mercados da base de novembro de 2026")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "colaboradores do OpenStreetMap" }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-07
  test("muda o raio sem baixar de novo a região e guarda a escolha no aparelho", async ({
    page,
  }) => {
    const { pedidos } = await servirBase(page);
    await abrirNoCentro(page);
    await expect(lista(page)).toHaveCount(3);

    await raio(page).selectOption("10");
    await expect(resumo(page)).toHaveText("4 mercados em até 10 km, do mais perto ao mais longe.");
    await raio(page).selectOption("30");
    await expect(lista(page)).toHaveCount(5);
    await raio(page).selectOption("1");
    await expect(lista(page).locator("h3")).toHaveText(["Mercadinho da Praça"]);

    expect(pedidos).toEqual([
      "/data/mercados/indice.json",
      `/data/mercados/${celulaDoCentro}.json`,
    ]);
    await expect.poll(() => ajustesGuardados(page)).toContainEqual({ id: "raio", km: 1 });
    await page.reload();
    await expect(raio(page)).toHaveValue("1");
  });

  // spec 0001 CA-39
  test("sem mercado no raio, diz isso e oferece aumentar a distância", async ({ page }) => {
    await servirBase(page);
    await abrirMercados(page);
    await page.getByRole("button", { name: "Escolher cidade" }).click();
    await page.getByLabel("Nome da cidade").fill("sem mercado");
    await page.getByRole("button", { name: "Cidade Sem Mercado, SP" }).click();

    await expect(page.getByText("Não há mercado da base em até 5 km deste ponto.")).toBeVisible();
    await expect(resumo(page)).toHaveText("Nenhum mercado da base em até 5 km.");
    await page.getByRole("button", { name: "Aumentar para 10 km" }).click();

    await expect(raio(page)).toHaveValue("10");
    await expect(page.getByText("Não há mercado da base em até 10 km deste ponto.")).toBeVisible();
  });

  // spec 0001 CA-39
  test("avisa quando o ponto está fora do Brasil", async ({ page }) => {
    const { pedidos } = await servirBase(page);
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 38.7223, longitude: -9.1393 });
    await abrirMercados(page);
    await page.getByRole("button", { name: "Usar minha localização" }).click();

    await expect(
      page.getByText("Este ponto parece estar fora do Brasil", { exact: false }),
    ).toBeVisible();
    // A região do ponto não está no índice: nada além dele é baixado.
    expect(pedidos).toEqual(["/data/mercados/indice.json"]);
  });

  test("mostra 50 mercados de cada vez", async ({ page }) => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({
      id: `n${2000 + i}`,
      nome: `Mercado ${String(i + 1).padStart(2, "0")}`,
      tipo: "bairro",
      // Um a cada 55 m, todos dentro dos 5 km do raio padrão.
      lat: Number((centro.latitude + (i + 1) / 2000).toFixed(5)),
      lon: centro.longitude,
    }));
    const base = basePadrao();
    await servirBase(page, {
      ...base,
      indice: {
        json: { versao: 1, geradoEm, celulas: { [celulaDoCentro]: 60 } },
      },
      celulas: {
        [celulaDoCentro]: { json: { versao: 1, celula: celulaDoCentro, mercados: muitos } },
      },
    });
    await abrirNoCentro(page);

    await expect(lista(page)).toHaveCount(50);
    await page.getByRole("button", { name: "Mostrar mais 10" }).click();
    await expect(lista(page)).toHaveCount(60);
    await expect(page.getByRole("button", { name: /^Mostrar mais/ })).toHaveCount(0);
  });

  test("mostra o nome que vem na base como texto, sem marcação", async ({
    page,
    consoleErrors,
  }) => {
    const base = basePadrao();
    const comMarcacao = [
      { ...mercadosDeExemplo[1]!, nome: '<img src=x onerror="alert(1)">Mercado' },
    ];
    await servirBase(page, {
      ...base,
      celulas: {
        [celulaDoCentro]: { json: { versao: 1, celula: celulaDoCentro, mercados: comMarcacao } },
      },
    });
    await abrirNoCentro(page);

    await expect(lista(page).locator("h3")).toHaveText(['<img src=x onerror="alert(1)">Mercado']);
    await expect(page.locator("ol.mercados-lista img")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

// spec 0001 CA-09
test.describe("saber mais", () => {
  test("mostra tipo, distância, horário e site, com link para o Google Maps", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await abrirNoCentro(page);
    const supermercado = item(page, "Supermercado Exemplo");
    const botao = supermercado.getByRole("button", {
      name: "Saber mais sobre Supermercado Exemplo",
    });
    await expect(botao).toHaveAttribute("aria-expanded", "false");

    await botao.click();

    await expect(supermercado.getByRole("button", { name: /^Fechar/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(supermercado.locator("dt")).toHaveText(["Tipo", "Distância", "Horário", "Site"]);
    await expect(supermercado.locator("dd")).toHaveText([
      "Supermercado",
      "1,2 km em linha reta do ponto da busca",
      "Mo-Sa 08:00-22:00; Su 08:00-14:00 (como está no OpenStreetMap)",
      "supermercado.example/loja/centro (abre em outra aba)",
    ]);
    const site = supermercado.getByRole("link", { name: /supermercado\.example/ });
    await expect(site).toHaveAttribute("href", "https://www.supermercado.example/loja/centro");
    await expect(site).toHaveAttribute("target", "_blank");
    await expect(site).toHaveAttribute("rel", "noopener noreferrer");
    const mapa = supermercado.getByRole("link", { name: /Ver o lugar no Google Maps/ });
    const destino = new URL((await mapa.getAttribute("href"))!);
    expect(destino.origin + destino.pathname).toBe("https://www.google.com/maps/search/");
    expect(destino.searchParams.get("query")).toBe(
      `${mercadosDeExemplo.find((m) => m.id === "n102")!.lat},${centro.longitude}`,
    );
    await expect(mapa).toHaveAttribute("rel", "noopener noreferrer");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-24
  test("abre a rota até o mercado no Google Maps e no Waze, com o modo escolhido", async ({
    page,
  }) => {
    await servirBase(page);
    await abrirNoCentro(page);
    const supermercado = item(page, "Supermercado Exemplo");
    await supermercado.getByRole("button", { name: /^Saber mais/ }).click();
    const rota = supermercado.getByRole("group", { name: "Ir até Supermercado Exemplo" });
    const destino = `${mercadosDeExemplo.find((m) => m.id === "n102")!.lat},${centro.longitude}`;
    const google = rota.getByRole("link", { name: /Abrir no Google Maps/ });
    const waze = rota.getByRole("link", { name: /Abrir no Waze/ });

    await expect(rota.getByLabel("De carro")).toBeChecked();
    let link = new URL((await google.getAttribute("href"))!);
    expect(link.origin + link.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(link.searchParams)).toEqual({
      api: "1",
      destination: destino,
      travelmode: "driving",
    });
    expect(new URL((await waze.getAttribute("href"))!).searchParams.get("ll")).toBe(destino);
    await expect(waze).toHaveAttribute("target", "_blank");
    await expect(waze).toHaveAttribute("rel", "noopener noreferrer");
    await expect(rota.getByRole("listitem")).toHaveCount(0);

    await rota.getByLabel("A pé").check();

    link = new URL((await google.getAttribute("href"))!);
    expect(link.searchParams.get("travelmode")).toBe("walking");
    await expect(rota.getByRole("listitem")).toHaveText(["O Waze calcula a rota de carro."]);
  });

  test("mostra site sem https só como texto e esconde o que a base não tem", async ({ page }) => {
    await servirBase(page);
    await abrirNoCentro(page);
    const mercadinho = item(page, "Mercadinho da Praça");

    await mercadinho.getByRole("button", { name: /^Saber mais/ }).click();

    await expect(mercadinho.locator("dt")).toHaveText(["Tipo", "Distância", "Site"]);
    await expect(mercadinho.locator("dd").last()).toHaveText(
      "mercadinho.example (sem conexão segura)",
    );
    await expect(mercadinho.getByRole("link", { name: /mercadinho\.example/ })).toHaveCount(0);

    await mercadinho.getByRole("button", { name: /^Fechar/ }).click();
    await expect(mercadinho.locator("dl")).toHaveCount(0);
  });
});

// spec 0001 CA-08
test.describe("mercado cadastrado pela pessoa", () => {
  test("cadastra no ponto da busca, mostra na lista e mantém depois de recarregar", async ({
    page,
    consoleErrors,
  }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await expect(lista(page)).toHaveCount(3);

    await cadastrar(page, "  Mercado da Esquina ");

    await expect(page.getByRole("status").filter({ hasText: "Mercado cadastrado" })).toHaveText(
      "Mercado cadastrado: Mercado da Esquina.",
    );
    await expect(formulario(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cadastrar mercado" })).toBeFocused();
    await expect(lista(page).locator("h3")).toHaveText([
      "Mercado da Esquina",
      "Mercadinho da Praça",
      "Supermercado Exemplo",
      "Atacarejo Modelo",
    ]);
    await expect(item(page, "Mercado da Esquina").locator("p").first()).toHaveText(
      "Mercado de bairro · 10 m · cadastrado por você",
    );
    await expect
      .poll(() => mercadosGuardados(page))
      .toEqual([
        expect.objectContaining({
          nome: "Mercado da Esquina",
          tipo: "bairro",
          lat: centro.latitude,
          lon: centro.longitude,
        }),
      ]);

    await page.reload();
    await expect(item(page, "Mercado da Esquina")).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test("pede o nome e recusa o mesmo mercado no mesmo lugar", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);

    await page.getByRole("button", { name: "Cadastrar mercado" }).click();
    await expect(formulario(page).getByLabel("Nome do mercado")).toBeFocused();
    await formulario(page).getByRole("button", { name: "Cadastrar" }).click();
    await expect(formulario(page).getByRole("alert")).toHaveText("Escreva o nome do mercado.");
    await formulario(page).getByRole("button", { name: "Cancelar" }).click();

    await cadastrar(page, "Mercado da Esquina");
    await cadastrar(page, "MERCADO DA ESQUINA");

    await expect(formulario(page).getByRole("alert")).toHaveText(
      '"Mercado da Esquina" já está cadastrado neste lugar.',
    );
    await expect(item(page, "Mercado da Esquina")).toHaveCount(1);
  });

  test("cadastra onde a pessoa está e avisa quando fica fora da distância máxima", async ({
    page,
    context,
  }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await context.grantPermissions(["geolocation"]);
    // Cerca de 7,4 km ao norte do centro da busca, com raio de 5 km.
    await context.setGeolocation({
      latitude: centro.latitude + 7.4 / 111.195,
      longitude: centro.longitude,
    });

    await page.getByRole("button", { name: "Cadastrar mercado" }).click();
    await formulario(page).getByLabel("Nome do mercado").fill("Mercado do Caminho");
    await formulario(page).getByLabel("Onde estou agora, pela localização do aparelho").check();
    await formulario(page).getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Mercado cadastrado" })).toHaveText(
      "Mercado cadastrado: Mercado do Caminho. Ele fica a 7,4 km do ponto da busca, fora da distância máxima de 5 km.",
    );
    await expect(item(page, "Mercado do Caminho")).toHaveCount(0);
    await raio(page).selectOption("10");
    await expect(item(page, "Mercado do Caminho")).toHaveCount(1);
  });

  test("sem permissão de localização, mantém o formulário e oferece o ponto da busca", async ({
    page,
    context,
  }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await context.clearPermissions();

    await page.getByRole("button", { name: "Cadastrar mercado" }).click();
    await formulario(page).getByLabel("Nome do mercado").fill("Mercado do Caminho");
    await formulario(page).getByLabel("Onde estou agora, pela localização do aparelho").check();
    await formulario(page).getByRole("button", { name: "Cadastrar" }).click();

    await expect(formulario(page).getByRole("alert")).toHaveText(
      "O navegador não deu permissão para usar a localização. Cadastre no ponto da busca ou marque no mapa.",
    );
    await expect(formulario(page).getByLabel("Nome do mercado")).toHaveValue("Mercado do Caminho");
  });

  test("exclui o mercado cadastrado depois de confirmar", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await cadastrar(page, "Mercado da Esquina");
    const esquina = item(page, "Mercado da Esquina");

    await esquina.getByRole("button", { name: /^Saber mais/ }).click();
    await expect(esquina.locator("dt")).toHaveText(["Tipo", "Distância", "Origem"]);
    await esquina.getByRole("button", { name: "Excluir este mercado" }).click();
    await esquina.getByRole("group").getByRole("button", { name: "Cancelar" }).click();
    await expect(esquina).toHaveCount(1);
    await esquina.getByRole("button", { name: "Excluir este mercado" }).click();
    await esquina.getByRole("group").getByRole("button", { name: "Excluir" }).click();

    await expect(esquina).toHaveCount(0);
    await expect.poll(() => mercadosGuardados(page)).toEqual([]);
    await page.reload();
    await expect(lista(page)).toHaveCount(3);
  });

  // spec 0001 CA-39
  test("sem a base publicada, ainda lista e deixa cadastrar o mercado", async ({ page }) => {
    await servirBase(page, { ...basePadrao(), indice: "404" });
    await escolherSaoPaulo(page);
    await expect(page.getByRole("alert")).toHaveText(
      "A base de mercados ainda não foi publicada neste site.",
    );

    await cadastrar(page, "Mercado da Esquina");

    await expect(lista(page).locator("h3")).toHaveText(["Mercado da Esquina"]);
  });

  // spec 0001 CA-04
  test("entra na cópia dos dados", async ({ page }) => {
    await servirBase(page);
    await escolherSaoPaulo(page);
    await cadastrar(page, "Mercado da Esquina");
    await expect(item(page, "Mercado da Esquina")).toHaveCount(1);

    await page.goto("/dados");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar cópia" }).click(),
    ]);
    const texto = await readFile(await download.path(), "utf8");

    const copia = JSON.parse(texto) as { versao: number; dados: { mercadosProprios: unknown[] } };
    expect(copia.versao).toBe(3);
    expect(copia.dados.mercadosProprios).toEqual([
      expect.objectContaining({ nome: "Mercado da Esquina", tipo: "bairro" }),
    ]);
    await expect(page.getByRole("status").filter({ hasText: "Cópia gerada" })).toContainText(
      "nenhuma lista, mais 1 mercado cadastrado.",
    );
  });
});

test.describe("falhas ao baixar a base", () => {
  test("avisa quando a base ainda não foi publicada, sem oferecer tentar de novo", async ({
    page,
  }) => {
    await servirBase(page, { indice: "404" });
    await abrirNoCentro(page);

    await expect(page.getByRole("alert")).toHaveText(
      "A base de mercados ainda não foi publicada neste site.",
    );
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
  });

  test("sem conexão, deixa tentar de novo e lista quando a conexão volta", async ({ page }) => {
    const base = await servirBase(page, { ...basePadrao(), indice: "sem-conexao" });
    await abrirNoCentro(page);
    await expect(page.getByRole("alert")).toContainText("Sem conexão para baixar os mercados.");

    base.trocar(basePadrao());
    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(lista(page)).toHaveCount(3);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  for (const [caso, alterar] of [
    ["índice que não é JSON", { indice: "nao-e-json" }],
    ["índice de outra versão", { indice: { json: { versao: 2, geradoEm: "x", celulas: {} } } }],
    ["região do índice que não existe", { celulas: {} }],
    ["região fora do formato", { celulas: { [celulaDoCentro]: { json: { versao: 1 } } } }],
  ] as const) {
    test(`trata ${caso} como base fora do formato`, async ({ page }) => {
      await servirBase(page, { ...basePadrao(), ...alterar });
      await abrirNoCentro(page);

      await expect(page.getByRole("alert")).toContainText(
        "Os mercados desta região vieram num formato que o app não entende.",
      );
    });
  }
});

test.describe("acessibilidade e celular", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`a explicação, a busca de cidade e a lista não têm violações no tema ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await servirBase(page);
      await abrirMercados(page);
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

      await page.getByRole("button", { name: "Escolher cidade" }).click();
      await page.getByLabel("Nome da cidade").fill("são");
      await expect(page.getByRole("button", { name: "São Paulo, SP" })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

      await page.getByRole("button", { name: "São Paulo, SP" }).click();
      await expect(lista(page)).toHaveCount(3);
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

      await item(page, "Supermercado Exemplo")
        .getByRole("button", { name: /^Saber mais/ })
        .click();
      await page.getByRole("button", { name: "Cadastrar mercado" }).click();
      await expect(formulario(page)).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
    });
  }

  test("dá para escolher a cidade e mudar o raio só pelo teclado", async ({ page }) => {
    await servirBase(page);
    await abrirMercados(page);

    await page.getByRole("button", { name: "Escolher cidade" }).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Nome da cidade").focus();
    await page.keyboard.type("são paulo");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "São Paulo, SP" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(lista(page)).toHaveCount(3);
    await raio(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(raio(page)).toHaveValue("10");
  });

  test("não tem rolagem horizontal com a lista aberta", async ({ page }) => {
    await servirBase(page);
    await abrirNoCentro(page);
    await expect(lista(page)).toHaveCount(3);

    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });
});
