/** Textos da tela de mercados, testados (spec 0001, CA-05, CA-07 e CA-39). */
import type { TipoDeMercado } from "../../shared/contratos/mercados";
import type { ErroDaCarga } from "./carga";
import type { ErroDaLocalizacao } from "./localizacao";

const nomesDosTipos: Record<TipoDeMercado, string> = {
  bairro: "Mercado de bairro",
  supermercado: "Supermercado",
  atacarejo: "Atacarejo",
};

export function descreverTipo(tipo: TipoDeMercado): string {
  return nomesDosTipos[tipo];
}

export function mensagemDaLocalizacao(erro: ErroDaLocalizacao): string {
  switch (erro) {
    case "negada":
      return "O navegador não deu permissão para usar a localização. Escolha a cidade.";
    case "indisponivel":
      return "Este aparelho não informou a localização. Escolha a cidade.";
    case "sem-resposta":
      return "A localização não chegou em 10 segundos. Escolha a cidade ou tente de novo.";
  }
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
