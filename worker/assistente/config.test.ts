import { describe, expect, it, vi } from "vitest";
import { configurarAssistente, limitesPadrao, type AmbienteDoAssistente } from "./config";
import type { BancoD1 } from "./cota";
import { provedorGravado } from "./gravado";
import type { Provedor } from "./provedor";

const banco: BancoD1 = {
  prepare: () => ({ bind: () => banco.prepare("") }),
  batch: () => Promise.resolve([]),
};
const codigo = "c".repeat(32);
const provedorFalso: Provedor = {
  nome: "falso",
  modelo: null,
  responder: () => Promise.reject(new Error("não deveria responder")),
};

function ambiente(extras: AmbienteDoAssistente = {}): AmbienteDoAssistente {
  return {
    USO_ASSISTENTE: banco,
    ASSISTENTE_CODIGO: codigo,
    ANTHROPIC_API_KEY: "chave-de-teste",
    ...extras,
  };
}

describe("configurarAssistente", () => {
  it("com banco, código e chave, liga a Anthropic com os limites padrão", () => {
    const criar = vi.fn(() => provedorFalso);

    const config = configurarAssistente(ambiente(), criar);

    expect(config).toEqual({
      ok: true,
      valor: { codigo, banco, provedor: provedorFalso, limites: limitesPadrao },
    });
    expect(criar).toHaveBeenCalledWith({ apiKey: "chave-de-teste" });
    expect(limitesPadrao).toEqual({ porDia: 30, porMes: 300 });
  });

  it("o padrão de verdade é o provedor da Anthropic", () => {
    const config = configurarAssistente(ambiente());

    expect(config.ok && config.valor.provedor.nome).toBe("anthropic");
  });

  // spec 0001 CA-35
  it("com o provedor gravado, não precisa da chave e não cria cliente da Anthropic", () => {
    const criar = vi.fn(() => provedorFalso);

    const config = configurarAssistente(
      ambiente({ ASSISTENTE_PROVEDOR: "gravado", ANTHROPIC_API_KEY: "" }),
      criar,
    );

    expect(config.ok && config.valor.provedor).toBe(provedorGravado);
    expect(criar).not.toHaveBeenCalled();
  });

  // spec 0001 CA-34
  it.each([
    ["sem-banco", { USO_ASSISTENTE: undefined }],
    ["sem-codigo", { ASSISTENTE_CODIGO: undefined }],
    ["sem-codigo", { ASSISTENTE_CODIGO: "" }],
    ["codigo-curto", { ASSISTENTE_CODIGO: "c".repeat(31) }],
    ["sem-chave", { ANTHROPIC_API_KEY: undefined }],
    ["sem-chave", { ANTHROPIC_API_KEY: "" }],
  ] as const)("fica desligado (%s) quando falta algo", (motivo, falta) => {
    const env: AmbienteDoAssistente = { ...ambiente() };
    for (const [nome, valor] of Object.entries(falta)) {
      if (valor === undefined) delete env[nome as keyof AmbienteDoAssistente];
      else Object.assign(env, { [nome]: valor });
    }

    expect(configurarAssistente(env, () => provedorFalso)).toEqual({ ok: false, erro: motivo });
  });

  it.each([
    [
      { ASSISTENTE_LIMITE_DIA: "10", ASSISTENTE_LIMITE_MES: "100" },
      { porDia: 10, porMes: 100 },
    ],
    [
      { ASSISTENTE_LIMITE_DIA: "100", ASSISTENTE_LIMITE_MES: "1000" },
      { porDia: 100, porMes: 1000 },
    ],
    [{ ASSISTENTE_LIMITE_DIA: "101", ASSISTENTE_LIMITE_MES: "1001" }, limitesPadrao],
    [{ ASSISTENTE_LIMITE_DIA: "0", ASSISTENTE_LIMITE_MES: "-5" }, limitesPadrao],
    [{ ASSISTENTE_LIMITE_DIA: "3.5", ASSISTENTE_LIMITE_MES: "trinta" }, limitesPadrao],
    [{ ASSISTENTE_LIMITE_DIA: "", ASSISTENTE_LIMITE_MES: "999999" }, limitesPadrao],
  ])("lê os limites das variáveis %j, com teto contra erro de digitação", (vars, esperado) => {
    const config = configurarAssistente(ambiente(vars), () => provedorFalso);

    expect(config.ok && config.valor.limites).toEqual(esperado);
  });
});
