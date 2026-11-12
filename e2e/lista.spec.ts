import AxeBuilder from "@axe-core/playwright";
import { guardado, nomeDoBanco } from "./aparelho";
import { expect, test } from "./fixtures";
import {
  abrir,
  abrirOpcoes,
  adicionar,
  adicionarEEsperar,
  aviso,
  formulario,
  itens,
  preencher,
  seletor,
} from "./tela-da-lista";

/**
 * A lista do mês (/lista) no navegador de verdade, com o IndexedDB de verdade. Cada teste
 * começa com o armazenamento vazio (contexto novo do Playwright).
 */
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("lista do mês", () => {
  test("no primeiro uso abre uma lista vazia com o nome do mês atual", async ({
    page,
    consoleErrors,
  }) => {
    await abrir(page);

    await expect(seletor(page).locator("option")).toHaveText([/^[A-Z][a-zç]+ de \d{4}$/]);
    await expect(
      page.getByText("A lista está vazia. Adicione o primeiro item acima."),
    ).toBeVisible();
    await expect(page.getByText("Nenhum item", { exact: true })).toBeVisible();
    await expect(formulario(page).getByLabel("Quantidade")).toHaveValue("1");
    expect(consoleErrors).toEqual([]);
  });

  // spec 0001 CA-01
  test("guarda o item com nome e quantidade e mantém depois de recarregar a página", async ({
    page,
  }) => {
    await abrir(page);

    await adicionarEEsperar(page, "Arroz", { quantidade: "2" });

    await expect(itens(page)).toHaveText([/Arroz.*2 unidades/]);
    await expect(formulario(page).getByLabel("Nome do item")).toHaveValue("");
    await expect(formulario(page).getByLabel("Nome do item")).toBeFocused();

    await page.reload();
    await expect(itens(page)).toHaveText([/Arroz.*2 unidades/]);
    await expect(page.getByText("1 item, nenhum comprado")).toBeVisible();
  });

  // spec 0001 CA-01
  test("guarda marca, tamanho e preferência e mantém depois de fechar e abrir de novo", async ({
    page,
    context,
  }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Café", {
      quantidade: "3",
      marca: "Marca Exemplo",
      tamanho: "500 g",
      preferencia: /Só esta marca/,
    });
    await adicionarEEsperar(page, "Feijão", { preferencia: /Marca boa/ });
    await page.close();

    const reaberta = await context.newPage();
    await abrir(reaberta);

    await expect(itens(reaberta)).toHaveText([
      /Café.*3 × 500 g · Marca Exemplo · só esta marca/,
      /Feijão.*1 unidade · marca boa/,
    ]);
    await reaberta.getByRole("button", { name: "Editar Café" }).click();
    const edicao = reaberta.getByRole("form", { name: "Alterar Café" });
    await expect(edicao.getByLabel("Nome do item")).toHaveValue("Café");
    await expect(edicao.getByLabel("Quantidade")).toHaveValue("3");
    await expect(edicao.getByLabel("Marca preferida")).toHaveValue("Marca Exemplo");
    await expect(edicao.getByLabel("Tamanho")).toHaveValue("500 g");
    await expect(edicao.getByLabel(/Só esta marca/)).toBeChecked();
  });

  // spec 0001 CA-01
  test("o que foi marcado como comprado continua marcado depois de recarregar", async ({
    page,
  }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz");
    await adicionarEEsperar(page, "Sal");

    await page.getByRole("checkbox", { name: "Arroz" }).check();
    await expect(aviso(page)).toHaveText("Arroz: comprado.");
    await expect(page.getByText("2 itens, 1 comprado")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Arroz" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Sal" })).not.toBeChecked();

    await page.getByRole("checkbox", { name: "Arroz" }).uncheck();
    await expect(aviso(page)).toHaveText("Arroz: falta comprar.");
    await expect(page.getByText("2 itens, nenhum comprado")).toBeVisible();
  });

  test("a lista fica só no aparelho: nenhum pedido ao servidor leva o que foi digitado", async ({
    page,
    consoleErrors,
  }) => {
    const pedidos: { metodo: string; url: string; corpo: string | null }[] = [];
    page.on("request", (request) =>
      pedidos.push({ metodo: request.method(), url: request.url(), corpo: request.postData() }),
    );
    await abrir(page);

    await adicionarEEsperar(page, "Segredo", { marca: "Sigilosa", tamanho: "1 kg" });
    await page.getByRole("checkbox", { name: "Segredo" }).check();
    await expect(aviso(page)).toHaveText("Segredo: comprado.");

    expect(pedidos.length).toBeGreaterThan(0);
    for (const pedido of pedidos) {
      expect(pedido.metodo, pedido.url).toBe("GET");
      expect(pedido.corpo).toBeNull();
      expect(decodeURIComponent(pedido.url)).not.toMatch(/segredo|sigilosa/i);
    }
    expect(consoleErrors).toEqual([]);
  });
});

