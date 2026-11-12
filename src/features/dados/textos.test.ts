import { describe, expect, it } from "vitest";
import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import type { ErroDaImportacao } from "./copia";
import {
  avisoDaCopia,
  avisoDeRecusados,
  contarRegistros,
  dataDaCopia,
  descreverResumo,
  limiteEmMb,
  mensagemDaExportacao,
  mensagemDaImportacao,
} from "./textos";

describe("descreverResumo", () => {
  it.each([
    [{ listas: 0, itens: 0, mercados: 0 }, "nenhuma lista"],
    [{ listas: 1, itens: 0, mercados: 0 }, "1 lista sem itens"],
    [{ listas: 3, itens: 0, mercados: 0 }, "3 listas sem itens"],
    [{ listas: 1, itens: 1, mercados: 0 }, "1 lista e 1 item"],
    [{ listas: 2, itens: 31, mercados: 0 }, "2 listas e 31 itens"],
    [{ listas: 1, itens: 3, mercados: 1 }, "1 lista e 3 itens, mais 1 mercado cadastrado"],
    [{ listas: 0, itens: 0, mercados: 2 }, "nenhuma lista, mais 2 mercados cadastrados"],
  ])("descreve %j como %j", (resumo, esperado) => {
    expect(descreverResumo(resumo)).toBe(esperado);
  });
});

describe("contarRegistros", () => {
  it.each([
    [1, "1 registro"],
    [2, "2 registros"],
    [12, "12 registros"],
  ])("escreve %i como %j", (quantos, esperado) => {
    expect(contarRegistros(quantos)).toBe(esperado);
  });
});

// spec 0001 CA-04
describe("mensagemDaImportacao", () => {
  const recusas: readonly ErroDaImportacao[] = [
    { tipo: "arquivo.grande-demais" },
    { tipo: "arquivo.ilegivel" },
    { tipo: "arquivo.outro-formato" },
    { tipo: "arquivo.versao-desconhecida", versao: 3 },
    { tipo: "arquivo.registros-invalidos", quantos: 2 },
  ];

  it.each(recusas)("diz o motivo de $tipo e que nada foi alterado", (erro) => {
    const mensagem = mensagemDaImportacao(erro);

    expect(mensagem.endsWith("Nada foi alterado.")).toBe(true);
    expect(mensagem).not.toMatch(/undefined|arquivo\.[a-z]/);
  });

  it("tem uma frase diferente para cada motivo", () => {
    expect(new Set(recusas.map(mensagemDaImportacao)).size).toBe(recusas.length);
  });

  it("diz o limite de tamanho", () => {
    expect(limiteEmMb).toBe(5);
    expect(mensagemDaImportacao({ tipo: "arquivo.grande-demais" })).toContain("mais de 5 MB");
  });

  it("diz a versão do arquivo e a que o app lê", () => {
    const mensagem = mensagemDaImportacao({ tipo: "arquivo.versao-desconhecida", versao: 3 });

    expect(mensagem).toContain("versão 3 do formato");
    expect(mensagem).toContain("lê até a versão 2");
  });

  it.each([
    [1, "1 registro fora do formato"],
    [4, "4 registros fora do formato"],
  ])("diz quantos registros estão fora do formato (%i)", (quantos, trecho) => {
    expect(mensagemDaImportacao({ tipo: "arquivo.registros-invalidos", quantos })).toContain(
      trecho,
    );
  });

  it.each<ErroDoBanco>(["sem-espaco", "fechado", "falhou"])(
    "usa a frase do armazenamento quando a gravação falha (%s)",
    (motivo) => {
      expect(mensagemDaImportacao({ tipo: "armazenamento", motivo })).toBe(mensagemDoBanco(motivo));
    },
  );
});

// spec 0001 CA-04
describe("mensagemDaExportacao", () => {
  it("explica que a cópia grande demais não poderia voltar", () => {
    const mensagem = mensagemDaExportacao({ tipo: "arquivo.grande-demais" });

    expect(mensagem).toContain("5 MB");
    expect(mensagem).toContain("Exclua listas antigas");
  });

  it("usa a frase do armazenamento quando a leitura falha", () => {
    expect(mensagemDaExportacao({ tipo: "armazenamento", motivo: "fechado" })).toBe(
      mensagemDoBanco("fechado"),
    );
  });
});

describe("avisos da cópia", () => {
  it("diz o nome do arquivo e o que ele tem", () => {
    const aviso = avisoDaCopia({
      nome: "cesta-certa-2026-11-11.json",
      resumo: { listas: 2, itens: 31, mercados: 0 },
    });

    expect(aviso).toBe("Cópia gerada: cesta-certa-2026-11-11.json, com 2 listas e 31 itens.");
  });

  it.each([
    [1, "1 registro guardado neste aparelho está fora do formato e não entra na cópia."],
    [3, "3 registros guardados neste aparelho estão fora do formato e não entram na cópia."],
  ])("avisa de %i registro(s) que não entram na cópia", (quantos, esperado) => {
    expect(avisoDeRecusados(quantos)).toBe(esperado);
  });
});

describe("dataDaCopia", () => {
  it("escreve a data no formato brasileiro, no fuso de quem lê", () => {
    expect(dataDaCopia("2026-11-12T01:30:00.000Z", "America/Sao_Paulo")).toBe("11/11/2026");
    expect(dataDaCopia("2026-11-12T01:30:00.000Z", "UTC")).toBe("12/11/2026");
  });

  it("sem fuso informado, usa o do aparelho", () => {
    expect(dataDaCopia("2026-11-11T15:30:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
