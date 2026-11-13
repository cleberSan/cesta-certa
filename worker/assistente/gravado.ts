import { sucesso } from "../../src/shared/resultado";
import type { Provedor } from "./provedor";

/**
 * Respostas gravadas (spec 0001, CA-35; ADR-0004): servem o E2E e a prévia sem chamar a
 * Anthropic e sem gastar nada. A resposta sai pela primeira palavra-chave que aparece na
 * pergunta. Nenhuma cita valor em reais, para não passar por dado conferido.
 */
interface Gravacao {
  palavras: readonly string[];
  texto: string;
}

const gravacoes: readonly Gravacao[] = [
  {
    palavras: ["teto", "caber", "tirar"],
    texto:
      "Esta é uma resposta gravada. Para caber no teto, o app primeiro troca itens por outra marca mais barata e, se ainda passar, tira o item mais barato que resolve. As sugestões aparecem em Para caber no teto, com a economia de cada uma.",
  },
  {
    palavras: ["combin", "dois mercados", "vale a pena"],
    texto:
      "Esta é uma resposta gravada. Uma combinação de mercados só aparece quando economiza pelo menos o mínimo que você escolheu no objetivo. Se ela está acima de um mercado só, a diferença compensa a parada a mais.",
  },
];

const respostaPadrao =
  "Esta é uma resposta gravada. A primeira opção da lista é a de menor total com as suas preferências, usando os preços que você registrou e as datas em que eles foram vistos.";

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export const provedorGravado: Provedor = {
  nome: "gravado",
  modelo: null,
  responder: async ({ pergunta }) => {
    const normalizada = normalizar(pergunta);
    const gravacao = gravacoes.find(({ palavras }) =>
      palavras.some((palavra) => normalizada.includes(palavra)),
    );
    return sucesso({
      texto: gravacao?.texto ?? respostaPadrao,
      tokensEntrada: 0,
      tokensSaida: 0,
      parada: "gravada",
    });
  },
};