// spec 0001 CA-03
test.describe("item com nome que já existe", () => {
  test.beforeEach(async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Banana", { quantidade: "6" });
  });

  test("avisa e soma as quantidades quando a pessoa aceita", async ({ page }) => {
    await adicionar(page, "bananas", { quantidade: "4" });

    const pergunta = page.getByRole("group", { name: /Banana já está na lista/ });
    await expect(pergunta).toContainText(
      "Banana já está na lista, com quantidade 6. Somar mais 4?",
    );
    const somar = pergunta.getByRole("button", { name: "Somar as quantidades" });
    await expect(somar).toBeFocused();
    await expect(itens(page)).toHaveCount(1);

    await somar.click();

    await expect(aviso(page)).toHaveText("Somado: Banana agora tem 10.");
    await expect(itens(page)).toHaveText([/Banana.*10 unidades/]);
    await expect(pergunta).toHaveCount(0);
    await expect(formulario(page).getByLabel("Nome do item")).toHaveValue("");

    await page.reload();
    await expect(itens(page)).toHaveText([/Banana.*10 unidades/]);
  });

  test("ignora maiúsculas e acentos ao comparar", async ({ page }) => {
    await adicionar(page, "  BÁNANA ");
    await expect(page.getByRole("group", { name: /Banana já está na lista/ })).toBeVisible();
  });

  test("deixa entrar como outro item quando a pessoa prefere", async ({ page }) => {
    await adicionar(page, "Bananas", { quantidade: "2" });
    await page.getByRole("button", { name: "Adicionar como outro item" }).click();

    await expect(aviso(page)).toHaveText("Bananas entrou na lista.");
    await expect(itens(page)).toHaveText([/Banana.*6 unidades/, /Bananas.*2 unidades/]);
  });

  test("cancelar não muda a lista e mantém o que foi digitado", async ({ page }) => {
    await adicionar(page, "banana", { quantidade: "9" });
    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(page.getByRole("group", { name: /já está na lista/ })).toHaveCount(0);
    await expect(itens(page)).toHaveText([/Banana.*6 unidades/]);
    await expect(formulario(page).getByLabel("Nome do item")).toHaveValue("banana");
    await expect(formulario(page).getByLabel("Nome do item")).toBeFocused();
  });

  test("recusa a soma que passa do máximo e não altera o item", async ({ page }) => {
    await adicionar(page, "banana", { quantidade: "995" });
    await page.getByRole("button", { name: "Somar as quantidades" }).click();

    await expect(page.getByRole("alert")).toHaveText("A soma passa de 999, o máximo por item.");
    await expect(itens(page)).toHaveText([/Banana.*6 unidades/]);
  });

  test("um nome só parecido entra sem aviso", async ({ page }) => {
    await adicionarEEsperar(page, "Banana prata");
    await expect(itens(page)).toHaveCount(2);
  });
});

