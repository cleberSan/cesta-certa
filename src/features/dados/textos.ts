import { limiteDoArquivo, versaoDoArquivo } from "../../shared/armazenamento/arquivo";
import { mensagemDoBanco } from "../../shared/armazenamento/textos";
import { contarItens } from "../lista/textos";
import type { Copia, ErroDaExportacao, ErroDaImportacao, Resumo } from "./copia";

/** Textos da tela Seus dados: fora do componente para terem teste de unidade. */
export const limiteEmMb = limiteDoArquivo / (1024 * 1024);

/**
 * "2 listas e 31 itens", "1 lista sem itens", "nenhuma lista", com os mercados cadastrados e
 * os preços quando houver: "1 lista e 3 itens, mais 2 mercados cadastrados e 15 preços".
 */
export function descreverResumo({ listas, itens, mercados, precos }: Resumo): string {
  const quantas = listas === 1 ? "1 lista" : `${listas} listas`;
  const daLista =
    listas === 0
      ? "nenhuma lista"
      : itens === 0
        ? `${quantas} sem itens`
        : `${quantas} e ${contarItens(itens)}`;
  const extras = [
    mercados === 0
      ? null
      : mercados === 1
        ? "1 mercado cadastrado"
        : `${mercados} mercados cadastrados`,
    precos === 0 ? null : precos === 1 ? "1 preço" : `${precos} preços`,
  ].filter((extra) => extra !== null);
  return extras.length === 0 ? daLista : `${daLista}, mais ${extras.join(" e ")}`;
}

/** "3 registros", "1 registro". */
export function contarRegistros(quantos: number): string {
  return quantos === 1 ? "1 registro" : `${quantos} registros`;
}

/** Registros que o aparelho guarda fora do formato esperado: o app não os lê nem os copia. */
export function avisoDeRecusados(quantos: number): string {
  return quantos === 1
    ? "1 registro guardado neste aparelho está fora do formato e não entra na cópia."
    : `${quantos} registros guardados neste aparelho estão fora do formato e não entram na cópia.`;
}

/** O que dizer quando a cópia foi gerada. */
export function avisoDaCopia({ nome, resumo }: Pick<Copia, "nome" | "resumo">): string {
  return `Cópia gerada: ${nome}, com ${descreverResumo(resumo)}.`;
}

/** Por que a exportação não saiu. */
export function mensagemDaExportacao(erro: ErroDaExportacao): string {
  if (erro.tipo === "armazenamento") return mensagemDoBanco(erro.motivo);
  return `A cópia passaria de ${limiteEmMb} MB, o máximo que o app aceita de volta. Exclua listas antigas e tente de novo.`;
}

/** Por que o arquivo foi recusado. Toda recusa diz que nada mudou no aparelho. */
export function mensagemDaImportacao(erro: ErroDaImportacao): string {
  switch (erro.tipo) {
    case "arquivo.grande-demais":
      return `O arquivo tem mais de ${limiteEmMb} MB, o máximo que o app aceita. Nada foi alterado.`;
    case "arquivo.ilegivel":
      return "O arquivo não pôde ser lido: ele não é um JSON válido ou está cortado. Nada foi alterado.";
    case "arquivo.outro-formato":
      return "Este arquivo não é uma cópia do Cesta Certa. Nada foi alterado.";
    case "arquivo.versao-desconhecida":
      return `O arquivo é da versão ${erro.versao} do formato, e este app lê até a versão ${versaoDoArquivo}. Recarregue a página para atualizar o app e tente de novo. Nada foi alterado.`;
    case "arquivo.registros-invalidos":
      return `O arquivo tem ${contarRegistros(erro.quantos)} fora do formato esperado. Nada foi alterado.`;
    case "armazenamento":
      return mensagemDoBanco(erro.motivo);
  }
}

/** "11/11/2026", na data do aparelho. */
export function dataDaCopia(exportadoEm: string, fuso?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(fuso === undefined ? {} : { timeZone: fuso }),
  }).format(new Date(exportadoEm));
}
