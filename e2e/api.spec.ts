import { expect, test, type APIResponse } from "@playwright/test";
import { chaveSintetica, consultaRoute } from "./routes";

/**
 * A API no Worker de verdade (workerd), pelo mesmo caminho da produção. Só entram aqui
 * pedidos que o servidor recusa antes de consultar a Secretaria da Fazenda: a suíte não faz
 * requisição a site de terceiro. A leitura de uma nota inteira é coberta, com rede simulada,
 * em worker/api.test.ts.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function esperarProblema(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  const headers = response.headers();
  expect(headers["content-type"]).toBe("application/problem+json; charset=utf-8");
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["access-control-allow-origin"]).toBeUndefined();
  expect(headers["x-correlation-id"]).toMatch(uuid);

  const body = (await response.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ type: "about:blank", status, code });
  expect(body["traceId"]).toBe(headers["x-correlation-id"]);
  expect(typeof body["detail"]).toBe("string");
  return body;
}

// spec 0001 CA-12
test.describe("link fora da lista de endereços oficiais", () => {
  const p = `${chaveSintetica}|2|1|1|A1B2C3D4E5F60718293A4B5C6D7E8F9012345678`;

  for (const [caso, url, code] of [
    ["outro site", `https://evil.example/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    [
      "endereço interno",
      `http://169.254.169.254/latest/meta-data?p=${p}`,
      "nfce.host-nao-permitido",
    ],
    ["localhost", `http://127.0.0.1:8787/api/nfce/consultar?p=${p}`, "nfce.host-nao-permitido"],
    [
      "host oficial como subdomínio de outro",
      `https://www.nfce.fazenda.sp.gov.br.evil.example/qrcode?p=${p}`,
      "nfce.host-nao-permitido",
    ],
    [
      "caminho fora da consulta por QR Code",
      `https://www.nfce.fazenda.sp.gov.br/admin?p=${p}`,
      "nfce.link-invalido",
    ],
    [
      "chave com dígito verificador errado",
      `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${chaveSintetica.slice(0, 43)}9|2|1`,
      "nfce.link-invalido",
    ],
    ["protocolo javascript", "javascript:alert(1)", "nfce.link-invalido"],
  ] as const) {
    test(`recusa ${caso} com 422`, async ({ request }) => {
      const response = await request.post(consultaRoute, { data: { url } });
      const body = await esperarProblema(response, 422, code);
      // A frase de erro não repete o que foi enviado.
      expect(JSON.stringify(body)).not.toMatch(/evil|169\.254|127\.0\.0\.1|admin|alert/);
    });
  }
});

test.describe("pedido fora do contrato", () => {
  test("GET responde 405 e diz que a rota aceita POST", async ({ request }) => {
    const response = await request.get(consultaRoute);
    await esperarProblema(response, 405, "requisicao.metodo-nao-permitido");
    expect(response.headers()["allow"]).toBe("POST");
  });

  test("preflight de outra origem não recebe cabeçalho de CORS", async ({ request }) => {
    const response = await request.fetch(consultaRoute, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    await esperarProblema(response, 405, "requisicao.metodo-nao-permitido");
  });

  test("POST de outra origem responde 403", async ({ request }) => {
    const response = await request.post(consultaRoute, {
      data: { url: "https://evil.example" },
      headers: { Origin: "https://evil.example" },
    });
    await esperarProblema(response, 403, "requisicao.origem-nao-permitida");
  });

  test("POST marcado pelo navegador como vindo de outro site responde 403", async ({ request }) => {
    const response = await request.post(consultaRoute, {
      data: { url: "https://evil.example" },
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    await esperarProblema(response, 403, "requisicao.origem-nao-permitida");
  });

  test("corpo que não é JSON declarado responde 415", async ({ request }) => {
    const response = await request.post(consultaRoute, {
      data: "url=https://evil.example",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    await esperarProblema(response, 415, "requisicao.tipo-nao-suportado");
  });

  test("JSON quebrado ou sem o campo url responde 400", async ({ request }) => {
    for (const data of ['{"url":', "[]", '{"link":"x"}', '{"url":42}']) {
      const response = await request.post(consultaRoute, {
        data,
        headers: { "Content-Type": "application/json" },
      });
      await esperarProblema(response, 400, "requisicao.invalida");
    }
  });

  test("corpo maior que 4 KB responde 413", async ({ request }) => {
    const response = await request.post(consultaRoute, {
      data: { url: `https://evil.example/?x=${"a".repeat(5000)}` },
    });
    await esperarProblema(response, 413, "requisicao.grande-demais");
  });

  test("rota que não existe em /api responde 404 em JSON, não a página do site", async ({
    request,
  }) => {
    for (const path of ["/api", "/api/", "/api/outra", "/api/nfce/consultar/extra"]) {
      const response = await request.post(path, { data: {} });
      await esperarProblema(response, 404, "requisicao.rota-desconhecida");
    }
  });
});
