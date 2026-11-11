import type { ErroDoBanco } from "../../shared/armazenamento/banco";
import { limites, type Item, type Preferencia, type TipoDeErro } from "./lista";
import type { ErroDaSessao } from "./sessao";

/** Textos da tela da lista: fora do componente para terem teste de unidade. */
export const rotulosDaPreferencia: Readonly<Record<Preferencia, string>> = {
  "mais-barato": "O mais barato",
  "marca-boa": "Marca boa",
  "so-esta-marca": "Só esta marca",
};

export const ajudaDaPreferencia: Readonly<Record<Preferencia, string>> = {
  "mais-barato": "Qualquer marca serve.",
  "marca-boa": "Prefiro a marca que escrevi, mas aceito outra boa.",
  "so-esta-marca": "Só compro a marca que escrevi.",
};

export type CampoDoItem = "nome" | "quantidade" | "marca" | "tamanho";

const mensagens: Readonly<Record<TipoDeErro, string>> = {
  "lista.nome-vazio": "Dê um nome para a lista.",
  "lista.nome-grande": `O nome da lista pode ter até ${limites.nomeDaLista} caracteres.`,
  "lista.limite": `Este aparelho já tem ${limites.listas} listas. Exclua uma para criar outra.`,
  "lista.inexistente": "Essa lista não está mais neste aparelho. Recarregue a página.",
  "item.nome-vazio": "Escreva o nome do item.",
  "item.nome-grande": `O nome do item pode ter até ${limites.nomeDoItem} caracteres.`,
  "item.quantidade-invalida": `A quantidade precisa ser um número inteiro de 1 a ${limites.quantidade}.`,
  "item.quantidade-acima": `A soma passa de ${limites.quantidade}, o máximo por item.`,
  "item.marca-grande": `A marca pode ter até ${limites.marca} caracteres.`,
  "item.marca-obrigatoria": "Para comprar só esta marca, escreva qual é a marca.",
  "item.tamanho-grande": `O tamanho pode ter até ${limites.tamanho} caracteres.`,
  "item.limite": `A lista já tem ${limites.itensPorLista} itens, o máximo.`,
  "item.inexistente": "Esse item não está mais na lista. Recarregue a página.",
};

const campos: Readonly<Partial<Record<TipoDeErro, CampoDoItem>>> = {
  "item.nome-vazio": "nome",
  "item.nome-grande": "nome",
  "item.quantidade-invalida": "quantidade",
  "item.quantidade-acima": "quantidade",
  "item.marca-grande": "marca",
  "item.marca-obrigatoria": "marca",
  "item.tamanho-grande": "tamanho",
};

export function mensagemDoErro(erro: ErroDaSessao): string {
  if (erro.tipo === "armazenamento") return mensagemDoBanco(erro.motivo);
  if (erro.tipo === "item.duplicado") return `${erro.existente.nome} já está na lista.`;
  return mensagens[erro.tipo];
}

/** Campo do formulário que o erro aponta, para marcar e levar o foco. */
export function campoDoErro(erro: ErroDaSessao): CampoDoItem | null {
  return erro.tipo === "armazenamento" || erro.tipo === "item.duplicado"
    ? null
    : (campos[erro.tipo] ?? null);
}

export function mensagemDoBanco(motivo: ErroDoBanco): string {
  switch (motivo) {
    case "sem-espaco":
      return "O aparelho está sem espaço para guardar. Nada foi alterado.";
    case "fechado":
      return "O app foi atualizado em outra aba. Recarregue esta página para continuar.";
    case "versao-mais-nova":
      return "Este aparelho tem dados de uma versão mais nova do app. Recarregue a página para atualizar.";
    case "indisponivel":
      return "O navegador não deixou guardar dados neste aparelho.";
    case "falhou":
      return "Não foi possível guardar no aparelho. Nada foi alterado; tente de novo.";
  }
}

/** "2 × 5 kg · Tio João · só esta marca", "1 unidade", "3 unidades · marca boa". */
export function detalhesDoItem(item: Item): string {
  const quantidade =
    item.tamanho === null
      ? `${item.quantidade} ${item.quantidade === 1 ? "unidade" : "unidades"}`
      : `${item.quantidade} × ${item.tamanho}`;
  const preferencia =
    item.preferencia === "mais-barato"
      ? null
      : rotulosDaPreferencia[item.preferencia].toLowerCase();
  return [quantidade, item.marca, preferencia].filter((parte) => parte !== null).join(" · ");
}

/** "1 item", "12 itens". */
export function contarItens(quantos: number): string {
  return quantos === 1 ? "1 item" : `${quantos} itens`;
}

/** "12 itens, 3 comprados", "1 item, nenhum comprado", "Nenhum item". */
export function resumoDosItens(itens: readonly Item[]): string {
  if (itens.length === 0) return "Nenhum item";
  const comprados = itens.filter((item) => item.comprado).length;
  const total = contarItens(itens.length);
  if (comprados === 0) return `${total}, nenhum comprado`;
  return `${total}, ${comprados} ${comprados === 1 ? "comprado" : "comprados"}`;
}
