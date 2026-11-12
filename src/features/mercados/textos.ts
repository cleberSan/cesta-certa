/** Textos da tela de mercados, testados (spec 0001, CA-05, CA-07 e CA-39). */
import type { TipoDeMercado } from "../../shared/contratos/mercados";
import type { ErroDaCarga } from "./carga";
import { formatarDistancia } from "./geo";
import type { ErroDaLocalizacao } from "./localizacao";
import { limitesDoProprio, type ErroDoCadastro } from "./proprios";

const nomesDosTipos: Record<TipoDeMercado, string> = {
  bairro: "Mercado de bairro",
  supermercado: "Supermercado",
  atacarejo: "Atacarejo",
};

export function descreverTipo(tipo: TipoDeMercado): string {
  return nomesDosTipos[tipo];
}

/**
 * Por que a localização não veio, com o outro caminho de cada tela: escolher a cidade, no
 * primeiro acesso, ou usar o ponto da busca, no cadastro de mercado.
 */
export function mensagemDaLocalizacao(
  erro: ErroDaLocalizacao,
  tela: "ponto" | "cadastro" = "ponto",
): string {
  const alternativa = tela === "ponto" ? "escolha a cidade" : "cadastre no ponto da busca";
  switch (erro) {
    case "negada":
      return `O navegador não deu permissão para usar a localização. ${maiuscula(alternativa)}.`;
    case "indisponivel":
      return `Este aparelho não informou a localização. ${maiuscula(alternativa)}.`;
    case "sem-resposta":
      return `A localização não chegou em 10 segundos. ${maiuscula(alternativa)} ou tente de novo.`;
  }
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Mensagem de falha ao baixar a base: os mercados da região ou a lista de cidades. */
export function mensagemDaCarga(
  erro: ErroDaCarga,
  oQue: "mercados" | "cidades" = "mercados",
): string {
  switch (erro) {
    case "sem-base":
      return "A base de mercados ainda não foi publicada neste site.";
    case "sem-conexao":
      return oQue === "mercados"
        ? "Sem conexão para baixar os mercados. Tente de novo quando estiver online."
        : "Sem conexão para baixar a lista de cidades. Tente de novo quando estiver online.";
    case "base-invalida":
      return oQue === "mercados"
        ? "Os mercados desta região vieram num formato que o app não entende. Tente de novo mais tarde."
        : "A lista de cidades veio num formato que o app não entende. Tente de novo mais tarde.";
  }
}

export function contarMercados(quantos: number): string {
  return quantos === 1 ? "1 mercado" : `${quantos.toLocaleString("pt-BR")} mercados`;
}

/** "novembro de 2026", no fuso de São Paulo: a base é gerada de madrugada, pelo horário de Brasília. */
export function mesDaBase(geradoEm: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(geradoEm));
}

export function resumoDoRaio(quantos: number, raioKm: number): string {
  if (quantos === 0) return `Nenhum mercado da base em até ${raioKm} km.`;
  return `${contarMercados(quantos)} em até ${raioKm} km, do mais perto ao mais longe.`;
}

/** Por que o mercado não foi cadastrado (CA-08). */
export function mensagemDoCadastro(erro: ErroDoCadastro): string {
  switch (erro.tipo) {
    case "nome-vazio":
      return "Escreva o nome do mercado.";
    case "nome-longo":
      return `O nome pode ter até ${limitesDoProprio.nome} caracteres.`;
    case "tipo-invalido":
      return "Escolha o tipo do mercado.";
    case "ponto-invalido":
      return "O lugar do mercado não veio certo. Escolha de novo onde ele fica.";
    case "limite":
      return `Este aparelho já tem ${limitesDoProprio.mercados} mercados cadastrados, o máximo. Exclua um que não usa mais.`;
    case "repetido":
      return `"${erro.existente.nome}" já está cadastrado neste lugar.`;
  }
}

/** Confirmação do cadastro; avisa quando o mercado ficou fora da distância escolhida. */
export function avisoDoCadastro(nome: string, distanciaKm: number, raioKm: number): string {
  const cadastrado = `Mercado cadastrado: ${nome}.`;
  if (distanciaKm <= raioKm) return cadastrado;
  return `${cadastrado} Ele fica a ${formatarDistancia(distanciaKm)} do ponto da busca, fora da distância máxima de ${raioKm} km.`;
}
