import type { PaginaLida } from "./html";

/**
 * Diagnóstico de uma página que não virou nota (spec 0001, tarefa T03).
 *
 * Vai na resposta de erro para que um print da tela baste para ajustar o leitor. Leva só a
 * estrutura da página: números, nomes de marcação e sinais de sim ou não. Nenhum texto da
 * nota entra aqui, então não há como carregar CPF, nome ou produto (CA-11).
 */
export interface DadosDaBusca {
  status: number;
  bytes: number;
  saltos: number;
  /** Caminho da última página buscada, sem a query. */
  caminho: string;
  tipoDeConteudo: string | null;
  codificacao: string;
}

export interface Diagnostico extends DadosDaBusca {
  titulo: string | null;
  blocos: number;
  truncada: boolean;
  estrutura: PaginaLida["estrutura"];
  rotulos: {
    codigo: number;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
    emissao: boolean;
    cnpj: boolean;
    chaveDeAcesso: boolean;
  };
  sinais: {
    captcha: boolean;
    naoEncontrada: boolean;
    erro: boolean;
    pedeJavascript: boolean;
  };
}

const captcha = /captcha|cf-turnstile/i;
const naoEncontrada = /n[ãa]o\s+(?:foi\s+)?(?:encontrad|localizad)|inexistente/i;
const erro = /\berro\b|inv[áa]lid|indispon[íi]vel|tente\s+novamente|rejei[çc]/i;
const pedeJavascript = /javascript/i;

const contar = (texto: string, rotulo: RegExp): number => texto.match(rotulo)?.length ?? 0;

/** Há captcha na página? Olha a marcação inteira, porque o captcha vem em atributo e script. */
export function temCaptcha(html: string): boolean {
  return captcha.test(html);
}

export function diagnosticar(html: string, pagina: PaginaLida, busca: DadosDaBusca): Diagnostico {
  const { texto } = pagina;
  return {
    ...busca,
    // Sequência longa de dígitos no título vira "#": título é do site, número pode ser de nota.
    titulo: pagina.titulo?.replace(/\d{5,}/g, "#") ?? null,
    blocos: pagina.blocos.length,
    truncada: pagina.truncada,
    estrutura: pagina.estrutura,
    rotulos: {
      codigo: contar(texto, /\(\s*C[óo]digo\s*:/gi),
      quantidade: contar(texto, /Qtde\.?\s*:/gi),
      valorUnitario: contar(texto, /Vl\.?\s*Unit\.?\s*:/gi),
      valorTotal: contar(texto, /Vl\.?\s*Total/gi),
      emissao: /Emiss[ãa]o\s*:/i.test(texto),
      cnpj: /CNPJ\s*:/i.test(texto),
      chaveDeAcesso: /Chave\s+de\s+acesso/i.test(texto),
    },
    sinais: {
      captcha: temCaptcha(html),
      naoEncontrada: naoEncontrada.test(texto),
      erro: erro.test(texto),
      pedeJavascript: pedeJavascript.test(texto),
    },
  };
}
