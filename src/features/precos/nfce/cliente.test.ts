import { describe, expect, it } from "vitest";
import { codigosDeErro, rotaDaConsulta, type NotaConsultada } from "../../../shared/contratos/nfce";
import {
  consultarNota,
  formatarCnpj,
  formatarEmissao,
  formatarQuantidade,
  mensagemDaFalha,
  somarItens,
  type CodigoDaFalha,
  type Enviar,
} from "./cliente";

const traceId = "0b9d6f0e-1111-4222-8333-444455556666";
const link = "https://www.nfce.fazenda.sp.gov.br/qrcode?p=chave|2|1|1|hash";

const nota: NotaConsultada = {
  uf: "SP",
  mercado: { cnpj: "11222333000181", nome: "MERCADO EXEMPLO LTDA", endereco: null },
  emitidaEm: "2026-11-07T10:15:30",
  itens: [
    {
      descricao: "CAFE SOLUVEL 200G",
      codigo: "7890000000017",
      quantidade: "2",
      unidade: "UN",
      precoUnitarioCentavos: 1899,
      totalCentavos: 3798,
    },
    {
      descricao: "QUEIJO MUCARELA KG",
      codigo: "2000340",
      quantidade: "0.345",
      unidade: "KG",
      precoUnitarioCentavos: 3890,
      totalCentavos: 1342,
    },
  ],
  itensNaoLidos: 0,
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "X-Correlation-Id": traceId },
  });
}

function problema(code: string, status: number, extras: Record<string, unknown> = {}): Response {
  return json(
    { type: "about:blank", title: "Erro", status, detail: "Detalhe.", code, traceId, ...extras },
    status,
  );
}

const respondendo =
  (resposta: Response): Enviar =>
  async () =>
    resposta;

describe("consultarNota", () => {
  it("envia só o link, em JSON, sem credenciais nem referência da página", async () => {
    const chamadas: { rota: string; init: RequestInit }[] = [];
    const enviar: Enviar = async (rota, init) => {
      chamadas.push({ rota, init });
      return json(nota);
    };

    const resultado = await consultarNota(`  ${link}\n`, enviar);

    expect(resultado).toEqual({ ok: true, valor: nota });
    expect(chamadas).toHaveLength(1);
    const { rota, init } = chamadas[0]!;
    expect(rota).toBe(rotaDaConsulta);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(JSON.parse(String(init.body))).toEqual({ url: link });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["vazio", "", "app.link-vazio"],
    ["só espaços", "  \n ", "app.link-vazio"],
    ["grande demais", `https://x.example/?p=${"a".repeat(2100)}`, "app.link-grande"],
  ])("não chama o servidor com o link %s", async (_caso, texto, code) => {
    let chamou = false;
    const enviar: Enviar = async () => {
      chamou = true;
      return json(nota);
    };

    const resultado = await consultarNota(texto, enviar);

    expect(resultado).toEqual({ ok: false, erro: { code, traceId: null, diagnostico: undefined } });
    expect(chamou).toBe(false);
  });

  it("repassa o código, o identificador e o diagnóstico do servidor", async () => {
    const diagnostico = { sinais: { captcha: true } };

    const resultado = await consultarNota(
      link,
      respondendo(problema("nfce.captcha", 502, { diagnostico })),
    );

    expect(resultado).toEqual({ ok: false, erro: { code: "nfce.captcha", traceId, diagnostico } });
  });

  it("avisa que está sem conexão quando a chamada falha", async () => {
    const enviar: Enviar = async () => {
      throw new TypeError("Failed to fetch");
    };
    const resultado = await consultarNota(link, enviar);
    expect(!resultado.ok && resultado.erro.code).toBe("app.sem-conexao");
  });

  it("desiste quando o servidor não responde dentro do limite", async () => {
    const enviar: Enviar = (_rota, init) =>
      new Promise((_resolver, rejeitar) => {
        init.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
      });

    const resultado = await consultarNota(link, enviar, 20);

    expect(!resultado.ok && resultado.erro.code).toBe("app.tempo-esgotado");
  });

  it.each([
    ["sucesso que não é JSON", new Response("<html>", { status: 200 })],
    ["sucesso fora do contrato", json({ uf: "SP", itens: "muitos" })],
    ["sucesso com item fora do contrato", json({ ...nota, itens: [{ descricao: 1 }] })],
    ["erro que não é ProblemDetails", json({ mensagem: "caiu" }, 500)],
    ["erro com código desconhecido", problema("outro.codigo", 500)],
    ["erro em HTML, como o de um proxy", new Response("<h1>502</h1>", { status: 502 })],
  ])("trata %s como resposta inesperada", async (_caso, resposta) => {
    const resultado = await consultarNota(link, respondendo(resposta));
    expect(!resultado.ok && resultado.erro.code).toBe("app.resposta-inesperada");
  });

  it("guarda o identificador do cabeçalho quando o corpo não pôde ser lido", async () => {
    const resposta = new Response("<h1>502</h1>", {
      status: 502,
      headers: { "X-Correlation-Id": traceId },
    });
    const resultado = await consultarNota(link, respondendo(resposta));
    expect(!resultado.ok && resultado.erro.traceId).toBe(traceId);
  });
});

