import { describe, expect, it } from "vitest";
import { ehProblema } from "../src/shared/contratos/nfce";
import worker, { type Env } from "./index";

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
});
