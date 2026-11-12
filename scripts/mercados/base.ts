/**
 * Montagem da base a partir das respostas por UF: células de 1 grau, índice, cidades e o
 * relatório de tamanho que vai no PR mensal (ADR-0005).
 */
import { gzipSync } from "node:zlib";
import {
  celulaDe,
  versaoDaBase,
  type ArquivoDaCelula,
  type ArquivoDeCidades,
  type ArquivoDoIndice,
  type Cidade,
  type MercadoDaBase,
} from "../../src/shared/contratos/mercados.ts";
import {
  converterElemento,
  motivosDeDescarte,
  type ElementoOverpass,
  type MotivoDeDescarte,
} from "./overpass.ts";

export interface RespostaDaUf {
  readonly uf: string;
  readonly elementos: readonly ElementoOverpass[];
}

export interface BaseMontada {
  /** Mercados por célula, em ordem de id, para o diff do PR mensal ser estável. */
  readonly celulas: ReadonlyMap<string, readonly MercadoDaBase[]>;
  readonly cidades: readonly Cidade[];
  readonly porUf: ReadonlyMap<string, number>;
  readonly descartes: Readonly<Record<MotivoDeDescarte, number>>;
  readonly repetidos: number;
}

function compararIds(a: string, b: string): number {
  if (a.charAt(0) !== b.charAt(0)) return a.charAt(0) < b.charAt(0) ? -1 : 1;
  return Number(a.slice(1)) - Number(b.slice(1));
}

