import type { Page } from "@playwright/test";
import { abrirMercados, centro, servirBase } from "./base-de-mercados";
import { expect } from "./fixtures";

/**
 * A compra de exemplo da comparação (spec 0001, T14 e T16): ponto, lista e preços gravados
 * direto no IndexedDB do app, com a base sintética de mercados servida pelo Playwright. O
 * relógio fica fixo em `hoje`, para o "antigo" não depender do dia.
 */
export const hoje = new Date("2026-11-13T15:00:00-03:00");
export const listaId = "11111111-1111-4111-8111-111111111111";
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
export const itens = [
  item("Arroz", 0, { tamanho: "5 kg", marca: "Tio João", preferencia: "so-esta-marca" }),
  item("Feijão", 1, { quantidade: 2, tamanho: "1 kg" }),
  item("Café", 2, { quantidade: 2, tamanho: "500 g" }),
  item("Óleo", 3, { quantidade: 3, tamanho: "900 ml" }),
  item("Sabão", 4, { comprado: true }),
];
export const precos = [
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
export async function gravar(page: Page, registros: Record<string, readonly unknown[]>) {
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

/** Abre /mercados com a compra de exemplo; `ajustesExtras` entram junto com o ponto. */
export async function abrirComparacao(
  page: Page,
  comPrecos = true,
  ajustesExtras: readonly unknown[] = [],
) {
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
      ...ajustesExtras,
    ],
    listas: [{ id: listaId, nome: "Novembro de 2026", criadaEm: criadoEm, atualizadaEm: criadoEm }],
    itens,
    observacoesDePreco: comPrecos ? precos : [],
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Atacarejo Modelo", exact: true })).toBeVisible();
}
