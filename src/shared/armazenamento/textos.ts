import type { ErroDoBanco } from "./banco";

/** O que dizer à pessoa quando o armazenamento do aparelho falha. */
export function mensagemDoBanco(motivo: ErroDoBanco): string {
  switch (motivo) {
    case "sem-espaco":
      return "O aparelho está sem espaço para guardar. Nada foi alterado.";
    case "fechado":
      return "Os dados deste aparelho mudaram em outra aba. Recarregue esta página para continuar.";
    case "versao-mais-nova":
      return "Este aparelho tem dados de uma versão mais nova do app. Recarregue a página para atualizar.";
    case "indisponivel":
      return "O navegador não deixou guardar dados neste aparelho.";
    case "falhou":
      return "Não foi possível guardar no aparelho. Nada foi alterado; tente de novo.";
  }
}