describe("mensagemDaFalha", () => {
  const todos: CodigoDaFalha[] = [
    ...codigosDeErro,
    "app.link-vazio",
    "app.link-grande",
    "app.sem-conexao",
    "app.tempo-esgotado",
    "app.resposta-inesperada",
  ];

  it.each(todos)("tem título e texto para %s", (code) => {
    const mensagem = mensagemDaFalha(code);
    expect(mensagem.titulo.length).toBeGreaterThan(10);
    expect(mensagem.texto.length).toBeGreaterThan(10);
    // A mensagem é para a pessoa: sem código, sem status e sem termo técnico do servidor.
    expect(`${mensagem.titulo} ${mensagem.texto}`).not.toMatch(/\b(HTTP|JSON|\d{3}|undefined)\b/);
  });

  // spec 0001 CA-13
  it.each<CodigoDaFalha>([
    "nfce.indisponivel",
    "nfce.captcha",
    "nfce.formato-desconhecido",
    "nfce.tempo-esgotado",
    "nfce.uf-sem-leitor",
    "erro.interno",
    "app.tempo-esgotado",
    "app.resposta-inesperada",
  ])("oferece digitar os preços quando a nota não pôde ser lida: %s", (code) => {
    expect(mensagemDaFalha(code).ofereceDigitar).toBe(true);
  });

  it.each<CodigoDaFalha>([
    "app.link-vazio",
    "app.link-grande",
    "app.sem-conexao",
    "nfce.link-invalido",
    "nfce.host-nao-permitido",
    "requisicao.invalida",
    "requisicao.origem-nao-permitida",
  ])("pede para corrigir e tentar de novo, sem oferecer digitar: %s", (code) => {
    expect(mensagemDaFalha(code).ofereceDigitar).toBe(false);
  });

  it("diz qual é o único site consultado quando recusa o endereço", () => {
    expect(mensagemDaFalha("nfce.host-nao-permitido").texto).toContain(
      "www.nfce.fazenda.sp.gov.br",
    );
  });
});

describe("formatação", () => {
  it.each([
    ["11222333000181", "11.222.333/0001-81"],
    ["12ABC34501DE35", "12.ABC.345/01DE-35"],
    ["123", "123"],
    ["", ""],
  ])("formata o CNPJ %s", (cnpj, esperado) => {
    expect(formatarCnpj(cnpj)).toBe(esperado);
  });

  it.each([
    ["2026-11-07T10:15:30", "07/11/2026 às 10:15"],
    ["2026-11-07", "07/11/2026"],
    [null, null],
    ["ontem", null],
  ])("formata a emissão %s", (emitidaEm, esperado) => {
    expect(formatarEmissao(emitidaEm)).toBe(esperado);
  });

  it("mostra a quantidade com vírgula", () => {
    expect(formatarQuantidade("0.345")).toBe("0,345");
    expect(formatarQuantidade("2")).toBe("2");
  });

  it("soma os totais dos itens em centavos", () => {
    expect(somarItens(nota)).toBe(5140);
    expect(somarItens({ ...nota, itens: [] })).toBe(0);
  });
});
