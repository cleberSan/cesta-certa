/*
 * Service worker do Cesta Certa (spec 0001, CA-36; ADR-0007): abre o site sem internet depois
 * da primeira visita a uma página com o aplicativo. Escrito à mão, sem biblioteca. O build
 * (astro.config.mjs) troca as duas constantes abaixo pela versão e pela lista de arquivos do
 * site (src/config/offline.ts).
 *
 * - Páginas: rede primeiro, para a pessoa ver sempre a versão nova; sem rede, a cópia guardada.
 * - Arquivos com hash em /_astro/, ícones e manifesto: a cópia guardada primeiro, porque o
 *   arquivo daquele endereço nunca muda.
 * - Base de mercados em /data/: rede primeiro, guardando a última cópia de cada região baixada,
 *   para a comparação abrir sem internet no ponto já usado.
 * - /api/, outros métodos e outros sites: o service worker não toca. Nota fiscal e pergunta ao
 *   assistente nunca ficam no cache; os dados da pessoa estão no IndexedDB, não aqui.
 */
"use strict";

const versao = "desenvolvimento";
const arquivos = [];

const prefixo = "cesta-certa-";
const cacheDoApp = `${prefixo}app-${versao}`;
const cacheDosArquivos = `${prefixo}arquivos`;
const cacheDosDados = `${prefixo}dados`;
const guardados = new Set(arquivos);

/** "/lista/" vira "/lista"; a raiz fica "/". */
function semBarraNoFinal(caminho) {
  return caminho.length > 1 && caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
}

/** Só resposta completa do próprio site entra no cache: nada de erro, redirecionamento ou opaco. */
function podeGuardar(resposta) {
  return resposta.ok && resposta.type === "basic" && !resposta.redirected;
}

async function guardarTudo() {
  const cache = await caches.open(cacheDoApp);
  const respostas = await Promise.all(
    arquivos.map(async (endereco) => {
      const resposta = await fetch(endereco, { cache: "no-cache" });
      if (!podeGuardar(resposta)) throw new Error(`Não deu para guardar ${endereco}.`);
      return [endereco, resposta];
    }),
  );
  await Promise.all(respostas.map(([endereco, resposta]) => cache.put(endereco, resposta)));
}

/** Apaga as listas de versões anteriores e os arquivos guardados por elas; a base fica. */
async function limparVersoesAntigas() {
  const nomes = await caches.keys();
  await Promise.all(
    nomes
      .filter((nome) => nome.startsWith(prefixo) && nome !== cacheDoApp && nome !== cacheDosDados)
      .map((nome) => caches.delete(nome)),
  );
}

function guardarDepois(evento, nomeDoCache, chave, resposta) {
  if (!podeGuardar(resposta)) return;
  const copia = resposta.clone();
  evento.waitUntil(caches.open(nomeDoCache).then((cache) => cache.put(chave, copia)));
}

async function pagina(evento, caminho) {
  try {
    const resposta = await fetch(evento.request);
    if (guardados.has(caminho)) guardarDepois(evento, cacheDoApp, caminho, resposta);
    return resposta;
  } catch (erro) {
    const guardada = guardados.has(caminho)
      ? await caches.match(caminho, { cacheName: cacheDoApp })
      : undefined;
    if (guardada === undefined) throw erro;
    return guardada;
  }
}

async function guardadoPrimeiro(evento) {
  const guardado = await caches.match(evento.request, { ignoreSearch: true });
  if (guardado !== undefined) return guardado;
  const resposta = await fetch(evento.request);
  guardarDepois(evento, cacheDosArquivos, evento.request, resposta);
  return resposta;
}

async function redePrimeiro(evento) {
  try {
    const resposta = await fetch(evento.request);
    guardarDepois(evento, cacheDosDados, evento.request, resposta);
    return resposta;
  } catch (erro) {
    const guardada = await caches.match(evento.request, { cacheName: cacheDosDados });
    if (guardada === undefined) throw erro;
    return guardada;
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(guardarTudo().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(limparVersoesAntigas().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  const caminho = semBarraNoFinal(url.pathname);
  if (caminho === "/api" || caminho.startsWith("/api/")) return;

  if (pedido.mode === "navigate") {
    evento.respondWith(pagina(evento, caminho));
  } else if (caminho.startsWith("/_astro/") || guardados.has(caminho)) {
    evento.respondWith(guardadoPrimeiro(evento));
  } else if (caminho.startsWith("/data/")) {
    evento.respondWith(redePrimeiro(evento));
  }
});
