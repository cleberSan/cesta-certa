import { describe, expect, it } from "vitest";
import { agenteDeUsuario, buscarPagina, decodificar, type Buscar } from "./buscar";

const destino = new URL("https://www.nfce.fazenda.sp.gov.br/qrcode?p=chave|3|1");
const limites = { tempoMs: 2_000, bytes: 1_024, saltos: 2 };

interface Chamada {
  url: string;
  init: RequestInit;
}

/** Rede simulada: responde na ordem dada e guarda o que foi pedido. */
function redeSimulada(...respostas: (Response | Error)[]): { buscar: Buscar; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, init });
    const proxima = fila.shift();
    if (proxima === undefined) throw new Error("requisição a mais do que o teste previa");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  };
  return { buscar, chamadas };
}

const html = (corpo: string, cabecalhos: Record<string, string> = {}): Response =>
  new Response(corpo, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...cabecalhos },
  });

const redireciona = (
  local: string | null,
  status = 302,
  cookies: readonly string[] = [],
): Response => {
  const cabecalhos = new Headers();
  if (local !== null) cabecalhos.set("Location", local);
  for (const cookie of cookies) cabecalhos.append("Set-Cookie", cookie);
  return new Response(null, { status, headers: cabecalhos });
};

const cabecalhosDe = (chamada: Chamada | undefined): Record<string, string> =>
  (chamada?.init.headers ?? {}) as Record<string, string>;

