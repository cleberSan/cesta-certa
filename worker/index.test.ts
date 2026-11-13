import { afterEach, describe, expect, it, vi } from "vitest";
import { rotaDoAssistente } from "../src/shared/contratos/assistente";
import { ehProblema, rotaDaConsulta } from "../src/shared/contratos/nfce";
import type { BancoD1 } from "./assistente/cota";
import worker, { type Env } from "./index";
import { linkSp } from "./nfce/fixtures/chaves";
import { paginaSp } from "./nfce/fixtures/pagina-sp";

const origem = "https://cesta-certa.exemplo.workers.dev";

function ambiente() {
  const pedidos: string[] = [];
  const env: Env = {
    ASSETS: {
      fetch: async (request) => {
        pedidos.push(new URL(request.url).pathname);
        return new Response("arquivo", { status: 200 });
      },
    },
  };
  return { env, pedidos };
}

describe("Worker", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["/", "/nota", "/apidoc", "/api-nova", "/naoexiste"])(
    "repassa %s aos arquivos do site",
    async (caminho) => {
      const { env, pedidos } = ambiente();

      const resposta = await worker.fetch(new Request(`${origem}${caminho}`), env);

      expect(await resposta.text()).toBe("arquivo");
      expect(pedidos).toEqual([caminho]);
    },
  );

  it.each(["/api", "/api/", "/api/outra", "/api/nfce/consultar/extra"])(
    "responde %s pela API, sem tocar nos arquivos",
    async (caminho) => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const { env, pedidos } = ambiente();

      const resposta = await worker.fetch(new Request(`${origem}${caminho}`), env);

      expect(resposta.status).toBe(404);
      const corpo: unknown = await resposta.json();
      expect(ehProblema(corpo) && corpo.code).toBe("requisicao.rota-desconhecida");
      expect(pedidos).toEqual([]);
    },
  );

  it("gera um identificador novo a cada requisição", async () => {
    const { env } = ambiente();
    const pedir = () => worker.fetch(new Request(`${origem}/api/x`), env);

    const [primeira, segunda] = await Promise.all([pedir(), pedir()]);

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(primeira.headers.get("X-Correlation-Id")).toMatch(uuid);
    expect(segunda.headers.get("X-Correlation-Id")).toMatch(uuid);
    expect(primeira.headers.get("X-Correlation-Id")).not.toBe(
      segunda.headers.get("X-Correlation-Id"),
    );
  });

  it("consulta a nota pela rede real do runtime e registra uma linha de log", async () => {
    const rede = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(paginaSp(), { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { env } = ambiente();

    const resposta = await worker.fetch(
      new Request(`${origem}${rotaDaConsulta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origem },
        body: JSON.stringify({ url: linkSp() }),
      }),
      env,
    );

    expect(resposta.status).toBe(200);
    expect(rede).toHaveBeenCalledTimes(1);
    expect(String(rede.mock.calls[0]?.[0])).toMatch(/^https:\/\/www\.nfce\.fazenda\.sp\.gov\.br\//);
    expect(rede.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "manual" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      evento: "nfce.consulta",
      resultado: "ok",
      itens: 3,
    });
  });

  it("passa o binding de limite à API quando ele existe", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const chaves: string[] = [];
    const env: Env = {
      ...ambiente().env,
      LIMITE_DA_NOTA: {
        limit: async ({ key }) => {
          chaves.push(key);
          return { success: false };
        },
      },
    };

    const resposta = await worker.fetch(
      new Request(`${origem}${rotaDaConsulta}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origem,
          "CF-Connecting-IP": "198.51.100.4",
        },
        body: JSON.stringify({ url: linkSp() }),
      }),
      env,
    );

    expect(resposta.status).toBe(429);
    expect(chaves).toEqual([`${rotaDaConsulta} 198.51.100.4`]);
  });

  // spec 0001 CA-34
  it("sem o banco e os segredos no ambiente, o assistente responde 503 e diz o motivo no log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { env } = ambiente();

    const resposta = await worker.fetch(
      new Request(`${origem}${rotaDoAssistente}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origem },
        body: JSON.stringify({ pergunta: "Oi", contexto: {} }),
      }),
      env,
    );

    expect(resposta.status).toBe(503);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      evento: "assistente",
      resultado: "indisponivel",
      motivo: "sem-banco",
    });
  });

  // spec 0001 CA-35
  it("com o provedor gravado, responde pelo ambiente sem chave da Anthropic", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const rede = vi.spyOn(globalThis, "fetch");
    const codigo = "codigo-do-ambiente-de-teste-com-40-letras";
    const banco: BancoD1 = {
      prepare: () => ({ bind: () => banco.prepare("") }),
      batch: async () => [{}, {}, { results: [{ usadas: 1 }] }, { results: [{ dia: 1, mes: 1 }] }],
    };
    const env: Env = {
      ...ambiente().env,
      USO_ASSISTENTE: banco,
      ASSISTENTE_CODIGO: codigo,
      ASSISTENTE_PROVEDOR: "gravado",
    };

    const resposta = await worker.fetch(
      new Request(`${origem}${rotaDoAssistente}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origem,
          Authorization: `Bearer ${codigo}`,
        },
        body: JSON.stringify({ pergunta: "Por que essa opção?", contexto: {} }),
      }),
      env,
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      texto: expect.stringContaining("resposta gravada") as string,
      limite: { restantesHoje: 29, restantesMes: 299, voltaEm: null },
    });
    expect(rede).not.toHaveBeenCalled();
  });
});
