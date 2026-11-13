/**
 * Tamanho da embalagem, preço por unidade de medida e faixa de atacado (spec 0001, CA-17 e
 * CA-18; ADR-0003). Contas puras: a tela de preços mostra o preço por unidade ao lado do
 * preço da embalagem, e a comparação (T14) usa as mesmas funções para saber quantas embalagens
 * comprar e se o preço de atacado vale.
 *
 * As quantidades ficam em números inteiros da menor unidade (grama, mililitro, unidade), para
 * a conta de embalagens não depender de ponto flutuante.
 */
import { formatarCentavos } from "../../shared/dinheiro";
import type { ObservacaoDePreco } from "./precos";

export type Grandeza = "massa" | "volume" | "contagem";

export interface Embalagem {
  readonly grandeza: Grandeza;
  /** Total da embalagem em gramas, mililitros ou unidades (já multiplicado no "12x1L"). */
  readonly quantidade: number;
  /** Como a contagem se chama: "rolo" no papel higiênico, "unidade" no resto. */
  readonly contavel: "unidade" | "rolo" | null;
}

interface Medida {
  readonly grandeza: Grandeza;
  /** Quantas unidades da menor medida (g, ml, un) cabem em uma desta. */
  readonly fator: number;
  readonly contavel: Embalagem["contavel"];
}

const medidas: Readonly<Record<string, Medida>> = {
  kg: { grandeza: "massa", fator: 1000, contavel: null },
  kgs: { grandeza: "massa", fator: 1000, contavel: null },
  quilo: { grandeza: "massa", fator: 1000, contavel: null },
  quilos: { grandeza: "massa", fator: 1000, contavel: null },
  g: { grandeza: "massa", fator: 1, contavel: null },
  gr: { grandeza: "massa", fator: 1, contavel: null },
  grs: { grandeza: "massa", fator: 1, contavel: null },
  grama: { grandeza: "massa", fator: 1, contavel: null },
  gramas: { grandeza: "massa", fator: 1, contavel: null },
  l: { grandeza: "volume", fator: 1000, contavel: null },
  lt: { grandeza: "volume", fator: 1000, contavel: null },
  lts: { grandeza: "volume", fator: 1000, contavel: null },
  litro: { grandeza: "volume", fator: 1000, contavel: null },
  litros: { grandeza: "volume", fator: 1000, contavel: null },
  ml: { grandeza: "volume", fator: 1, contavel: null },
  un: { grandeza: "contagem", fator: 1, contavel: "unidade" },
  und: { grandeza: "contagem", fator: 1, contavel: "unidade" },
  unid: { grandeza: "contagem", fator: 1, contavel: "unidade" },
  unidade: { grandeza: "contagem", fator: 1, contavel: "unidade" },
  unidades: { grandeza: "contagem", fator: 1, contavel: "unidade" },
  rolo: { grandeza: "contagem", fator: 1, contavel: "rolo" },
  rolos: { grandeza: "contagem", fator: 1, contavel: "rolo" },
};

/** Maior total aceito, em gramas, mililitros ou unidades (100 t, 100 mil L). Acima, é engano. */
const maiorQuantidade = 100_000_000;

const nomesDasMedidas = Object.keys(medidas)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** "12x1L", "12 x 1 L", "1,5L", "500 g", "32 rolos": multiplicador opcional, número e medida. */
const padrao = `(?:(\\d{1,3})\\s*x\\s*)?(\\d{1,5}(?:[.,]\\d{1,3})?)\\s*(${nomesDasMedidas})`;
const textoInteiro = new RegExp(`^${padrao}$`, "iu");
const dentroDoTexto = new RegExp(`(?<![\\p{L}\\d.,])${padrao}(?![\\p{L}\\d])`, "giu");

function montar(multiplicador: string | undefined, numero: string, nome: string): Embalagem | null {
  const medida = medidas[nome.toLowerCase()];
  if (medida === undefined) return null;
  const valor = Number(numero.replace(",", "."));
  const vezes = multiplicador === undefined ? 1 : Number(multiplicador);
  // Contagem é sempre inteira: "1,5 rolo" não é uma embalagem.
  if (medida.grandeza === "contagem" && !Number.isInteger(valor)) return null;
  const quantidade = Math.round(valor * medida.fator) * vezes;
  if (vezes < 1 || quantidade < 1 || quantidade > maiorQuantidade) return null;
  return { grandeza: medida.grandeza, quantidade, contavel: medida.contavel };
}

/** Lê o tamanho como a pessoa escreveu ou a nota trouxe; sem reconhecer, nulo. */
export function lerEmbalagem(texto: string | null): Embalagem | null {
  if (texto === null) return null;
  const partes = textoInteiro.exec(texto.normalize("NFC").trim().replace(/\s+/g, " "));
  return partes === null ? null : montar(partes[1], partes[2]!, partes[3]!);
}

