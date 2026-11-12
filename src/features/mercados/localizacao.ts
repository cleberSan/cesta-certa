/**
 * Pedido da localização ao navegador (CA-05): só depois do toque em "Usar minha localização",
 * com 10 segundos de limite contados pelo próprio app, porque o `timeout` do navegador não
 * conta o tempo em que a pergunta de permissão fica na tela.
 */
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import type { Ponto } from "./geo";

export type ErroDaLocalizacao = "negada" | "indisponivel" | "sem-resposta";

export const tempoDaLocalizacaoMs = 10_000;

/** O pedaço de `navigator.geolocation` que o app usa. */
export interface Geolocalizacao {
  getCurrentPosition(
    sucesso: (posicao: {
      readonly coords: { readonly latitude: number; readonly longitude: number };
    }) => void,
    erro: (motivo: { readonly code: number }) => void,
    opcoes: PositionOptions,
  ): void;
}

export interface Relogio {
  setTimeout(acao: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const relogioDoAparelho: Relogio = {
  setTimeout: (acao, ms) => globalThis.setTimeout(acao, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Código do `GeolocationPositionError`: 1 negada, 2 indisponível, 3 tempo esgotado. */
function motivoDoErro(codigo: number): ErroDaLocalizacao {
  if (codigo === 1) return "negada";
  if (codigo === 3) return "sem-resposta";
  return "indisponivel";
}

export function pedirLocalizacao(
  geo: Geolocalizacao | undefined,
  tempoMs = tempoDaLocalizacaoMs,
  relogio: Relogio = relogioDoAparelho,
): Promise<Resultado<Ponto, ErroDaLocalizacao>> {
  if (geo === undefined) return Promise.resolve(falha("indisponivel"));
  return new Promise((resolver) => {
    let respondido = false;
    const responder = (resultado: Resultado<Ponto, ErroDaLocalizacao>) => {
      if (respondido) return;
      respondido = true;
      relogio.clearTimeout(limite);
      resolver(resultado);
    };
    const limite = relogio.setTimeout(() => responder(falha("sem-resposta")), tempoMs);
    try {
      geo.getCurrentPosition(
        (posicao) => {
          const { latitude, longitude } = posicao.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            responder(falha("indisponivel"));
          } else {
            responder(sucesso({ lat: latitude, lon: longitude }));
          }
        },
        (erro) => responder(falha(motivoDoErro(erro.code))),
        // Precisão de rede basta para achar mercados num raio de quilômetros e gasta menos bateria.
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: tempoMs },
      );
    } catch {
      // Política do documento que bloqueia a geolocalização pode lançar em vez de responder.
      responder(falha("indisponivel"));
    }
  });
}
