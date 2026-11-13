import { describe, expect, it } from "vitest";
import { apiSecurityHeaders } from "../src/config/security";
import { ehNotaConsultada, ehProblema, rotaDaConsulta } from "../src/shared/contratos/nfce";
import { falha } from "../src/shared/resultado";
import { tratarApi, type DependenciasDaApi } from "./api";
import type { Buscar } from "./nfce/buscar";
import { chaves, hashQr, hostSp, linkSp } from "./nfce/fixtures/chaves";
import {
  consumidorSintetico,
  mercadoSintetico,
  paginaComCaptcha,
  paginaSemNota,
  paginaSp,
} from "./nfce/fixtures/pagina-sp";
import type { Evento } from "./observabilidade/registro";

const origem = "https://cesta-certa.exemplo.workers.dev";
const traceId = "0b9d6f0e-1111-4222-8333-444455556666";

interface Cenario {
  deps: DependenciasDaApi;
  eventos: Evento[];
  buscas: string[];
}

/** Dependências controladas: rede simulada, relógio que anda 25 ms por leitura e log em memória. */
function cenario(responder: Buscar = async () => paginaHtml(paginaSp())): Cenario {
  const eventos: Evento[] = [];
  const buscas: string[] = [];
  let relogio = 1_000;
  return {
    eventos,
    buscas,
    deps: {
      buscar: (url, init) => {
        buscas.push(url);
        return responder(url, init);
      },
      registrar: (evento) => eventos.push(evento),
      agora: () => (relogio += 25),
      gerarId: () => traceId,
      assistente: () => falha("sem-banco"),
      limites: { tempoMs: 200, bytes: 512 * 1024, saltos: 2 },
    },
  };
}

