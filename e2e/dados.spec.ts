import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { apagarBanco, guardado } from "./aparelho";
import { expect, test } from "./fixtures";
import { abrir, adicionar, adicionarEEsperar, itens } from "./tela-da-lista";

/**
 * Seus dados (/dados): exportar e importar a cópia em arquivo, no navegador de verdade,
 * com o IndexedDB e o download de verdade. Cada teste começa com o armazenamento vazio.
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const limite = 5 * 1024 * 1024;

const campoDoArquivo = (page: Page) => page.getByLabel("Arquivo da cópia");
const pergunta = (page: Page) => page.getByRole("group", { name: /^O arquivo / });
const substituir = (page: Page) =>
  page.getByRole("button", { name: "Substituir pelos dados do arquivo" });

async function abrirDados(page: Page) {
  await page.goto("/dados");
  // O botão aparece quando os dados terminam de abrir do aparelho.
  await expect(page.getByRole("button", { name: "Exportar cópia" })).toBeVisible();
}

/** Monta uma lista com dois itens pela tela, como a pessoa faria. */
async function montarLista(page: Page) {
  await abrir(page);
  await adicionarEEsperar(page, "Arroz", {
    quantidade: "2",
    marca: "Marca Exemplo",
    tamanho: "5 kg",
    preferencia: /Só esta marca/,
  });
  await adicionarEEsperar(page, "Feijão");
  await page.getByRole("checkbox", { name: "Arroz" }).check();
  await expect(page.getByText("2 itens, 1 comprado")).toBeVisible();
}

/** Exporta pela tela e devolve o nome e o texto do arquivo baixado. */
async function exportar(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar cópia" }).click(),
  ]);
  return {
    nome: download.suggestedFilename(),
    texto: await readFile(await download.path(), "utf8"),
  };
}

async function escolher(page: Page, conteudo: string | Buffer, nome = "copia.json") {
  await campoDoArquivo(page).setInputFiles({
    name: nome,
    mimeType: "application/json",
    buffer: typeof conteudo === "string" ? Buffer.from(conteudo) : conteudo,
  });
}

/**
 * Um arquivo de cópia válido, com uma lista e um item, para os testes de importação. Fica na
 * versão 1 do formato de propósito: o app segue lendo as cópias antigas (CA-04).
 */
function copia(campos: Record<string, unknown> = {}): string {
  const listaId = "11111111-1111-4111-8111-111111111111";
  return JSON.stringify({
    app: "cesta-certa",
    versao: 1,
    exportadoEm: "2026-11-10T12:00:00.000Z",
    dados: {
      listas: [
        {
          id: listaId,
          nome: "Lista do arquivo",
          criadaEm: "2026-11-01T10:00:00.000Z",
          atualizadaEm: "2026-11-01T10:00:00.000Z",
        },
      ],
      itens: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          listaId,
          nome: "Macarrão",
          quantidade: 3,
          marca: null,
          tamanho: "500 g",
          preferencia: "mais-barato",
          comprado: false,
          ordem: 0,
          criadoEm: "2026-11-01T10:00:00.000Z",
        },
      ],
    },
    ...campos,
  });
}

test.describe("exportar", () => {
  // spec 0001 CA-04
  test("gera um arquivo JSON versionado com as listas e os itens do aparelho", async ({
    page,
    consoleErrors,
  }) => {
    await montarLista(page);
    await abrirDados(page);
    await expect(page.getByText("Neste aparelho: 1 lista e 2 itens.")).toBeVisible();

    const arquivo = await exportar(page);

    expect(arquivo.nome).toMatch(/^cesta-certa-\d{4}-\d{2}-\d{2}\.json$/);
    const lido = JSON.parse(arquivo.texto) as Record<string, unknown>;
    const noAparelho = await guardado(page);
    expect(lido).toEqual({
      app: "cesta-certa",
      versao: 3,
      exportadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      dados: {
        listas: noAparelho.listas,
        itens: noAparelho.itens,
        mercadosProprios: [],
        observacoesDePreco: [],
      },
    });
    expect(noAparelho.itens).toHaveLength(2);
    await expect(page.getByRole("status").filter({ hasText: "Cópia gerada" })).toHaveText(
      `Cópia gerada: ${arquivo.nome}, com 1 lista e 2 itens.`,
    );
    expect(consoleErrors).toEqual([]);
  });

  test("exportar não muda o que está guardado", async ({ page }) => {
    await montarLista(page);
    await abrirDados(page);
    const antes = await guardado(page);

    await exportar(page);

    expect(await guardado(page)).toEqual(antes);
  });

  test("num aparelho sem lista, abrir a tela não cria nada e a cópia sai vazia", async ({
    page,
  }) => {
    await abrirDados(page);
    await expect(page.getByText("Neste aparelho: nenhuma lista.")).toBeVisible();

    const arquivo = await exportar(page);

    expect((JSON.parse(arquivo.texto) as { dados: unknown }).dados).toEqual({
      listas: [],
      itens: [],
      mercadosProprios: [],
      observacoesDePreco: [],
    });
    expect((await guardado(page)).listas).toEqual([]);
  });
});

