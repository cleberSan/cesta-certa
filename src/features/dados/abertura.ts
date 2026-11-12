import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { abrirIndexedDb } from "../../shared/armazenamento/indexeddb";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { lerAparelho, type Aparelho } from "./copia";

type AbrirBanco = (fabrica: IDBFactory | undefined) => Promise<Resultado<Banco, ErroDoBanco>>;

export interface DadosAbertos {
  readonly banco: Banco;
  readonly aparelho: Aparelho;
}

/**
 * Abre o armazenamento do aparelho para a tela Seus dados. Aqui não há reserva em memória:
 * sem armazenamento no navegador não existe o que exportar nem onde importar, e a tela diz
 * isso em vez de fingir que guardou.
 */
export async function abrirDados(
  fabrica: IDBFactory | undefined,
  abrirBanco: AbrirBanco = abrirIndexedDb,
): Promise<Resultado<DadosAbertos, ErroDoBanco>> {
  const banco = await abrirBanco(fabrica);
  if (!banco.ok) return banco;
  const aparelho = await lerAparelho(banco.valor);
  if (!aparelho.ok) return falha(aparelho.erro.motivo);
  return sucesso({ banco: banco.valor, aparelho: aparelho.valor });
}
