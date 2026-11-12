/**
 * Conferências comuns de dado que vem de fora do código: do aparelho, de um arquivo
 * importado, da base publicada ou da resposta do servidor. Sem dependências, porque também
 * roda direto no Node (o gerador da base usa a remoção de tipos do Node 24).
 */

/** Objeto comum, sem ser lista nem nulo. */
export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Identificador dos registros do aparelho: UUID em minúsculas, como `gerarId` cria. */
export function ehUuid(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(valor)
  );
}

/**
 * Data e hora em UTC exatamente como `Date.toISOString()` escreve ("2026-11-12T15:00:00.000Z"),
 * e que existe no calendário: 30 de fevereiro não passa.
 */
export function ehDataIso(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor) &&
    !Number.isNaN(Date.parse(valor)) &&
    new Date(valor).toISOString() === valor
  );
}
