/**
 * A demonstração (spec 0001, CA-35, CA-38 e CA-40; ADR-0007): um bairro, mercados, uma lista e
 * preços fictícios, para ver a comparação antes de registrar o primeiro preço.
 *
 * Os dados ficam em `demo.json` e vivem só na memória da página: nada daqui passa pelo banco do
 * aparelho, e os preços levam a fonte "demonstracao", que o leitor do aparelho e da cópia
 * recusa. Os nomes são inventados e dizem que são fictícios; o teste confere que nenhum é de
 * rede real.
 *
 * Sem React e sem API do navegador: o dia de hoje entra por parâmetro.
 */
import type { TipoDeMercado } from "../../shared/contratos/mercados";
import type { MercadoDaComparacao } from "../comparar/otimizador";
import { preferencias, type Item, type Lista, type Preferencia } from "../lista/lista";
import { distanciaKm, pontoNoRumo, type Ponto } from "../mercados/geo";
import type { ObservacaoDePreco } from "../precos/precos";
import dadosDoSite from "./demo.json";

/** Mercado como está no `demo.json`: a posição é a distância e o rumo a partir do ponto. */
export interface MercadoDosDados {
  readonly id: string;
  readonly nome: string;
  readonly tipo: string;
  readonly distanciaKm: number;
  /** Graus a partir do norte, no sentido do relógio. */
  readonly rumo: number;
}

export interface ItemDosDados {
  readonly nome: string;
  readonly quantidade: number;
  readonly marca: string | null;
  readonly tamanho: string | null;
  readonly preferencia: string;
}

export interface PrecoDosDados {
  /** O `id` de um dos mercados. */
  readonly mercado: string;
  readonly produto: string;
  readonly marca: string | null;
  readonly tamanho: string | null;
  readonly centavos: number;
  readonly atacadoAPartirDe: number | null;
  /** Há quantos dias o preço foi "visto", contados a partir de hoje: a demonstração não envelhece. */
  readonly diasAtras: number;
}

/** O formato do `demo.json`; o TypeScript confere o arquivo contra ele no build. */
export interface DadosDaDemonstracao {
  readonly bairro: string;
  readonly cidade: string;
  readonly raioKm: number;
  readonly mercados: readonly MercadoDosDados[];
  readonly lista: { readonly nome: string; readonly itens: readonly ItemDosDados[] };
  readonly precos: readonly PrecoDosDados[];
}

export interface MercadoDaDemonstracao extends MercadoDaComparacao {
  readonly tipo: TipoDeMercado;
}

/** A demonstração pronta para a tela e para a comparação. */
export interface Demonstracao {
  readonly bairro: string;
  readonly cidade: string;
  readonly raioKm: number;
  /** Em ordem de distância. */
  readonly mercados: readonly MercadoDaDemonstracao[];
  readonly lista: Lista;
  readonly itens: readonly Item[];
  readonly observacoes: readonly ObservacaoDePreco[];
}

export const dadosDaDemonstracao: DadosDaDemonstracao = dadosDoSite;

/**
 * Âncora das posições no meio do oceano (0°, 0°): o bairro não existe, e as coordenadas servem
 * só para a conta das distâncias entre os mercados. Elas não aparecem na tela, porque a
 * demonstração não tem mapa nem rota, e não vão para o assistente (CA-27).
 */
export const ancoraDaDemonstracao: Ponto = { lat: 0, lon: 0 };

export const idDaListaDeExemplo = "demonstracao";

const tiposConhecidos: Readonly<Record<string, TipoDeMercado>> = {
  bairro: "bairro",
  supermercado: "supermercado",
  atacarejo: "atacarejo",
};

function preferenciaDe(texto: string): Preferencia {
  return (preferencias as readonly string[]).includes(texto)
    ? (texto as Preferencia)
    : "mais-barato";
}

/** "2026-11-13" menos 3 dias vira "2026-11-10", sem o fuso do aparelho. */
export function diaAntes(hoje: string, dias: number): string {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia! - dias)).toISOString().slice(0, 10);
}

/** Monta mercados, lista e preços a partir dos dados e do dia de hoje ("AAAA-MM-DD"). */
export function montarDemonstracao(dados: DadosDaDemonstracao, hoje: string): Demonstracao {
  const criadoEm = `${hoje}T12:00:00.000Z`;
  const mercados = dados.mercados
    .map((mercado): MercadoDaDemonstracao => {
      const ponto = pontoNoRumo(ancoraDaDemonstracao, mercado.distanciaKm, mercado.rumo);
      return {
        id: mercado.id,
        nome: mercado.nome,
        tipo: tiposConhecidos[mercado.tipo] ?? "bairro",
        ...ponto,
        distanciaKm: distanciaKm(ancoraDaDemonstracao, ponto),
      };
    })
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
  const nomes = new Map(mercados.map((mercado) => [mercado.id, mercado.nome]));
  const lista: Lista = {
    id: idDaListaDeExemplo,
    nome: dados.lista.nome,
    criadaEm: criadoEm,
    atualizadaEm: criadoEm,
  };
  const itens = dados.lista.itens.map((item, ordem): Item => ({
    id: `demonstracao-item-${ordem + 1}`,
    listaId: lista.id,
    nome: item.nome,
    quantidade: item.quantidade,
    marca: item.marca,
    tamanho: item.tamanho,
    preferencia: preferenciaDe(item.preferencia),
    comprado: false,
    ordem,
    criadoEm,
  }));
  const observacoes = dados.precos.map((preco, posicao): ObservacaoDePreco => {
    const vistoEm = diaAntes(hoje, preco.diasAtras);
    return {
      id: `demonstracao-preco-${posicao + 1}`,
      produto: preco.produto,
      marca: preco.marca,
      tamanho: preco.tamanho,
      descricao: null,
      precoCentavos: preco.centavos,
      minimoAtacado: preco.atacadoAPartirDe,
      mercadoId: preco.mercado,
      mercadoNome: nomes.get(preco.mercado) ?? preco.mercado,
      fonte: "demonstracao",
      vistoEm,
      nota: null,
      criadoEm: `${vistoEm}T12:00:00.000Z`,
    };
  });
  return {
    bairro: dados.bairro,
    cidade: dados.cidade,
    raioKm: dados.raioKm,
    mercados,
    lista,
    itens,
    observacoes,
  };
}
