import { expect, type Locator, type Page } from "@playwright/test";

/** Apoio dos testes que usam a tela da lista do mês (/lista). */
export const formulario = (page: Page) => page.getByRole("form", { name: "Adicionar item" });
export const itens = (page: Page) =>
  page.getByRole("list", { name: "Itens" }).getByRole("listitem");
export const aviso = (page: Page) => page.getByRole("status");
export const seletor = (page: Page) => page.getByLabel("Lista", { exact: true });

export async function abrir(page: Page) {
  await page.goto("/lista");
  // O formulário aparece quando a lista termina de abrir do aparelho.
  await expect(formulario(page).getByLabel("Nome do item")).toBeVisible();
}

export interface Detalhes {
  quantidade?: string;
  marca?: string;
  tamanho?: string;
  preferencia?: RegExp;
}

export async function preencher(campos: Locator, nome: string, detalhes: Detalhes = {}) {
  await campos.getByLabel("Nome do item").fill(nome);
  if (detalhes.quantidade !== undefined) {
    await campos.getByLabel("Quantidade").fill(detalhes.quantidade);
  }
  if (detalhes.marca !== undefined || detalhes.tamanho !== undefined || detalhes.preferencia) {
    const marca = campos.getByLabel("Marca preferida");
    if (!(await marca.isVisible())) await campos.getByText("Marca, tamanho e preferência").click();
    if (detalhes.marca !== undefined) await marca.fill(detalhes.marca);
    if (detalhes.tamanho !== undefined) await campos.getByLabel("Tamanho").fill(detalhes.tamanho);
    if (detalhes.preferencia) await campos.getByLabel(detalhes.preferencia).check();
  }
}

export async function adicionar(page: Page, nome: string, detalhes: Detalhes = {}) {
  await preencher(formulario(page), nome, detalhes);
  await formulario(page).getByRole("button", { name: "Adicionar", exact: true }).click();
}

export async function adicionarEEsperar(page: Page, nome: string, detalhes: Detalhes = {}) {
  await adicionar(page, nome, detalhes);
  await expect(aviso(page)).toHaveText(`${nome} entrou na lista.`);
}

export async function abrirOpcoes(page: Page) {
  const opcoes = page.locator("details", { hasText: "Opções da lista" });
  if ((await opcoes.getAttribute("open")) === null) await page.getByText("Opções da lista").click();
}
