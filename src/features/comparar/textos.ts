/** Textos da comparação (spec 0001, CA-19 a CA-22): fora dos componentes, com teste. */
import { formatarCentavos } from "../../shared/dinheiro";
import type { Preferencia } from "../lista/lista";
import { formatarDistancia } from "../mercados/geo";
import { ehAntigo } from "../precos/precos";
import { avisoDeAntigo, descreverEmbalagem } from "../precos/textos";
import { descreverModo } from "../rota/textos";
import type { Objetivo } from "./objetivo";
import type {
  Ajuste,
  Comparacao,
  Frente,
  Linha,
  MaximoDeMercados,
  Opcao,
  Sugestao,
  TotalDoMercado,
} from "./otimizador";

export const perguntas = {
  teto: "Quanto quer gastar no máximo?",
  marcas: "Marcas: só as que escolhi, marcas boas ou o mais barato?",
  mercados: "Até quantos mercados topa ir?",
  caminho: "A pé ou de carro, até que distância?",
} as const;

/** Na ordem da pergunta. */
export const ordemDasMarcas: readonly Preferencia[] = ["so-esta-marca", "marca-boa", "mais-barato"];

export const rotulosDasMarcas: Readonly<Record<Preferencia, string>> = {
  "so-esta-marca": "Só as marcas que escolhi",
  "marca-boa": "Marcas boas",
  "mais-barato": "O mais barato",
};

export const ajudaDasMarcas: Readonly<Record<Preferencia, string>> = {
  "so-esta-marca": "Nos itens com marca escrita, só essa marca conta.",
  "marca-boa": "A marca escrita quando o mercado tem; senão, outra.",
  "mais-barato": "Vale o que você marcou em cada item da lista.",
};

export const ajudaDoTeto = "Opcional. Em reais, como 600 ou 650,50.";

export const mensagemDoTeto =
  "Escreva o valor em reais, como 600 ou 650,50, ou deixe em branco para comparar sem teto.";

export function rotuloDosMercados(quantos: MaximoDeMercados): string {
  return quantos === 1 ? "Só 1 mercado" : `Até ${quantos} mercados`;
}

export function rotuloDaEconomia(centavos: number): string {
  return centavos === 0 ? "Qualquer economia" : formatarCentavos(centavos);
}

/** "Até R$ 600,00 · O mais barato · Até 2 mercados · De carro, até 5 km". */
export function resumoDoObjetivo(objetivo: Objetivo, raioKm: number): string {
  return [
    objetivo.tetoCentavos === null ? "Sem teto" : `Até ${formatarCentavos(objetivo.tetoCentavos)}`,
    rotulosDasMarcas[objetivo.marcas],
    rotuloDosMercados(objetivo.maximoDeMercados),
    `${descreverModo(objetivo.modo)}, até ${raioKm} km`,
  ].join(" · ");
}

