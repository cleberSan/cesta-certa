/**
 * Consulta à Overpass API e conversão da resposta para o formato da base (ADR-0005).
 *
 * Uma consulta por UF devolve as lojas de alimentos e as sedes de município. Tudo o que vem
 * do OpenStreetMap é texto de terceiros: só os campos escolhidos passam, limpos e limitados.
 */
import {
  limitesDaBase,
  siteSeguro,
  textoDaBase,
  type Cidade,
  type MercadoDaBase,
  type TipoDeMercado,
} from "../../src/shared/contratos/mercados.ts";

/** As 27 UFs, na ordem em que a base é gerada. */
export const ufs = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

export const lojasPesquisadas = ["supermarket", "wholesale", "convenience", "greengrocer"] as const;

/**
 * Valores da chave `wholesale` que indicam atacado de alimentos. `shop=wholesale` sem essa
 * chave entra; com outro valor (material de construção, roupa) fica de fora.
 */
const atacadoDeAlimentos = new Set(["food", "groceries", "supermarket", "general", "beverages"]);

export function consultaDaUf(uf: string, tempoLimiteS = 300): string {
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`UF inválida: ${uf}`);
  const lojas = lojasPesquisadas.join("|");
  return [
    `[out:json][timeout:${tempoLimiteS}];`,
    `area["ISO3166-2"="BR-${uf}"]["admin_level"="4"]->.uf;`,
    "(",
    `  nwr["shop"~"^(${lojas})$"](area.uf);`,
    `  node["place"~"^(city|town)$"](area.uf);`,
    ");",
    "out center tags;",
  ].join("\n");
}

export interface ElementoOverpass {
  readonly type: "node" | "way" | "relation";
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly tags?: Readonly<Record<string, string>>;
}

export type ErroDaResposta =
  | { readonly tipo: "resposta-invalida" }
  | { readonly tipo: "consulta-incompleta"; readonly observacao: string };

export type LeituraDaResposta =
  | { readonly ok: true; readonly elementos: readonly ElementoOverpass[] }
  | { readonly ok: false; readonly erro: ErroDaResposta };

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function lerElemento(valor: unknown): ElementoOverpass | null {
  if (!ehObjeto(valor)) return null;
  const { type, id, lat, lon, center, tags } = valor;
  if (type !== "node" && type !== "way" && type !== "relation") return null;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return null;
  // fromEntries cria propriedades próprias: uma etiqueta "__proto__" não troca o protótipo.
  const etiquetas: Record<string, string> = ehObjeto(tags)
    ? Object.fromEntries(
        Object.entries(tags).filter(
          (entrada): entrada is [string, string] => typeof entrada[1] === "string",
        ),
      )
    : {};
  const ponto = ehNumero(lat) && ehNumero(lon) ? { lat, lon } : {};
  const centro =
    ehObjeto(center) && ehNumero(center["lat"]) && ehNumero(center["lon"])
      ? { center: { lat: center["lat"], lon: center["lon"] } }
      : {};
  return { type, id, ...ponto, ...centro, tags: etiquetas };
}

/**
 * Lê a resposta da Overpass. Quando a consulta passa do tempo ou da memória, a Overpass
 * responde 200 com o que conseguiu e um `remark` de erro: isso conta como falha, para uma
 * UF pela metade não substituir a base anterior.
 */
export function lerRespostaOverpass(texto: string): LeituraDaResposta {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return { ok: false, erro: { tipo: "resposta-invalida" } };
  }
  if (!ehObjeto(valor) || !Array.isArray(valor["elements"])) {
    return { ok: false, erro: { tipo: "resposta-invalida" } };
  }
  const observacao = valor["remark"];
  if (typeof observacao === "string" && /error/i.test(observacao)) {
    return {
      ok: false,
      erro: { tipo: "consulta-incompleta", observacao: observacao.slice(0, 200) },
    };
  }
  const elementos: ElementoOverpass[] = [];
  for (const bruto of valor["elements"]) {
    const elemento = lerElemento(bruto);
    if (elemento !== null) elementos.push(elemento);
  }
  return { ok: true, elementos };
}

