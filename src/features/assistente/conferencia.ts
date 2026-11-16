/**
 * Conferência dos valores em reais da resposta (spec 0001, CA-33; plano.md, "Assistente"). O
 * modelo de linguagem pode errar conta ou inventar preço, e uma descrição de nota fiscal pode
 * tentar induzi-lo a isso. Todo valor em reais da resposta é procurado entre os valores do
 * contexto que o app enviou; o que não está lá a tela marca como "valor não conferido".
 *
 * Formatos reconhecidos: "R$ 1.234,56", "R$1234,56", "R$ 12", "R$ 12.90", "12,90 reais" e o
 * número solto com vírgula e dois decimais ("1.234,56", "12,90"), desde que não seja seguido
 * de unidade de medida ou de porcentagem ("2,50 kg", "12,50%").
 */

export type Trecho =
  | { readonly tipo: "texto"; readonly texto: string }
  | {
      readonly tipo: "valor";
      readonly texto: string;
      /** Nulo quando o número é grande demais para ser um preço. */
      readonly centavos: number | null;
      readonly conferido: boolean;
    };

const comMilhar = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?`;
const simples = String.raw`\d+(?:[.,]\d{1,2})?`;
const solto = String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}`;
const unidades = String.raw`%|(?:kg|g|mg|l|ml|km|m|un|unidades?|litros?|quilos?|gramas?|metros?)(?![\p{L}\d])`;

/**
 * 1: com "R$" antes; 2: com "reais" depois; 3: solto. Cada forma não pode continuar em outro
 * dígito, para "12,3456" não virar R$ 12,34.
 */
const padraoDeValor = new RegExp(
  [
    String.raw`R\$\s?(${comMilhar}|${simples})(?![.,]?\d)`,
    String.raw`(${comMilhar}|${simples})\s?(?:reais|real)(?![\p{L}\d])`,
    String.raw`(${solto})(?![.,]?\d)(?!\s?(?:${unidades}))`,
  ].join("|"),
  "giu",
);

/** Mais que isto não é preço de compra do mês; o valor fica sem conferir. */
const digitosMaximos = 12;

/** "1.234,56" vira 123456; "12.9" vira 1290; "12" vira 1200. Sem ponto flutuante. */
export function centavosDoTexto(numero: string): number | null {
  let inteiro: string;
  let fracao: string;
  const milhar = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(numero);
  if (milhar !== null) {
    inteiro = milhar[1]!.replaceAll(".", "");
    fracao = milhar[2] ?? "";
  } else {
    const partes = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(numero);
    if (partes === null) return null;
    inteiro = partes[1]!;
    fracao = partes[2] ?? "";
  }
  const significativos = inteiro.replace(/^0+(?=\d)/, "");
  if (significativos.length > digitosMaximos) return null;
  return Number(significativos) * 100 + Number(fracao.padEnd(2, "0"));
}

interface Achado {
  readonly inicio: number;
  readonly fim: number;
  readonly centavos: number | null;
}

function acharValores(texto: string): Achado[] {
  const achados: Achado[] = [];
  for (const achado of texto.matchAll(padraoDeValor)) {
    const numero = achado[1] ?? achado[2] ?? achado[3]!;
    achados.push({
      inicio: achado.index,
      fim: achado.index + achado[0].length,
      centavos: centavosDoTexto(numero),
    });
  }
  return achados;
}

function coletarTextos(valor: unknown, textos: string[]): void {
  if (typeof valor === "string") {
    textos.push(valor);
  } else if (Array.isArray(valor)) {
    for (const item of valor) coletarTextos(item, textos);
  } else if (typeof valor === "object" && valor !== null) {
    for (const item of Object.values(valor)) coletarTextos(item, textos);
  }
}

/** Os valores em reais escritos no contexto enviado, em centavos. */
export function valoresDoContexto(contexto: unknown): ReadonlySet<number> {
  const textos: string[] = [];
  coletarTextos(contexto, textos);
  const valores = new Set<number>();
  for (const texto of textos) {
    for (const { centavos } of acharValores(texto)) {
      if (centavos !== null) valores.add(centavos);
    }
  }
  return valores;
}

/** A resposta em trechos, com cada valor em reais marcado como conferido ou não (CA-33). */
export function conferirResposta(texto: string, conhecidos: ReadonlySet<number>): Trecho[] {
  const trechos: Trecho[] = [];
  let posicao = 0;
  for (const { inicio, fim, centavos } of acharValores(texto)) {
    if (inicio > posicao) trechos.push({ tipo: "texto", texto: texto.slice(posicao, inicio) });
    trechos.push({
      tipo: "valor",
      texto: texto.slice(inicio, fim),
      centavos,
      conferido: centavos !== null && conhecidos.has(centavos),
    });
    posicao = fim;
  }
  if (posicao < texto.length) trechos.push({ tipo: "texto", texto: texto.slice(posicao) });
  return trechos;
}

export function temValorNaoConferido(trechos: readonly Trecho[]): boolean {
  return trechos.some((trecho) => trecho.tipo === "valor" && !trecho.conferido);
}