/** "A", "A e B", "A, B e C". */
export function juntar(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)!}`;
}

export function nomeDaOpcao(opcao: Pick<Opcao, "paradas">): string {
  return juntar(opcao.paradas.map((parada) => parada.mercado.nome));
}

const nomesNoResumo = 5;

/** "Falta preço de 1 item: Feijão." (CA-21); nulo quando não falta nada. */
export function descreverFaltando(opcao: Pick<Opcao, "faltando">): string | null {
  const quantos = opcao.faltando.length;
  if (quantos === 0) return null;
  const nomes = opcao.faltando.slice(0, nomesNoResumo).map((item) => item.nome);
  if (quantos > nomesNoResumo) nomes.push(`mais ${quantos - nomesNoResumo}`);
  return `Falta preço de ${quantos === 1 ? "1 item" : `${quantos} itens`}: ${juntar(nomes)}.`;
}

/** Como a combinação se compara ao melhor mercado sozinho (CA-22). */
export function descreverFrente(frente: Frente): string {
  if (frente.itensAMais > 0) {
    const itens = frente.itensAMais === 1 ? "1 item" : `${frente.itensAMais} itens`;
    return `Tem preço de ${itens} a mais que ${frente.mercado.nome} sozinho.`;
  }
  return `Economiza ${formatarCentavos(frente.economiaCentavos)} em relação a comprar tudo em ${frente.mercado.nome}.`;
}

/** Distância estimada em linha reta, do ponto até o último mercado (CA-22). */
export function descreverCaminho(opcao: Pick<Opcao, "paradas" | "distanciaKm">): string {
  const distancia = formatarDistancia(opcao.distanciaKm);
  return opcao.paradas.length === 1
    ? `${distancia} do ponto, em linha reta`
    : `${distancia} de caminho estimado, em linha reta, passando pelos ${opcao.paradas.length} mercados`;
}

export function descreverAcimaDoTeto(centavos: number): string {
  return `Passa do teto em ${formatarCentavos(centavos)}.`;
}

function detalheDoPreco(linha: Linha): string | null {
  return descreverEmbalagem(linha.observacao) ?? linha.observacao.descricao;
}

/** "Arroz (Tio João, 5 kg): 2 × R$ 27,90 = R$ 55,80". */
export function descreverLinha(linha: Linha): string {
  const detalhe = detalheDoPreco(linha);
  const preco = formatarCentavos(linha.observacao.precoCentavos);
  const conta =
    linha.embalagens === 1
      ? preco
      : `${linha.embalagens} × ${preco} = ${formatarCentavos(linha.centavos)}`;
  return `${linha.item.nome}${detalhe === null ? "" : ` (${detalhe})`}: ${conta}`;
}

/** Cada passo para caber no teto (CA-20). */
export function descreverSugestao(sugestao: Sugestao): string {
  const economia = formatarCentavos(sugestao.economiaCentavos);
  if (sugestao.tipo === "retirar") {
    return `Tirar ${sugestao.linha.item.nome} da compra: economiza ${economia}.`;
  }
  const de = detalheDoPreco(sugestao.de);
  const para = detalheDoPreco(sugestao.para) ?? "outra opção";
  return `Trocar ${sugestao.de.item.nome}${de === null ? "" : ` (${de})`} por ${para} em ${sugestao.mercado.nome}: economiza ${economia}.`;
}

export function aberturaDoAjuste(ajuste: Ajuste, tetoCentavos: number): string {
  return `A opção mais barata passa do teto de ${formatarCentavos(tetoCentavos)} em ${formatarCentavos(ajuste.excessoCentavos)}. Para caber, começando pelo que mais economiza:`;
}

export function fechamentoDoAjuste(ajuste: Ajuste): string {
  return `Com isso, a compra fica em ${formatarCentavos(ajuste.totalDepoisCentavos)}.`;
}

/** O total escrito no pino do mapa: "R$ 412,30" ou "R$ 200,00 (faltam 2)". */
export function rotuloDoPino(total: TotalDoMercado): string {
  const valor = formatarCentavos(total.totalCentavos);
  if (total.faltando === 0) return valor;
  return `${valor} (${total.faltando === 1 ? "falta 1" : `faltam ${total.faltando}`})`;
}

/** Na lista de mercados: "Sua lista aqui: R$ 412,30" ou com os itens sem preço. */
export function descreverTotalDoMercado(total: TotalDoMercado): string {
  const valor = `Sua lista aqui: ${formatarCentavos(total.totalCentavos)}`;
  if (total.faltando === 0) return valor;
  const itens = total.faltando === 1 ? "1 item" : `${total.faltando} itens`;
  return `${valor}, sem preço de ${itens}`;
}

/** O que a tela anuncia depois de comparar. */
export function resumoDaComparacao(comparacao: Pick<Comparacao, "opcoes" | "itens">): string {
  const umItem = comparacao.itens.length === 1;
  const itens = umItem ? "1 item" : `${comparacao.itens.length} itens`;
  const quantas = comparacao.opcoes.length;
  if (quantas === 0) {
    return `Nenhum mercado do raio tem preço ${umItem ? "do item" : `dos ${itens}`} da lista.`;
  }
  const opcoes = quantas === 1 ? "1 opção" : `${quantas} opções`;
  return `${opcoes} para ${itens} da lista, da mais barata para a mais cara.`;
}

export const semItens =
  "A lista ainda não tem itens para comparar. Ponha os itens do mês na lista e volte aqui.";

export const semPrecos =
  "Você ainda não registrou nenhum preço. Leia a nota fiscal de uma compra ou digite os preços que viu, e os mercados aparecem aqui com o total da sua lista. Para ver como fica, abra a demonstração, com mercados e preços fictícios.";

/** Na demonstração não há "Ir": a rota levaria a um lugar de verdade (CA-38). */
export const semRotaNaDemonstracao =
  "Na demonstração não há rota: os mercados são fictícios. Com os seus preços, cada opção ganha o botão Ir, que abre o caminho no Waze ou no Google Maps.";

/**
 * "+R$ 4,00": quanto a opção custa a mais que a opção 1 (spec 0002, CA-12). Nulo quando custa
 * menos, o que só acontece se faltar preço de algum item: aí o aviso de falta já explica.
 */
export function diferencaParaAMelhor(totalCentavos: number, melhorCentavos: number): string | null {
  if (totalCentavos < melhorCentavos) return null;
  return `+${formatarCentavos(totalCentavos - melhorCentavos)}`;
}

/**
 * Largura da barra de uma opção, em porcentagem do maior total (CA-12): a barra é só um apoio
 * visual, e o texto ao lado diz o total e a diferença. Nunca menor que 4%, para ser vista.
 */
export function larguraDaBarra(totalCentavos: number, maiorCentavos: number): number {
  if (maiorCentavos <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((totalCentavos / maiorCentavos) * 100)));
}

export type TipoDeSelo = "antigo" | "outra-marca" | "atacado";

export interface Selo {
  readonly tipo: TipoDeSelo;
  readonly texto: string;
}

/** Os avisos de um preço da comparação, como selos com texto, nunca só cor (CA-13). */
export function selosDaLinha(linha: Linha, hoje: string): readonly Selo[] {
  const selos: Selo[] = [];
  if (ehAntigo(linha.observacao.vistoEm, hoje)) {
    selos.push({ tipo: "antigo", texto: avisoDeAntigo });
  }
  if (linha.outraMarca) {
    selos.push({ tipo: "outra-marca", texto: "Outra marca: a escolhida não tem preço aqui" });
  }
  const minimo = linha.observacao.minimoAtacado;
  if (minimo !== null) {
    selos.push({ tipo: "atacado", texto: `Preço de atacado: a partir de ${minimo} unidades` });
  }
  return selos;
}
