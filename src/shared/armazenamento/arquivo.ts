import { falha, sucesso, type Resultado } from "../resultado";
import { ehDataIso, ehObjeto } from "../validacao";
import { armazensDaCopia, type ConteudoDaCopia, type NomeDaCopia, type Registros } from "./banco";

/**
 * Cópia dos dados em arquivo (spec 0001 CA-04): um JSON com a versão do formato no topo.
 * Aqui fica só o envelope. O formato de cada registro é conferido pela fatia dona dele, e
 * nada do arquivo é gravado antes dessa conferência.
 *
 * Quando um armazém novo entrar no banco, a versão do arquivo sobe e a leitura das versões
 * anteriores continua: o que elas não têm entra vazio.
 */
export const identificacaoDoArquivo = "cesta-certa";
/** 1: listas e itens (T05). 2: mais os mercados cadastrados (T08). 3: mais os preços (T12). */
export const versaoDoArquivo = 3;

/** 5 MB: vale para o arquivo que entra e para a cópia que sai, que precisa poder voltar. */
export const limiteDoArquivo = 5 * 1024 * 1024;

export type ErroDoArquivo =
  | { readonly tipo: "arquivo.grande-demais" }
  /** Não é JSON: arquivo cortado, editado à mão ou de outro tipo. */
  | { readonly tipo: "arquivo.ilegivel" }
  /** É JSON, mas não é uma cópia deste app. */
  | { readonly tipo: "arquivo.outro-formato" }
  /** Cópia feita por uma versão mais nova do app. */
  | { readonly tipo: "arquivo.versao-desconhecida"; readonly versao: number };

export interface ArquivoLido {
  readonly versao: number;
  readonly exportadoEm: string;
  /** Registros como vieram do arquivo, ainda sem conferir o formato de cada um. */
  readonly conteudo: ConteudoDaCopia;
}

/** Tamanho do texto em bytes (UTF-8), como ele fica no arquivo. */
export function tamanhoEmBytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/** O texto do arquivo de cópia. Recusa a cópia que passaria do limite de importação. */
export function montarArquivo(
  registros: Registros,
  agora: Date,
): Resultado<string, { readonly tipo: "arquivo.grande-demais" }> {
  const texto = JSON.stringify({
    app: identificacaoDoArquivo,
    versao: versaoDoArquivo,
    exportadoEm: agora.toISOString(),
    dados: Object.fromEntries(armazensDaCopia.map((nome) => [nome, registros[nome]])),
  });
  return passaDoLimite(texto) ? falha({ tipo: "arquivo.grande-demais" }) : sucesso(texto);
}

export function lerArquivo(texto: string): Resultado<ArquivoLido, ErroDoArquivo> {
  if (passaDoLimite(texto)) return falha({ tipo: "arquivo.grande-demais" });

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    // Texto cortado, vazio ou aninhado além do que o navegador aceita.
    return falha({ tipo: "arquivo.ilegivel" });
  }

  if (!ehObjeto(bruto) || bruto.app !== identificacaoDoArquivo) {
    return falha({ tipo: "arquivo.outro-formato" });
  }
  const { versao, exportadoEm, dados } = bruto;
  if (typeof versao !== "number" || !Number.isSafeInteger(versao) || versao < 1) {
    return falha({ tipo: "arquivo.outro-formato" });
  }
  if (versao > versaoDoArquivo) return falha({ tipo: "arquivo.versao-desconhecida", versao });
  if (!ehDataIso(exportadoEm) || !ehObjeto(dados)) return falha({ tipo: "arquivo.outro-formato" });

  const lido = (nome: NomeDaCopia): readonly unknown[] | null => {
    const valor = Object.hasOwn(dados, nome) ? dados[nome] : undefined;
    return Array.isArray(valor) ? (valor as readonly unknown[]) : null;
  };
  const listas = lido("listas");
  const itens = lido("itens");
  // O que a versão do arquivo ainda não tinha entra vazio; da versão em que entrou em diante,
  // a lista é exigida.
  const mercadosProprios = versao >= 2 ? lido("mercadosProprios") : [];
  const observacoesDePreco = versao >= 3 ? lido("observacoesDePreco") : [];
  if (
    listas === null ||
    itens === null ||
    mercadosProprios === null ||
    observacoesDePreco === null
  ) {
    return falha({ tipo: "arquivo.outro-formato" });
  }

  return sucesso({
    versao,
    exportadoEm,
    conteudo: { listas, itens, mercadosProprios, observacoesDePreco },
  });
}

/** O comprimento em caracteres nunca passa do tamanho em bytes: evita codificar um texto enorme. */
function passaDoLimite(texto: string): boolean {
  return texto.length > limiteDoArquivo || tamanhoEmBytes(texto) > limiteDoArquivo;
}
