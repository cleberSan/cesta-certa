import type { Resultado } from "../resultado";

/**
 * Onde ficam os dados da pessoa: só no aparelho (spec 0001). As fatias falam com esta
 * interface; a implementação de verdade usa o IndexedDB (indexeddb.ts) e a de memória serve
 * aos testes e de reserva quando o navegador não deixa guardar.
 */
export const armazens = ["listas", "itens"] as const;

export type NomeDoArmazem = (typeof armazens)[number];

/** Todo registro guardado tem um `id`, que é a chave dele no armazém. */
export interface Registro {
  readonly id: string;
}

/** O que foi lido do aparelho, ainda sem conferir o formato de cada registro. */
export type Conteudo = Readonly<Record<NomeDoArmazem, readonly unknown[]>>;

export type Registros = Readonly<Record<NomeDoArmazem, readonly Registro[]>>;

export interface AlteracoesDoArmazem {
  readonly gravar?: readonly Registro[];
  readonly apagar?: readonly string[];
}

/** Gravações e remoções que entram juntas: ou todas valem, ou nenhuma. */
export type Alteracoes = Readonly<Partial<Record<NomeDoArmazem, AlteracoesDoArmazem>>>;

export type ErroDoBanco =
  /** O navegador não tem IndexedDB ou não deixou abrir (modo restrito, política do aparelho). */
  | "indisponivel"
  /** O aparelho tem dados gravados por uma versão mais nova do app. */
  | "versao-mais-nova"
  /** A conexão deixou de valer: outra aba atualizou o app ou substituiu os dados (importação). */
  | "fechado"
  /** O aparelho não tem espaço para guardar. */
  | "sem-espaco"
  | "falhou";

export interface Banco {
  /** Falso quando os dados somem ao fechar a página (reserva em memória). */
  readonly persistente: boolean;
  lerTudo(): Promise<Resultado<Conteudo, ErroDoBanco>>;
  aplicar(alteracoes: Alteracoes): Promise<Resultado<void, ErroDoBanco>>;
  /** Troca tudo o que está guardado pelo conteúdo recebido (importação). */
  substituirTudo(registros: Registros): Promise<Resultado<void, ErroDoBanco>>;
}
