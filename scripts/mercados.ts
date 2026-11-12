/**
 * Gera a base nacional de mercados a partir do OpenStreetMap (spec 0001, T06; ADR-0005).
 *
 *   node scripts/mercados.ts --saida base [--anterior public/data/mercados/indice.json]
 *     [--relatorio base/relatorio.md] [--ufs SP,RJ]
 *
 * Roda no workflow mensal `.github/workflows/mercados.yml`. Escreve `mercados/<célula>.json`,
 * `mercados/indice.json` e `cidades.json` dentro da pasta de saída, só se todas as UFs
 * responderem e a conferência passar. Sai com código 1 em qualquer falha.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { parseArgs } from "node:util";
import { consultarTodas, prepararPublicacao, totalDoIndice } from "./mercados/executar.ts";
import { ufs } from "./mercados/overpass.ts";

const instancia = "https://overpass-api.de/api/interpreter";
// Identificação pedida pela política de uso da Overpass: o projeto, sem dado pessoal.
const agente = "cesta-certa/1 (+https://github.com/cleberSan/cesta-certa)";

const { values: argumentos } = parseArgs({
  options: {
    saida: { type: "string" },
    anterior: { type: "string" },
    relatorio: { type: "string" },
    ufs: { type: "string" },
  },
});

async function lerSeExistir(caminho: string | undefined): Promise<string | null> {
  if (caminho === undefined) return null;
  try {
    return await readFile(caminho, "utf8");
  } catch {
    return null;
  }
}

async function principal(): Promise<number> {
  const saida = argumentos.saida;
  if (saida === undefined) {
    console.error("Informe a pasta de saída: --saida <pasta>.");
    return 1;
  }
  const escolhidas = argumentos.ufs?.split(",").map((uf) => uf.trim().toUpperCase()) ?? [...ufs];
  const desconhecidas = escolhidas.filter((uf) => !(ufs as readonly string[]).includes(uf));
  if (desconhecidas.length > 0) {
    console.error(`UF desconhecida: ${desconhecidas.join(", ")}.`);
    return 1;
  }

  const consulta = await consultarTodas(
    {
      async consultar(texto) {
        const resposta = await fetch(instancia, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": agente },
          body: new URLSearchParams({ data: texto }),
          signal: AbortSignal.timeout(400_000),
        });
        return { status: resposta.status, texto: await resposta.text() };
      },
      esperar: (ms) => esperar(ms),
      registrar: (linha) => console.log(linha),
    },
    { ufs: escolhidas, pausaMs: 20_000, tentativas: 4, esperaMs: 60_000 },
  );
  if (!consulta.ok) {
    console.error(`A base não foi gerada: ${consulta.motivo}`);
    return 1;
  }

  const anterior = totalDoIndice(await lerSeExistir(argumentos.anterior));
  const publicacao = prepararPublicacao(consulta.respostas, anterior, new Date());
  if (argumentos.relatorio !== undefined) {
    await mkdir(dirname(argumentos.relatorio), { recursive: true });
    await writeFile(argumentos.relatorio, publicacao.relatorio);
  }
  console.log(publicacao.relatorio);
  if (publicacao.problemas.length > 0) {
    console.error("A base não foi publicada: a conferência encontrou problemas.");
    return 1;
  }

  await rm(join(saida, "mercados"), { recursive: true, force: true });
  for (const [caminho, texto] of publicacao.arquivos) {
    const destino = join(saida, caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, texto);
  }
  console.log(`${publicacao.arquivos.size} arquivos gravados em ${saida}.`);
  return 0;
}

process.exitCode = await principal();