describe("buscarPagina", () => {
  it("busca o destino e devolve a página com as medidas", async () => {
    const { buscar, chamadas } = redeSimulada(html("<p>Olá, nota</p>"));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        html: "<p>Olá, nota</p>",
        status: 200,
        bytes: 17,
        saltos: 0,
        caminho: "/qrcode",
        tipoDeConteudo: "text/html; charset=utf-8",
        codificacao: "utf-8",
      },
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe(destino.href);
  });

  it("pede com GET, sem seguir redirecionamento sozinho, com limite de tempo e identificação honesta", async () => {
    const { buscar, chamadas } = redeSimulada(html("ok"));

    await buscarPagina(destino, buscar, limites);

    const init = chamadas[0]?.init;
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();
    expect(cabecalhosDe(chamadas[0])).toEqual({
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "User-Agent": agenteDeUsuario,
    });
    expect(agenteDeUsuario).toMatch(/^cesta-certa\/\d/);
    expect(agenteDeUsuario).not.toMatch(/mozilla|chrome|safari/i);
  });

  it("segue redirecionamento para o mesmo host, levando o cookie de sessão", async () => {
    const { buscar, chamadas } = redeSimulada(
      redireciona("/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=chave|3|1", 302, [
        "ASP.NET_SessionId=abc123; path=/; HttpOnly; SameSite=Lax",
        "rota=n1; Secure",
        "invalido",
      ]),
      redireciona("https://www.nfce.fazenda.sp.gov.br/outra", 307, ["rota=n2"]),
      html("<p>fim</p>"),
    );

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado.ok && resultado.valor).toMatchObject({ saltos: 2, caminho: "/outra" });
    expect(chamadas.map((chamada) => chamada.url)).toEqual([
      destino.href,
      "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=chave|3|1",
      "https://www.nfce.fazenda.sp.gov.br/outra",
    ]);
    expect(cabecalhosDe(chamadas[0])["Cookie"]).toBeUndefined();
    expect(cabecalhosDe(chamadas[1])["Cookie"]).toBe("ASP.NET_SessionId=abc123; rota=n1");
    expect(cabecalhosDe(chamadas[2])["Cookie"]).toBe("ASP.NET_SessionId=abc123; rota=n2");
  });

  // spec 0001 CA-12
  it.each([
    ["outro site", "https://evil.example/qrcode"],
    ["subdomínio parecido", "https://www.nfce.fazenda.sp.gov.br.evil.example/"],
    ["http no mesmo host", "http://www.nfce.fazenda.sp.gov.br/qrcode"],
    ["outra porta", "https://www.nfce.fazenda.sp.gov.br:8443/qrcode"],
    ["credenciais", "https://usuario:senha@www.nfce.fazenda.sp.gov.br/qrcode"],
    ["endereço relativo ao protocolo", "//evil.example/qrcode"],
    ["IP interno", "https://10.0.0.1/"],
    ["endereço de metadados de nuvem", "http://169.254.169.254/latest/meta-data"],
    ["javascript:", "javascript:alert(1)"],
    ["sem Location", null],
  ])("não segue redirecionamento para %s", async (_caso, local) => {
    const { buscar, chamadas } = redeSimulada(redireciona(local));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado).toEqual({
      ok: false,
      erro: { motivo: "redirecionamento", status: 302, saltos: 0, caminho: null },
    });
    expect(chamadas).toHaveLength(1);
  });

  it("para no terceiro redirecionamento e diz para onde a origem queria ir", async () => {
    const { buscar, chamadas } = redeSimulada(
      redireciona("/a", 301),
      redireciona("/b", 303),
      redireciona("/c", 308),
    );

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado).toEqual({
      ok: false,
      erro: { motivo: "redirecionamento", status: 308, saltos: 2, caminho: "/c" },
    });
    expect(chamadas).toHaveLength(3);
  });

  it.each([403, 404, 429, 500, 503, 204, 304])("trata o status %d como falha", async (status) => {
    const { buscar } = redeSimulada(new Response(null, { status }));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado).toEqual({
      ok: false,
      erro: { motivo: "status", status, saltos: 0, caminho: "/qrcode" },
    });
  });

  it.each(["application/json", "application/pdf", "image/png", "text/plain"])(
    "recusa resposta do tipo %s",
    async (tipo) => {
      const { buscar } = redeSimulada(new Response("{}", { headers: { "Content-Type": tipo } }));

      const resultado = await buscarPagina(destino, buscar, limites);

      expect(resultado.ok).toBe(false);
      expect(!resultado.ok && resultado.erro.motivo).toBe("tipo-de-conteudo");
    },
  );

  it("aceita XHTML e resposta sem tipo declarado", async () => {
    const xhtml = redeSimulada(
      new Response("<p>a</p>", { headers: { "Content-Type": "application/xhtml+xml" } }),
    );
    const semTipo = new Response(new TextEncoder().encode("<p>b</p>"));
    semTipo.headers.delete("Content-Type");

    expect((await buscarPagina(destino, xhtml.buscar, limites)).ok).toBe(true);
    const resultado = await buscarPagina(destino, redeSimulada(semTipo).buscar, limites);
    expect(resultado.ok && resultado.valor.tipoDeConteudo).toBeNull();
  });

  it("informa o caminho sem query, curto e sem sequência longa de dígitos", async () => {
    const longo = `/consulta/35261111222333000181650010000123451123456780/${"a".repeat(300)}`;
    const { buscar } = redeSimulada(redireciona(`${longo}?p=segredo`), html("<p>nota</p>"));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.caminho).toHaveLength(120);
    expect(resultado.valor.caminho.startsWith("/consulta/#/aaa")).toBe(true);
    expect(resultado.valor.caminho).not.toMatch(/\d{5}|segredo|\?/);
  });

  it("recusa página maior que o limite pelo tamanho declarado, sem ler o corpo", async () => {
    let lido = false;
    // Sem fila de antecedência: o pedaço só é produzido quando alguém lê.
    const corpo = new ReadableStream<Uint8Array>(
      {
        pull(controlador) {
          lido = true;
          controlador.enqueue(new Uint8Array(10));
          controlador.close();
        },
      },
      { highWaterMark: 0 },
    );
    const { buscar } = redeSimulada(
      new Response(corpo, { headers: { "Content-Type": "text/html", "Content-Length": "1025" } }),
    );

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(!resultado.ok && resultado.erro.motivo).toBe("grande-demais");
    expect(lido).toBe(false);
  });

  it("para de ler quando o corpo passa do limite sem ter declarado o tamanho", async () => {
    let pedacos = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controlador) {
        pedacos++;
        controlador.enqueue(new Uint8Array(400));
      },
    });
    const { buscar } = redeSimulada(
      new Response(corpo, { headers: { "Content-Type": "text/html" } }),
    );

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(!resultado.ok && resultado.erro.motivo).toBe("grande-demais");
    // 1024 bytes de limite, pedaços de 400: para no terceiro, com pouca folga de leitura à frente.
    expect(pedacos).toBeLessThanOrEqual(5);
  });

  it("aceita página exatamente no limite", async () => {
    const { buscar } = redeSimulada(html("a".repeat(1_024)));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado.ok && resultado.valor.bytes).toBe(1_024);
  });

  // spec 0001 CA-13
  it("desiste quando a origem não responde dentro do limite de tempo", async () => {
    const buscar: Buscar = (_url, init) =>
      new Promise((_resolver, rejeitar) => {
        init.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
      });

    const inicio = Date.now();
    const resultado = await buscarPagina(destino, buscar, { ...limites, tempoMs: 40 });

    expect(resultado).toEqual({
      ok: false,
      erro: { motivo: "tempo", status: null, saltos: 0, caminho: "/qrcode" },
    });
    expect(Date.now() - inicio).toBeLessThan(1_500);
  });

  // spec 0001 CA-13
  it("o limite de tempo também vale para o corpo que chega devagar", async () => {
    // Manda o começo da página e nunca termina; só o sinal de tempo encerra a leitura.
    const buscar: Buscar = async (_url, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controlador) {
            controlador.enqueue(new TextEncoder().encode("<p>começo"));
            init.signal?.addEventListener("abort", () => controlador.error(init.signal?.reason));
          },
        }),
        { headers: { "Content-Type": "text/html" } },
      );

    const resultado = await buscarPagina(destino, buscar, { ...limites, tempoMs: 40 });

    expect(!resultado.ok && resultado.erro).toMatchObject({ motivo: "tempo", status: 200 });
  });

  it("trata falha de rede como indisponibilidade, sem repassar a mensagem do erro", async () => {
    const { buscar } = redeSimulada(new TypeError(`fetch failed: ${destino.href}`));

    const resultado = await buscarPagina(destino, buscar, limites);

    expect(resultado).toEqual({
      ok: false,
      erro: { motivo: "rede", status: null, saltos: 0, caminho: "/qrcode" },
    });
    expect(JSON.stringify(resultado)).not.toContain("chave");
  });

  it("usa os limites padrão de 8 segundos, 512 KB e 2 saltos", async () => {
    const { limitesPadrao } = await import("./buscar");
    expect(limitesPadrao).toEqual({ tempoMs: 8_000, bytes: 524_288, saltos: 2 });

    const { buscar } = redeSimulada(html("ok"));
    expect((await buscarPagina(destino, buscar)).ok).toBe(true);
  });
});

