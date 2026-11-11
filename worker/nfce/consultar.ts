import type { CodigoDeErro } from "../../src/shared/contratos/nfce";
import { declaraMaisQue, lerComLimite } from "../http/corpo";
import { responderJson, responderProblema, type DadosDoProblema } from "../http/respostas";
import type { Evento, Registrar } from "../observabilidade/registro";
import { buscarPagina, type Buscar, type LimitesDaBusca } from "./buscar";
import { diagnosticar } from "./diagnostico";
import { lerPagina } from "./html";
import { validarLink } from "./link";

/**
 * `POST /api/nfce/consultar` (spec 0001, CA-10 a CA-13): recebe `{ "url": "<link do QR Code>" }`
 * e devolve o mercado, a data e os itens da nota.
 *
 * Ordem: confere o corpo, valida o link (nenhuma requisição sai antes disso), busca a página
 * com limites, lê com o leitor da UF e responde. Nada é guardado. O log leva o resultado e
 * números; o link, o conteúdo e o CNPJ ficam de fora.
 */
export interface Dependencias {
  buscar: Buscar;
  registrar: Registrar;
  agora: () => number;
  limites?: LimitesDaBusca;
}

/** Um link de QR Code tem poucas centenas de caracteres; 4 KB sobram. */
const limiteDoCorpo = 4_096;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

async function lerUrlDoCorpo(request: Request): Promise<string | DadosDoProblema> {
  const tipo = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(tipo)) {
    return {
      status: 415,
      code: "requisicao.tipo-nao-suportado",
      detail: "Envie o corpo como application/json.",
    };
  }
  const grande: DadosDoProblema = {
    status: 413,
    code: "requisicao.grande-demais",
    detail: "O corpo da requisição passa de 4 KB.",
  };
  if (declaraMaisQue(request.headers, limiteDoCorpo)) return grande;
  const bytes = await lerComLimite(request.body, limiteDoCorpo);
  if (bytes === undefined) return grande;

  const invalida: DadosDoProblema = {
    status: 400,
    code: "requisicao.invalida",
    detail: 'O corpo precisa ser um JSON com o campo "url" em texto.',
  };
  let corpo: unknown;
  try {
    corpo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalida;
  }
  const url = ehObjeto(corpo) ? corpo["url"] : undefined;
  return typeof url === "string" ? url : invalida;
}

/** Doze caracteres do SHA-256 da chave: bastam para notar repetição e não revelam a nota. */
async function resumoDaChave(chave: string): Promise<string> {
  const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave));
  return Array.from(new Uint8Array(resumo).subarray(0, 6), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const detalhesDaBusca: Readonly<Record<string, string>> = {
  tempo: "A consulta da Secretaria da Fazenda demorou mais que o limite de 8 segundos.",
  rede: "Não foi possível conectar à consulta da Secretaria da Fazenda.",
  status: "A consulta da Secretaria da Fazenda respondeu com erro.",
  redirecionamento: "A consulta da Secretaria da Fazenda redirecionou para um endereço não aceito.",
  "grande-demais": "A página da nota passa do tamanho máximo aceito.",
  "tipo-de-conteudo": "A consulta da Secretaria da Fazenda não devolveu uma página.",
};

export async function consultarNota(
  request: Request,
  traceId: string,
  deps: Dependencias,
): Promise<Response> {
  const inicio = deps.agora();
  const concluir = (resultado: "ok" | CodigoDeErro, dados: Evento = {}): void => {
    deps.registrar({
      evento: "nfce.consulta",
      traceId,
      resultado,
      duracaoMs: deps.agora() - inicio,
      ...dados,
    });
  };
  const recusar = (problema: DadosDoProblema, dados: Evento = {}): Response => {
    concluir(problema.code, dados);
    return responderProblema(problema, traceId);
  };

  const url = await lerUrlDoCorpo(request);
  if (typeof url !== "string") return recusar(url);

  const link = validarLink(url);
  if (!link.ok) return recusar({ status: 422, code: link.erro.code, detail: link.erro.detalhe });

  const { leitor, chave, destino } = link.valor;
  const nota = { uf: leitor.sigla, chave: await resumoDaChave(chave.valor) };

  const busca = await buscarPagina(destino, deps.buscar, deps.limites);
  if (!busca.ok) {
    const { motivo, status, saltos, caminho } = busca.erro;
    const tempoEsgotado = motivo === "tempo";
    return recusar(
      {
        status: tempoEsgotado ? 504 : 502,
        code: tempoEsgotado ? "nfce.tempo-esgotado" : "nfce.indisponivel",
        detail: detalhesDaBusca[motivo]!,
        diagnostico: { motivo, status, saltos, caminho },
      },
      { ...nota, motivo, statusOrigem: status, saltos },
    );
  }

  const { html, ...dadosDaBusca } = busca.valor;
  const medidas = {
    ...nota,
    statusOrigem: dadosDaBusca.status,
    saltos: dadosDaBusca.saltos,
    bytes: dadosDaBusca.bytes,
  };
  const pagina = lerPagina(html);
  const lida = leitor.ler(pagina, chave);
  if (lida === undefined) {
    const diagnostico = diagnosticar(html, pagina, dadosDaBusca);
    return recusar(
      diagnostico.sinais.captcha
        ? {
            status: 502,
            code: "nfce.captcha",
            detail: "A consulta da Secretaria da Fazenda pediu uma verificação (captcha).",
            diagnostico,
          }
        : {
            status: 502,
            code: "nfce.formato-desconhecido",
            detail: "A página da nota veio num formato que o leitor ainda não conhece.",
            diagnostico,
          },
      medidas,
    );
  }

  concluir("ok", { ...medidas, itens: lida.itens.length, itensNaoLidos: lida.itensNaoLidos });
  return responderJson(lida, traceId);
}
