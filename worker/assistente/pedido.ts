import {
  limiteDaPergunta,
  limiteDoContexto,
  tamanhoDaPergunta,
  tamanhoDoContexto,
  type PedidoAoAssistente,
} from "../../src/shared/contratos/assistente";
import { falha, sucesso, type Resultado } from "../../src/shared/resultado";
import { ehObjeto } from "../../src/shared/validacao";
import { declaraMaisQue, lerComLimite } from "../http/corpo";
import type { DadosDoProblema } from "../http/respostas";

/**
 * Lê e confere o corpo de `POST /api/assistente` (spec 0001, CA-31), antes de gastar qualquer
 * crédito da cota: pergunta até 500 caracteres e contexto até 32 KB. O corpo inteiro tem um
 * teto um pouco maior, para a leitura parar cedo sem medir campo por campo.
 */
const limiteDoCorpo = limiteDoContexto + 4 * 1024;

export type ResultadoDaLeitura = "tipo-nao-suportado" | "grande-demais" | "invalido";

export interface PedidoRecusado {
  resultado: ResultadoDaLeitura;
  problema: DadosDoProblema;
}

const grandeDemais = (detail: string): PedidoRecusado => ({
  resultado: "grande-demais",
  problema: { status: 413, code: "assistente.grande-demais", detail },
});

const invalido: PedidoRecusado = {
  resultado: "invalido",
  problema: {
    status: 400,
    code: "requisicao.invalida",
    detail: 'O corpo precisa ser um JSON com "pergunta" em texto e "contexto" como objeto.',
  },
};

const textoDoTamanhoTotal = "O pedido ao assistente passa do tamanho máximo aceito.";

export async function lerPedido(
  request: Request,
): Promise<Resultado<PedidoAoAssistente, PedidoRecusado>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(tipo)) {
    return falha({
      resultado: "tipo-nao-suportado",
      problema: {
        status: 415,
        code: "requisicao.tipo-nao-suportado",
        detail: "Envie o corpo como application/json.",
      },
    });
  }
  if (declaraMaisQue(request.headers, limiteDoCorpo))
    return falha(grandeDemais(textoDoTamanhoTotal));
  const bytes = await lerComLimite(request.body, limiteDoCorpo);
  if (bytes === undefined) return falha(grandeDemais(textoDoTamanhoTotal));

  let corpo: unknown;
  try {
    corpo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return falha(invalido);
  }
  if (!ehObjeto(corpo)) return falha(invalido);
  const { pergunta, contexto } = corpo;
  if (typeof pergunta !== "string" || !ehObjeto(contexto)) return falha(invalido);

  const limpa = pergunta.trim();
  if (limpa === "") return falha(invalido);
  if (tamanhoDaPergunta(limpa) > limiteDaPergunta) {
    return falha(grandeDemais(`A pergunta passa de ${limiteDaPergunta} caracteres.`));
  }
  if (tamanhoDoContexto(contexto) > limiteDoContexto) {
    return falha(grandeDemais("Os dados da lista passam de 32 KB."));
  }
  return sucesso({ pergunta: limpa, contexto });
}
