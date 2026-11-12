/**
 * Roteiro da geração (ADR-0005): consulta as UFs uma por vez, com pausa e retentativa, e
 * prepara os arquivos e o relatório. Rede, relógio e espera chegam por parâmetro, para os
 * testes trocarem por versões controladas; quem liga tudo ao mundo real é scripts/mercados.ts.
 */
import { lerIndice } from "../../src/shared/contratos/mercados.ts";
import {
  arquivosDaBase,
  conferirBase,
  medir,
  montarBase,
  relatorio,
  type RespostaDaUf,
} from "./base.ts";
import { consultaDaUf, lerRespostaOverpass, type ElementoOverpass } from "./overpass.ts";

export interface RespostaHttp {
  readonly status: number;
  readonly texto: string;
}

export interface Dependencias {
  /** Envia a consulta à Overpass; rejeita em falha de rede ou tempo esgotado. */
  consultar(consulta: string): Promise<RespostaHttp>;
  esperar(ms: number): Promise<void>;
  registrar(linha: string): void;
}

export interface Opcoes {
  readonly ufs: readonly string[];
  /** Pausa entre uma UF e a seguinte, para não ocupar a instância pública. */
  readonly pausaMs: number;
  readonly tentativas: number;
  /** Primeira espera depois de uma falha; dobra a cada tentativa. */
  readonly esperaMs: number;
}

type Tentativa =
  | { readonly ok: true; readonly elementos: readonly ElementoOverpass[] }
  | { readonly ok: false; readonly motivo: string; readonly repetir: boolean };

async function tentar(uf: string, deps: Dependencias): Promise<Tentativa> {
  let resposta: RespostaHttp;
  try {
    resposta = await deps.consultar(consultaDaUf(uf));
  } catch {
    // A mensagem do erro pode trazer o endereço inteiro; só o tipo de falha interessa.
    return { ok: false, motivo: "falha de rede ou tempo esgotado", repetir: true };
  }
  if (resposta.status === 200) {
    const leitura = lerRespostaOverpass(resposta.texto);
    if (leitura.ok) return { ok: true, elementos: leitura.elementos };
    const motivo =
      leitura.erro.tipo === "consulta-incompleta"
        ? `consulta incompleta: ${leitura.erro.observacao}`
        : "resposta que não é JSON da Overpass";
    return { ok: false, motivo, repetir: true };
  }
  // 429 (fila cheia) e 5xx passam; outro 4xx é erro na consulta e não adianta repetir.
  const repetir = resposta.status === 429 || resposta.status >= 500;
  return { ok: false, motivo: `HTTP ${resposta.status}`, repetir };
}

export async function consultarUf(
  uf: string,
  deps: Dependencias,
  opcoes: Opcoes,
): Promise<RespostaDaUf | string> {
  let motivo = "nenhuma tentativa";
  for (let tentativa = 1; tentativa <= opcoes.tentativas; tentativa += 1) {
    const resultado = await tentar(uf, deps);
    if (resultado.ok) return { uf, elementos: resultado.elementos };
    motivo = resultado.motivo;
    deps.registrar(`${uf}: tentativa ${tentativa} de ${opcoes.tentativas} falhou (${motivo}).`);
    if (!resultado.repetir) break;
    if (tentativa < opcoes.tentativas) await deps.esperar(opcoes.esperaMs * 2 ** (tentativa - 1));
  }
  return `${uf}: ${motivo}.`;
}

/**
 * Consulta todas as UFs. Se uma falhar depois das tentativas, nada é gerado: a base anterior
 * continua publicada em vez de uma base sem aquela UF.
 */
export async function consultarTodas(
  deps: Dependencias,
  opcoes: Opcoes,
): Promise<{ ok: true; respostas: RespostaDaUf[] } | { ok: false; motivo: string }> {
  const respostas: RespostaDaUf[] = [];
  for (const [posicao, uf] of opcoes.ufs.entries()) {
    if (posicao > 0) await deps.esperar(opcoes.pausaMs);
    const resposta = await consultarUf(uf, deps, opcoes);
    if (typeof resposta === "string") return { ok: false, motivo: resposta };
    deps.registrar(`${uf}: ${resposta.elementos.length} elementos.`);
    respostas.push(resposta);
  }
  return { ok: true, respostas };
}

/** Total de mercados do índice publicado antes, para a conferência de queda. */
export function totalDoIndice(texto: string | null): number | null {
  if (texto === null) return null;
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }
  const lido = lerIndice(valor);
  if (!lido.ok) return null;
  return [...lido.valor.celulas.values()].reduce((soma, quantos) => soma + quantos, 0);
}

export interface Publicacao {
  readonly arquivos: ReadonlyMap<string, string>;
  readonly relatorio: string;
  readonly problemas: readonly string[];
}

export function prepararPublicacao(
  respostas: readonly RespostaDaUf[],
  totalAnterior: number | null,
  geradoEm: Date,
): Publicacao {
  const base = montarBase(respostas);
  const arquivos = arquivosDaBase(base, geradoEm);
  const tamanhos = medir(arquivos);
  const conferencia = conferirBase(base, tamanhos, totalAnterior);
  return {
    arquivos,
    relatorio: relatorio(base, tamanhos, conferencia, totalAnterior, geradoEm),
    problemas: conferencia.problemas,
  };
}
