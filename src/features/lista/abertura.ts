import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { abrirIndexedDb } from "../../shared/armazenamento/indexeddb";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { gerarId } from "../../shared/identificador";
import type { Resultado } from "../../shared/resultado";
import type { Contexto } from "./lista";
import { abrirSessao, type Sessao } from "./sessao";

type AbrirBanco = (fabrica: IDBFactory | undefined) => Promise<Resultado<Banco, ErroDoBanco>>;

const contextoDoAparelho = (): Contexto => ({ agora: new Date(), gerarId });

/**
 * Abre a lista no aparelho. Se o navegador não deixa guardar, a lista abre em memória (a
 * tela avisa que ela some ao fechar a página). Dados de uma versão mais nova do app nunca
 * são abertos nem sobrepostos por uma lista vazia: a tela pede para recarregar.
 */
export async function abrirLista(
  fabrica: IDBFactory | undefined,
  abrirBanco: AbrirBanco = abrirIndexedDb,
  contexto: () => Contexto = contextoDoAparelho,
): Promise<Resultado<Sessao, ErroDoBanco>> {
  const banco = await abrirBanco(fabrica);
  if (banco.ok) return abrirSessao(banco.valor, contexto);
  if (banco.erro !== "indisponivel") return banco;
  return abrirSessao(criarBancoEmMemoria(), contexto);
}
