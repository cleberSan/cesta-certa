import { lerArquivo, montarArquivo, type ErroDoArquivo } from "../../shared/armazenamento/arquivo";
import type { Banco, ErroDoBanco } from "../../shared/armazenamento/banco";
import { falha, sucesso, type Resultado } from "../../shared/resultado";
import { conferirEstado, type Estado } from "../lista/lista";
import { conferirMercadosProprios, type MercadoProprio } from "../mercados/proprios";

/**
 * Cópia dos dados em arquivo: exportar e importar (spec 0001 CA-04, tarefa T05).
 *
 * A importação é tudo ou nada. O arquivo passa pelo mesmo validador que lê o aparelho, só
 * que sem tolerância: um registro fora do formato recusa o arquivo inteiro, e a gravação é
 * uma substituição numa transação só. Cada registro é reconstruído campo a campo, então
 * nada além dos campos conhecidos chega ao aparelho.
 */
export interface ErroDeArmazenamento {
  readonly tipo: "armazenamento";
  readonly motivo: ErroDoBanco;
}

export type ErroDaExportacao = { readonly tipo: "arquivo.grande-demais" } | ErroDeArmazenamento;

export type ErroDaImportacao =
  | ErroDoArquivo
  | { readonly tipo: "arquivo.registros-invalidos"; readonly quantos: number }
  | ErroDeArmazenamento;

export interface Resumo {
  readonly listas: number;
  readonly itens: number;
  /** Mercados cadastrados pela pessoa (CA-08). */
  readonly mercados: number;
}

/** O que vai e volta na cópia, já conferido registro a registro. */
export interface Dados extends Estado {
  readonly mercadosProprios: readonly MercadoProprio[];
}

export interface Aparelho {
  readonly dados: Dados;
  readonly resumo: Resumo;
  /** Registros guardados fora do formato esperado: não entram na cópia. */
  readonly recusados: number;
}

export interface Copia {
  readonly nome: string;
  readonly texto: string;
  readonly resumo: Resumo;
  readonly recusados: number;
}

export interface ArquivoConferido {
  readonly dados: Dados;
  readonly resumo: Resumo;
  readonly exportadoEm: string;
}

const resumir = (dados: Dados): Resumo => ({
  listas: dados.listas.length,
  itens: dados.itens.length,
  mercados: dados.mercadosProprios.length,
});

/** Confere listas, itens e mercados próprios; conta o que ficou de fora. */
function conferirDados(conteudo: {
  readonly listas: readonly unknown[];
  readonly itens: readonly unknown[];
  readonly mercadosProprios: readonly unknown[];
}): { readonly dados: Dados; readonly recusados: number } {
  const lista = conferirEstado(conteudo);
  const mercados = conferirMercadosProprios(conteudo.mercadosProprios);
  return {
    dados: { ...lista.estado, mercadosProprios: mercados.mercados },
    recusados: lista.recusados + mercados.recusados,
  };
}

/** O que está guardado no aparelho agora. */
export async function lerAparelho(banco: Banco): Promise<Resultado<Aparelho, ErroDeArmazenamento>> {
  const lido = await banco.lerTudo();
  if (!lido.ok) return falha({ tipo: "armazenamento", motivo: lido.erro });
  const { dados, recusados } = conferirDados(lido.valor);
  return sucesso({ dados, resumo: resumir(dados), recusados });
}

/** Lê o aparelho na hora do pedido e monta o arquivo de cópia. */
export async function exportar(
  banco: Banco,
  agora: Date,
  fuso?: string,
): Promise<Resultado<Copia, ErroDaExportacao>> {
  const aparelho = await lerAparelho(banco);
  if (!aparelho.ok) return aparelho;
  const { dados, resumo, recusados } = aparelho.valor;

  const texto = montarArquivo(dados, agora);
  if (!texto.ok) return texto;
  return sucesso({ nome: nomeDaCopia(agora, fuso), texto: texto.valor, resumo, recusados });
}

/** Confere o arquivo inteiro sem gravar nada: a tela mostra o resumo e pede a confirmação. */
export function conferirArquivo(texto: string): Resultado<ArquivoConferido, ErroDaImportacao> {
  const lido = lerArquivo(texto);
  if (!lido.ok) return lido;

  const { dados, recusados } = conferirDados(lido.valor.conteudo);
  if (recusados > 0) return falha({ tipo: "arquivo.registros-invalidos", quantos: recusados });
  return sucesso({ dados, resumo: resumir(dados), exportadoEm: lido.valor.exportadoEm });
}

/** Troca o que está no aparelho pelo conteúdo já conferido do arquivo. */
export async function importar(
  banco: Banco,
  conferido: ArquivoConferido,
): Promise<Resultado<Resumo, ErroDeArmazenamento>> {
  const gravado = await banco.substituirTudo(conferido.dados);
  if (!gravado.ok) return falha({ tipo: "armazenamento", motivo: gravado.erro });
  return sucesso(conferido.resumo);
}

/** "cesta-certa-2026-11-11.json", com a data do aparelho. */
export function nomeDaCopia(agora: Date, fuso?: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(fuso === undefined ? {} : { timeZone: fuso }),
  }).formatToParts(agora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((atual) => atual.type === tipo)?.value ?? "";
  return `cesta-certa-${parte("year")}-${parte("month")}-${parte("day")}.json`;
}
