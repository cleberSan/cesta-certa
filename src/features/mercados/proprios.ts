/**
 * Mercados que a pessoa cadastra (spec 0001, CA-08): para o mercado que falta na base do
 * OpenStreetMap. Ficam só no aparelho, no armazém `mercadosProprios`, e entram na cópia dos
 * dados (CA-04), com o ponto de cada mercado.
 */
import type { Alteracoes } from "../../shared/armazenamento/banco";
import { tiposDeMercado, type TipoDeMercado } from "../../shared/contratos/mercados";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { chaveDeComparacao, limparTexto } from "../../shared/texto";
import { ehDataIso, ehObjeto, ehUuid } from "../../shared/validacao";
import { distanciaKm, ehPonto, type Ponto } from "./geo";

export const limitesDoProprio = {
  nome: 120,
  /** Bem acima do uso de uma pessoa; segura o arquivo de cópia e a lista da tela. */
  mercados: 300,
  /** Mesmo nome a menos disto de um mercado já cadastrado é o mesmo mercado. */
  repetidoKm: 0.2,
} as const;

export interface MercadoProprio {
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoDeMercado;
  readonly lat: number;
  readonly lon: number;
  readonly criadoEm: string;
}

export interface NovoMercado {
  readonly nome: string;
  readonly tipo: string;
  readonly ponto: Ponto;
}

export interface ContextoDoCadastro {
  readonly agora: Date;
  readonly gerarId: () => string;
}

export type ErroDoCadastro =
  | { readonly tipo: "nome-vazio" }
  | { readonly tipo: "nome-longo" }
  | { readonly tipo: "tipo-invalido" }
  | { readonly tipo: "ponto-invalido" }
  | { readonly tipo: "limite" }
  | { readonly tipo: "repetido"; readonly existente: MercadoProprio };

export function ehTipoDeMercado(valor: unknown): valor is TipoDeMercado {
  return typeof valor === "string" && (tiposDeMercado as readonly string[]).includes(valor);
}

/** 5 casas decimais, cerca de 1 metro: o mesmo arredondamento da base. */
function arredondar(valor: number): number {
  return Math.round(valor * 1e5) / 1e5 + 0;
}

function lerNome(nome: string): Resultado<string, ErroDoCadastro> {
  const limpo = limparTexto(nome);
  if (limpo === "") return falha({ tipo: "nome-vazio" });
  if (limpo.length > limitesDoProprio.nome) return falha({ tipo: "nome-longo" });
  return sucesso(limpo);
}

/** Confere o que a pessoa digitou e monta o mercado novo, sem gravar nada. */
export function cadastrarMercado(
  atuais: readonly MercadoProprio[],
  novo: NovoMercado,
  contexto: ContextoDoCadastro,
): Resultado<MercadoProprio, ErroDoCadastro> {
  const nome = lerNome(novo.nome);
  if (!nome.ok) return nome;
  if (!ehTipoDeMercado(novo.tipo)) return falha({ tipo: "tipo-invalido" });
  if (!ehPonto(novo.ponto)) return falha({ tipo: "ponto-invalido" });
  if (atuais.length >= limitesDoProprio.mercados) return falha({ tipo: "limite" });

  const ponto = { lat: arredondar(novo.ponto.lat), lon: arredondar(novo.ponto.lon) };
  const chave = chaveDeComparacao(nome.valor);
  const existente = atuais.find(
    (atual) =>
      chaveDeComparacao(atual.nome) === chave &&
      distanciaKm(atual, ponto) < limitesDoProprio.repetidoKm,
  );
  if (existente !== undefined) return falha({ tipo: "repetido", existente });

  return sucesso({
    id: contexto.gerarId(),
    nome: nome.valor,
    tipo: novo.tipo,
    ...ponto,
    criadoEm: contexto.agora.toISOString(),
  });
}

/** Reconstrói um mercado guardado ou importado, campo a campo; fora do formato, nulo. */
export function lerMercadoProprio(valor: unknown): MercadoProprio | null {
  if (!ehObjeto(valor)) return null;
  const { id, nome, tipo, lat, lon, criadoEm } = valor;
  if (!ehUuid(id) || typeof nome !== "string" || !ehTipoDeMercado(tipo) || !ehDataIso(criadoEm)) {
    return null;
  }
  const ponto = { lat, lon };
  if (!ehPonto(ponto)) return null;
  const lido = lerNome(nome);
  if (!lido.ok || lido.valor !== nome) return null;
  return { id, nome, tipo, lat: ponto.lat, lon: ponto.lon, criadoEm };
}

/**
 * Lê todos os mercados próprios. Registro fora do formato, repetido ou além do limite fica
 * de fora e é contado: o aparelho segue com o resto, a importação recusa o arquivo.
 */
export function conferirMercadosProprios(registros: readonly unknown[]): {
  readonly mercados: readonly MercadoProprio[];
  readonly recusados: number;
} {
  const mercados = new Map<string, MercadoProprio>();
  let recusados = 0;
  for (const registro of registros) {
    const mercado = lerMercadoProprio(registro);
    if (
      mercado === null ||
      mercados.has(mercado.id) ||
      mercados.size >= limitesDoProprio.mercados
    ) {
      recusados += 1;
    } else {
      mercados.set(mercado.id, mercado);
    }
  }
  return { mercados: [...mercados.values()], recusados };
}

export function gravarMercado(mercado: MercadoProprio): Alteracoes {
  return { mercadosProprios: { gravar: [mercado] } };
}

export function excluirMercado(id: string): Alteracoes {
  return { mercadosProprios: { apagar: [id] } };
}
