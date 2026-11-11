import type { NotaConsultada } from "../../../src/shared/contratos/nfce";
import type { ChaveDeAcesso } from "../chave";
import type { PaginaLida } from "../html";

/**
 * Cada UF publica a consulta da NFC-e num endereço e num formato próprios, então cada uma
 * tem o seu leitor (spec 0001, plano.md). O primeiro é o de São Paulo.
 */
export interface LeitorDeUf {
  readonly sigla: string;
  /** Código do IBGE, os dois primeiros dígitos da chave de acesso. */
  readonly codigoIbge: string;
  /** Host exato da consulta: a única origem que o Worker busca para esta UF. */
  readonly host: string;
  /** Caminhos da consulta por QR Code, na grafia oficial. */
  readonly rotas: readonly string[];
  /** Devolve a nota, ou `undefined` quando a página não traz itens no formato esperado. */
  ler(pagina: PaginaLida, chave: ChaveDeAcesso): NotaConsultada | undefined;
}
