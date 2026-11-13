/** Textos da tela de preços (spec 0001, CA-15 e CA-16): fora dos componentes, com teste. */
import { formatarCentavos } from "../../shared/dinheiro";
import { limitesDoPreco, type ErroDoPreco, type ObservacaoDePreco } from "./precos";

/** "2026-11-07" vira "07/11/2026", sem passar pelo objeto Date e o fuso dele. */
export function formatarDia(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split("-");
  return `${diaDoMes}/${mes}/${ano}`;
}

/** De onde veio o preço e quando foi visto (CA-16). */
export function descreverFonte(observacao: Pick<ObservacaoDePreco, "fonte" | "vistoEm">): string {
  const quando = formatarDia(observacao.vistoEm);
  return observacao.fonte === "nota" ? `Nota fiscal de ${quando}` : `Digitado em ${quando}`;
}

/** "Marca Exemplo, 5 kg", só com o que houver; nulo quando não há marca nem tamanho. */
export function descreverEmbalagem(
  observacao: Pick<ObservacaoDePreco, "marca" | "tamanho">,
): string | null {
  const partes = [observacao.marca, observacao.tamanho].filter((parte) => parte !== null);
  return partes.length === 0 ? null : partes.join(", ");
}

/** "A partir de 3 unidades" (CA-18). */
export function descreverAtacado(minimo: number): string {
  return `Preço de atacado: a partir de ${minimo} unidades`;
}

export const avisoDeAntigo = `Antigo: visto há mais de ${limitesDoPreco.diasAteAntigo} dias`;

/** "1 preço", "12 preços". */
export function contarPrecos(quantos: number): string {
  return quantos === 1 ? "1 preço" : `${quantos} preços`;
}

/** O que a tela anuncia depois de guardar um preço digitado. */
export function avisoDoPreco(observacao: ObservacaoDePreco): string {
  return `Preço guardado: ${observacao.produto}, ${formatarCentavos(observacao.precoCentavos)}, em ${observacao.mercadoNome}.`;
}

/** Por que o preço digitado não foi aceito. */
export function mensagemDoPreco(erro: ErroDoPreco): string {
  switch (erro.tipo) {
    case "produto-vazio":
      return "Escreva o produto, por exemplo Arroz.";
    case "produto-longo":
      return `O produto pode ter até ${limitesDoPreco.produto} caracteres.`;
    case "marca-longa":
      return `A marca pode ter até ${limitesDoPreco.marca} caracteres.`;
    case "tamanho-longo":
      return `O tamanho pode ter até ${limitesDoPreco.tamanho} caracteres.`;
    case "preco-invalido":
      return "Escreva o preço em reais, maior que zero, por exemplo 12,90.";
    case "mercado-vazio":
      return "Escolha o mercado onde você viu o preço.";
    case "atacado-invalido":
      return `A quantidade do atacado é um número inteiro de 2 a ${limitesDoPreco.minimoAtacado}. Deixe vazio se o preço vale para qualquer quantidade.`;
    case "limite":
      return `O aparelho já tem ${limitesDoPreco.precos} preços, o máximo. Exclua preços antigos para registrar novos.`;
  }
}