// spec 0001 CA-02
test.describe("duplicar a lista", () => {
  test("cria uma lista nova com os mesmos itens, quantidades e preferências, nada comprado", async ({
    page,
  }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz", {
      quantidade: "2",
      marca: "Marca Exemplo",
      tamanho: "5 kg",
      preferencia: /Só esta marca/,
    });
    await adicionarEEsperar(page, "Feijão", { quantidade: "3", preferencia: /Marca boa/ });
    await page.getByRole("checkbox", { name: "Arroz" }).check();
    await expect(aviso(page)).toHaveText("Arroz: comprado.");
    const original = await seletor(page).locator("option:checked").textContent();

    await abrirOpcoes(page);
    await page.getByRole("button", { name: "Duplicar" }).click();

    await expect(aviso(page)).toHaveText(
      `Lista duplicada em "${original} (2)": 2 itens, nenhum marcado como comprado.`,
    );
    await expect(seletor(page).locator("option:checked")).toHaveText(`${original} (2)`);
    await expect(itens(page)).toHaveText([
      /Arroz.*2 × 5 kg · Marca Exemplo · só esta marca(?! · comprado)/,
      /Feijão.*3 unidades · marca boa(?! · comprado)/,
    ]);
    await expect(page.getByText("2 itens, nenhum comprado")).toBeVisible();
    for (const caixa of await page.getByRole("checkbox").all()) {
      await expect(caixa).not.toBeChecked();
    }

    // A lista de origem continua como estava, com o arroz comprado.
    await seletor(page).selectOption({ label: original! });
    await expect(page.getByRole("checkbox", { name: "Arroz" })).toBeChecked();
    await expect(page.getByText("2 itens, 1 comprado")).toBeVisible();

    // E as duas continuam lá depois de recarregar, abrindo na que foi mexida por último.
    await page.reload();
    await expect(seletor(page).locator("option")).toHaveCount(2);
    const { listas, itens: guardados } = await guardado(page);
    expect(listas).toHaveLength(2);
    expect(guardados).toHaveLength(4);
  });

  test("mudar um item da cópia não muda a lista de origem", async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz", { quantidade: "2" });
    const original = await seletor(page).locator("option:checked").textContent();
    await abrirOpcoes(page);
    await page.getByRole("button", { name: "Duplicar" }).click();
    await expect(aviso(page)).toContainText("Lista duplicada");

    await page.getByRole("button", { name: "Remover Arroz" }).click();
    await expect(itens(page)).toHaveCount(0);

    await seletor(page).selectOption({ label: original! });
    await expect(itens(page)).toHaveText([/Arroz.*2 unidades/]);
  });
});

