import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarTabela, limiteDepois, periodosDe, reservar, type BancoD1 } from "./cota";
import { abrirD1, type D1DeTeste } from "./fixtures/d1";

const limites = { porDia: 3, porMes: 5 };
/** 13/11/2026, 14h em Brasília (17h UTC). */
const sextaAsDuas = Date.UTC(2026, 10, 13, 17, 0, 0);
const umDia = 24 * 60 * 60 * 1000;

let d1: D1DeTeste;

beforeAll(async () => {
  d1 = await abrirD1();
}, 30_000);

afterAll(async () => {
  await d1.fechar();
});

beforeEach(async () => {
  await d1.limpar();
});

async function reservarVezes(vezes: number, agora: number) {
  const reservas = [];
  for (let i = 0; i < vezes; i += 1) reservas.push(await reservar(d1.banco, agora, limites));
  return reservas;
}

describe("periodosDe", () => {
  it("vira o dia à meia-noite de Brasília, não à de UTC", () => {
    // Arrange: 23h59 de 13/11 em Brasília é 02h59 de 14/11 em UTC.
    const quaseMeiaNoite = Date.UTC(2026, 10, 14, 2, 59, 0);

    // Act
    const antes = periodosDe(quaseMeiaNoite);
    const depois = periodosDe(quaseMeiaNoite + 60_000);

    // Assert
    expect(antes.dia).toBe("2026-11-13");
    expect(depois.dia).toBe("2026-11-14");
    expect(new Date(antes.amanhaEm).toISOString()).toBe("2026-11-14T03:00:00.000Z");
  });

  it("fecha o ano no último dia de dezembro", () => {
    const periodos = periodosDe(Date.UTC(2026, 11, 31, 20, 0, 0));

    expect(periodos).toMatchObject({
      dia: "2026-12-31",
      inicioDoMes: "2026-12-01",
      inicioDoProximoMes: "2027-01-01",
    });
    expect(new Date(periodos.proximoMesEm).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("limiteDepois", () => {
  const periodos = periodosDe(sextaAsDuas);

  it("sem nada esgotado, não diz quando volta", () => {
    expect(limiteDepois(1, 1, limites, periodos)).toEqual({
      restantesHoje: 2,
      restantesMes: 4,
      voltaEm: null,
    });
  });

  // spec 0001 CA-30
  it("com o dia esgotado, volta à meia-noite de Brasília", () => {
    expect(limiteDepois(3, 3, limites, periodos)).toEqual({
      restantesHoje: 0,
      restantesMes: 2,
      voltaEm: "2026-11-14T03:00:00.000Z",
    });
  });

  // spec 0001 CA-30
  it("com o mês esgotado, volta no primeiro dia do mês seguinte, e o dia segue o mês", () => {
    expect(limiteDepois(1, 5, limites, periodos)).toEqual({
      restantesHoje: 0,
      restantesMes: 0,
      voltaEm: "2026-12-01T03:00:00.000Z",
    });
  });
});

describe("reservar, no D1 local", () => {
  // spec 0001 CA-30
  it("reserva até o limite do dia e então recusa, dizendo quando volta", async () => {
    // Act
    const reservas = await reservarVezes(4, sextaAsDuas);

    // Assert
    expect(reservas.map((reserva) => reserva.reservada)).toEqual([true, true, true, false]);
    expect(reservas.map((reserva) => reserva.limite.restantesHoje)).toEqual([2, 1, 0, 0]);
    expect(reservas[3]?.limite).toEqual({
      restantesHoje: 0,
      restantesMes: 2,
      voltaEm: "2026-11-14T03:00:00.000Z",
    });
  });

  // spec 0001 CA-30
  it("soma os dias do mês e recusa quando o mês acaba, mesmo com crédito no dia", async () => {
    // Arrange: três no dia 12 e duas no dia 13 fecham as cinco do mês.
    await reservarVezes(3, sextaAsDuas - umDia);
    await reservarVezes(2, sextaAsDuas);

    // Act
    const [sexta] = await reservarVezes(1, sextaAsDuas);
    const [sabado] = await reservarVezes(1, sextaAsDuas + umDia);

    // Assert
    expect(sexta).toMatchObject({
      reservada: false,
      limite: { restantesHoje: 0, restantesMes: 0, voltaEm: "2026-12-01T03:00:00.000Z" },
    });
    expect(sabado?.reservada).toBe(false);
  });

  // spec 0001 CA-30
  it("o mês seguinte começa do zero", async () => {
    await reservarVezes(3, sextaAsDuas);

    const [dezembro] = await reservarVezes(1, Date.UTC(2026, 11, 1, 12, 0, 0));

    expect(dezembro).toMatchObject({
      reservada: true,
      limite: { restantesHoje: 2, restantesMes: 4 },
    });
  });

  // spec 0001 CA-30
  it("na corrida pelo último crédito do dia, só um pedido passa", async () => {
    // Arrange: sobra uma pergunta hoje.
    await reservarVezes(2, sextaAsDuas);

    // Act: dez pedidos ao mesmo tempo.
    const reservas = await Promise.all(
      Array.from({ length: 10 }, () => reservar(d1.banco, sextaAsDuas, limites)),
    );

    // Assert
    expect(reservas.filter((reserva) => reserva.reservada)).toHaveLength(1);
    const [depois] = await reservarVezes(1, sextaAsDuas);
    expect(depois?.limite.restantesHoje).toBe(0);
  });

  it("guarda só o dia e o número de perguntas", async () => {
    await reservarVezes(2, sextaAsDuas);

    const [tudo] = await d1.banco.batch([d1.banco.prepare("SELECT * FROM uso_assistente")]);

    expect(tudo?.results).toEqual([{ periodo: "2026-11-13", usadas: 2 }]);
  });

  it("falha do banco sobe como exceção, para quem chama recusar a pergunta", async () => {
    const quebrado: BancoD1 = {
      prepare: () => ({ bind: () => quebrado.prepare("") }),
      batch: () => Promise.reject(new Error("D1 fora do ar")),
    };

    await expect(reservar(quebrado, sextaAsDuas, limites)).rejects.toThrow("D1 fora do ar");
  });

  it("resposta do banco fora do formato vira exceção, não reserva", async () => {
    const estranho: BancoD1 = {
      prepare: () => ({ bind: () => estranho.prepare("") }),
      batch: () => Promise.resolve([{}, {}, { results: [{}] }, { results: [{ dia: "3" }] }]),
    };

    await expect(reservar(estranho, sextaAsDuas, limites)).rejects.toThrow("fora do formato");
  });

  it("a tabela criada na reserva é a mesma da migração 0001", () => {
    const migracao = readFileSync(
      new URL("../../migrations/0001_uso_assistente.sql", import.meta.url),
      "utf8",
    );
    const instrucao = migracao
      .split("\n")
      .filter((linha) => !linha.startsWith("--"))
      .join(" ")
      .trim();

    expect(instrucao).toBe(`${criarTabela};`);
  });
});