function paginaHtml(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function pedido(corpo: unknown, cabecalhos: Record<string, string> = {}): Request {
  return new Request(`${origem}${rotaDaConsulta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origem, ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function problemaDe(resposta: Response) {
  expect(resposta.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
  const corpo: unknown = await resposta.json();
  if (!ehProblema(corpo)) throw new Error(`Não é ProblemDetails: ${JSON.stringify(corpo)}`);
  expect(corpo.status).toBe(resposta.status);
  expect(corpo.traceId).toBe(traceId);
  return corpo;
}

function esperarCabecalhosDaApi(resposta: Response): void {
  for (const [nome, valor] of Object.entries(apiSecurityHeaders)) {
    expect(resposta.headers.get(nome), nome).toBe(valor);
  }
  expect(resposta.headers.get("X-Correlation-Id")).toBe(traceId);
  expect(resposta.headers.get("Access-Control-Allow-Origin")).toBeNull();
}

describe("POST /api/nfce/consultar: nota lida", () => {
  it("devolve o mercado, a data e os itens no formato do contrato", async () => {
    const { deps, buscas } = cenario();

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    esperarCabecalhosDaApi(resposta);
    const nota: unknown = await resposta.json();
    expect(ehNotaConsultada(nota)).toBe(true);
    expect(nota).toMatchObject({
      uf: "SP",
      mercado: { cnpj: "11222333000181", nome: mercadoSintetico.nome },
      emitidaEm: "2026-11-07T10:15:30",
      itensNaoLidos: 0,
    });
    expect((nota as { itens: unknown[] }).itens).toHaveLength(3);
    expect(buscas).toEqual([
      `https://${hostSp}/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chaves.sp}|2|1|1|${hashQr}`,
    ]);
  });

  it("registra um evento por consulta, só com metadados", async () => {
    const { deps, eventos } = cenario();

    await tratarApi(pedido({ url: linkSp() }), deps);

    expect(eventos).toEqual([
      {
        evento: "nfce.consulta",
        traceId,
        resultado: "ok",
        duracaoMs: 25,
        uf: "SP",
        chave: expect.stringMatching(/^[0-9a-f]{12}$/),
        statusOrigem: 200,
        saltos: 0,
        bytes: expect.any(Number),
        itens: 3,
        itensNaoLidos: 0,
      },
    ]);
  });

  it("dá o mesmo resumo para a mesma chave e outro para chave diferente", async () => {
    const { deps, eventos } = cenario();

    await tratarApi(pedido({ url: linkSp() }), deps);
    await tratarApi(pedido({ url: linkSp(chaves.sp, "/qrcode") }), deps);
    await tratarApi(pedido({ url: linkSp(chaves.spOutubro) }), deps);

    const [primeira, segunda, terceira] = eventos.map((evento) => evento["chave"]);
    expect(primeira).toBe(segunda);
    expect(terceira).not.toBe(primeira);
  });

  it("aceita Content-Type com charset e campos a mais no corpo", async () => {
    const { deps } = cenario();

    const resposta = await tratarApi(
      pedido({ url: linkSp(), admin: true }, { "Content-Type": "application/json; charset=utf-8" }),
      deps,
    );

    expect(resposta.status).toBe(200);
  });

  it("atende cliente que não é navegador (sem Origin nem Sec-Fetch-Site)", async () => {
    const { deps } = cenario();
    const semOrigem = new Request(`${origem}${rotaDaConsulta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkSp() }),
    });

    expect((await tratarApi(semOrigem, deps)).status).toBe(200);
    expect(
      (await tratarApi(pedido({ url: linkSp() }, { "Sec-Fetch-Site": "same-origin" }), deps))
        .status,
    ).toBe(200);
  });
});

// spec 0001 CA-11
describe("POST /api/nfce/consultar: nada de consumidor nem de link na resposta e no log", () => {
  const sensiveis = [
    consumidorSintetico.cpf,
    consumidorSintetico.cpf.replace(/\D/g, ""),
    consumidorSintetico.nome,
    hashQr,
    chaves.sp,
    "p=",
    hostSp,
  ];

  it("na consulta que deu certo", async () => {
    const { deps, eventos } = cenario();

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    const corpo = await resposta.text();
    const log = JSON.stringify(eventos);
    for (const valor of sensiveis) {
      expect(corpo, `resposta com ${valor}`).not.toContain(valor);
      expect(log, `log com ${valor}`).not.toContain(valor);
    }
    // O log não leva nem os dados do mercado, que a resposta pode levar.
    expect(log).not.toContain("11222333000181");
    expect(log).not.toContain(mercadoSintetico.nome);
    expect(log).not.toContain("CAFE");
  });

  it.each([
    ["formato desconhecido", () => paginaHtml(paginaSp({ itens: [] }))],
    ["captcha", () => paginaHtml(paginaComCaptcha)],
    ["erro da origem", () => paginaHtml(paginaSp(), 500)],
    ["falha de rede", () => Promise.reject(new TypeError(`fetch failed ${linkSp()}`))],
  ])("na consulta que falhou por %s", async (_caso, responder) => {
    const { deps, eventos } = cenario(async () => responder());

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    const corpo = await resposta.text();
    const log = JSON.stringify(eventos);
    expect(resposta.ok).toBe(false);
    for (const valor of [...sensiveis, "11222333000181", mercadoSintetico.nome]) {
      expect(corpo, `resposta com ${valor}`).not.toContain(valor);
      expect(log, `log com ${valor}`).not.toContain(valor);
    }
  });

  it("no link recusado, que não é repetido na resposta nem no log", async () => {
    const { deps, eventos } = cenario();
    const link = `https://evil.example/segredo?p=${chaves.sp}|2|1|1|${hashQr}&cpf=${consumidorSintetico.cpf}`;

    const resposta = await tratarApi(pedido({ url: link }), deps);

    const tudo = (await resposta.text()) + JSON.stringify(eventos);
    for (const valor of ["evil", "segredo", hashQr, chaves.sp, consumidorSintetico.cpf]) {
      expect(tudo).not.toContain(valor);
    }
  });
});