const ordemDasCidades = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function montarBase(respostas: readonly RespostaDaUf[]): BaseMontada {
  const mercados = new Map<string, MercadoDaBase>();
  const cidades = new Map<string, Cidade>();
  const porUf = new Map<string, number>();
  const descartes = Object.fromEntries(motivosDeDescarte.map((motivo) => [motivo, 0])) as Record<
    MotivoDeDescarte,
    number
  >;
  let repetidos = 0;

  for (const { uf, elementos } of respostas) {
    let daUf = 0;
    for (const elemento of elementos) {
      const conversao = converterElemento(elemento, uf);
      if ("mercado" in conversao) {
        // Um mercado na divisa entre duas UFs vem nas duas consultas.
        if (mercados.has(conversao.mercado.id)) {
          repetidos += 1;
        } else {
          mercados.set(conversao.mercado.id, conversao.mercado);
          daUf += 1;
        }
      } else if ("cidade" in conversao) {
        const chave = `${conversao.cidade.uf}|${elemento.type}${elemento.id}`;
        if (!cidades.has(chave)) cidades.set(chave, conversao.cidade);
      } else if ("descarte" in conversao) {
        descartes[conversao.descarte] += 1;
      }
    }
    porUf.set(uf, daUf);
  }

  const celulas = new Map<string, MercadoDaBase[]>();
  for (const mercado of [...mercados.values()].sort((a, b) => compararIds(a.id, b.id))) {
    const celula = celulaDe(mercado.lat, mercado.lon);
    const daCelula = celulas.get(celula);
    if (daCelula === undefined) celulas.set(celula, [mercado]);
    else daCelula.push(mercado);
  }
  const ordenadas = new Map([...celulas.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

  return {
    celulas: ordenadas,
    cidades: [...cidades.values()].sort(
      (a, b) => (a.uf < b.uf ? -1 : a.uf > b.uf ? 1 : 0) || ordemDasCidades.compare(a.nome, b.nome),
    ),
    porUf,
    descartes,
    repetidos,
  };
}

/**
 * Arquivos a publicar em `public/data`, pelo caminho relativo a essa pasta. JSON compacto: o
 * Cloudflare comprime na entrega, e o tamanho que importa é o comprimido.
 */
export function arquivosDaBase(base: BaseMontada, geradoEm: Date): Map<string, string> {
  const data = geradoEm.toISOString();
  const arquivos = new Map<string, string>();
  const contagem: Record<string, number> = {};
  for (const [celula, mercados] of base.celulas) {
    const arquivo: ArquivoDaCelula = { versao: versaoDaBase, celula, mercados };
    arquivos.set(`mercados/${celula}.json`, JSON.stringify(arquivo));
    contagem[celula] = mercados.length;
  }
  const indice: ArquivoDoIndice = { versao: versaoDaBase, geradoEm: data, celulas: contagem };
  arquivos.set("mercados/indice.json", JSON.stringify(indice));
  const cidades: ArquivoDeCidades = { versao: versaoDaBase, geradoEm: data, cidades: base.cidades };
  arquivos.set("cidades.json", JSON.stringify(cidades));
  return arquivos;
}

export interface Tamanho {
  readonly caminho: string;
  readonly bytes: number;
  readonly comprimido: number;
}

export function medir(arquivos: ReadonlyMap<string, string>): Tamanho[] {
  return [...arquivos.entries()].map(([caminho, texto]) => ({
    caminho,
    bytes: Buffer.byteLength(texto),
    comprimido: gzipSync(texto, { level: 9 }).length,
  }));
}

/** Meta do plano para uma célula, comprimida: acima disso, a célula é dividida. */
export const orcamentoDaCelula = 300 * 1024;

/** Queda máxima aceita no total de mercados entre uma geração e a seguinte. */
export const quedaMaxima = 0.2;

export interface Conferencia {
  readonly problemas: readonly string[];
  readonly avisos: readonly string[];
}

/**
 * Confere a base antes de publicar. Problema impede a publicação (a base anterior fica);
 * aviso só vai para o relatório.
 */
export function conferirBase(
  base: BaseMontada,
  tamanhos: readonly Tamanho[],
  totalAnterior: number | null,
): Conferencia {
  const problemas: string[] = [];
  const avisos: string[] = [];
  for (const [uf, quantos] of base.porUf) {
    if (quantos === 0) problemas.push(`${uf} veio sem nenhum mercado.`);
  }
  const total = [...base.celulas.values()].reduce((soma, lista) => soma + lista.length, 0);
  if (totalAnterior !== null && total < totalAnterior * (1 - quedaMaxima)) {
    problemas.push(
      `O total caiu de ${totalAnterior} para ${total} mercados, mais de ${quedaMaxima * 100}%.`,
    );
  }
  if (base.cidades.length === 0) problemas.push("Nenhuma cidade veio na consulta.");
  for (const tamanho of tamanhos) {
    if (tamanho.caminho.startsWith("mercados/") && tamanho.comprimido > orcamentoDaCelula) {
      avisos.push(
        `${tamanho.caminho} tem ${kb(tamanho.comprimido)} comprimido, acima da meta de ${kb(orcamentoDaCelula)}.`,
      );
    }
  }
  return { problemas, avisos };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

const nomesDosDescartes: Record<MotivoDeDescarte, string> = {
  "sem-nome": "sem nome nem marca",
  "sem-ponto": "sem coordenada",
  "outro-ramo": "atacado de outro ramo",
  "fora-do-formato": "coordenada fora do formato",
};

/** Relatório em Markdown para o resumo do workflow e o corpo do PR mensal. */
export function relatorio(
  base: BaseMontada,
  tamanhos: readonly Tamanho[],
  conferencia: Conferencia,
  totalAnterior: number | null,
  geradoEm: Date,
): string {
  const total = [...base.celulas.values()].reduce((soma, lista) => soma + lista.length, 0);
  const celulas = tamanhos.filter(
    (tamanho) =>
      tamanho.caminho.startsWith("mercados/") && tamanho.caminho !== "mercados/indice.json",
  );
  const somaBytes = tamanhos.reduce((soma, tamanho) => soma + tamanho.bytes, 0);
  const somaComprimida = tamanhos.reduce((soma, tamanho) => soma + tamanho.comprimido, 0);
  const maiores = [...celulas].sort((a, b) => b.comprimido - a.comprimido).slice(0, 10);
  const indice = tamanhos.find((tamanho) => tamanho.caminho === "mercados/indice.json");
  const cidades = tamanhos.find((tamanho) => tamanho.caminho === "cidades.json");

  const linhas = [
    `## Base de mercados (OpenStreetMap), gerada em ${geradoEm.toISOString().slice(0, 10)}`,
    "",
    `- Mercados: **${numero(total)}**${totalAnterior === null ? "" : ` (antes: ${numero(totalAnterior)})`}`,
    `- Células de 1 grau com mercado: **${numero(base.celulas.size)}**`,
    `- Cidades para "Escolher cidade": **${numero(base.cidades.length)}**`,
    `- Tamanho total: ${kb(somaBytes)}, ${kb(somaComprimida)} comprimido`,
    `- Índice: ${indice === undefined ? "-" : kb(indice.comprimido)} comprimido; cidades: ${cidades === undefined ? "-" : kb(cidades.comprimido)} comprimido`,
    `- Repetidos entre UFs: ${numero(base.repetidos)}`,
    `- Deixados de fora: ${motivosDeDescarte.map((motivo) => `${nomesDosDescartes[motivo]} ${numero(base.descartes[motivo])}`).join(", ")}`,
    "",
    "### Células maiores",
    "",
    "| Célula | Mercados | Tamanho | Comprimido |",
    "| --- | ---: | ---: | ---: |",
    ...maiores.map((tamanho) => {
      const celula = tamanho.caminho.slice("mercados/".length, -".json".length);
      return `| ${celula} | ${numero(base.celulas.get(celula)?.length ?? 0)} | ${kb(tamanho.bytes)} | ${kb(tamanho.comprimido)} |`;
    }),
    "",
    "### Mercados por UF",
    "",
    [...base.porUf.entries()].map(([uf, quantos]) => `${uf} ${numero(quantos)}`).join(" · "),
  ];
  if (conferencia.avisos.length > 0) {
    linhas.push("", "### Avisos", "", ...conferencia.avisos.map((aviso) => `- ${aviso}`));
  }
  if (conferencia.problemas.length > 0) {
    linhas.push(
      "",
      "### Problemas (a base não foi publicada)",
      "",
      ...conferencia.problemas.map((problema) => `- ${problema}`),
    );
  }
  linhas.push(
    "",
    "Dados © colaboradores do OpenStreetMap, sob a licença ODbL 1.0 (https://www.openstreetmap.org/copyright).",
  );
  return `${linhas.join("\n")}\n`;
}
