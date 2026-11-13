/** Textos da importação da nota (spec 0001, CA-10 e CA-14): fora dos componentes, com teste. */
import { limitesDoPreco } from "../precos";
import { contarPrecos } from "../textos";
import { limitesDaAssociacao } from "./associacoes";
import type { ErroDaImportacao, Importacao, Preparo } from "./importacao";

const milhar = new Intl.NumberFormat("pt-BR");

/** "1 produto", "3 produtos". */
export function contarProdutos(quantos: number): string {
  return quantos === 1 ? "1 produto" : `${quantos} produtos`;
}

/** Quantos produtos ainda esperam a escolha da pessoa (CA-14). */
export function descreverPendentes(quantos: number): string {
  if (quantos === 0) return "Todos os produtos têm uma escolha.";
  return quantos === 1 ? "Falta escolher 1 produto." : `Faltam escolher ${quantos} produtos.`;
}

/** Texto do botão de guardar, com quantos preços entram. */
export function rotuloDeGuardar(quantos: number): string {
  return quantos === 0 ? "Guardar as escolhas" : `Guardar ${contarPrecos(quantos)}`;
}

/** Avisos sobre a nota antes de guardar: itens sem preço e nota já importada. */
export function avisosDoPreparo(preparo: Preparo): readonly string[] {
  const avisos: string[] = [];
  if (preparo.semPreco > 0) {
    avisos.push(
      preparo.semPreco === 1
        ? "1 item sem preço na nota fica de fora."
        : `${preparo.semPreco} itens sem preço na nota ficam de fora.`,
    );
  }
  if (preparo.jaGuardados > 0) {
    avisos.push(
      `Esta nota já foi importada (${contarPrecos(preparo.jaGuardados)}). Guardar de novo troca os preços dela pelos desta vez, sem repetir.`,
    );
  }
  return avisos;
}

/** O que a tela diz depois de guardar. */
export function resumoDaImportacao(importacao: Importacao, mercado: string): string {
  const ignorados =
    importacao.ignorados === 0
      ? ""
      : ` ${contarProdutos(importacao.ignorados)} ${importacao.ignorados === 1 ? "ignorado" : "ignorados"}.`;
  const guardados =
    importacao.guardados === 0
      ? `Nenhum preço guardado de ${mercado}.`
      : `${contarPrecos(importacao.guardados)} de ${mercado} ${importacao.guardados === 1 ? "guardado" : "guardados"}.`;
  return `${guardados}${ignorados} As escolhas ficam lembradas para as próximas notas desta loja.`;
}

export function mensagemDaImportacao(erro: ErroDaImportacao): string {
  switch (erro.tipo) {
    case "mercado-vazio":
      return "Escolha o mercado desta nota.";
    case "faltam-produtos":
      return `${descreverPendentes(erro.quantos)} Escolha o item da lista ou "Ignorar este produto", ou toque em "Ignorar os que faltam".`;
    case "limite-de-precos":
      return `Os preços desta nota passariam do máximo de ${milhar.format(limitesDoPreco.precos)} preços no aparelho. Exclua preços antigos em Preços e tente de novo.`;
    case "limite-de-escolhas":
      return `O aparelho já lembra ${milhar.format(limitesDaAssociacao.associacoes)} escolhas de produtos das notas, o máximo. Os preços desta nota podem ser digitados em Preços.`;
  }
}
