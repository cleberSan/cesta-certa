/**
 * O que a pessoa decidiu sobre cada nota fiscal (spec 0001, CA-10 e CA-14; ADR-0003): qual
 * mercado do app é o CNPJ da nota e a que item da lista corresponde cada produto daquele
 * mercado, ou que ele deve ser ignorado. A escolha é lembrada por (CNPJ, código do produto na
 * loja) e vale para as notas seguintes. Fica no armazém `associacoes`, que entra na cópia.
 */
import { limparTexto } from "../../../shared/texto";
import { ehDataIso, ehObjeto } from "../../../shared/validacao";
import { ehIdDeMercado, limitesDoPreco, type MercadoDoPreco } from "../precos";

export const limitesDaAssociacao = {
  /** Bem acima de dezenas de notas por mês em alguns mercados. */
  associacoes: 20_000,
  codigo: 60,
} as const;

export interface AssociacaoDeMercado {
  readonly id: string;
  readonly tipo: "mercado";
  readonly cnpj: string;
  readonly mercadoId: string;
  readonly mercadoNome: string;
  readonly atualizadaEm: string;
}

export interface AssociacaoDeProduto {
  readonly id: string;
  readonly tipo: "produto";
  readonly cnpj: string;
  /** Código do produto na loja, como a nota imprime. */
  readonly codigo: string;
  /** Descrição da nota na última vez, para a pessoa reconhecer a escolha. */
  readonly descricao: string;
  /** Nome do produto na lista; nulo quando a pessoa escolheu ignorar este produto. */
  readonly produto: string | null;
  readonly atualizadaEm: string;
}

export type Associacao = AssociacaoDeMercado | AssociacaoDeProduto;

/** O CNPJ como a nota traz: 14 caracteres, números ou letras maiúsculas (CNPJ alfanumérico). */
export function ehCnpj(valor: unknown): valor is string {
  return typeof valor === "string" && /^[0-9A-Z]{14}$/.test(valor);
}

export function idDoMercado(cnpj: string): string {
  return `mercado ${cnpj}`;
}

export function idDoProduto(cnpj: string, codigo: string): string {
  return `produto ${cnpj} ${codigo}`;
}

function ehTextoLimpo(valor: unknown, maximo: number): valor is string {
  return (
    typeof valor === "string" &&
    valor !== "" &&
    valor.length <= maximo &&
    limparTexto(valor) === valor
  );
}

/** Reconstrói uma associação guardada ou importada, campo a campo; fora do formato, nula. */
export function lerAssociacao(valor: unknown): Associacao | null {
  if (!ehObjeto(valor) || !ehCnpj(valor["cnpj"]) || !ehDataIso(valor["atualizadaEm"])) {
    return null;
  }
  const { id, cnpj, atualizadaEm } = valor;
  if (valor["tipo"] === "mercado") {
    const { mercadoId, mercadoNome } = valor;
    if (
      id !== idDoMercado(cnpj) ||
      !ehIdDeMercado(mercadoId) ||
      !ehTextoLimpo(mercadoNome, limitesDoPreco.mercado)
    ) {
      return null;
    }
    return { id, tipo: "mercado", cnpj, mercadoId, mercadoNome, atualizadaEm };
  }
  if (valor["tipo"] === "produto") {
    const { codigo, descricao, produto } = valor;
    if (
      !ehTextoLimpo(codigo, limitesDaAssociacao.codigo) ||
      id !== idDoProduto(cnpj, codigo) ||
      !ehTextoLimpo(descricao, limitesDoPreco.descricao) ||
      !(produto === null || ehTextoLimpo(produto, limitesDoPreco.produto))
    ) {
      return null;
    }
    return { id, tipo: "produto", cnpj, codigo, descricao, produto, atualizadaEm };
  }
  return null;
}

/**
 * Lê todas as associações. Registro fora do formato, repetido ou além do limite fica de fora
 * e é contado: o aparelho segue com o resto, a importação recusa o arquivo.
 */
export function conferirAssociacoes(registros: readonly unknown[]): {
  readonly associacoes: readonly Associacao[];
  readonly recusados: number;
} {
  const associacoes = new Map<string, Associacao>();
  let recusados = 0;
  for (const registro of registros) {
    const associacao = lerAssociacao(registro);
    if (
      associacao === null ||
      associacoes.has(associacao.id) ||
      associacoes.size >= limitesDaAssociacao.associacoes
    ) {
      recusados += 1;
    } else {
      associacoes.set(associacao.id, associacao);
    }
  }
  return { associacoes: [...associacoes.values()], recusados };
}

/** O mercado do app que a pessoa ligou a este CNPJ, se já ligou. */
export function mercadoLembrado(
  associacoes: readonly Associacao[],
  cnpj: string,
): MercadoDoPreco | null {
  const id = idDoMercado(cnpj);
  const achada = associacoes.find(
    (associacao): associacao is AssociacaoDeMercado =>
      associacao.tipo === "mercado" && associacao.id === id,
  );
  return achada === undefined ? null : { id: achada.mercadoId, nome: achada.mercadoNome };
}
