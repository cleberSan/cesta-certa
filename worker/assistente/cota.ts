import type { LimiteDoAssistente } from "../../src/shared/contratos/assistente";
import { ehObjeto } from "../../src/shared/validacao";

/**
 * Cota do assistente no D1 (spec 0001, CA-30; ADR-0004): no máximo N perguntas por dia e M por
 * mês, reservadas antes de chamar o provedor. A tabela guarda só contadores, sem conteúdo, sem
 * IP e sem identificação.
 *
 * Uma linha por dia (`2026-11-13`); o uso do mês é a soma das linhas do mês. Assim a reserva é
 * um único UPDATE numa única linha, que confere o dia e o mês na mesma instrução: o D1 executa
 * uma instrução por vez, e duas pessoas no último crédito nunca passam as duas.
 */

/** O pedaço da API do D1 que o contador usa; o binding de verdade satisfaz esta forma. */
export interface ConsultaD1 {
  bind(...valores: (string | number)[]): ConsultaD1;
}

export interface BancoD1 {
  prepare(sql: string): ConsultaD1;
  batch(consultas: ConsultaD1[]): Promise<{ results?: unknown[] }[]>;
}

export interface LimitesDoAssistente {
  porDia: number;
  porMes: number;
}

/**
 * A mesma instrução de `migrations/0001_uso_assistente.sql`, repetida em cada reserva: o deploy
 * não depende de alguém aplicar a migração, e `IF NOT EXISTS` não escreve nada depois da
 * primeira vez. Um teste confere que as duas não se separam.
 */
export const criarTabela =
  "CREATE TABLE IF NOT EXISTS uso_assistente (periodo TEXT PRIMARY KEY NOT NULL, usadas INTEGER NOT NULL DEFAULT 0 CHECK (usadas >= 0))";

const abrirDia =
  "INSERT INTO uso_assistente (periodo, usadas) VALUES (?1, 0) ON CONFLICT DO NOTHING";

/** Soma só a linha do dia se o dia e o mês ainda têm crédito; devolve a linha só se somou. */
const reservarUma = `UPDATE uso_assistente SET usadas = usadas + 1
WHERE periodo = ?1 AND usadas < ?2
AND (SELECT COALESCE(SUM(usadas), 0) FROM uso_assistente WHERE periodo >= ?3 AND periodo < ?4) < ?5
RETURNING usadas`;

const lerUso = `SELECT
(SELECT usadas FROM uso_assistente WHERE periodo = ?1) AS dia,
(SELECT COALESCE(SUM(usadas), 0) FROM uso_assistente WHERE periodo >= ?2 AND periodo < ?3) AS mes`;

/**
 * O dia da cota vira à meia-noite de Brasília. O horário é fixo em UTC−3 porque o Brasil não
 * tem horário de verão desde 2019; se voltar a ter, a virada atrasa uma hora, sem outro efeito.
 */
const fusoMs = 3 * 60 * 60 * 1000;

export interface Periodos {
  dia: string;
  inicioDoMes: string;
  inicioDoProximoMes: string;
  /** Instantes (ms, UTC) em que o dia e o mês seguintes começam em Brasília. */
  amanhaEm: number;
  proximoMesEm: number;
}

function diaIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function periodosDe(agoraMs: number): Periodos {
  const local = new Date(agoraMs - fusoMs);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate();
  return {
    dia: diaIso(Date.UTC(ano, mes, dia)),
    inicioDoMes: diaIso(Date.UTC(ano, mes, 1)),
    inicioDoProximoMes: diaIso(Date.UTC(ano, mes + 1, 1)),
    amanhaEm: Date.UTC(ano, mes, dia + 1) + fusoMs,
    proximoMesEm: Date.UTC(ano, mes + 1, 1) + fusoMs,
  };
}

/** Quanto sobra depois do uso informado e, se algo acabou, quando volta. */
export function limiteDepois(
  usadasNoDia: number,
  usadasNoMes: number,
  limites: LimitesDoAssistente,
  periodos: Periodos,
): LimiteDoAssistente {
  const restantesMes = Math.max(0, limites.porMes - usadasNoMes);
  const restantesHoje = Math.min(Math.max(0, limites.porDia - usadasNoDia), restantesMes);
  const volta =
    restantesMes === 0 ? periodos.proximoMesEm : restantesHoje === 0 ? periodos.amanhaEm : null;
  return {
    restantesHoje,
    restantesMes,
    voltaEm: volta === null ? null : new Date(volta).toISOString(),
  };
}

export interface Reserva {
  reservada: boolean;
  limite: LimiteDoAssistente;
}

function ehContagem(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

/**
 * Reserva uma pergunta, numa transação só (o `batch` do D1): cria a tabela se faltar, abre a
 * linha do dia, tenta somar e lê o uso. Falha do D1 sobe como exceção, e quem chama recusa a
 * pergunta: sem contador não há trava de custo.
 */
export async function reservar(
  banco: BancoD1,
  agoraMs: number,
  limites: LimitesDoAssistente,
): Promise<Reserva> {
  const periodos = periodosDe(agoraMs);
  const resultados = await banco.batch([
    banco.prepare(criarTabela),
    banco.prepare(abrirDia).bind(periodos.dia),
    banco
      .prepare(reservarUma)
      .bind(
        periodos.dia,
        limites.porDia,
        periodos.inicioDoMes,
        periodos.inicioDoProximoMes,
        limites.porMes,
      ),
    banco.prepare(lerUso).bind(periodos.dia, periodos.inicioDoMes, periodos.inicioDoProximoMes),
  ]);
  const somou = resultados[2]?.results ?? [];
  const uso: unknown = resultados[3]?.results?.[0];
  const dia = ehObjeto(uso) ? uso["dia"] : null;
  const mes = ehObjeto(uso) ? uso["mes"] : null;
  if (!ehContagem(dia) || !ehContagem(mes)) {
    throw new Error("O D1 devolveu o uso do assistente fora do formato.");
  }
  return {
    reservada: somou.length === 1,
    limite: limiteDepois(dia, mes, limites, periodos),
  };
}