test.describe("importar", () => {
  // spec 0001 CA-04
  test("a cópia exportada restaura o mesmo estado em um aparelho com outros dados", async ({
    page,
    consoleErrors,
  }) => {
    const enviadas: string[] = [];
    page.on("request", (pedido) => {
      if (pedido.method() !== "GET") enviadas.push(`${pedido.method()} ${pedido.url()}`);
    });
    await montarLista(page);
    await abrirDados(page);
    const arquivo = await exportar(page);
    const original = await guardado(page);

    // Outro aparelho: banco apagado e uma lista diferente no lugar.
    await page.goto("/sobre");
    await apagarBanco(page);
    await abrir(page);
    await adicionarEEsperar(page, "Sabão");
    await abrirDados(page);

    await escolher(page, arquivo.texto, arquivo.nome);
    await expect(pergunta(page)).toContainText(
      `O arquivo ${arquivo.nome} tem 1 lista e 2 itens, de uma cópia feita em`,
    );
    await expect(pergunta(page)).toContainText(
      "Importar apaga o que está neste aparelho (1 lista e 1 item) e põe no lugar o que está no arquivo. Não dá para desfazer.",
    );
    // Nada muda antes da confirmação.
    expect((await guardado(page)).itens).toHaveLength(1);
    await substituir(page).click();

    await expect(page.getByRole("status").filter({ hasText: "Dados importados" })).toContainText(
      "Dados importados: 1 lista e 2 itens.",
    );
    const restaurado = await guardado(page);
    expect(restaurado.listas).toEqual(original.listas);
    expect(restaurado.itens).toEqual(original.itens);
    await expect(page.getByText("Neste aparelho: 1 lista e 2 itens.")).toBeVisible();
    await expect(pergunta(page)).toHaveCount(0);
    await expect(campoDoArquivo(page)).toHaveValue("");

    // O foco vai para o atalho da lista, que mostra o que veio do arquivo.
    const atalho = page.getByRole("link", { name: "Abrir a lista" });
    await expect(atalho).toBeFocused();
    await atalho.click();
    await expect(itens(page)).toHaveText([
      /Arroz.*2 × 5 kg · Marca Exemplo · só esta marca · comprado/,
      /Feijão.*1 unidade/,
    ]);
    await expect(page.getByRole("checkbox", { name: "Arroz" })).toBeChecked();

    // O arquivo é gerado e lido no aparelho: nada é enviado a servidor nenhum.
    expect(enviadas).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-04
  test("cancelar a importação não altera nada e devolve o foco ao campo do arquivo", async ({
    page,
  }) => {
    await montarLista(page);
    await abrirDados(page);
    const antes = await guardado(page);

    await escolher(page, copia());
    await expect(pergunta(page)).toBeVisible();
    await pergunta(page).getByRole("button", { name: "Cancelar" }).click();

    await expect(pergunta(page)).toHaveCount(0);
    await expect(campoDoArquivo(page)).toBeFocused();
    await expect(campoDoArquivo(page)).toHaveValue("");
    expect(await guardado(page)).toEqual(antes);
  });

  test("mostra o nome do arquivo como texto, sem interpretar marcação", async ({
    page,
    consoleErrors,
  }) => {
    await abrirDados(page);

    await escolher(page, copia(), '<img src=x onerror="document.title=1">.json');

    await expect(pergunta(page)).toContainText('<img src=x onerror="document.title=1">.json');
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(page).toHaveTitle(/Seus dados/);
    expect(consoleErrors).toEqual([]);
  });

  test("trocar de arquivo antes de confirmar vale o último escolhido", async ({ page }) => {
    await abrirDados(page);

    await escolher(page, copia(), "primeiro.json");
    await expect(pergunta(page)).toContainText("primeiro.json");
    await escolher(page, "{", "quebrado.json");

    await expect(pergunta(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText("O arquivo não pôde ser lido");
  });
});

test.describe("arquivo recusado", () => {
  const recusas: ReadonlyArray<{ caso: string; conteudo: string | Buffer; mensagem: string }> = [
    {
      caso: "que não é JSON",
      conteudo: "lista de compras",
      mensagem:
        "O arquivo não pôde ser lido: ele não é um JSON válido ou está cortado. Nada foi alterado.",
    },
    {
      caso: "cortado no meio",
      conteudo: copia().slice(0, 150),
      mensagem:
        "O arquivo não pôde ser lido: ele não é um JSON válido ou está cortado. Nada foi alterado.",
    },
    {
      caso: "que é JSON de outra coisa",
      conteudo: JSON.stringify({ nome: "outro app", itens: [] }),
      mensagem: "Este arquivo não é uma cópia do Cesta Certa. Nada foi alterado.",
    },
    {
      caso: "de uma versão mais nova do formato",
      conteudo: copia({ versao: 4 }),
      mensagem:
        "O arquivo é da versão 4 do formato, e este app lê até a versão 3. Recarregue a página para atualizar o app e tente de novo. Nada foi alterado.",
    },
    {
      caso: "com um registro fora do formato",
      conteudo: copia().replace('"quantidade":3', '"quantidade":0'),
      mensagem: "O arquivo tem 1 registro fora do formato esperado. Nada foi alterado.",
    },
    {
      caso: "maior que 5 MB",
      conteudo: Buffer.concat([Buffer.from(copia()), Buffer.alloc(limite, " ")]),
      mensagem: "O arquivo tem mais de 5 MB, o máximo que o app aceita. Nada foi alterado.",
    },
  ];

  for (const { caso, conteudo, mensagem } of recusas) {
    // spec 0001 CA-04
    test(`recusa o arquivo ${caso}, diz o motivo e não altera nada`, async ({ page }) => {
      await montarLista(page);
      await abrirDados(page);
      const antes = await guardado(page);

      await escolher(page, conteudo);

      await expect(page.getByRole("alert")).toHaveText(mensagem);
      await expect(pergunta(page)).toHaveCount(0);
      await expect(campoDoArquivo(page)).toHaveAttribute("aria-invalid", "true");
      await expect(campoDoArquivo(page)).toHaveAccessibleDescription(new RegExp(mensagem));
      expect(await guardado(page)).toEqual(antes);
    });
  }

  test("depois de uma recusa, um arquivo válido é aceito e a mensagem some", async ({ page }) => {
    await abrirDados(page);
    await escolher(page, "{");
    await expect(page.getByRole("alert")).toBeVisible();

    await escolher(page, copia());

    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(campoDoArquivo(page)).toHaveAttribute("aria-invalid", "false");
    await substituir(page).click();
    await expect(page.getByText("Dados importados: 1 lista e 1 item.")).toBeVisible();
  });
});

test.describe("armazenamento do aparelho", () => {
  test("a lista aberta em outra aba pede para recarregar depois da importação, em vez de gravar por cima", async ({
    page,
    context,
  }) => {
    await montarLista(page);
    const outra = await context.newPage();
    await abrirDados(outra);
    await escolher(outra, copia());
    await substituir(outra).click();
    await expect(outra.getByText("Dados importados: 1 lista e 1 item.")).toBeVisible();
    const importado = await guardado(outra);

    await adicionar(page, "Café");

    await expect(page.getByRole("alert")).toHaveText(
      "Os dados deste aparelho mudaram em outra aba. Recarregue esta página para continuar.",
    );
    expect(await guardado(outra)).toEqual(importado);

    await page.reload();
    await expect(itens(page)).toHaveText([/Macarrão.*3 × 500 g/]);
  });

  // O que só aparece depois de a ilha abrir o banco, quando o aviso de "voltar" já está ligado:
  // o título vem no HTML e, numa máquina ocupada, aparece antes de a ilha acordar.
  const prontas = {
    "/lista": (page: Page) => page.getByText(/Arroz/).first(),
    "/dados": (page: Page) => page.getByText("Neste aparelho: 1 lista e 2 itens."),
  };
  for (const [rota, pronta] of Object.entries(prontas)) {
    test(`${rota} recarrega quando o navegador devolve a página do cache de voltar, para não mostrar dados velhos`, async ({
      page,
    }) => {
      await montarLista(page);
      await page.goto(rota);
      await expect(pronta(page)).toBeVisible();
      await page.evaluate(() => {
        (window as { marcaDoTeste?: boolean }).marcaDoTeste = true;
      });

      // O mesmo evento que o navegador dispara ao devolver a página sem carregar de novo.
      await Promise.all([
        page.waitForEvent("load"),
        page.evaluate(() => {
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
        }),
      ]);

      expect(
        await page.evaluate(() => (window as { marcaDoTeste?: boolean }).marcaDoTeste),
      ).toBeUndefined();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("sem armazenamento no navegador, diz que não há o que exportar nem onde importar", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined });
    });
    await page.goto("/dados");

    await expect(page.getByRole("alert")).toContainText(
      "Os dados não abriram. O navegador não deixou guardar dados neste aparelho.",
    );
    await expect(page.getByRole("alert")).toContainText(
      "Sem armazenamento no navegador, não há o que exportar nem onde importar.",
    );
    await expect(page.getByRole("button", { name: "Exportar cópia" })).toHaveCount(0);
    await expect(campoDoArquivo(page)).toHaveCount(0);
  });

  test("não abre dados gravados por uma versão mais nova do app", async ({ page }) => {
    await page.goto("/sobre");
    await page.evaluate(
      () =>
        new Promise<void>((resolver, rejeitar) => {
          const pedido = indexedDB.open("cesta-certa", 99);
          pedido.onupgradeneeded = () => {
            pedido.result.createObjectStore("listas", { keyPath: "id" });
            pedido.result.createObjectStore("itens", { keyPath: "id" });
          };
          pedido.onsuccess = () => {
            pedido.result.close();
            resolver();
          };
          pedido.onerror = () => rejeitar(pedido.error);
        }),
    );

    await page.goto("/dados");

    await expect(page.getByRole("alert")).toContainText(
      "Os dados não abriram. Este aparelho tem dados de uma versão mais nova do app.",
    );
    await expect(page.getByRole("button", { name: "Recarregar a página" })).toBeVisible();
    expect((await guardado(page)).versao).toBe(99);
  });
});

test.describe("acessibilidade e celular", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`a tela com a pergunta, o aviso e o erro não tem violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await montarLista(page);
      await abrirDados(page);
      await exportar(page);
      await escolher(page, copia());
      await expect(pergunta(page)).toBeVisible();

      const comPergunta = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(comPergunta.violations).toEqual([]);

      await substituir(page).click();
      await expect(page.getByRole("link", { name: "Abrir a lista" })).toBeVisible();
      await escolher(page, "{");
      await expect(page.getByRole("alert")).toBeVisible();

      const comErro = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(comErro.violations).toEqual([]);
    });
  }

  test("nome de arquivo comprido não cria rolagem lateral", async ({ page }) => {
    await abrirDados(page);

    await escolher(page, copia(), `${"copia-da-lista-do-mes".repeat(6)}.json`);
    await expect(pergunta(page)).toBeVisible();

    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("os alvos de toque têm pelo menos 44 px de altura", async ({ page }) => {
    await abrirDados(page);
    await escolher(page, copia());

    for (const alvo of [
      page.getByRole("button", { name: "Exportar cópia" }),
      campoDoArquivo(page),
      substituir(page),
      pergunta(page).getByRole("button", { name: "Cancelar" }),
    ]) {
      const caixa = await alvo.boundingBox();
      expect(
        caixa?.height,
        await alvo.evaluate((elemento) => elemento.outerHTML),
      ).toBeGreaterThanOrEqual(44);
    }

    await substituir(page).click();
    const atalho = await page.getByRole("link", { name: "Abrir a lista" }).boundingBox();
    expect(atalho?.height).toBeGreaterThanOrEqual(44);
  });

  test("a lista aponta para Seus dados, e o rodapé também", async ({ page }) => {
    await abrir(page);

    await page.getByRole("main").getByRole("link", { name: "Seus dados" }).click();

    await expect(page).toHaveURL(/\/dados$/);
    await expect(page.getByRole("heading", { level: 1, name: "Seus dados" })).toBeVisible();
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Seus dados" }),
    ).toHaveAttribute("href", "/dados");
  });
});
