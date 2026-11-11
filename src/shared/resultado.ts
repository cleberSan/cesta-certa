/**
 * Resultado de uma operação que pode falhar por motivo esperado (entrada inválida, serviço
 * fora do ar). Exceção fica para erro de programação.
 */
export type Resultado<T, E> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly erro: E };

export function sucesso<T>(valor: T): Resultado<T, never> {
  return { ok: true, valor };
}

export function falha<E>(erro: E): Resultado<never, E> {
  return { ok: false, erro };
}
