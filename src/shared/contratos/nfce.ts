/**
 * Contrato de `POST /api/nfce/consultar` (spec 0001, plano.md): usado pelo Worker para
 * responder e pelo app para conferir a resposta antes de mostrar.
 */
import { ehObjeto } from "../validacao";

export const rotaDaConsulta = "/api/nfce/consultar";

/** Tamanho máximo do link aceito pelo servidor e conferido antes de enviar. */
export const limiteDoLink = 2048;

export const codigosDeErro = [
  "nfce.link-invalido",
  "nfce.host-nao-permitido",
  "nfce.uf-sem-leitor",
  "nfce.indisponivel",
  "nfce.captcha",
  "nfce.formato-desconhecido",
  "nfce.tempo-esgotado",
  "requisicao.invalida",
  "requisicao.origem-nao-permitida",
  "requisicao.rota-desconhecida",
  "requisicao.metodo-nao-permitido",
  "requisicao.grande-demais",
  "requisicao.tipo-nao-suportado",
  "erro.interno",
] as const;

export type CodigoDeErro = (typeof codigosDeErro)[number];

export interface ItemDaNota {
  descricao: string;
  /** Código do produto na loja, como impresso na nota. */
  codigo: string;
  /** Texto decimal com ponto ("2", "0.345"): quantidade fracionada não vira ponto flutuante. */
  quantidade: string;
  unidade: string;
  precoUnitarioCentavos: number;
  totalCentavos: number;
}

export interface NotaConsultada {
  uf: string;
  mercado: {
    cnpj: string;
    nome: string | null;
    endereco: string | null;
  };
  /** Data e hora locais da emissão, "AAAA-MM-DDTHH:MM:SS" ou só a data; null se não achou. */
  emitidaEm: string | null;
  itens: ItemDaNota[];
  /** Itens que a página trazia mas o leitor não conseguiu interpretar. */
  itensNaoLidos: number;
}

/** ProblemDetails (RFC 9457) com `code` estável e `traceId`. */
export interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: CodigoDeErro;
  traceId: string;
  /** Só estrutura da página consultada, nunca o texto dela. */
  diagnostico?: unknown;
}

function ehTexto(valor: unknown, maximo: number): valor is string {
  return typeof valor === "string" && valor.length <= maximo;
}

function ehTextoOuNulo(valor: unknown, maximo: number): valor is string | null {
  return valor === null || ehTexto(valor, maximo);
}

function ehInteiroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

function ehItem(valor: unknown): valor is ItemDaNota {
  return (
    ehObjeto(valor) &&
    ehTexto(valor["descricao"], 200) &&
    ehTexto(valor["codigo"], 60) &&
    ehTexto(valor["quantidade"], 24) &&
    /^\d+(\.\d+)?$/.test(valor["quantidade"]) &&
    ehTexto(valor["unidade"], 6) &&
    ehInteiroNaoNegativo(valor["precoUnitarioCentavos"]) &&
    ehInteiroNaoNegativo(valor["totalCentavos"])
  );
}

/** Confere a resposta de sucesso campo a campo: o app não confia no formato de quem responde. */
export function ehNotaConsultada(valor: unknown): valor is NotaConsultada {
  if (!ehObjeto(valor) || !ehObjeto(valor["mercado"])) return false;
  const mercado = valor["mercado"];
  const itens = valor["itens"];
  return (
    ehTexto(valor["uf"], 2) &&
    ehTexto(mercado["cnpj"], 14) &&
    /^[0-9A-Z]{14}$/.test(mercado["cnpj"]) &&
    ehTextoOuNulo(mercado["nome"], 200) &&
    ehTextoOuNulo(mercado["endereco"], 300) &&
    ehTextoOuNulo(valor["emitidaEm"], 19) &&
    Array.isArray(itens) &&
    itens.length <= 1000 &&
    itens.every(ehItem) &&
    ehInteiroNaoNegativo(valor["itensNaoLidos"])
  );
}

export function ehCodigoDeErro(valor: unknown): valor is CodigoDeErro {
  return typeof valor === "string" && (codigosDeErro as readonly string[]).includes(valor);
}

export function ehProblema(valor: unknown): valor is Problema {
  return (
    ehObjeto(valor) &&
    ehCodigoDeErro(valor["code"]) &&
    ehTexto(valor["traceId"], 64) &&
    ehTexto(valor["detail"], 500) &&
    typeof valor["status"] === "number"
  );
}
