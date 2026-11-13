/**
 * Leitura da base de mercados publicada com o site (ADR-0005). O app pede o índice, as
 * células que o raio toca e, só em "Escolher cidade", a lista de cidades. O site fica sabendo
 * a célula pedida (cerca de 110 km de lado), nunca o ponto (CA-06).
 */
import {
  caminhoDaCelula,
  caminhoDasCidades,
  caminhoDoIndice,
  lerCelula,
  lerCidades,
  lerIndice,
  type Cidade,
  type IndiceLido,
  type MercadoDaBase,
} from "../../shared/contratos/mercados";
import { falha, sucesso, type Resultado } from "../../shared/resultado";

export interface RespostaDoSite {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Busca um arquivo do próprio site; rejeita sem conexão. */
export type Buscar = (caminho: string) => Promise<RespostaDoSite>;

/** Só caminhos do próprio site, que é o que a CSP deixa (`connect-src 'self'`). */
export const buscarNoSite: Buscar = (caminho) => globalThis.fetch(caminho);

export type ErroDaCarga =
  /** O site ainda não tem a base (o primeiro PR de dados não foi mesclado). */
  | "sem-base"
  | "sem-conexao"
  /** Arquivo fora do formato ou de uma versão que este app não conhece. */
  | "base-invalida";

async function baixar(
  buscar: Buscar,
  caminho: string,
): Promise<Resultado<unknown, ErroDaCarga | "ausente">> {
  let resposta: RespostaDoSite;
  try {
    resposta = await buscar(caminho);
  } catch {
    return falha("sem-conexao");
  }
  if (resposta.status === 404) return falha("ausente");
  if (!resposta.ok) return falha("sem-conexao");
  try {
    return sucesso(await resposta.json());
  } catch {
    return falha("base-invalida");
  }
}

export async function carregarIndice(buscar: Buscar): Promise<Resultado<IndiceLido, ErroDaCarga>> {
  const baixado = await baixar(buscar, caminhoDoIndice);
  if (!baixado.ok) return falha(baixado.erro === "ausente" ? "sem-base" : baixado.erro);
  const lido = lerIndice(baixado.valor);
  return lido.ok ? sucesso(lido.valor) : falha("base-invalida");
}

export interface MercadosCarregados {
  readonly mercados: readonly MercadoDaBase[];
  readonly recusados: number;
}

/**
 * Baixa só as células pedidas que o índice diz ter mercado: célula sem mercado nem é pedida.
 * Uma célula que o índice lista e falta no site torna a base inválida.
 */
export async function carregarMercados(
  buscar: Buscar,
  indice: IndiceLido,
  celulas: readonly string[],
): Promise<Resultado<MercadosCarregados, ErroDaCarga>> {
  const comMercado = celulas.filter((celula) => indice.celulas.has(celula));
  const baixadas = await Promise.all(
    comMercado.map(async (celula) => ({
      celula,
      baixado: await baixar(buscar, caminhoDaCelula(celula)),
    })),
  );
  const mercados: MercadoDaBase[] = [];
  let recusados = 0;
  for (const { celula, baixado } of baixadas) {
    if (!baixado.ok) return falha(baixado.erro === "ausente" ? "base-invalida" : baixado.erro);
    const lida = lerCelula(baixado.valor, celula);
    if (!lida.ok) return falha("base-invalida");
    mercados.push(...lida.valor.mercados);
    recusados += lida.valor.recusados;
  }
  return sucesso({ mercados, recusados });
}

export async function carregarCidades(
  buscar: Buscar,
): Promise<Resultado<readonly Cidade[], ErroDaCarga>> {
  const baixado = await baixar(buscar, caminhoDasCidades);
  if (!baixado.ok) return falha(baixado.erro === "ausente" ? "sem-base" : baixado.erro);
  const lido = lerCidades(baixado.valor);
  return lido.ok ? sucesso(lido.valor.cidades) : falha("base-invalida");
}