/**
 * Acha o tamanho no meio da descrição da nota ("CAFE SOLUVEL 200G", "LEITE 12X1L"). Fica com
 * o último que aparecer, que é onde as notas costumam imprimir o tamanho.
 */
export function embalagemNaDescricao(descricao: string | null): Embalagem | null {
  if (descricao === null) return null;
  let achada: Embalagem | null = null;
  for (const partes of descricao.normalize("NFC").matchAll(dentroDoTexto)) {
    achada = montar(partes[1], partes[2]!, partes[3]!) ?? achada;
  }
  return achada;
}

/** O tamanho do preço: o escrito no campo e, sem ele, o que a descrição da nota traz. */
export function embalagemDoPreco(
  observacao: Pick<ObservacaoDePreco, "tamanho" | "descricao">,
): Embalagem | null {
  return lerEmbalagem(observacao.tamanho) ?? embalagemNaDescricao(observacao.descricao);
}

export interface PrecoPorUnidade {
  readonly grandeza: Grandeza;
  /** Centavos por kg, por litro ou por unidade, sem arredondar: é o valor que se compara. */
  readonly centavos: number;
  readonly referencia: "kg" | "litro" | "unidade" | "rolo";
}

/** Preço por kg, por litro ou por unidade (CA-17). */
export function precoPorUnidade(precoCentavos: number, embalagem: Embalagem): PrecoPorUnidade {
  switch (embalagem.grandeza) {
    case "massa":
      return {
        grandeza: "massa",
        centavos: (precoCentavos * 1000) / embalagem.quantidade,
        referencia: "kg",
      };
    case "volume":
      return {
        grandeza: "volume",
        centavos: (precoCentavos * 1000) / embalagem.quantidade,
        referencia: "litro",
      };
    case "contagem":
      return {
        grandeza: "contagem",
        centavos: precoCentavos / embalagem.quantidade,
        referencia: embalagem.contavel === "rolo" ? "rolo" : "unidade",
      };
  }
}

/** "R$ 94,95 por kg"; abaixo de um centavo, "menos de R$ 0,01 por unidade". */
export function formatarPrecoPorUnidade(preco: PrecoPorUnidade): string {
  const centavos = Math.round(preco.centavos);
  const valor = centavos < 1 ? `menos de ${formatarCentavos(1)}` : formatarCentavos(centavos);
  return `${valor} por ${preco.referencia}`;
}

/** O que a tela de preços mostra ao lado do preço da embalagem; nulo sem tamanho reconhecido. */
export function descreverPrecoPorUnidade(
  observacao: Pick<ObservacaoDePreco, "tamanho" | "descricao" | "precoCentavos">,
): string | null {
  const embalagem = embalagemDoPreco(observacao);
  return embalagem === null
    ? null
    : formatarPrecoPorUnidade(precoPorUnidade(observacao.precoCentavos, embalagem));
}

/**
 * Quantas embalagens deste preço cobrem o item da lista. Com o tamanho do item e o do preço
 * na mesma grandeza, a conta é pela quantidade total ("2 de 5 kg" com preço de 1 kg dá 10);
 * sem um deles, ou em grandezas diferentes, vale a quantidade da lista.
 */
export function embalagensNecessarias(
  item: { readonly quantidade: number; readonly tamanho: string | null },
  embalagem: Embalagem | null,
): number {
  const doItem = lerEmbalagem(item.tamanho);
  if (doItem === null || embalagem === null || doItem.grandeza !== embalagem.grandeza) {
    return item.quantidade;
  }
  return Math.max(1, Math.ceil((item.quantidade * doItem.quantidade) / embalagem.quantidade));
}

/** O preço de atacado só vale quando a compra alcança o mínimo dele (CA-18). */
export function atacadoVale(minimoAtacado: number | null, embalagens: number): boolean {
  return minimoAtacado === null || embalagens >= minimoAtacado;
}

export interface CustoDoItem {
  readonly embalagens: number;
  readonly centavos: number;
}

/**
 * Quanto o item da lista custa com este preço: as embalagens necessárias vezes o preço da
 * embalagem. Nulo quando é preço de atacado e a compra não alcança o mínimo (CA-18).
 */
export function custoDoItem(
  item: { readonly quantidade: number; readonly tamanho: string | null },
  observacao: Pick<ObservacaoDePreco, "tamanho" | "descricao" | "precoCentavos" | "minimoAtacado">,
): CustoDoItem | null {
  const embalagens = embalagensNecessarias(item, embalagemDoPreco(observacao));
  if (!atacadoVale(observacao.minimoAtacado, embalagens)) return null;
  return { embalagens, centavos: embalagens * observacao.precoCentavos };
}
