import type { Page } from "@playwright/test";

/** Apoio dos testes que olham o que o app guardou no aparelho (IndexedDB do navegador). */
export const nomeDoBanco = "cesta-certa";

export interface Guardado {
  versao: number;
  listas: unknown[];
  itens: unknown[];
}

/** Lê tudo o que está guardado no aparelho, direto do IndexedDB. */
export function guardado(page: Page): Promise<Guardado> {
  return page.evaluate(
    (nome) =>
      new Promise<{ versao: number; listas: unknown[]; itens: unknown[] }>((resolver, rejeitar) => {
        const pedido = indexedDB.open(nome);
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          const transacao = banco.transaction(["listas", "itens"], "readonly");
          const listas = transacao.objectStore("listas").getAll();
          const itensGuardados = transacao.objectStore("itens").getAll();
          transacao.oncomplete = () => {
            banco.close();
            resolver({
              versao: banco.version,
              listas: listas.result,
              itens: itensGuardados.result,
            });
          };
        };
      }),
    nomeDoBanco,
  );
}

/**
 * Apaga o banco do app, como num aparelho que nunca abriu o site. A página precisa estar
 * numa rota sem ilha que use o banco (por exemplo /sobre), senão a conexão aberta segura.
 */
export function apagarBanco(page: Page): Promise<void> {
  return page.evaluate(
    (nome) =>
      new Promise<void>((resolver, rejeitar) => {
        const pedido = indexedDB.deleteDatabase(nome);
        pedido.onsuccess = () => resolver();
        pedido.onerror = () => rejeitar(pedido.error);
        pedido.onblocked = () => rejeitar(new Error("banco em uso por outra página"));
      }),
    nomeDoBanco,
  );
}
