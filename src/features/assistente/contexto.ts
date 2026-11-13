/**
 * O que o app manda ao assistente junto com a pergunta (spec 0001, CA-26 e CA-27; plano.md,
 * "Assistente"). O app faz a conta e o Claude só explica: vão o objetivo, os itens da lista e
 * as três melhores opções já somadas, com preços, fontes, datas e as diferenças entre elas.
 *
 * Fica de fora o que não é preciso para explicar a compra: coordenadas e endereço (CA-27),
 * identificadores do aparelho e a descrição impressa na nota fiscal, que é texto de terceiro.
 * A distância vai arredondada para 1 km. Se passar de 32 KB (CA-31), o detalhe por item sai
 * primeiro das opções 2 e 3, depois da 1; se nem assim couber, o app avisa sem enviar.
 */
import {
  limiteDoContexto,
  tamanhoDoContexto,
  type PedidoAoAssistente,
} from "../../shared/contratos/assistente";
import { formatarCentavos } from "../../shared/dinheiro";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import type { Preferencia } from "../lista/lista";
import { ehAntigo } from "../precos/precos";
import { descreverEmbalagem } from "../precos/textos";
import { descreverModo } from "../rota/textos";
import type { Objetivo } from "../comparar/objetivo";
import type { Comparacao, Linha, Opcao, Sugestao } from "../comparar/otimizador";
import { rotulosDasMarcas } from "../comparar/textos";

/** CA-26: as três melhores opções. */
export const opcoesNoContexto = 3;

export const niveisDeDetalhe = ["completo", "compras-so-da-primeira", "so-totais"] as const;

export type NivelDeDetalhe = (typeof niveisDeDetalhe)[number];

export interface ItemDoContexto {
  readonly nome: string;
  readonly quantidade: number;
  readonly marca: string | null;
  readonly tamanho: string | null;
  readonly preferencia: Preferencia;
}

export interface CompraDoContexto {
  readonly item: string;
  readonly embalagens: number;
  readonly precoDaEmbalagem: string;
  readonly total: string;
  /** Marca e tamanho do preço registrado ("Marca, 5 kg"); nulo quando não há. */
  readonly embalagem: string | null;
  readonly fonte: "nota fiscal" | "digitado";
  readonly vistoEm: string;
  readonly antigo: boolean;
  readonly outraMarca: boolean;
  readonly atacadoAPartirDe: number | null;
}

export interface ParadaDoContexto {
  readonly mercado: string;
  readonly subtotal: string;
  readonly compras: readonly CompraDoContexto[];
}

export interface DiferencaDoContexto {
  readonly opcao: number;
  readonly sentido: "mais cara" | "mais barata" | "mesmo total";
  readonly valor: string;
}

export interface OpcaoDoContexto {
  readonly posicao: number;
  readonly mercados: readonly { readonly nome: string; readonly distanciaKm: number }[];
  readonly total: string;
  /** Caminho estimado em linha reta, arredondado para 1 km (CA-27). */
  readonly caminhoKm: number;
  readonly itensSemPreco: readonly string[];
  readonly passaDoTetoEm: string | null;
  /** Combinação comparada ao melhor mercado sozinho (CA-22); nula para um mercado só. */
  readonly frenteAoMercadoSozinho: {
    readonly mercado: string;
    readonly economia: string;
    readonly itensAMais: number;
  } | null;
  /** Diferença do total para cada opção acima dela. */
  readonly diferencas: readonly DiferencaDoContexto[];
  /** O que comprar em cada mercado; ausente quando o contexto precisou encolher. */
  readonly paradas?: readonly ParadaDoContexto[];
}

export type SugestaoDoContexto =
  | {
      readonly tipo: "trocar";
      readonly item: string;
      readonly de: string | null;
      readonly para: string | null;
      readonly mercado: string;
      readonly economia: string;
    }
  | { readonly tipo: "retirar"; readonly item: string; readonly economia: string };

export interface ContextoDoAssistente {
  /** Dia de hoje, "AAAA-MM-DD", para o assistente saber a idade de cada preço. */
  readonly hoje: string;
  readonly objetivo: {
    readonly teto: string | null;
    readonly marcas: string;
    readonly ateMercados: number;
    readonly economiaMinimaParaCombinar: string;
    readonly comoIr: string;
    readonly distanciaMaximaKm: number;
  };
  readonly lista: readonly ItemDoContexto[];
  readonly opcoes: readonly OpcaoDoContexto[];
  readonly paraCaberNoTeto: {
    readonly passaDoTetoEm: string;
    readonly sugestoes: readonly SugestaoDoContexto[];
    readonly totalDepois: string;
  } | null;
  readonly detalhe: NivelDeDetalhe;
}

export interface EntradaDoContexto {
  readonly comparacao: Comparacao;
  readonly objetivo: Objetivo;
  readonly raioKm: number;
  readonly hoje: string;
}

/** "R$ 1.234,56" com espaço comum: o modelo lê e repete sem caractere especial. */
function reais(centavos: number): string {
  return formatarCentavos(centavos).replace(" ", " ");
}

const km = (distancia: number) => Math.round(distancia);

