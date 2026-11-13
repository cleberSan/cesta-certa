import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { tamanhoMinimoDoCodigo } from "./acesso";
import { criarProvedorAnthropic, type OpcoesDoAnthropic } from "./anthropic";
import type { BancoD1, LimitesDoAssistente } from "./cota";
import { provedorGravado } from "./gravado";
import type { Provedor } from "./provedor";

/**
 * O que o assistente precisa do ambiente do Worker (ADR-0004). Os dois segredos ficam só no
 * cofre da Cloudflare, criados pelo Cleber no painel (CA-34); nenhum arquivo do repositório nem
 * do site os contém. Faltou algo, o assistente fica desligado e responde 503: o resto do app
 * segue igual.
 */
export interface AmbienteDoAssistente {
  /** Binding D1 do `wrangler.jsonc`, com os contadores de uso. */
  USO_ASSISTENTE?: BancoD1;
  /** Segredo: chave da API da Anthropic, exclusiva deste projeto. */
  ANTHROPIC_API_KEY?: string;
  /** Segredo: código de acesso que o app manda como `Authorization: Bearer`. */
  ASSISTENTE_CODIGO?: string;
  /** "gravado" troca a Anthropic pelas respostas gravadas (E2E e prévia, sem custo). */
  ASSISTENTE_PROVEDOR?: string;
  /** Variáveis opcionais; sem elas, 30 por dia e 300 por mês. */
  ASSISTENTE_LIMITE_DIA?: string;
  ASSISTENTE_LIMITE_MES?: string;
}

export interface ConfiguracaoDoAssistente {
  codigo: string;
  banco: BancoD1;
  provedor: Provedor;
  limites: LimitesDoAssistente;
}

export type MotivoDeDesligado = "sem-banco" | "sem-codigo" | "codigo-curto" | "sem-chave";

export const limitesPadrao: LimitesDoAssistente = { porDia: 30, porMes: 300 };

/** Teto para um erro de digitação não multiplicar o custo: 100 por dia e 1.000 por mês. */
const limitesMaximos: LimitesDoAssistente = { porDia: 100, porMes: 1_000 };

function lerLimite(texto: string | undefined, padrao: number, maximo: number): number {
  if (texto === undefined || !/^\d{1,5}$/.test(texto)) return padrao;
  const valor = Number(texto);
  return valor >= 1 && valor <= maximo ? valor : padrao;
}

export function configurarAssistente(
  env: AmbienteDoAssistente,
  criarAnthropic: (opcoes: OpcoesDoAnthropic) => Provedor = criarProvedorAnthropic,
): Resultado<ConfiguracaoDoAssistente, MotivoDeDesligado> {
  if (env.USO_ASSISTENTE === undefined) return falha("sem-banco");
  const codigo = env.ASSISTENTE_CODIGO;
  if (codigo === undefined || codigo === "") return falha("sem-codigo");
  if (codigo.length < tamanhoMinimoDoCodigo) return falha("codigo-curto");

  let provedor: Provedor;
  if (env.ASSISTENTE_PROVEDOR === "gravado") {
    provedor = provedorGravado;
  } else if (env.ANTHROPIC_API_KEY === undefined || env.ANTHROPIC_API_KEY === "") {
    return falha("sem-chave");
  } else {
    provedor = criarAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  return sucesso({
    codigo,
    banco: env.USO_ASSISTENTE,
    provedor,
    limites: {
      porDia: lerLimite(env.ASSISTENTE_LIMITE_DIA, limitesPadrao.porDia, limitesMaximos.porDia),
      porMes: lerLimite(env.ASSISTENTE_LIMITE_MES, limitesPadrao.porMes, limitesMaximos.porMes),
    },
  });
}
