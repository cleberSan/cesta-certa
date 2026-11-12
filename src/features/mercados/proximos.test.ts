import { describe, expect, it } from "vitest";
import type { MercadoDaBase } from "../../shared/contratos/mercados";
import { distanciaKm } from "./geo";
import { mercadosNoRaio, situacaoDoPonto } from "./proximos";

const centro = { lat: -23.5, lon: -46.6 };

/** Mercado a `km` quilômetros ao norte do centro (1 grau de latitude ≈ 111,2 km). */
function mercado(id: string, nome: string, km: number): MercadoDaBase {
  return { id, nome, tipo: "supermercado", lat: centro.lat + km / 111.195, lon: centro.lon };
}

// spec 0001 CA-07
describe("mercadosNoRaio", () => {
  it("deixa de fora quem passa do raio e ordena do mais perto ao mais longe", () => {
    const resultado = mercadosNoRaio(
      [mercado("n3", "Longe", 4.5), mercado("n1", "Perto", 0.3), mercado("n9", "Fora", 5.2)],
      centro,
      5,
    );
    expect(resultado.map((m) => m.id)).toEqual(["n1", "n3"]);
  });

  it("inclui o mercado exatamente no limite do raio", () => {
    const noLimite = mercado("n1", "Limite", 5);
    const raio = distanciaKm(centro, noLimite);
    expect(mercadosNoRaio([noLimite], centro, raio)).toHaveLength(1);
  });

  it("guarda a distância calculada junto do mercado", () => {
    const [primeiro] = mercadosNoRaio([mercado("n1", "Perto", 1)], centro, 5);
    expect(primeiro?.distanciaKm).toBeCloseTo(1, 2);
    expect(primeiro?.nome).toBe("Perto");
  });

  it("desempata pelo nome, sem ligar para acento e maiúscula, e depois pelo id", () => {
    const mesmoPonto = (id: string, nome: string): MercadoDaBase => ({
      id,
      nome,
      tipo: "bairro",
      ...centro,
    });
    const resultado = mercadosNoRaio(
      [mesmoPonto("w2", "Ébano"), mesmoPonto("n5", "abacate"), mesmoPonto("n1", "Ébano")],
      centro,
      1,
    );
    expect(resultado.map((m) => m.id)).toEqual(["n5", "n1", "w2"]);
  });

  it("conta uma vez o mercado que veio em duas células", () => {
    const repetido = mercado("n1", "Perto", 1);
    expect(mercadosNoRaio([repetido, repetido], centro, 5)).toHaveLength(1);
  });

  it("devolve vazio sem mercados", () => {
    expect(mercadosNoRaio([], centro, 30)).toEqual([]);
  });
});

// spec 0001 CA-39
describe("situacaoDoPonto", () => {
  it("diz que há mercados quando a lista não está vazia", () => {
    expect(situacaoDoPonto(centro, 3)).toBe("com-mercados");
  });

  it("diz que não há mercados no raio dentro do Brasil", () => {
    expect(situacaoDoPonto(centro, 0)).toBe("sem-mercados");
  });

  it("diz que o ponto está fora do Brasil", () => {
    expect(situacaoDoPonto({ lat: 38.72, lon: -9.14 }, 0)).toBe("fora-do-brasil");
  });
});
