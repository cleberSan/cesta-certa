/**
 * O que a tela de preços lê do aparelho (spec 0001, T12): as listas, para sugerir os
 * produtos, o ponto e o raio, para oferecer os mercados perto, os mercados cadastrados e os
 * preços. Sem IndexedDB, a tela funciona em memória e avisa que os preços somem ao fechar a
 * página; dados de uma versão mais nova do app nunca são abertos nem sobrepostos.
 */
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { abrirIndexedDb } from "../../shared/armazenamento/indexeddb";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { conferirEstado, type Estado } from "../lista/lista";
import { lerAjustes, type Ajustes } from "../mercados/ajustes";
import { conferirMercadosProprios, type MercadoProprio } from "../mercados/proprios";
import { conferirObservacoes, excluirPreco, gravarPrecos, type ObservacaoDePreco } from "./precos";

type AbrirBanco = (fabrica: IDBFactory | undefined) => Promise<Resultado<Banco, ErroDoBanco>>;

export interface AparelhoDosPrecos {
  readonly banco: Banco;
  readonly lista: Estado;
  readonly ajustes: Ajustes;
  readonly proprios: readonly MercadoProprio[];
  readonly observacoes: readonly ObservacaoDePreco[];
}

export async function abrirPrecos(
  fabrica: IDBFactory | undefined,
  abrirBanco: AbrirBanco = abrirIndexedDb,
): Promise<Resultado<AparelhoDosPrecos, ErroDoBanco>> {
  const aberto = await abrirBanco(fabrica);
  if (!aberto.ok && aberto.erro !== "indisponivel") return aberto;
  const banco = aberto.ok ? aberto.valor : criarBancoEmMemoria();
  const lido = await banco.lerTudo();
  if (!lido.ok) return falha(lido.erro);
  return sucesso({
    banco,
    lista: conferirEstado(lido.valor).estado,
    ajustes: lerAjustes(lido.valor.ajustes),
    proprios: conferirMercadosProprios(lido.valor.mercadosProprios).mercados,
    observacoes: conferirObservacoes(lido.valor.observacoesDePreco).observacoes,
  });
}

export function guardarPrecos(banco: Banco, observacoes: readonly ObservacaoDePreco[]) {
  return banco.aplicar(gravarPrecos(observacoes));
}

export function apagarPreco(banco: Banco, id: string) {
  return banco.aplicar(excluirPreco(id));
}
