/**
 * Ponto e raio no aparelho (ADR-0005). Sem IndexedDB, a tela funciona em memória e avisa
 * que o ponto some ao fechar a página; dados de uma versão mais nova do app nunca são
 * abertos nem sobrepostos.
 */
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { abrirIndexedDb } from "../../shared/armazenamento/indexeddb";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import {
  idDoPonto,
  lerAjustes,
  registroDoPonto,
  registroDoRaio,
  type Ajustes,
  type PontoEscolhido,
  type Raio,
} from "./ajustes";

type AbrirBanco = (fabrica: IDBFactory | undefined) => Promise<Resultado<Banco, ErroDoBanco>>;

export interface Aparelho {
  readonly banco: Banco;
  readonly ajustes: Ajustes;
}

export async function abrirAparelho(
  fabrica: IDBFactory | undefined,
  abrirBanco: AbrirBanco = abrirIndexedDb,
): Promise<Resultado<Aparelho, ErroDoBanco>> {
  const aberto = await abrirBanco(fabrica);
  if (!aberto.ok && aberto.erro !== "indisponivel") return aberto;
  const banco = aberto.ok ? aberto.valor : criarBancoEmMemoria();
  const lido = await banco.lerTudo();
  if (!lido.ok) return falha(lido.erro);
  return sucesso({ banco, ajustes: lerAjustes(lido.valor.ajustes) });
}

export function guardarPonto(banco: Banco, ponto: PontoEscolhido) {
  return banco.aplicar({ ajustes: { gravar: [registroDoPonto(ponto)] } });
}

export function esquecerPonto(banco: Banco) {
  return banco.aplicar({ ajustes: { apagar: [idDoPonto] } });
}

export function guardarRaio(banco: Banco, km: Raio) {
  return banco.aplicar({ ajustes: { gravar: [registroDoRaio(km)] } });
}