describe("decodificar", () => {
  const latin1 = (texto: string): Uint8Array => Uint8Array.from(texto, (c) => c.charCodeAt(0));

  it("usa UTF-8 quando nada diz o contrário", () => {
    const bytes = new TextEncoder().encode("Emissão: ação");
    expect(decodificar(bytes, null)).toEqual({ texto: "Emissão: ação", codificacao: "utf-8" });
    expect(decodificar(bytes, "text/html").codificacao).toBe("utf-8");
  });

  it.each(["ISO-8859-1", "iso-8859-1", "windows-1252", "latin1", '"ISO-8859-1"'])(
    "lê página em %s declarada no cabeçalho",
    (charset) => {
      const resultado = decodificar(latin1("Emissão: Código"), `text/html; charset=${charset}`);
      expect(resultado).toEqual({ texto: "Emissão: Código", codificacao: "windows-1252" });
    },
  );

  it("lê a codificação do <meta> quando o cabeçalho não traz", () => {
    const pagina =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>Emissão</body></html>';
    expect(decodificar(latin1(pagina), "text/html").texto).toContain("Emissão");
    expect(decodificar(latin1('<meta charset="windows-1252">ação'), null).texto).toContain("ação");
  });

  it("o cabeçalho vence o <meta>", () => {
    const bytes = new TextEncoder().encode('<meta charset="iso-8859-1">ação');
    expect(decodificar(bytes, "text/html; charset=utf-8").texto).toContain("ação");
  });

  it("converte os caracteres próprios do Windows-1252", () => {
    const bytes = Uint8Array.from([0x80, 0x20, 0x93, 0x61, 0x94, 0x20, 0x96]);
    expect(decodificar(bytes, "text/html; charset=windows-1252").texto).toBe("€ “a” –");
  });

  it("decodifica página grande em Latin-1 sem estourar a pilha", () => {
    const bytes = new Uint8Array(300_000).fill(0xe7);
    expect(decodificar(bytes, "text/html; charset=iso-8859-1").texto).toBe("ç".repeat(300_000));
  });

  it("trata codificação desconhecida como UTF-8 e não quebra com bytes inválidos", () => {
    const bytes = Uint8Array.from([0x61, 0xff, 0x62]);
    expect(decodificar(bytes, "text/html; charset=klingon")).toEqual({
      texto: "a\ufffdb",
      codificacao: "utf-8",
    });
  });
});
