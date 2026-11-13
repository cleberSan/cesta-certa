/**
 * Formato do banco no aparelho, uma migração por versão. A posição na lista é a versão de
 * partida: a migração 0 leva um aparelho sem banco à versão 1. Migração publicada nunca é
 * alterada; mudança de formato entra como migração nova, no fim da lista.
 */
export type BancoEmAtualizacao = Pick<IDBDatabase, "createObjectStore">;

export type Migracao = (banco: BancoEmAtualizacao) => void;

export const migracoes: readonly Migracao[] = [
  // 0 para 1: listas e itens da lista (spec 0001, T04).
  (banco) => {
    banco.createObjectStore("listas", { keyPath: "id" });
    banco.createObjectStore("itens", { keyPath: "id" });
  },
  // 1 para 2: ponto escolhido e raio, fora da cópia (spec 0001, T07; ADR-0005).
  (banco) => {
    banco.createObjectStore("ajustes", { keyPath: "id" });
  },
  // 2 para 3: mercados que a pessoa cadastrou, que entram na cópia (spec 0001, T08).
  (banco) => {
    banco.createObjectStore("mercadosProprios", { keyPath: "id" });
  },
];

export const versaoDoBanco = migracoes.length;

/**
 * Aplica, em ordem, as migrações que faltam para levar o banco de uma versão a outra. Roda
 * dentro da transação de atualização do IndexedDB: se alguma falhar, a exceção desfaz todas.
 */
export function aplicarMigracoes(
  banco: BancoEmAtualizacao,
  de: number,
  para: number,
  lista: readonly Migracao[] = migracoes,
): void {
  if (!Number.isInteger(de) || !Number.isInteger(para) || de < 0 || de > para) {
    throw new RangeError(`Migração inválida: da versão ${de} para a ${para}`);
  }
  if (para > lista.length) {
    throw new RangeError(`Não existe migração até a versão ${para}`);
  }
  for (let versao = de; versao < para; versao += 1) {
    lista[versao]!(banco);
  }
}
