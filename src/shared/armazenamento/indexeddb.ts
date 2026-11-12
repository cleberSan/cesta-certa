import { falha, sucesso, type Resultado } from "../resultado";
import {
  armazens,
  type Alteracoes,
  type Banco,
  type Conteudo,
  type ErroDoBanco,
  type NomeDoArmazem,
  type Registros,
} from "./banco";
import { aplicarMigracoes, versaoDoBanco } from "./migracoes";

/**
 * Banco no IndexedDB do navegador. Este arquivo é só a ponte com a API do navegador: não
 * roda no Node, então fica fora da cobertura de unidade e é provado pelos testes E2E
 * (e2e/lista.spec.ts e e2e/dados.spec.ts). As regras ficam em arquivos com teste de unidade:
 * migracoes.ts, arquivo.ts e as fatias.
 */
export const nomeDoBanco = "cesta-certa";

export async function abrirIndexedDb(
  fabrica: IDBFactory | undefined,
  nome: string = nomeDoBanco,
): Promise<Resultado<Banco, ErroDoBanco>> {
  if (fabrica === undefined) return falha("indisponivel");

  let conexao: IDBDatabase;
  try {
    conexao = await abrir(fabrica, nome);
  } catch (erro) {
    return falha(nomeDoErro(erro) === "VersionError" ? "versao-mais-nova" : "indisponivel");
  }

  let fechada = false;
  // Outra aba abriu uma versão mais nova do app: soltar o banco para ela conseguir atualizar.
  conexao.onversionchange = () => {
    fechada = true;
    conexao.close();
  };
  conexao.onclose = () => {
    fechada = true;
  };
  // Outra aba substituiu tudo (importação): o que esta aba tem em memória deixou de valer.
  // Daqui em diante ela recusa gravar, para não misturar o estado antigo com os dados novos.
  const canal = abrirCanal(nome);
  if (canal !== null) {
    canal.onmessage = () => {
      fechada = true;
      conexao.close();
    };
  }

  function transacao<T>(
    modo: IDBTransactionMode,
    corpo: (transacao: IDBTransaction) => () => T,
  ): Promise<Resultado<T, ErroDoBanco>> {
    return new Promise((resolver) => {
      if (fechada) {
        resolver(falha("fechado"));
        return;
      }
      let aberta: IDBTransaction;
      try {
        aberta = conexao.transaction(armazens, modo);
      } catch (erro) {
        resolver(falha(fechada ? "fechado" : classificar(erro)));
        return;
      }
      aberta.onabort = () => resolver(falha(classificar(aberta.error)));
      try {
        const ler = corpo(aberta);
        aberta.oncomplete = () => resolver(sucesso(ler()));
      } catch (erro) {
        // Um pedido recusado no meio (registro inválido, por exemplo) desfaz os anteriores.
        resolver(falha(classificar(erro)));
        aberta.abort();
      }
    });
  }

  return sucesso({
    persistente: true,
    lerTudo() {
      return transacao<Conteudo>("readonly", (aberta) => {
        const pedidos = armazens.map((armazem) => aberta.objectStore(armazem).getAll());
        return () => {
          const lido = (armazem: NomeDoArmazem) =>
            (pedidos[armazens.indexOf(armazem)]?.result ?? []) as unknown[];
          return { listas: lido("listas"), itens: lido("itens") };
        };
      });
    },
    aplicar(alteracoes: Alteracoes) {
      return transacao<void>("readwrite", (aberta) => {
        for (const nome of armazens) {
          const { gravar = [], apagar = [] } = alteracoes[nome] ?? {};
          const armazem = aberta.objectStore(nome);
          for (const id of apagar) armazem.delete(id);
          for (const registro of gravar) armazem.put(registro);
        }
        return () => undefined;
      });
    },
    async substituirTudo(registros: Registros) {
      const substituido = await transacao<void>("readwrite", (aberta) => {
        for (const nome of armazens) {
          const armazem = aberta.objectStore(nome);
          armazem.clear();
          for (const registro of registros[nome]) armazem.put(registro);
        }
        return () => undefined;
      });
      // O aviso chega às outras abas, nunca a esta: quem substituiu já tem o estado novo.
      if (substituido.ok) canal?.postMessage("substituido");
      return substituido;
    },
  });
}

function abrir(fabrica: IDBFactory, nome: string): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = fabrica.open(nome, versaoDoBanco);
    // Uma exceção aqui aborta a transação de atualização: o banco fica como estava.
    pedido.onupgradeneeded = (evento) => {
      aplicarMigracoes(pedido.result, evento.oldVersion, versaoDoBanco);
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

/** Canal entre as abas do site. Navegador sem BroadcastChannel segue sem o aviso. */
function abrirCanal(nome: string): BroadcastChannel | null {
  return typeof BroadcastChannel === "function" ? new BroadcastChannel(`${nome}:dados`) : null;
}

function nomeDoErro(erro: unknown): string {
  return erro instanceof Error || erro instanceof DOMException ? erro.name : "";
}

function classificar(erro: unknown): ErroDoBanco {
  return nomeDoErro(erro) === "QuotaExceededError" ? "sem-espaco" : "falhou";
}
