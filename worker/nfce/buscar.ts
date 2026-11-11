import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { declaraMaisQue, lerComLimite } from "../http/corpo";

/**
 * Busca da página da nota, com limites (spec 0001, CA-12 e CA-13).
 *
 * - Só o endereço montado pelo validador é buscado, sempre em https.
 * - Redirecionamento não é seguido pelo runtime: cada salto é conferido aqui e só vale para
 *   o mesmo host exato, em https, na porta padrão e sem credenciais, no máximo 2 vezes.
 * - Um único limite de tempo cobre todos os saltos e a leitura do corpo.
 * - O corpo é lido em pedaços e a leitura para ao passar do tamanho máximo.
 * - Cookies de sessão valem só entre os saltos desta consulta e não são guardados.
 */
export interface LimitesDaBusca {
  tempoMs: number;
  bytes: number;
  saltos: number;
}

export const limitesPadrao: LimitesDaBusca = { tempoMs: 8_000, bytes: 512 * 1024, saltos: 2 };

export interface PaginaBuscada {
  html: string;
  status: number;
  bytes: number;
  saltos: number;
  caminho: string;
  tipoDeConteudo: string | null;
  codificacao: string;
}

export type MotivoDaFalha =
  "tempo" | "rede" | "status" | "redirecionamento" | "grande-demais" | "tipo-de-conteudo";

export interface FalhaDaBusca {
  motivo: MotivoDaFalha;
  /** Status HTTP da origem, quando houve resposta. */
  status: number | null;
  saltos: number;
  /** Caminho (sem query) da página que falhou ou para onde a origem quis redirecionar. */
  caminho: string | null;
}

export type Buscar = (url: string, init: RequestInit) => Promise<Response>;

/** Identificação honesta de quem consulta, com o endereço do projeto. */
export const agenteDeUsuario = "cesta-certa/0.1 (+https://github.com/cleberSan/cesta-certa)";

const redirecionamentos = new Set([301, 302, 303, 307, 308]);

// Windows-1252 nas posições 0x80 a 0x9F; o restante coincide com o ISO-8859-1.
const cp1252 = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function decodificarLatin1(bytes: Uint8Array): string {
  const partes: string[] = [];
  const pedaco = 8_192;
  for (let inicio = 0; inicio < bytes.length; inicio += pedaco) {
    const codigos = Array.from(bytes.subarray(inicio, inicio + pedaco), (byte) =>
      byte >= 0x80 && byte <= 0x9f ? cp1252[byte - 0x80]! : byte,
    );
    partes.push(String.fromCharCode(...codigos));
  }
  return partes.join("");
}

const charsetDeclarado = /charset\s*=\s*["']?([\w-]+)/i;

/**
 * Codificação da página: a do cabeçalho Content-Type ou, na falta, a do <meta> no começo do
 * documento; sem nenhuma das duas, UTF-8. As páginas de governo ainda variam entre UTF-8 e
 * ISO-8859-1, e a decodificação errada estraga os acentos dos rótulos.
 */
export function decodificar(
  bytes: Uint8Array,
  tipoDeConteudo: string | null,
): { texto: string; codificacao: string } {
  const doCabecalho = charsetDeclarado.exec(tipoDeConteudo ?? "")?.[1];
  const doMeta = charsetDeclarado.exec(decodificarLatin1(bytes.subarray(0, 2_048)))?.[1];
  const rotulo = (doCabecalho ?? doMeta ?? "utf-8").toLowerCase();

  if (["iso-8859-1", "iso8859-1", "latin1", "windows-1252", "cp1252"].includes(rotulo)) {
    return { texto: decodificarLatin1(bytes), codificacao: "windows-1252" };
  }
  return { texto: new TextDecoder("utf-8").decode(bytes), codificacao: "utf-8" };
}

/**
 * Caminho para o diagnóstico: sem query, curto e sem sequência longa de dígitos, para mostrar
 * a estrutura do endereço sem levar um identificador de nota.
 */
function caminhoSeguro(url: URL): string {
  return url.pathname.replace(/\d{5,}/g, "#").slice(0, 120);
}

/** Destino de um redirecionamento, se continuar no mesmo host exato e em https. */
function proximoSalto(atual: URL, local: string | null): URL | undefined {
  if (local === null || !URL.canParse(local, atual)) return undefined;
  const proximo = new URL(local, atual);
  const mesmoLugar =
    proximo.protocol === "https:" &&
    proximo.hostname === atual.hostname &&
    proximo.port === "" &&
    proximo.username === "" &&
    proximo.password === "";
  return mesmoLugar ? proximo : undefined;
}

function guardarCookies(resposta: Response, cookies: Map<string, string>): void {
  for (const cabecalho of resposta.headers.getSetCookie()) {
    const par = cabecalho.split(";", 1)[0] ?? "";
    const igual = par.indexOf("=");
    if (igual > 0) cookies.set(par.slice(0, igual).trim(), par.slice(igual + 1).trim());
  }
}

export async function buscarPagina(
  destino: URL,
  buscar: Buscar,
  limites: LimitesDaBusca = limitesPadrao,
): Promise<Resultado<PaginaBuscada, FalhaDaBusca>> {
  const sinal = AbortSignal.timeout(limites.tempoMs);
  const cookies = new Map<string, string>();
  let atual = destino;
  let saltos = 0;
  let status: number | null = null;

  const falhar = (motivo: MotivoDaFalha, caminho: string | null = caminhoSeguro(atual)) =>
    falha<FalhaDaBusca>({ motivo, status, saltos, caminho });

  try {
    for (;;) {
      const cabecalhos: Record<string, string> = {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": agenteDeUsuario,
      };
      if (cookies.size > 0) {
        cabecalhos["Cookie"] = [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; ");
      }
      const resposta = await buscar(atual.href, {
        method: "GET",
        redirect: "manual",
        signal: sinal,
        headers: cabecalhos,
      });
      status = resposta.status;

      if (redirecionamentos.has(resposta.status)) {
        await resposta.body?.cancel();
        const proximo = proximoSalto(atual, resposta.headers.get("location"));
        if (proximo === undefined) return falhar("redirecionamento", null);
        if (saltos >= limites.saltos) return falhar("redirecionamento", caminhoSeguro(proximo));
        guardarCookies(resposta, cookies);
        atual = proximo;
        saltos++;
        continue;
      }
      if (resposta.status !== 200) {
        await resposta.body?.cancel();
        return falhar("status");
      }

      const tipoDeConteudo = resposta.headers.get("content-type");
      if (tipoDeConteudo !== null && !/html/i.test(tipoDeConteudo)) {
        await resposta.body?.cancel();
        return falhar("tipo-de-conteudo");
      }
      if (declaraMaisQue(resposta.headers, limites.bytes)) {
        await resposta.body?.cancel();
        return falhar("grande-demais");
      }
      const corpo = await lerComLimite(resposta.body, limites.bytes);
      if (corpo === undefined) return falhar("grande-demais");

      const { texto, codificacao } = decodificar(corpo, tipoDeConteudo);
      return sucesso({
        html: texto,
        status: resposta.status,
        bytes: corpo.byteLength,
        saltos,
        caminho: caminhoSeguro(atual),
        tipoDeConteudo: tipoDeConteudo?.slice(0, 80) ?? null,
        codificacao,
      });
    }
  } catch {
    // Falha de rede ou limite de tempo; a mensagem do erro pode trazer a URL e não é usada.
    return falhar(sinal.aborted ? "tempo" : "rede");
  }
}
