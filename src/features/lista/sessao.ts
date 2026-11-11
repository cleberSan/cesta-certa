import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import {
  conferirEstado,
  criarLista,
  sugerirNome,
  type Contexto,
  type ErroDaLista,
  type Estado,
  type Mudanca,
} from "./lista";

/**
 * Liga as regras da lista ao que está guardado no aparelho. O estado em memória só muda
 * depois que a gravação deu certo, então a tela nunca mostra o que não foi guardado; as
 * operações rodam uma de cada vez, na ordem em que chegaram.
 */
export type ErroDaSessao =
  ErroDaLista | { readonly tipo: "armazenamento"; readonly motivo: ErroDoBanco };

export type Operacao<M extends Mudanca> = (
  estado: Estado,
  contexto: Contexto,
) => Resultado<M, ErroDaLista>;

export interface Sessao {
  /** Falso quando a lista vale só enquanto a página estiver aberta. */
  readonly persistente: boolean;
  /** Registros guardados que não estavam no formato esperado e ficaram de fora. */
  readonly recusados: number;
  estado(): Estado;
  /** Avisa a cada mudança de estado; devolve a função que cancela o aviso. */
  assinar(ouvinte: () => void): () => void;
  executar<M extends Mudanca>(operacao: Operacao<M>): Promise<Resultado<M, ErroDaSessao>>;
}

export async function abrirSessao(
  banco: Banco,
  contexto: () => Contexto,
): Promise<Resultado<Sessao, ErroDoBanco>> {
  const lido = await banco.lerTudo();
  if (!lido.ok) return lido;

  const conferido = conferirEstado(lido.valor);
  let estado = conferido.estado;
  let fila: Promise<unknown> = Promise.resolve();
  const ouvintes = new Set<() => void>();

  const sessao: Sessao = {
    persistente: banco.persistente,
    recusados: conferido.recusados,
    estado: () => estado,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    executar<M extends Mudanca>(operacao: Operacao<M>) {
      const vez = fila.then(async (): Promise<Resultado<M, ErroDaSessao>> => {
        const resultado = operacao(estado, contexto());
        if (!resultado.ok) return resultado;
        const gravado = await banco.aplicar(resultado.valor.alteracoes);
        if (!gravado.ok) return falha({ tipo: "armazenamento", motivo: gravado.erro });
        estado = resultado.valor.estado;
        for (const ouvinte of ouvintes) ouvinte();
        return resultado;
      });
      // Uma operação que estoura exceção não trava as seguintes.
      fila = vez.catch(() => undefined);
      return vez;
    },
  };

  // O app sempre tem uma lista aberta: no primeiro uso, a do mês atual.
  if (estado.listas.length === 0) {
    const criada = await sessao.executar((atual, agora) =>
      criarLista(atual, sugerirNome(atual, agora), agora),
    );
    if (!criada.ok) {
      return falha(criada.erro.tipo === "armazenamento" ? criada.erro.motivo : "falhou");
    }
  }
  return sucesso(sessao);
}
