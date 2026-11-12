/**
 * Formato da base nacional de mercados (spec 0001, CA-06, CA-07 e CA-09; ADR-0005).
 *
 * A base é gerada uma vez por mês por `scripts/mercados.ts` a partir do OpenStreetMap e
 * publicada com o site em `/data`: um arquivo por célula de 1 grau, um índice com as células
 * que existem e a lista de cidades. O gerador escreve com estes tipos e o app confere com os
 * leitores daqui tudo o que baixa, campo a campo, antes de usar.
 *
 * Este arquivo também roda direto no Node (o gerador usa a remoção de tipos do Node 24), por
 * isso importa com a extensão `.ts` e só usa sintaxe que some ao tirar os tipos.
 */
import { limparTexto } from "../texto.ts";

export const versaoDaBase = 1;

export const caminhoDoIndice = "/data/mercados/indice.json";
export const caminhoDasCidades = "/data/cidades.json";

export function caminhoDaCelula(celula: string): string {
  return `/data/mercados/${celula}.json`;
}

export const tiposDeMercado = ["bairro", "supermercado", "atacarejo"] as const;

export type TipoDeMercado = (typeof tiposDeMercado)[number];

export const limitesDaBase = {
  nome: 120,
  horario: 200,
  site: 300,
  mercadosPorCelula: 20_000,
  celulas: 2_000,
  cidades: 10_000,
} as const;

export interface MercadoDaBase {
  /** Tipo e número do objeto no OpenStreetMap: `n` ponto, `w` contorno, `r` relação. */
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoDeMercado;
  readonly lat: number;
  readonly lon: number;
  /** Horário no formato `opening_hours` do OpenStreetMap, como está na base. */
  readonly horario?: string;
  /** Só `http` ou `https`, sem usuário nem senha. */
  readonly site?: string;
}

export interface Cidade {
  readonly nome: string;
  readonly uf: string;
  readonly lat: number;
  readonly lon: number;
}

/** Arquivo de uma célula, como é gravado. */
export interface ArquivoDaCelula {
  readonly versao: typeof versaoDaBase;
  readonly celula: string;
  readonly mercados: readonly MercadoDaBase[];
}

/** Índice da base, como é gravado: quantos mercados há em cada célula que existe. */
export interface ArquivoDoIndice {
  readonly versao: typeof versaoDaBase;
  readonly geradoEm: string;
  readonly celulas: Readonly<Record<string, number>>;
}

export interface ArquivoDeCidades {
  readonly versao: typeof versaoDaBase;
  readonly geradoEm: string;
  readonly cidades: readonly Cidade[];
}

export interface IndiceLido {
  readonly geradoEm: string;
  readonly celulas: ReadonlyMap<string, number>;
}

export interface CelulaLida {
  readonly mercados: readonly MercadoDaBase[];
  /** Registros fora do formato, deixados de fora. */
  readonly recusados: number;
}

export interface CidadesLidas {
  readonly geradoEm: string;
  readonly cidades: readonly Cidade[];
  readonly recusados: number;
}

export type ErroDaBase = "formato" | "versao";

export type LeituraDaBase<T> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly erro: ErroDaBase };

/**
 * Célula de 1 grau (cerca de 110 km de lado) que contém o ponto: o canto sudoeste, em graus
 * inteiros. O app pede ao site só a célula, nunca o ponto (CA-06).
 */
export function celulaDe(lat: number, lon: number): string {
  return `${Math.floor(lat) + 0}_${Math.floor(lon) + 0}`;
}

const formatoDaCelula = /^(-?\d{1,2})_(-?\d{1,3})$/;

export function ehIdDeCelula(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = formatoDaCelula.exec(valor);
  if (partes === null) return false;
  const lat = Number(partes[1]);
  const lon = Number(partes[2]);
  return lat >= -90 && lat <= 89 && lon >= -180 && lon <= 179 && valor === celulaDe(lat, lon);
}

/** Endereço de site que pode virar link: http(s), sem credenciais e de tamanho razoável. */
export function siteSeguro(valor: string): string | null {
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > limitesDaBase.site || !URL.canParse(texto)) {
    return null;
  }
  const url = new URL(texto);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.hostname === "") return null;
  return url.href.length <= limitesDaBase.site ? url.href : null;
}

/** Texto curto vindo da base: limpo e dentro do limite, ou nada. */
export function textoDaBase(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = limparTexto(valor);
  return limpo.length > 0 && limpo.length <= maximo ? limpo : null;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehCoordenada(valor: unknown, limite: number): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && Math.abs(valor) <= limite;
}

function ehData(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length <= 30 &&
    !Number.isNaN(Date.parse(valor)) &&
    new Date(valor).toISOString() === valor
  );
}

