import { describe, expect, it } from "vitest";
import { limiteDaPergunta } from "../../shared/contratos/assistente";
import type { ErroDoCodigo } from "./acesso";
import type { CodigoDaFalhaDoAssistente } from "./cliente";
import {
  contarCaracteres,
  descreverLimite,
  formatarVolta,
  mensagemDaFalha,
  mensagemDoCodigo,
  textoDoAceite,
} from "./textos";

const limite = { restantesHoje: 29, restantesMes: 299, voltaEm: null };

describe("textos do assistente", () => {
  // spec 0001 CA-28
  it("o aceite diz que a pergunta e a lista vão para a Anthropic e o que não vai", () => {
    const texto = textoDoAceite.join(" ");

    expect(texto).toContain("Anthropic");
    expect(texto).toContain("sua pergunta");
    expect(texto).toContain("itens da lista");
    expect(texto).toContain("Não vão a sua localização");
    expect(texto).toContain("não conferido");
  });

  it.each<ErroDoCodigo>(["codigo-vazio", "codigo-curto", "codigo-longo", "codigo-invalido"])(
    "explica o código recusado por %s",
    (erro) => {
      expect(mensagemDoCodigo(erro)).toMatch(/\.$/);
    },
  );

  it("conta os caracteres contra o limite", () => {
    expect(contarCaracteres(12)).toBe(`12 de ${limiteDaPergunta} caracteres`);
  });

  it("descreve o que resta da cota", () => {
    expect(descreverLimite(limite)).toBe("Restam 29 perguntas hoje e 299 no mês.");
    expect(descreverLimite({ ...limite, restantesHoje: 1, restantesMes: 1 })).toBe(
      "Resta 1 pergunta hoje e 1 no mês.",
    );
    expect(descreverLimite({ ...limite, restantesHoje: 0 })).toBe(
      "Restam 0 perguntas hoje e 299 no mês.",
    );
  });

  // spec 0001 CA-30
  it("escreve a volta da cota no horário de Brasília", () => {
    expect(formatarVolta("2026-11-14T03:00:00.000Z")).toBe("14/11/2026 às 00:00");
    expect(formatarVolta("2026-12-01T03:00:00.000Z")).toBe("01/12/2026 às 00:00");
    expect(formatarVolta("2026-11-14T03:00:00.000Z", "UTC")).toBe("14/11/2026 às 03:00");
  });
});

describe("mensagens de falha", () => {
  // spec 0001 CA-30
  it("no limite do dia, diz quando volta", () => {
    const mensagem = mensagemDaFalha({
      code: "assistente.limite",
      traceId: null,
      limite: { restantesHoje: 0, restantesMes: 270, voltaEm: "2026-11-14T03:00:00.000Z" },
    });

    expect(mensagem.titulo).toBe("O assistente chegou ao limite de perguntas de hoje");
    expect(mensagem.texto).toContain("Volta em 14/11/2026 às 00:00, horário de Brasília.");
  });

  // spec 0001 CA-30
  it("no limite do mês, diz que é do mês", () => {
    const mensagem = mensagemDaFalha({
      code: "assistente.limite",
      traceId: null,
      limite: { restantesHoje: 30, restantesMes: 0, voltaEm: "2026-12-01T03:00:00.000Z" },
    });

    expect(mensagem.titulo).toBe("O assistente chegou ao limite de perguntas do mês");
    expect(mensagem.texto).toContain("01/12/2026 às 00:00");
  });

  // spec 0001 CA-30
  it("no limite sem a hora da volta, diz quando volta em palavras", () => {
    expect(
      mensagemDaFalha({ code: "assistente.limite", traceId: null, limite: null }).texto,
    ).toMatch(/^Volta amanhã\./);
    expect(
      mensagemDaFalha({
        code: "assistente.limite",
        traceId: null,
        limite: { restantesHoje: 0, restantesMes: 0, voltaEm: null },
      }).texto,
    ).toMatch(/^Volta no começo do mês que vem\./);
  });

  // spec 0001 CA-32
  it.each<CodigoDaFalhaDoAssistente>([
    "assistente.indisponivel",
    "assistente.tempo-esgotado",
    "app.sem-conexao",
    "app.tempo-esgotado",
    "app.resposta-inesperada",
    "erro.interno",
  ])("na falha %s, avisa e lembra que o ranking continua", (code) => {
    expect(mensagemDaFalha({ code, traceId: null, limite }).texto).toContain(
      "O ranking acima continua valendo.",
    );
  });

  // spec 0001 CA-32
  it("na recusa, pede outra pergunta", () => {
    expect(mensagemDaFalha({ code: "assistente.recusa", traceId: null, limite }).titulo).toBe(
      "O assistente não respondeu a essa pergunta",
    );
  });

  it("no código errado, pede para digitar de novo", () => {
    expect(
      mensagemDaFalha({ code: "assistente.nao-autorizado", traceId: null, limite: null }).texto,
    ).toContain("Digite o código de novo.");
  });
});