test.describe("alterar e remover itens", () => {
  test.beforeEach(async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz", { quantidade: "2" });
    await adicionarEEsperar(page, "Feijão");
    await adicionarEEsperar(page, "Sal");
  });

  test("altera um item e mantém a posição dele", async ({ page }) => {
    await page.getByRole("button", { name: "Editar Feijão" }).click();
    const edicao = page.getByRole("form", { name: "Alterar Feijão" });
    await expect(edicao.getByLabel("Nome do item")).toBeFocused();
    await preencher(edicao, "Feijão preto", { quantidade: "4", tamanho: "1 kg" });
    await edicao.getByRole("button", { name: "Salvar" }).click();

    await expect(aviso(page)).toHaveText("Feijão preto foi alterado.");
    await expect(itens(page)).toHaveText([/Arroz/, /Feijão preto.*4 × 1 kg/, /Sal/]);
    await expect(page.getByRole("button", { name: "Editar Feijão preto" })).toBeFocused();

    await page.reload();
    await expect(itens(page)).toHaveText([/Arroz/, /Feijão preto.*4 × 1 kg/, /Sal/]);
  });

  test("cancelar a alteração deixa o item como estava", async ({ page }) => {
    await page.getByRole("button", { name: "Editar Arroz" }).click();
    const edicao = page.getByRole("form", { name: "Alterar Arroz" });
    await edicao.getByLabel("Nome do item").fill("Outra coisa");
    await edicao.getByRole("button", { name: "Cancelar" }).click();

    await expect(itens(page)).toHaveText([/Arroz.*2 unidades/, /Feijão/, /Sal/]);
    await expect(page.getByRole("button", { name: "Editar Arroz" })).toBeFocused();
  });

  test("remove um item e desfaz, devolvendo ao mesmo lugar", async ({ page }) => {
    await page.getByRole("button", { name: "Remover Feijão" }).click();

    await expect(aviso(page)).toHaveText("Feijão saiu da lista.");
    await expect(itens(page)).toHaveText([/Arroz/, /Sal/]);
    const desfazer = page.getByRole("button", { name: "Desfazer" });
    await expect(desfazer).toBeFocused();

    await desfazer.click();

    await expect(aviso(page)).toHaveText("Feijão voltou para a lista.");
    await expect(itens(page)).toHaveText([/Arroz/, /Feijão/, /Sal/]);
    await expect(desfazer).toHaveCount(0);

    await page.reload();
    await expect(itens(page)).toHaveText([/Arroz/, /Feijão/, /Sal/]);
  });

  test("a remoção vale depois de recarregar", async ({ page }) => {
    await page.getByRole("button", { name: "Remover Sal" }).click();
    await expect(aviso(page)).toHaveText("Sal saiu da lista.");

    await page.reload();
    await expect(itens(page)).toHaveText([/Arroz/, /Feijão/]);
  });
});

