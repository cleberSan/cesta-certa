/** Textos da tela do assistente (spec 0001, CA-26 a CA-35): fora dos componentes, com teste. */
import { limiteDaPergunta, type LimiteDoAssistente } from "../../shared/contratos/assistente";
import { tamanhoMinimoDoCodigo, type ErroDoCodigo } from "./acesso";
import type { CodigoDaFalhaDoAssistente, FalhaDoAssistente } from "./cliente";

/** CA-28: o que vai para a Anthropic, dito antes do primeiro envio. */
export const textoDoAceite = [
  "O assistente usa o Claude, um modelo de inteligência artificial da Anthropic. Para responder, o Cesta Certa envia à Anthropic a sua pergunta, o objetivo da compra, os itens da lista e as três melhores opções, com mercados, preços, fontes, datas e distâncias arredondadas para 1 km.",
  "Não vão a sua localização, o ponto escolhido nem a descrição impressa nas notas fiscais. O Cesta Certa não guarda a pergunta nem a resposta: o servidor só conta quantas perguntas foram feitas.",
  "A resposta explica as opções que o app já calculou e pode errar. Valor em reais que não está nos dados enviados aparece marcado como não conferido.",
] as const;

export const ajudaDoCodigo = `O assistente é de uso restrito. Digite o código de acesso, com pelo menos ${tamanhoMinimoDoCodigo} caracteres. Ele fica guardado só neste aparelho, fora da cópia em arquivo.`;

export function mensagemDoCodigo(erro: ErroDoCodigo): string {
  switch (erro) {
    case "codigo-vazio":
      return "Digite o código de acesso.";
    case "codigo-curto":
      return `O código tem pelo menos ${tamanhoMinimoDoCodigo} caracteres. Confira se veio inteiro.`;
    case "codigo-longo":
      return "Esse texto é longo demais para ser o código. Cole só o código.";
    case "codigo-invalido":
      return "O código tem só letras sem acento, números e símbolos, sem espaço no meio.";
  }
}

export const ajudaDaPergunta =
  "Pergunte sobre as opções acima: por que uma é melhor, o que tirar para caber no teto, se vale ir a dois mercados.";

/** "120 de 500 caracteres". */
export function contarCaracteres(quantos: number): string {
  return `${quantos} de ${limiteDaPergunta} caracteres`;
}

export const mensagemDaPerguntaVazia = "Escreva a pergunta.";

export const mensagemDaPerguntaLonga = `A pergunta pode ter até ${limiteDaPergunta} caracteres.`;

export const avisoDeNaoConferido = "valor não conferido";

export const notaDaConferencia =
  "Os valores marcados como não conferidos não estão nos dados que o app enviou. Confira no ranking antes de decidir.";

export const avisoDeGravada = "Resposta gravada da demonstração: o assistente não foi chamado.";

/** O fuso em que a cota vira: Brasília, sem horário de verão desde 2019. */
export const fusoDaCota = "America/Sao_Paulo";

/** "14/11/2026 às 00:00", no horário de Brasília. */
export function formatarVolta(iso: string, fuso: string = fusoDaCota): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} às ${parte("hour")}:${parte("minute")}`;
}

function perguntas(quantas: number): string {
  return quantas === 1 ? "1 pergunta" : `${quantas} perguntas`;
}

/** "Restam 29 perguntas hoje e 299 no mês." */
export function descreverLimite(limite: LimiteDoAssistente): string {
  const verbo = limite.restantesHoje === 1 ? "Resta" : "Restam";
  return `${verbo} ${perguntas(limite.restantesHoje)} hoje e ${limite.restantesMes} no mês.`;
}

export interface MensagemDaFalha {
  readonly titulo: string;
  readonly texto: string;
}

const rankingContinua = "O ranking acima continua valendo.";

function mensagemDoLimite(limite: LimiteDoAssistente | null): MensagemDaFalha {
  const doMes = limite !== null && limite.restantesMes === 0;
  const voltaEm = limite?.voltaEm ?? null;
  const semHora = doMes ? "Volta no começo do mês que vem." : "Volta amanhã.";
  const volta =
    voltaEm === null ? semHora : `Volta em ${formatarVolta(voltaEm)}, horário de Brasília.`;
  return {
    titulo: `O assistente chegou ao limite de perguntas ${doMes ? "do mês" : "de hoje"}`,
    texto: `${volta} ${rankingContinua}`,
  };
}

const mensagens: Readonly<Partial<Record<CodigoDaFalhaDoAssistente, MensagemDaFalha>>> = {
  "assistente.nao-autorizado": {
    titulo: "O código de acesso não confere",
    texto: "Ele foi apagado deste aparelho. Digite o código de novo.",
  },
  "assistente.grande-demais": {
    titulo: "A pergunta ou a lista ficou grande demais para o assistente",
    texto: `Encurte a pergunta. Se continuar, a lista tem itens demais para enviar. ${rankingContinua}`,
  },
  "assistente.indisponivel": {
    titulo: "O assistente não está disponível agora",
    texto: `Tente de novo mais tarde. ${rankingContinua}`,
  },
  "assistente.tempo-esgotado": {
    titulo: "O assistente demorou mais de 20 segundos",
    texto: `Tente de novo em alguns minutos. ${rankingContinua}`,
  },
  "assistente.recusa": {
    titulo: "O assistente não respondeu a essa pergunta",
    texto: "Pergunte de outro jeito, sobre a compra e as opções acima.",
  },
  "requisicao.muitas-consultas": {
    titulo: "Muitas perguntas seguidas",
    texto: "Espere um minuto e tente de novo.",
  },
  "app.sem-conexao": {
    titulo: "Sem conexão com o Cesta Certa",
    texto: `Confira a internet do aparelho e tente de novo. ${rankingContinua}`,
  },
  "app.tempo-esgotado": {
    titulo: "A resposta demorou demais",
    texto: `O servidor não respondeu a tempo. Tente de novo em alguns minutos. ${rankingContinua}`,
  },
};

const mensagemGenerica: MensagemDaFalha = {
  titulo: "O assistente respondeu de um jeito inesperado",
  texto: `Tente de novo em alguns minutos. ${rankingContinua}`,
};

/** CA-30 e CA-32: o que deu errado e, no limite, quando volta. */
export function mensagemDaFalha(falha: FalhaDoAssistente): MensagemDaFalha {
  if (falha.code === "assistente.limite") return mensagemDoLimite(falha.limite);
  return mensagens[falha.code] ?? mensagemGenerica;
}

/** Contexto que nem com o mínimo de detalhe cabe em 32 KB (CA-31). */
export const mensagemDoContextoGrande: MensagemDaFalha = {
  titulo: "A lista tem itens demais para o assistente",
  texto: `Com tantos itens, os dados passam do limite de envio. ${rankingContinua}`,
};
