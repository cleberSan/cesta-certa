import { sucesso } from "../resultado";
import { armazens, type Banco, type NomeDoArmazem, type Registro, type Registros } from "./banco";

/**
 * Banco em memória, com o mesmo contrato do IndexedDB. Usado nos testes de unidade e como
 * reserva quando o navegador não deixa guardar: a lista funciona, mas some ao fechar a página.
 */
export function criarBancoEmMemoria(inicial: Partial<Registros> = {}): Banco {
  const dados = new Map<NomeDoArmazem, Map<string, Registro>>();
  const preencher = (registros: Partial<Registros>) => {
    for (const nome of armazens) {
      dados.set(nome, new Map((registros[nome] ?? []).map((registro) => [registro.id, registro])));
    }
  };
  preencher(inicial);
  const armazem = (nome: NomeDoArmazem) => dados.get(nome)!;

  return {
    persistente: false,
    async lerTudo() {
      return sucesso({
        listas: [...armazem("listas").values()],
        itens: [...armazem("itens").values()],
      });
    },
    async aplicar(alteracoes) {
      for (const nome of armazens) {
        const { gravar = [], apagar = [] } = alteracoes[nome] ?? {};
        for (const id of apagar) armazem(nome).delete(id);
        for (const registro of gravar) armazem(nome).set(registro.id, registro);
      }
      return sucesso(undefined);
    },
    async substituirTudo(registros) {
      preencher(registros);
      return sucesso(undefined);
    },
  };
}