test.describe("entrada inválida", () => {
  test.beforeEach(async ({ page }) => {
    await abrir(page);
  });

  for (const [caso, nome, quantidade, mensagem, campo] of [
    ["nome vazio", "", "1", "Escreva o nome do item.", "Nome do item"],
    ["nome só com espaços", "   ", "1", "Escreva o nome do item.", "Nome do item"],
    [
      "quantidade zero",
      "Arroz",
      "0",
      "A quantidade precisa ser um número inteiro de 1 a 999.",
      "Quantidade",
    ],
    [
      "quantidade com vírgula",
      "Arroz",
      "1,5",
      "A quantidade precisa ser um número inteiro de 1 a 999.",
      "Quantidade",
    ],
    [
      "quantidade com letra",
      "Arroz",
      "x",
      "A quantidade precisa ser um número inteiro de 1 a 999.",
      "Quantidade",
    ],
  ] as const) {
    test(`recusa ${caso}, diz o motivo e leva o foco ao campo`, async ({ page }) => {
      await adicionar(page, nome, { quantidade });

      await expect(page.getByRole("alert")).toHaveText(mensagem);
      const entrada = formulario(page).getByLabel(campo);
      await expect(entrada).toBeFocused();
      await expect(entrada).toHaveAttribute("aria-invalid", "true");
      await expect(entrada).toHaveAccessibleDescription(mensagem);
      await expect(itens(page)).toHaveCount(0);
      expect((await guardado(page)).itens).toEqual([]);
    });
  }

  test("pede a marca quando a preferência é só esta marca, abrindo os campos opcionais", async ({
    page,
  }) => {
    await preencher(formulario(page), "Café", { preferencia: /Só esta marca/ });
    // Fecha os campos opcionais antes de enviar: a recusa precisa abrir de novo.
    await formulario(page).getByText("Marca, tamanho e preferência").click();
    await formulario(page).getByRole("button", { name: "Adicionar", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Para comprar só esta marca, escreva qual é a marca.",
    );
    await expect(formulario(page).getByLabel("Marca preferida")).toBeFocused();

    await formulario(page).getByLabel("Marca preferida").fill("Marca Exemplo");
    await formulario(page).getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(aviso(page)).toHaveText("Café entrou na lista.");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("os campos não deixam digitar além do limite", async ({ page }) => {
    await preencher(formulario(page), "a".repeat(100), {
      quantidade: "12345",
      marca: "m".repeat(100),
      tamanho: "t".repeat(100),
    });

    await expect(formulario(page).getByLabel("Nome do item")).toHaveValue("a".repeat(60));
    await expect(formulario(page).getByLabel("Quantidade")).toHaveValue("123");
    await expect(formulario(page).getByLabel("Marca preferida")).toHaveValue("m".repeat(40));
    await expect(formulario(page).getByLabel("Tamanho")).toHaveValue("t".repeat(20));
  });

  test("mostra como texto um nome com marcação HTML", async ({ page, consoleErrors }) => {
    let dialogos = 0;
    page.on("dialog", (dialogo) => {
      dialogos += 1;
      void dialogo.dismiss();
    });
    const nome = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

    await adicionarEEsperar(page, nome);
    await page.reload();

    await expect(itens(page)).toContainText(nome);
    await expect(page.locator(".lista img, .lista script")).toHaveCount(0);
    expect(dialogos).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test("dois envios seguidos do mesmo nome guardam um item só", async ({ page }) => {
    await formulario(page).getByLabel("Nome do item").fill("Arroz");
    const botao = formulario(page).getByRole("button", { name: "Adicionar", exact: true });
    await botao.dblclick();

    await expect(itens(page)).toHaveCount(1);
    expect((await guardado(page)).itens).toHaveLength(1);
  });
});

test.describe("listas", () => {
  test.beforeEach(async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz");
    await abrirOpcoes(page);
  });

  test("renomeia a lista", async ({ page }) => {
    await page.getByRole("button", { name: "Renomear" }).click();
    const campo = page.getByLabel("Novo nome da lista");
    await expect(campo).toBeFocused();
    await campo.fill("Compra grande");
    await page.getByRole("button", { name: "Salvar nome" }).click();

    await expect(aviso(page)).toHaveText('A lista agora se chama "Compra grande".');
    await expect(seletor(page).locator("option:checked")).toHaveText("Compra grande");

    await page.reload();
    await expect(seletor(page).locator("option:checked")).toHaveText("Compra grande");
    await expect(itens(page)).toHaveText([/Arroz/]);
  });

  test("recusa nome vazio ao renomear", async ({ page }) => {
    await page.getByRole("button", { name: "Renomear" }).click();
    await page.getByLabel("Novo nome da lista").fill("  ");
    await page.getByRole("button", { name: "Salvar nome" }).click();

    await expect(page.getByRole("alert")).toHaveText("Dê um nome para a lista.");
    await expect(page.getByLabel("Novo nome da lista")).toHaveAttribute("aria-invalid", "true");
  });

  test("cria outra lista vazia e troca entre elas", async ({ page }) => {
    const primeira = await seletor(page).locator("option:checked").textContent();
    await page.getByRole("button", { name: "Nova lista" }).click();

    await expect(aviso(page)).toHaveText(`Lista "${primeira} (2)" criada.`);
    await expect(itens(page)).toHaveCount(0);
    await adicionarEEsperar(page, "Carvão");

    await seletor(page).selectOption({ label: primeira! });
    await expect(itens(page)).toHaveText([/Arroz/]);
    await seletor(page).selectOption({ label: `${primeira} (2)` });
    await expect(itens(page)).toHaveText([/Carvão/]);
  });

  test("só exclui a lista depois da confirmação", async ({ page }) => {
    await page.getByRole("button", { name: "Nova lista" }).click();
    await expect(aviso(page)).toContainText("criada");
    await adicionarEEsperar(page, "Carvão");
    const excluida = await seletor(page).locator("option:checked").textContent();

    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    const pergunta = page.getByRole("group", { name: /Excluir a lista/ });
    await expect(pergunta).toContainText(
      `Excluir a lista ${excluida} e 1 item? Não dá para desfazer.`,
    );
    await expect(pergunta.getByRole("button", { name: "Excluir a lista" })).toBeFocused();

    await pergunta.getByRole("button", { name: "Cancelar" }).click();
    await expect(pergunta).toHaveCount(0);
    await expect(seletor(page).locator("option")).toHaveCount(2);

    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await pergunta.getByRole("button", { name: "Excluir a lista" }).click();

    await expect(aviso(page)).toContainText(`Lista "${excluida}" excluída.`);
    await expect(seletor(page).locator("option")).toHaveCount(1);
    await expect(itens(page)).toHaveText([/Arroz/]);
    const { listas, itens: guardados } = await guardado(page);
    expect(listas).toHaveLength(1);
    expect(guardados).toHaveLength(1);
  });

  test("ao excluir a última lista, abre uma vazia com o nome do mês", async ({ page }) => {
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await page.getByRole("button", { name: "Excluir a lista" }).click();

    await expect(seletor(page).locator("option")).toHaveText([/^[A-Z][a-zç]+ de \d{4}$/]);
    await expect(itens(page)).toHaveCount(0);
    expect((await guardado(page)).itens).toEqual([]);
  });
});

test.describe("acessibilidade e celular", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`a lista com itens, pergunta e erro não tem violações no tema ${colorScheme} (axe, WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await abrir(page);
      await adicionarEEsperar(page, "Arroz", {
        quantidade: "2",
        marca: "Marca Exemplo",
        tamanho: "5 kg",
        preferencia: /Só esta marca/,
      });
      await adicionarEEsperar(page, "Feijão");
      await page.getByRole("checkbox", { name: "Arroz" }).check();
      await abrirOpcoes(page);
      await page.getByRole("button", { name: "Excluir", exact: true }).click();
      await page.getByRole("button", { name: "Editar Feijão" }).click();
      await adicionar(page, "arroz");
      await expect(page.getByRole("group", { name: /Arroz já está na lista/ })).toBeVisible();

      const comPergunta = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(comPergunta.violations).toEqual([]);

      await page.getByRole("button", { name: "Cancelar" }).last().click();
      await adicionar(page, "", { quantidade: "0" });
      await expect(page.getByRole("alert")).toBeVisible();

      const comErro = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(comErro.violations).toEqual([]);
    });
  }

  test("nome comprido não cria rolagem lateral", async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Detergente".repeat(6), {
      marca: "Marcacomnomemuitocomprido".repeat(1),
      tamanho: "12x500ml caixa",
    });
    await adicionarEEsperar(page, "Papel higiênico folha dupla neutro trinta metros leve mais");

    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("os alvos de toque da lista têm pelo menos 44 px de altura", async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz");
    await abrirOpcoes(page);

    for (const alvo of [
      seletor(page),
      formulario(page).getByLabel("Nome do item"),
      formulario(page).getByRole("button", { name: "Adicionar", exact: true }),
      page.getByRole("button", { name: "Editar Arroz" }),
      page.getByRole("button", { name: "Remover Arroz" }),
      page.getByRole("button", { name: "Duplicar" }),
      page.locator(".lista-item-marcar"),
    ]) {
      const caixa = await alvo.boundingBox();
      expect(
        caixa?.height,
        await alvo.evaluate((elemento) => elemento.outerHTML),
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test("dá para montar a lista só com o teclado", async ({ page, isMobile }) => {
    test.skip(isMobile, "Navegação por teclado só no desktop.");
    await abrir(page);

    await formulario(page).getByLabel("Nome do item").focus();
    await page.keyboard.type("Arroz");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await expect(aviso(page)).toHaveText("Arroz entrou na lista.");

    // O foco volta ao nome: o item seguinte entra sem tocar no mouse.
    await page.keyboard.type("Feijão");
    await page.keyboard.press("Enter");
    await expect(itens(page)).toHaveText([/Arroz.*2 unidades/, /Feijão/]);

    await page.getByRole("checkbox", { name: "Arroz" }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Arroz" })).toBeChecked();
  });
});

test.describe("armazenamento do aparelho", () => {
  test("sem armazenamento no navegador, avisa que a lista não fica guardada e segue funcionando", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined });
    });
    await abrir(page);

    await expect(page.getByRole("alert")).toContainText("Esta lista não está sendo guardada.");
    await adicionarEEsperar(page, "Arroz");
    await expect(itens(page)).toHaveText([/Arroz/]);

    await page.reload();
    await expect(formulario(page).getByLabel("Nome do item")).toBeVisible();
    await expect(itens(page)).toHaveCount(0);
  });

  test("não abre nem altera dados gravados por uma versão mais nova do app", async ({ page }) => {
    await page.goto("/sobre");
    await page.evaluate(
      (nome) =>
        new Promise<void>((resolver, rejeitar) => {
          const pedido = indexedDB.open(nome, 99);
          pedido.onupgradeneeded = () => {
            pedido.result.createObjectStore("listas", { keyPath: "id" });
            pedido.result.createObjectStore("itens", { keyPath: "id" });
            pedido.result.createObjectStore("doFuturo", { keyPath: "id" });
          };
          pedido.onsuccess = () => {
            pedido.result.close();
            resolver();
          };
          pedido.onerror = () => rejeitar(pedido.error);
        }),
      nomeDoBanco,
    );

    await page.goto("/lista");

    await expect(page.getByRole("alert")).toContainText(
      "A lista não abriu. Este aparelho tem dados de uma versão mais nova do app.",
    );
    await expect(page.getByRole("button", { name: "Recarregar a página" })).toBeVisible();
    await expect(page.getByLabel("Nome do item")).toHaveCount(0);
    expect((await guardado(page)).versao).toBe(99);
  });

  test("deixa de fora o registro guardado fora do formato e avisa", async ({ page }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz");
    await page.evaluate(
      (nome) =>
        new Promise<void>((resolver, rejeitar) => {
          const pedido = indexedDB.open(nome);
          pedido.onerror = () => rejeitar(pedido.error);
          pedido.onsuccess = () => {
            const transacao = pedido.result.transaction("itens", "readwrite");
            transacao.objectStore("itens").put({ id: "quebrado", nome: 42 });
            transacao.oncomplete = () => {
              pedido.result.close();
              resolver();
            };
          };
        }),
      nomeDoBanco,
    );

    await page.reload();

    await expect(
      page.getByText("1 registro guardado neste aparelho não pôde ser lido e ficou de fora."),
    ).toBeVisible();
    await expect(itens(page)).toHaveText([/Arroz/]);
    await adicionarEEsperar(page, "Feijão");
  });

  test("quando outra aba atualiza o app, pede para recarregar em vez de gravar no banco antigo", async ({
    page,
    context,
  }) => {
    await abrir(page);
    await adicionarEEsperar(page, "Arroz");

    // Outra aba abre o mesmo banco numa versão seguinte, como um app atualizado faria.
    const outra = await context.newPage();
    await outra.goto("/sobre");
    await outra.evaluate(
      (nome) =>
        new Promise<void>((resolver, rejeitar) => {
          const consulta = indexedDB.open(nome);
          consulta.onerror = () => rejeitar(consulta.error);
          consulta.onsuccess = () => {
            const seguinte = consulta.result.version + 1;
            consulta.result.close();
            const pedido = indexedDB.open(nome, seguinte);
            pedido.onsuccess = () => {
              pedido.result.close();
              resolver();
            };
            pedido.onerror = () => rejeitar(pedido.error);
          };
        }),
      nomeDoBanco,
    );

    await adicionar(page, "Feijão");

    await expect(page.getByRole("alert")).toHaveText(
      "Os dados deste aparelho mudaram em outra aba. Recarregue esta página para continuar.",
    );
    await expect(itens(page)).toHaveText([/Arroz/]);
    await expect(formulario(page).getByLabel("Nome do item")).toHaveValue("Feijão");
  });
});
