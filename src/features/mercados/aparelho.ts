/**
 * Ponto, raio e mercados cadastrados no aparelho (ADR-0005), e o que a comparação usa: as
 * listas, os preços e o objetivo (T14, ADR-0006). Sem IndexedDB, a tela funciona em memória e
 * avisa que o ponto some ao fechar a página; dados de uma versão mais nova do app nunca são
 * abertos nem sobrepostos.
 */
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { abrirIndexedDb } from "../../shared/armazenamento/indexeddb";
import { criarBancoEmMemoria } from "../../shared/armazenamento/memoria";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { lerObjetivo, registroDoObjetivo, type Objetivo } from "../comparar/objetivo";
import { conferirEstado, type Estado } from "../lista/lista";
import { conferirObservacoes, type ObservacaoDePreco } from "../precos/precos";
import {
  idDoPonto,
  lerAjustes,
  registroDoPonto,
  registroDoRaio,
  type Ajustes,
  type PontoEscolhido,
  type Raio,
} from "./ajustes";
import {
  conferirMercadosProprios,
  excluirMercado,
  gravarMercado,
  type MercadoProprio,
} from "./proprios";

type AbrirBanco = (fabrica: IDBFactory | undefined) => Promise<Resultado<Banco, ErroDoBanco>>;

export interface Aparelho {
  readonly banco: Banco;
  readonly ajustes: Ajustes;
  /** Mercados que a pessoa cadastrou; registro fora do formato fica de fora (CA-08). */
  readonly proprios: readonly MercadoProprio[];
  readonly lista: Estado;
  readonly observacoes: readonly ObservacaoDePreco[];
  readonly objetivo: Objetivo;
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
  return sucesso({
    banco,
    ajustes: lerAjustes(lido.valor.ajustes),
    proprios: conferirMercadosProprios(lido.valor.mercadosProprios).mercados,
    lista: conferirEstado(lido.valor).estado,
    observacoes: conferirObservacoes(lido.valor.observacoesDePreco).observacoes,
    objetivo: lerObjetivo(lido.valor.ajustes),
  });
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

export function guardarObjetivo(banco: Banco, objetivo: Objetivo) {
  return banco.aplicar({ ajustes: { gravar: [registroDoObjetivo(objetivo)] } });
}

export function guardarMercado(banco: Banco, mercado: MercadoProprio) {
  return banco.aplicar(gravarMercado(mercado));
}

export function apagarMercado(banco: Banco, id: string) {
  return banco.aplicar(excluirMercado(id));
}
