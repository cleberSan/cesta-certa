/**
 * Aceite e código de acesso do assistente, guardados no armazém `ajustes` do aparelho (spec
 * 0001, CA-28 e CA-29; ADR-0004). O armazém fica fora da cópia exportada, então o código não
 * sai do aparelho num arquivo de cópia. Esquecer apaga os dois.
 */
import type { Registro } from "../../shared/armazenamento/banco";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { ehDataIso } from "../../shared/validacao";

export interface AcessoAoAssistente {
  /** Quando a pessoa aceitou o envio à Anthropic neste aparelho (CA-28); nulo antes disso. */
  readonly aceitoEm: string | null;
  readonly codigo: string | null;
}

export const acessoInicial: AcessoAoAssistente = { aceitoEm: null, codigo: null };

export const idDoAssistente = "assistente";

/** Os mesmos 32 do servidor: abaixo disso o assistente nem liga (worker/assistente/acesso.ts). */
export const tamanhoMinimoDoCodigo = 32;
export const tamanhoMaximoDoCodigo = 512;

/**
 * Só ASCII visível: o código vai num cabeçalho HTTP, que não aceita espaço no meio nem letra
 * acentuada (o `fetch` recusaria antes de enviar).
 */
const formatoDoCodigo = /^[\x21-\x7e]+$/;

export type ErroDoCodigo = "codigo-vazio" | "codigo-curto" | "codigo-longo" | "codigo-invalido";

export function lerCodigoDigitado(texto: string): Resultado<string, ErroDoCodigo> {
  const codigo = texto.trim();
  if (codigo === "") return falha("codigo-vazio");
  if (!formatoDoCodigo.test(codigo)) return falha("codigo-invalido");
  if (codigo.length < tamanhoMinimoDoCodigo) return falha("codigo-curto");
  if (codigo.length > tamanhoMaximoDoCodigo) return falha("codigo-longo");
  return sucesso(codigo);
}

/** Lê o registro guardado; campo fora do formato conta como ausente. */
export function lerAcesso(registros: readonly unknown[]): AcessoAoAssistente {
  const registro = registros.find(
    (valor): valor is Record<string, unknown> =>
      typeof valor === "object" && valor !== null && "id" in valor && valor.id === idDoAssistente,
  );
  if (registro === undefined) return acessoInicial;
  const { aceitoEm, codigo } = registro;
  return {
    aceitoEm: ehDataIso(aceitoEm) ? aceitoEm : null,
    codigo: typeof codigo === "string" && lerCodigoDigitado(codigo).ok ? codigo : null,
  };
}

export function registroDoAcesso(acesso: AcessoAoAssistente): Registro & AcessoAoAssistente {
  return { id: idDoAssistente, ...acesso };
}
