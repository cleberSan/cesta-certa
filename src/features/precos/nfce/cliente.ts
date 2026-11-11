import {
  ehNotaConsultada,
  ehProblema,
  limiteDoLink,
  rotaDaConsulta,
  type CodigoDeErro,
  type NotaConsultada,
} from "../../../shared/contratos/nfce";
import { falha, sucesso, type Resultado } from "../../../shared/resultado";

/**
 * Lado do app na consulta da nota fiscal (spec 0001, CA-10 e CA-13): envia o link ao
 * servidor, confere a resposta e traduz cada falha numa mensagem para a pessoa. As regras
 * ficam aqui, com teste unitário; a tela (ConsultaNota.tsx) só mostra.
 */
export type CodigoDaFalha =
  | CodigoDeErro
  | "app.link-vazio"
  | "app.link-grande"
  | "app.sem-conexao"
  | "app.tempo-esgotado"
  | "app.resposta-inesperada";

export interface FalhaDaConsulta {
  code: CodigoDaFalha;
  /** Identificador da requisição no servidor, para ligar um print ao log. */
  traceId: string | null;
  /** Estrutura da página consultada, quando o servidor manda; nunca o texto da nota. */
  diagnostico: unknown;
}

/** O servidor desiste da Secretaria da Fazenda em 8 s; o app espera um pouco mais por ele. */
export const limiteDeEsperaMs = 12_000;

export type Enviar = (rota: string, init: RequestInit) => Promise<Response>;

function falhar(
  code: CodigoDaFalha,
  traceId: string | null = null,
  diagnostico: unknown = undefined,
): Resultado<never, FalhaDaConsulta> {
  return falha({ code, traceId, diagnostico });
}