function compraDoContexto(linha: Linha, hoje: string): CompraDoContexto {
  const { observacao } = linha;
  return {
    item: linha.item.nome,
    embalagens: linha.embalagens,
    precoDaEmbalagem: reais(observacao.precoCentavos),
    total: reais(linha.centavos),
    embalagem: descreverEmbalagem(observacao),
    fonte: observacao.fonte === "nota" ? "nota fiscal" : "digitado",
    vistoEm: observacao.vistoEm,
    antigo: ehAntigo(observacao.vistoEm, hoje),
    outraMarca: linha.outraMarca,
    atacadoAPartirDe: observacao.minimoAtacado,
  };
}

function diferenca(opcao: Opcao, outra: Opcao, posicao: number): DiferencaDoContexto {
  const centavos = opcao.totalCentavos - outra.totalCentavos;
  return {
    opcao: posicao,
    sentido: centavos > 0 ? "mais cara" : centavos < 0 ? "mais barata" : "mesmo total",
    valor: reais(Math.abs(centavos)),
  };
}

function opcaoDoContexto(
  opcao: Opcao,
  indice: number,
  anteriores: readonly Opcao[],
  comCompras: boolean,
  hoje: string,
): OpcaoDoContexto {
  const base: OpcaoDoContexto = {
    posicao: indice + 1,
    mercados: opcao.paradas.map(({ mercado }) => ({
      nome: mercado.nome,
      distanciaKm: km(mercado.distanciaKm),
    })),
    total: reais(opcao.totalCentavos),
    caminhoKm: km(opcao.distanciaKm),
    itensSemPreco: opcao.faltando.map((item) => item.nome),
    passaDoTetoEm: opcao.acimaDoTetoCentavos > 0 ? reais(opcao.acimaDoTetoCentavos) : null,
    frenteAoMercadoSozinho:
      opcao.frente === null
        ? null
        : {
            mercado: opcao.frente.mercado.nome,
            economia: reais(opcao.frente.economiaCentavos),
            itensAMais: opcao.frente.itensAMais,
          },
    diferencas: anteriores.map((outra, posicao) => diferenca(opcao, outra, posicao + 1)),
  };
  if (!comCompras) return base;
  return {
    ...base,
    paradas: opcao.paradas.map((parada) => ({
      mercado: parada.mercado.nome,
      subtotal: reais(parada.subtotalCentavos),
      compras: parada.linhas.map((linha) => compraDoContexto(linha, hoje)),
    })),
  };
}

function sugestaoDoContexto(sugestao: Sugestao): SugestaoDoContexto {
  if (sugestao.tipo === "retirar") {
    return {
      tipo: "retirar",
      item: sugestao.linha.item.nome,
      economia: reais(sugestao.economiaCentavos),
    };
  }
  return {
    tipo: "trocar",
    item: sugestao.de.item.nome,
    de: descreverEmbalagem(sugestao.de.observacao),
    para: descreverEmbalagem(sugestao.para.observacao),
    mercado: sugestao.mercado.nome,
    economia: reais(sugestao.economiaCentavos),
  };
}

function comprasNaOpcao(detalhe: NivelDeDetalhe, indice: number): boolean {
  return detalhe === "completo" || (detalhe === "compras-so-da-primeira" && indice === 0);
}

export function montarContextoNoNivel(
  entrada: EntradaDoContexto,
  detalhe: NivelDeDetalhe,
): ContextoDoAssistente {
  const { comparacao, objetivo, raioKm, hoje } = entrada;
  const melhores = comparacao.opcoes.slice(0, opcoesNoContexto);
  const { ajuste } = comparacao;
  return {
    hoje,
    objetivo: {
      teto: objetivo.tetoCentavos === null ? null : reais(objetivo.tetoCentavos),
      marcas: rotulosDasMarcas[objetivo.marcas],
      ateMercados: objetivo.maximoDeMercados,
      economiaMinimaParaCombinar:
        objetivo.economiaMinimaCentavos === 0
          ? "qualquer economia"
          : reais(objetivo.economiaMinimaCentavos),
      comoIr: descreverModo(objetivo.modo),
      distanciaMaximaKm: raioKm,
    },
    lista: comparacao.itens.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      marca: item.marca,
      tamanho: item.tamanho,
      preferencia: item.preferencia,
    })),
    opcoes: melhores.map((opcao, indice) =>
      opcaoDoContexto(
        opcao,
        indice,
        melhores.slice(0, indice),
        comprasNaOpcao(detalhe, indice),
        hoje,
      ),
    ),
    paraCaberNoTeto:
      ajuste === null
        ? null
        : {
            passaDoTetoEm: reais(ajuste.excessoCentavos),
            sugestoes: ajuste.sugestoes.map(sugestaoDoContexto),
            totalDepois: reais(ajuste.totalDepoisCentavos),
          },
    detalhe,
  };
}

/** O contexto mais detalhado que cabe em 32 KB (CA-31). */
export function montarContexto(
  entrada: EntradaDoContexto,
): Resultado<ContextoDoAssistente, "grande-demais"> {
  for (const detalhe of niveisDeDetalhe) {
    const contexto = montarContextoNoNivel(entrada, detalhe);
    if (tamanhoDoContexto(contexto) <= limiteDoContexto) return sucesso(contexto);
  }
  return falha("grande-demais");
}

/** O corpo do pedido, com a pergunta já sem espaços nas pontas. */
export function montarPedido(pergunta: string, contexto: ContextoDoAssistente): PedidoAoAssistente {
  return { pergunta: pergunta.trim(), contexto: { ...contexto } };
}
