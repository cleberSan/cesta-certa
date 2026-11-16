/**
 * Prévia da demonstração na página inicial (spec 0002, CA-06): a opção mais barata da
 * `/demonstracao`, calculada no build com os mesmos dados (`demo.json`), o mesmo otimizador e o
 * mesmo objetivo padrão da ilha. A página inicial recebe só o texto pronto, sem JavaScript.
 */
import { formatarCentavos } from "../../shared/dinheiro";
import { objetivoPadrao } from "../comparar/objetivo";
import { comparar } from "../comparar/otimizador";
import { nomeDaOpcao } from "../comparar/textos";
import { formatarDistancia } from "../mercados/geo";
import { montarDemonstracao, type DadosDaDemonstracao } from "./demo";

export interface PreviaDaDemonstracao {
  /** "Mercadinho Exemplo da Praça e Atacarejo Imaginário". */
  readonly nome: string;
  readonly total: string;
  /** "R$ 28,50 a menos"; nulo quando a opção não ganha do melhor mercado sozinho. */
  readonly economia: string | null;
  /** "que tudo no Supermercado Fictício Central". */
  readonly economiaFrente: string | null;
  /** "2 paradas · 5,4 km". */
  readonly caminho: string;
  /** "Vila Exemplo, até 5 km". */
  readonly lugar: string;
}

/** A opção 1 da demonstração em texto; nula se os dados não derem nenhuma opção. */
export function previaDaDemonstracao(
  dados: DadosDaDemonstracao,
  hoje: string,
): PreviaDaDemonstracao | null {
  const demo = montarDemonstracao(dados, hoje);
  const { opcoes } = comparar(demo.itens, demo.observacoes, demo.mercados, objetivoPadrao);
  const melhor = opcoes[0];
  if (melhor === undefined) return null;

  const paradas = melhor.paradas.length;
  const ganha = melhor.frente !== null && melhor.frente.itensAMais === 0;
  return {
    nome: nomeDaOpcao(melhor),
    total: formatarCentavos(melhor.totalCentavos),
    economia: ganha ? `${formatarCentavos(melhor.frente!.economiaCentavos)} a menos` : null,
    economiaFrente: ganha ? `que tudo no ${melhor.frente!.mercado.nome}` : null,
    caminho: `${paradas === 1 ? "1 parada" : `${paradas} paradas`} · ${formatarDistancia(melhor.distanciaKm)}`,
    lugar: `${dados.bairro}, até ${dados.raioKm} km`,
  };
}