export async function consultarNota(
  link: string,
  enviar: Enviar,
  esperaMs: number = limiteDeEsperaMs,
): Promise<Resultado<NotaConsultada, FalhaDaConsulta>> {
  const url = link.trim();
  if (url === "") return falhar("app.link-vazio");
  if (url.length > limiteDoLink) return falhar("app.link-grande");

  const sinal = AbortSignal.timeout(esperaMs);
  let resposta: Response;
  let corpo: unknown;
  try {
    resposta = await enviar(rotaDaConsulta, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: sinal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return falhar(sinal.aborted ? "app.tempo-esgotado" : "app.sem-conexao");
  }
  const traceId = resposta.headers.get("X-Correlation-Id");
  try {
    corpo = await resposta.json();
  } catch {
    return falhar(sinal.aborted ? "app.tempo-esgotado" : "app.resposta-inesperada", traceId);
  }

  if (resposta.ok) {
    return ehNotaConsultada(corpo) ? sucesso(corpo) : falhar("app.resposta-inesperada", traceId);
  }
  return ehProblema(corpo)
    ? falhar(corpo.code, corpo.traceId, corpo.diagnostico)
    : falhar("app.resposta-inesperada", traceId);
}

export interface MensagemDaFalha {
  titulo: string;
  texto: string;
  /** A saída para esta falha é digitar os preços da compra (CA-13). */
  ofereceDigitar: boolean;
}

const tenteDeNovo = "Tente de novo em alguns minutos.";

const mensagens: Readonly<Record<CodigoDaFalha, MensagemDaFalha>> = {
  "app.link-vazio": {
    titulo: "Cole o link da nota",
    texto: "O campo está vazio. Cole o endereço que abre quando você lê o QR Code do cupom.",
    ofereceDigitar: false,
  },
  "app.link-grande": {
    titulo: "Esse texto é grande demais para ser um link de nota",
    texto: "Cole só o endereço do QR Code do cupom, sem outro texto junto.",
    ofereceDigitar: false,
  },
  "app.sem-conexao": {
    titulo: "Sem conexão com o Cesta Certa",
    texto: "Confira a internet do aparelho e tente de novo.",
    ofereceDigitar: false,
  },
  "app.tempo-esgotado": {
    titulo: "A consulta demorou demais",
    texto: `O servidor não respondeu a tempo. ${tenteDeNovo}`,
    ofereceDigitar: true,
  },
  "app.resposta-inesperada": {
    titulo: "O servidor respondeu de um jeito inesperado",
    texto: tenteDeNovo,
    ofereceDigitar: true,
  },
  "nfce.link-invalido": {
    titulo: "Esse link não é de uma nota fiscal de consumidor",
    texto:
      "Confira se o endereço do QR Code foi copiado inteiro, do começo ao fim, sem cortar o final.",
    ofereceDigitar: false,
  },
  "nfce.host-nao-permitido": {
    titulo: "Esse endereço não é o da consulta de nota fiscal",
    texto:
      "Por segurança, o Cesta Certa só consulta o site oficial da nota fiscal de São Paulo (www.nfce.fazenda.sp.gov.br).",
    ofereceDigitar: false,
  },
  "nfce.uf-sem-leitor": {
    titulo: "Ainda não há leitor para notas desse estado",
    texto: "Por enquanto o Cesta Certa lê só notas fiscais emitidas em São Paulo.",
    ofereceDigitar: true,
  },
  "nfce.indisponivel": {
    titulo: "A consulta da Secretaria da Fazenda não respondeu como esperado",
    texto: tenteDeNovo,
    ofereceDigitar: true,
  },
  "nfce.captcha": {
    titulo: "A Secretaria da Fazenda pediu uma verificação",
    texto: "A página da nota pediu uma verificação que o app não consegue fazer por você.",
    ofereceDigitar: true,
  },
  "nfce.formato-desconhecido": {
    titulo: "A página da nota veio num formato que o app ainda não conhece",
    texto: "O diagnóstico abaixo mostra a estrutura da página, sem o conteúdo da nota.",
    ofereceDigitar: true,
  },
  "nfce.tempo-esgotado": {
    titulo: "A Secretaria da Fazenda demorou mais de 8 segundos",
    texto: tenteDeNovo,
    ofereceDigitar: true,
  },
  "requisicao.invalida": {
    titulo: "O app enviou o link de um jeito que o servidor não entendeu",
    texto: "Atualize a página e tente de novo.",
    ofereceDigitar: false,
  },
  "requisicao.origem-nao-permitida": {
    titulo: "O servidor recusou a consulta",
    texto: "Abra esta página direto pelo endereço do Cesta Certa e tente de novo.",
    ofereceDigitar: false,
  },
  "requisicao.rota-desconhecida": {
    titulo: "O servidor não reconheceu a consulta",
    texto: "Atualize a página e tente de novo.",
    ofereceDigitar: false,
  },
  "requisicao.metodo-nao-permitido": {
    titulo: "O servidor não reconheceu a consulta",
    texto: "Atualize a página e tente de novo.",
    ofereceDigitar: false,
  },
  "requisicao.grande-demais": {
    titulo: "Esse texto é grande demais para ser um link de nota",
    texto: "Cole só o endereço do QR Code do cupom, sem outro texto junto.",
    ofereceDigitar: false,
  },
  "requisicao.tipo-nao-suportado": {
    titulo: "O app enviou o link de um jeito que o servidor não entendeu",
    texto: "Atualize a página e tente de novo.",
    ofereceDigitar: false,
  },
  "erro.interno": {
    titulo: "Algo deu errado no servidor",
    texto: tenteDeNovo,
    ofereceDigitar: true,
  },
};

export function mensagemDaFalha(code: CodigoDaFalha): MensagemDaFalha {
  return mensagens[code];
}

/** "11222333000181" vira "11.222.333/0001-81"; vale também para o CNPJ com letras. */
export function formatarCnpj(cnpj: string): string {
  const partes = /^(.{2})(.{3})(.{3})(.{4})(.{2})$/.exec(cnpj);
  return partes === null
    ? cnpj
    : `${partes[1]}.${partes[2]}.${partes[3]}/${partes[4]}-${partes[5]}`;
}

/**
 * "2026-11-07T10:15:30" vira "07/11/2026 às 10:15". O horário é o impresso na nota, sem
 * conversão de fuso: por isso a montagem é por texto, sem o objeto Date.
 */
export function formatarEmissao(emitidaEm: string | null): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(emitidaEm ?? "");
  if (partes === null) return null;
  const data = `${partes[3]}/${partes[2]}/${partes[1]}`;
  return partes[4] === undefined ? data : `${data} às ${partes[4]}:${partes[5]}`;
}

/** "0.345" vira "0,345", como a pessoa lê no cupom. */
export function formatarQuantidade(quantidade: string): string {
  return quantidade.replace(".", ",");
}

/** Soma dos totais dos itens, em centavos. */
export function somarItens(nota: NotaConsultada): number {
  return nota.itens.reduce((soma, item) => soma + item.totalCentavos, 0);
}