function ehTipo(valor: unknown): valor is TipoDeMercado {
  return typeof valor === "string" && (tiposDeMercado as readonly string[]).includes(valor);
}

/** Reconstrói um mercado campo a campo; o que não está no formato fica de fora. */
export function lerMercado(valor: unknown): MercadoDaBase | null {
  if (!ehObjeto(valor)) return null;
  const { id, tipo, lat, lon } = valor;
  const nome = textoDaBase(valor["nome"], limitesDaBase.nome);
  if (
    typeof id !== "string" ||
    !/^[nwr][1-9]\d{0,15}$/.test(id) ||
    nome === null ||
    !ehTipo(tipo) ||
    !ehCoordenada(lat, 90) ||
    !ehCoordenada(lon, 180)
  ) {
    return null;
  }
  const horario = textoDaBase(valor["horario"], limitesDaBase.horario);
  const site = typeof valor["site"] === "string" ? siteSeguro(valor["site"]) : null;
  return {
    id,
    nome,
    tipo,
    lat,
    lon,
    ...(horario === null ? {} : { horario }),
    ...(site === null ? {} : { site }),
  };
}

function versaoConhecida(valor: Record<string, unknown>): LeituraDaBase<true> {
  if (valor["versao"] !== versaoDaBase) return { ok: false, erro: "versao" };
  return { ok: true, valor: true };
}

/** Lê o arquivo de uma célula; registro fora do formato é contado e deixado de fora. */
export function lerCelula(valor: unknown, celula: string): LeituraDaBase<CelulaLida> {
  if (!ehObjeto(valor)) return { ok: false, erro: "formato" };
  const versao = versaoConhecida(valor);
  if (!versao.ok) return versao;
  const lista = valor["mercados"];
  if (
    valor["celula"] !== celula ||
    !Array.isArray(lista) ||
    lista.length > limitesDaBase.mercadosPorCelula
  ) {
    return { ok: false, erro: "formato" };
  }
  const mercados: MercadoDaBase[] = [];
  for (const registro of lista) {
    const mercado = lerMercado(registro);
    if (mercado !== null && celulaDe(mercado.lat, mercado.lon) === celula) mercados.push(mercado);
  }
  return { ok: true, valor: { mercados, recusados: lista.length - mercados.length } };
}

export function lerIndice(valor: unknown): LeituraDaBase<IndiceLido> {
  if (!ehObjeto(valor)) return { ok: false, erro: "formato" };
  const versao = versaoConhecida(valor);
  if (!versao.ok) return versao;
  const { geradoEm, celulas } = valor;
  if (!ehData(geradoEm) || !ehObjeto(celulas)) return { ok: false, erro: "formato" };
  const entradas = Object.entries(celulas);
  if (entradas.length > limitesDaBase.celulas) return { ok: false, erro: "formato" };
  const lidas = new Map<string, number>();
  for (const [celula, quantos] of entradas) {
    if (
      !ehIdDeCelula(celula) ||
      typeof quantos !== "number" ||
      !Number.isSafeInteger(quantos) ||
      quantos < 1 ||
      quantos > limitesDaBase.mercadosPorCelula
    ) {
      return { ok: false, erro: "formato" };
    }
    lidas.set(celula, quantos);
  }
  return { ok: true, valor: { geradoEm, celulas: lidas } };
}

/** Reconstrói uma cidade campo a campo. */
export function lerCidade(valor: unknown): Cidade | null {
  if (!ehObjeto(valor)) return null;
  const { uf, lat, lon } = valor;
  const nome = textoDaBase(valor["nome"], limitesDaBase.nome);
  if (
    nome === null ||
    typeof uf !== "string" ||
    !/^[A-Z]{2}$/.test(uf) ||
    !ehCoordenada(lat, 90) ||
    !ehCoordenada(lon, 180)
  ) {
    return null;
  }
  return { nome, uf, lat, lon };
}

export function lerCidades(valor: unknown): LeituraDaBase<CidadesLidas> {
  if (!ehObjeto(valor)) return { ok: false, erro: "formato" };
  const versao = versaoConhecida(valor);
  if (!versao.ok) return versao;
  const { geradoEm, cidades } = valor;
  if (!ehData(geradoEm) || !Array.isArray(cidades) || cidades.length > limitesDaBase.cidades) {
    return { ok: false, erro: "formato" };
  }
  const lidas: Cidade[] = [];
  for (const registro of cidades) {
    const cidade = lerCidade(registro);
    if (cidade !== null) lidas.push(cidade);
  }
  return {
    ok: true,
    valor: { geradoEm, cidades: lidas, recusados: cidades.length - lidas.length },
  };
}