// spec 0001 CA-12
describe("POST /api/nfce/consultar: link fora da lista permitida", () => {
  const p = `${chaves.sp}|2|1|1|${hashQr}`;

  it.each([
    ["outro site", `https://evil.example/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    ["host parecido", `https://${hostSp}.evil.example/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    ["host no usuário", `https://${hostSp}@evil.example/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    [
      "homologação",
      `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${p}`,
      "nfce.host-nao-permitido",
    ],
    ["IP interno", `https://10.0.0.1/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    ["localhost", `http://localhost/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    ["metadados de nuvem", "http://169.254.169.254/latest/meta-data/", "nfce.host-nao-permitido"],
    ["porta", `https://${hostSp}:8443/qrcode?p=${p}`, "nfce.host-nao-permitido"],
    ["outro caminho no site oficial", `https://${hostSp}/admin?p=${p}`, "nfce.link-invalido"],
    [
      "chave com dígito errado",
      `https://${hostSp}/qrcode?p=${chaves.sp.slice(0, 43)}5|2|1`,
      "nfce.link-invalido",
    ],
    ["protocolo file", "file:///etc/passwd", "nfce.link-invalido"],
    ["texto que não é link", "nota do mercado", "nfce.link-invalido"],
    ["texto vazio", "", "nfce.link-invalido"],
  ])("recusa %s sem fazer nenhuma requisição externa", async (_caso, url, codigo) => {
    const { deps, buscas, eventos } = cenario();

    const resposta = await tratarApi(pedido({ url }), deps);

    expect(resposta.status).toBe(422);
    expect((await problemaDe(resposta)).code).toBe(codigo);
    esperarCabecalhosDaApi(resposta);
    expect(buscas).toEqual([]);
    expect(eventos).toEqual([
      { evento: "nfce.consulta", traceId, resultado: codigo, duracaoMs: 25 },
    ]);
  });

  it("não segue o redirecionamento da origem para fora do site oficial", async () => {
    const { deps, buscas } = cenario(
      async () =>
        new Response(null, { status: 302, headers: { Location: "https://evil.example/nota" } }),
    );

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.indisponivel");
    expect(problema.diagnostico).toEqual({
      motivo: "redirecionamento",
      status: 302,
      saltos: 0,
      caminho: null,
    });
    expect(buscas).toHaveLength(1);
  });
});

// spec 0001 CA-13
describe("POST /api/nfce/consultar: falhas que levam à digitação", () => {
  it("nota de UF sem leitor", async () => {
    const { deps, buscas } = cenario();
    const url = `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${chaves.mg}|2|1|1|${hashQr}`;

    const resposta = await tratarApi(pedido({ url }), deps);

    expect(resposta.status).toBe(422);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.uf-sem-leitor");
    expect(problema.detail).toBe("Ainda não há leitor para notas fiscais de MG.");
    expect(buscas).toEqual([]);
  });

  it.each([403, 404, 500, 503])("origem respondendo %d", async (status) => {
    const { deps, eventos } = cenario(async () => paginaHtml("<p>erro</p>", status));

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.indisponivel");
    expect(problema.diagnostico).toEqual({
      motivo: "status",
      status,
      saltos: 0,
      caminho: "/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx",
    });
    expect(eventos[0]).toMatchObject({
      resultado: "nfce.indisponivel",
      motivo: "status",
      statusOrigem: status,
      uf: "SP",
    });
  });

  it("falha de rede", async () => {
    const { deps } = cenario(() => Promise.reject(new TypeError("fetch failed")));

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    expect((await problemaDe(resposta)).code).toBe("nfce.indisponivel");
  });

  it("origem que passa do limite de tempo", async () => {
    const { deps, eventos } = cenario(
      (_url, init) =>
        new Promise((_resolver, rejeitar) => {
          init.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
        }),
    );
    deps.limites = { tempoMs: 30, bytes: 1_024, saltos: 2 };

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(504);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.tempo-esgotado");
    expect(problema.detail).toContain("8 segundos");
    expect(eventos[0]).toMatchObject({ resultado: "nfce.tempo-esgotado", motivo: "tempo" });
  });

  it("página que pede captcha", async () => {
    const { deps, eventos } = cenario(async () => paginaHtml(paginaComCaptcha));

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.captcha");
    expect(problema.diagnostico).toMatchObject({ sinais: { captcha: true } });
    expect(eventos[0]).toMatchObject({ resultado: "nfce.captcha", statusOrigem: 200 });
  });

  it("página em formato desconhecido, com diagnóstico só de estrutura", async () => {
    const { deps, eventos } = cenario(async () => paginaHtml(paginaSemNota));

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("nfce.formato-desconhecido");
    expect(problema.diagnostico).toMatchObject({
      status: 200,
      saltos: 0,
      codificacao: "utf-8",
      rotulos: { codigo: 0 },
      sinais: { captcha: false, naoEncontrada: true },
    });
    expect(eventos[0]).toMatchObject({
      resultado: "nfce.formato-desconhecido",
      bytes: expect.any(Number),
    });
  });

  it("página maior que o limite", async () => {
    const { deps } = cenario(async () => paginaHtml("a".repeat(2_000)));
    deps.limites = { tempoMs: 200, bytes: 1_024, saltos: 2 };

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(502);
    expect((await problemaDe(resposta)).diagnostico).toMatchObject({ motivo: "grande-demais" });
  });
});

describe("API: requisição recusada antes da consulta", () => {
  it("rota que não existe responde 404 em ProblemDetails", async () => {
    const { deps, buscas } = cenario();

    for (const caminho of ["/api", "/api/", "/api/outra", `${rotaDaConsulta}/`, "/api/nfce"]) {
      const resposta = await tratarApi(new Request(`${origem}${caminho}`), deps);
      expect(resposta.status, caminho).toBe(404);
      expect((await problemaDe(resposta)).code).toBe("requisicao.rota-desconhecida");
      esperarCabecalhosDaApi(resposta);
    }
    expect(buscas).toEqual([]);
  });

  it.each(["GET", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])(
    "método %s responde 405 com Allow",
    async (method) => {
      const { deps, buscas } = cenario();

      const resposta = await tratarApi(
        new Request(`${origem}${rotaDaConsulta}?url=${encodeURIComponent(linkSp())}`, { method }),
        deps,
      );

      expect(resposta.status).toBe(405);
      expect(resposta.headers.get("Allow")).toBe("POST");
      esperarCabecalhosDaApi(resposta);
      expect(buscas).toEqual([]);
    },
  );

  it.each([
    ["Origin de outro site", { Origin: "https://evil.example" }],
    ["Origin nula", { Origin: "null" }],
    ["Origin do mesmo host em http", { Origin: origem.replace("https", "http") }],
    ["Sec-Fetch-Site de outro site", { "Sec-Fetch-Site": "cross-site" }],
    ["Sec-Fetch-Site do mesmo site, outra origem", { "Sec-Fetch-Site": "same-site" }],
  ])("%s responde 403 e não consulta", async (_caso, cabecalhos) => {
    const { deps, buscas } = cenario();

    const resposta = await tratarApi(pedido({ url: linkSp() }, cabecalhos), deps);

    expect(resposta.status).toBe(403);
    expect((await problemaDe(resposta)).code).toBe("requisicao.origem-nao-permitida");
    expect(buscas).toEqual([]);
  });

  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "application/jsonp",
    "text/json",
  ])("Content-Type %s responde 415", async (tipo) => {
    const { deps, buscas } = cenario();

    const resposta = await tratarApi(pedido({ url: linkSp() }, { "Content-Type": tipo }), deps);

    expect(resposta.status).toBe(415);
    expect((await problemaDe(resposta)).code).toBe("requisicao.tipo-nao-suportado");
    expect(buscas).toEqual([]);
  });

  it("sem Content-Type responde 415", async () => {
    const { deps } = cenario();
    const semTipo = new Request(`${origem}${rotaDaConsulta}`, {
      method: "POST",
      body: new TextEncoder().encode(JSON.stringify({ url: linkSp() })),
    });

    expect((await tratarApi(semTipo, deps)).status).toBe(415);
  });

  it("corpo acima de 4 KB responde 413, pelo tamanho declarado ou pelo lido", async () => {
    const { deps, buscas } = cenario();
    const grande = JSON.stringify({ url: linkSp(), enchimento: "x".repeat(5_000) });

    const declarado = await tratarApi(pedido(grande, { "Content-Length": "5100" }), deps);
    const emPedacos = await tratarApi(
      new Request(`${origem}${rotaDaConsulta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new ReadableStream<Uint8Array>({
          pull(controlador) {
            controlador.enqueue(new TextEncoder().encode("x".repeat(1_500)));
          },
        }),
        // Corpo em fluxo exige esta opção no Node; o tipo ainda não a conhece.
        ...({ duplex: "half" } as RequestInit),
      }),
      deps,
    );

    for (const resposta of [declarado, emPedacos]) {
      expect(resposta.status).toBe(413);
      expect((await problemaDe(resposta)).code).toBe("requisicao.grande-demais");
    }
    expect(buscas).toEqual([]);
  });

  it.each([
    ["JSON quebrado", '{"url": '],
    ["corpo vazio", ""],
    ["lista", JSON.stringify([linkSp()])],
    ["texto JSON", JSON.stringify(linkSp())],
    ["nulo", "null"],
    ["sem o campo url", JSON.stringify({ link: linkSp() })],
    ["url numérica", JSON.stringify({ url: 123 })],
    ["url em objeto", JSON.stringify({ url: { href: linkSp() } })],
    ["url em lista", JSON.stringify({ url: [linkSp()] })],
  ])("%s responde 400", async (_caso, corpo) => {
    const { deps, buscas } = cenario();

    const resposta = await tratarApi(pedido(corpo), deps);

    expect(resposta.status).toBe(400);
    expect((await problemaDe(resposta)).code).toBe("requisicao.invalida");
    expect(buscas).toEqual([]);
  });

  it("corpo que não é UTF-8 responde 400", async () => {
    const { deps } = cenario();
    const invalido = new Request(`${origem}${rotaDaConsulta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d]),
    });

    expect((await tratarApi(invalido, deps)).status).toBe(400);
  });
});

