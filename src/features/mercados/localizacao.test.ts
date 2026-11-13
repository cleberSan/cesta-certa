import { describe, expect, it, vi } from "vitest";
import {
  pedirLocalizacao,
  tempoDaLocalizacaoMs,
  type Geolocalizacao,
  type Relogio,
} from "./localizacao";

type Sucesso = Parameters<Geolocalizacao["getCurrentPosition"]>[0];
type Erro = Parameters<Geolocalizacao["getCurrentPosition"]>[1];

/** Geolocalização que guarda os retornos para o teste responder quando quiser. */
function geoManual() {
  const chamadas: { sucesso: Sucesso; erro: Erro; opcoes: PositionOptions }[] = [];
  const geo: Geolocalizacao = {
    getCurrentPosition: (sucesso, erro, opcoes) => {
      chamadas.push({ sucesso, erro, opcoes });
    },
  };
  return { geo, chamadas };
}

/** Relógio que só dispara quando o teste manda. */
function relogioManual() {
  const pendentes = new Map<number, () => void>();
  let proximo = 0;
  const relogio: Relogio = {
    setTimeout: (acao) => {
      proximo += 1;
      pendentes.set(proximo, acao);
      return proximo;
    },
    clearTimeout: (id) => {
      pendentes.delete(id as number);
    },
  };
  const disparar = () => {
    for (const [id, acao] of [...pendentes]) {
      pendentes.delete(id);
      acao();
    }
  };
  return { relogio, pendentes, disparar };
}

const posicao = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } });

// spec 0001 CA-05
describe("pedirLocalizacao", () => {
  it("responde indisponível sem perguntar quando o navegador não tem geolocalização", async () => {
    expect(await pedirLocalizacao(undefined)).toEqual({ ok: false, erro: "indisponivel" });
  });

  it("devolve o ponto e desliga o relógio quando o navegador responde", async () => {
    const { geo, chamadas } = geoManual();
    const { relogio, pendentes } = relogioManual();
    const pedido = pedirLocalizacao(geo, 10_000, relogio);
    chamadas[0]?.sucesso(posicao(-23.5, -46.6));
    expect(await pedido).toEqual({ ok: true, valor: { lat: -23.5, lon: -46.6 } });
    expect(pendentes.size).toBe(0);
  });

  it("pede precisão de rede, aceita posição de até 1 minuto e passa o mesmo limite", () => {
    const { geo, chamadas } = geoManual();
    void pedirLocalizacao(geo, 10_000, relogioManual().relogio);
    expect(chamadas[0]?.opcoes).toEqual({
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 10_000,
    });
  });

  it.each([
    [1, "negada"],
    [2, "indisponivel"],
    [3, "sem-resposta"],
    [99, "indisponivel"],
  ] as const)("traduz o código %i do navegador em %s", async (code, erro) => {
    const { geo, chamadas } = geoManual();
    const pedido = pedirLocalizacao(geo, 10_000, relogioManual().relogio);
    chamadas[0]?.erro({ code });
    expect(await pedido).toEqual({ ok: false, erro });
  });

  it("desiste em 10 segundos contados pelo app, mesmo com a pergunta na tela", async () => {
    const { geo, chamadas } = geoManual();
    const { relogio, disparar } = relogioManual();
    const definir = vi.spyOn(relogio, "setTimeout");
    const pedido = pedirLocalizacao(geo, undefined, relogio);
    expect(definir).toHaveBeenCalledWith(expect.any(Function), tempoDaLocalizacaoMs);
    disparar();
    expect(await pedido).toEqual({ ok: false, erro: "sem-resposta" });
    // Resposta que chega depois do limite não muda nada.
    chamadas[0]?.sucesso(posicao(-23.5, -46.6));
    chamadas[0]?.erro({ code: 1 });
    expect(await pedido).toEqual({ ok: false, erro: "sem-resposta" });
  });

  it("vale só a primeira resposta do navegador", async () => {
    const { geo, chamadas } = geoManual();
    const pedido = pedirLocalizacao(geo, 10_000, relogioManual().relogio);
    chamadas[0]?.erro({ code: 1 });
    chamadas[0]?.sucesso(posicao(-23.5, -46.6));
    expect(await pedido).toEqual({ ok: false, erro: "negada" });
  });

  it.each([
    [Number.NaN, -46.6],
    [-23.5, Number.POSITIVE_INFINITY],
  ])("trata coordenada que não é número (%s, %s) como indisponível", async (lat, lon) => {
    const { geo, chamadas } = geoManual();
    const pedido = pedirLocalizacao(geo, 10_000, relogioManual().relogio);
    chamadas[0]?.sucesso(posicao(lat, lon));
    expect(await pedido).toEqual({ ok: false, erro: "indisponivel" });
  });

  it("trata o navegador que lança em vez de responder como indisponível", async () => {
    const geo: Geolocalizacao = {
      getCurrentPosition: () => {
        throw new Error("bloqueado pela política do documento");
      },
    };
    const { relogio, pendentes } = relogioManual();
    expect(await pedirLocalizacao(geo, 10_000, relogio)).toEqual({
      ok: false,
      erro: "indisponivel",
    });
    expect(pendentes.size).toBe(0);
  });

  it("usa o relógio do aparelho quando nenhum é passado", async () => {
    vi.useFakeTimers();
    try {
      const { geo } = geoManual();
      const pedido = pedirLocalizacao(geo);
      await vi.advanceTimersByTimeAsync(tempoDaLocalizacaoMs);
      expect(await pedido).toEqual({ ok: false, erro: "sem-resposta" });
    } finally {
      vi.useRealTimers();
    }
  });
});