export const motivosDeDescarte = [
  "sem-nome",
  "sem-ponto",
  "outro-ramo",
  "fora-do-formato",
] as const;

export type MotivoDeDescarte = (typeof motivosDeDescarte)[number];

export type Conversao =
  | { readonly mercado: MercadoDaBase }
  | { readonly cidade: Cidade }
  | { readonly descarte: MotivoDeDescarte }
  | { readonly ignorado: true };

/** Coordenada com 5 casas (cerca de 1 metro): o suficiente para distância e rota. */
function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator + 0;
}

function tipoDoMercado(loja: string, nome: string, marca: string): TipoDeMercado {
  if (/atacad|atacarej/i.test(`${nome} ${marca}`)) return "atacarejo";
  if (loja === "wholesale") return "atacarejo";
  if (loja === "supermarket") return "supermercado";
  return "bairro";
}

/** Ponto do elemento: o próprio, num ponto; o centro calculado pela Overpass, num contorno. */
function pontoDoElemento(elemento: ElementoOverpass): { lat: number; lon: number } | null {
  if (elemento.lat !== undefined && elemento.lon !== undefined) {
    return { lat: elemento.lat, lon: elemento.lon };
  }
  return elemento.center ?? null;
}

function idDoElemento(elemento: ElementoOverpass): string {
  return `${elemento.type.charAt(0)}${elemento.id}`;
}

function converterLoja(elemento: ElementoOverpass, loja: string): Conversao {
  const tags = elemento.tags ?? {};
  const ramo = tags["wholesale"];
  if (loja === "wholesale" && ramo !== undefined && !atacadoDeAlimentos.has(ramo)) {
    return { descarte: "outro-ramo" };
  }
  const nome =
    textoDaBase(tags["name"], limitesDaBase.nome) ?? textoDaBase(tags["brand"], limitesDaBase.nome);
  if (nome === null) return { descarte: "sem-nome" };
  const ponto = pontoDoElemento(elemento);
  if (ponto === null) return { descarte: "sem-ponto" };
  const lat = arredondar(ponto.lat, 5);
  const lon = arredondar(ponto.lon, 5);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { descarte: "fora-do-formato" };
  const horario = textoDaBase(tags["opening_hours"], limitesDaBase.horario);
  const enderecoDoSite = tags["website"] ?? tags["contact:website"];
  const site = enderecoDoSite === undefined ? null : siteSeguro(enderecoDoSite);
  return {
    mercado: {
      id: idDoElemento(elemento),
      nome,
      tipo: tipoDoMercado(loja, nome, tags["brand"] ?? ""),
      lat,
      lon,
      ...(horario === null ? {} : { horario }),
      ...(site === null ? {} : { site }),
    },
  };
}

/**
 * Converte um elemento da resposta: loja pesquisada vira mercado (ou descarte com motivo),
 * sede de município vira cidade, e o resto é ignorado.
 */
export function converterElemento(elemento: ElementoOverpass, uf: string): Conversao {
  const tags = elemento.tags ?? {};
  const loja = tags["shop"];
  if (loja !== undefined && (lojasPesquisadas as readonly string[]).includes(loja)) {
    return converterLoja(elemento, loja);
  }
  const lugar = tags["place"];
  if (elemento.type === "node" && (lugar === "city" || lugar === "town")) {
    const nome = textoDaBase(tags["name"], limitesDaBase.nome);
    if (nome === null || elemento.lat === undefined || elemento.lon === undefined) {
      return { ignorado: true };
    }
    return {
      cidade: { nome, uf, lat: arredondar(elemento.lat, 4), lon: arredondar(elemento.lon, 4) },
    };
  }
  return { ignorado: true };
}