describe("API: limite de requisições por cliente", () => {
  /** Contador em memória no lugar do binding da Cloudflare, com o mesmo contrato. */
  function contador(maximo: number) {
    const chaves: string[] = [];
    return {
      chaves,
      limite: {
        limit: async ({ key }: { key: string }) => {
          chaves.push(key);
          return { success: chaves.filter((chave) => chave === key).length <= maximo };
        },
      },
    };
  }

  it("conta pela rota e pelo IP que a Cloudflare informa, e recusa com 429 ao passar", async () => {
    const { deps, eventos, buscas } = cenario();
    const { chaves, limite } = contador(1);
    const comLimite = { ...deps, limite };
    const doCliente = { "CF-Connecting-IP": "203.0.113.7" };

    const primeira = await tratarApi(pedido({ url: linkSp() }, doCliente), comLimite);
    const segunda = await tratarApi(pedido({ url: linkSp() }, doCliente), comLimite);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(429);
    expect(segunda.headers.get("Retry-After")).toBe("60");
    esperarCabecalhosDaApi(segunda);
    expect((await problemaDe(segunda)).code).toBe("requisicao.muitas-consultas");
    expect(chaves).toEqual([`${rotaDaConsulta} 203.0.113.7`, `${rotaDaConsulta} 203.0.113.7`]);
    expect(buscas).toHaveLength(1);
    expect(eventos).toContainEqual({ evento: "api.limite", traceId, rota: rotaDaConsulta });
    expect(JSON.stringify(eventos)).not.toContain("203.0.113.7");
  });

  it("conta cada cliente separado", async () => {
    const { deps } = cenario();
    const { limite } = contador(1);
    const comLimite = { ...deps, limite };

    const um = await tratarApi(
      pedido({ url: linkSp() }, { "CF-Connecting-IP": "203.0.113.1" }),
      comLimite,
    );
    const outro = await tratarApi(
      pedido({ url: linkSp() }, { "CF-Connecting-IP": "203.0.113.2" }),
      comLimite,
    );

    expect([um.status, outro.status]).toEqual([200, 200]);
  });

  it("não conta pedido de outra origem, recusado antes", async () => {
    const { deps } = cenario();
    const { chaves, limite } = contador(10);

    const resposta = await tratarApi(
      pedido({ url: linkSp() }, { Origin: "https://outro.exemplo" }),
      { ...deps, limite },
    );

    expect(resposta.status).toBe(403);
    expect(chaves).toEqual([]);
  });

  it("segue a consulta quando o contador falha, e registra só o tipo do erro", async () => {
    const { deps, eventos } = cenario();
    const limite = {
      limit: async () => {
        throw new TypeError("binding fora do ar");
      },
    };

    const resposta = await tratarApi(pedido({ url: linkSp() }), { ...deps, limite });

    expect(resposta.status).toBe(200);
    expect(eventos).toContainEqual({
      evento: "api.limite-indisponivel",
      traceId,
      tipo: "TypeError",
    });
  });

  it("registra como desconhecido o erro que não é Error", async () => {
    const { deps, eventos } = cenario();
    const limite = { limit: () => Promise.reject(new Object()) };

    await tratarApi(pedido({ url: linkSp() }), { ...deps, limite });

    expect(eventos).toContainEqual({
      evento: "api.limite-indisponivel",
      traceId,
      tipo: "desconhecido",
    });
  });
});

describe("API: erro inesperado", () => {
  it("responde 500 em ProblemDetails e registra só o tipo do erro", async () => {
    const { deps, eventos } = cenario();
    deps.agora = () => {
      throw new RangeError(`falha com dado ${linkSp()}`);
    };

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(500);
    const problema = await problemaDe(resposta);
    expect(problema.code).toBe("erro.interno");
    esperarCabecalhosDaApi(resposta);
    expect(eventos).toEqual([{ evento: "erro.interno", traceId, tipo: "RangeError" }]);
    expect(JSON.stringify(problema)).not.toContain(hostSp);
  });

  it("erro que não é Error é registrado como desconhecido", async () => {
    const { deps, eventos } = cenario();
    deps.agora = () => {
      // Simula biblioteca que lança texto em vez de Error.
      throw "texto solto";
    };

    const resposta = await tratarApi(pedido({ url: linkSp() }), deps);

    expect(resposta.status).toBe(500);
    expect(eventos).toEqual([{ evento: "erro.interno", traceId, tipo: "desconhecido" }]);
  });
});
