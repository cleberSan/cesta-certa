import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import type { BancoD1 } from "../cota";

/**
 * D1 local de verdade para os testes (o mesmo SQLite do `wrangler dev`, rodando no workerd), em
 * memória e sem conta da Cloudflare. Um por arquivo de teste; `limpar` zera os contadores.
 */
export interface D1DeTeste {
  banco: BancoD1;
  limpar: () => Promise<void>;
  fechar: () => Promise<void>;
}

export async function abrirD1(): Promise<D1DeTeste> {
  const proxy = await getPlatformProxy<{ USO_ASSISTENTE: BancoD1 & D1Limpavel }>({
    configPath: fileURLToPath(new URL("./wrangler.d1.jsonc", import.meta.url)),
    persist: false,
    envFiles: [],
  });
  const banco = proxy.env.USO_ASSISTENTE;
  return {
    banco,
    limpar: async () => {
      await banco.exec("DROP TABLE IF EXISTS uso_assistente");
    },
    fechar: () => proxy.dispose(),
  };
}

interface D1Limpavel {
  exec(sql: string): Promise<unknown>;
}
