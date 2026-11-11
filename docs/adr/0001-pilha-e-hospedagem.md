# ADR-0001: Astro estático com ilhas React e um Worker da Cloudflare para a API

- Status: aceito
- Data: 2026-11-10

## Contexto

O cesta-certa é um site feito primeiro para o celular, com custo zero e sem risco de cobrança. A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) pede que os dados da pessoa (lista, preços, ponto escolhido) fiquem no aparelho, e o servidor entra só onde o navegador não alcança:

- consultar a página pública de uma nota fiscal (NFC-e), que o navegador não pode buscar de outra origem;
- mais adiante, falar com a API da Anthropic sem expor a chave.

Fatos conferidos em 2026-11-10 na [documentação de limites do Workers](https://developers.cloudflare.com/workers/platform/limits/), plano gratuito: 100 mil requisições por dia ao código do Worker, 10 ms de CPU por requisição, 50 requisições de saída por requisição e 128 MB de memória. Ao passar do limite diário, a Cloudflare responde com erro (1027) até a virada do dia em UTC. O plano gratuito não pede cartão, então não há como gerar cobrança.

O ecossistema já tem um site nesse desenho, o lojinha-da-lua (Astro estático publicado como arquivos de um Worker), com CI, cabeçalhos, CSP por hash e E2E prontos para reaproveitar.

## Decisão

1. **Páginas estáticas com Astro 7**, geradas no build. JavaScript só nas páginas que têm ilha React (`client:load`); as demais saem sem script.
2. **Um Worker no mesmo projeto** (`worker/index.ts`) atende só `/api` e `/api/*` (`run_worker_first` no `wrangler.jsonc`). Os arquivos de `dist/` são servidos direto pela plataforma, sem executar código.
3. **Pastas por assunto:** `src/features/<assunto>/` para telas e regras do app, `src/shared/` para o que é comum (contratos, dinheiro, resultado), `src/config/` para site e segurança, `worker/<assunto>/` para o servidor. O contrato de cada rota fica em `src/shared/contratos/` e é usado dos dois lados.
4. **Regras em TypeScript puro**, sem depender do runtime: o que o Worker precisa de fora (rede, relógio, log, identificador) chega por parâmetro. O leitor da nota fiscal é um segmentador de HTML próprio, sem `HTMLRewriter`, para rodar igual no Vitest e no workerd.
5. **Cabeçalhos de segurança de uma fonte só** (`src/config/security.ts`): geram o `_headers` das páginas, a CSP por hash do Astro e os cabeçalhos das respostas da API.
6. **Erros da API em ProblemDetails** (RFC 9457) com `code` estável e `traceId`, repetido no cabeçalho `X-Correlation-Id` e no log.
7. **Log estruturado** em uma linha JSON por evento, só com metadados técnicos. Os logs do Worker ficam ligados no `wrangler.jsonc` com a query string redigida.
8. **Publicação pelo Workers Builds**, o app da Cloudflare no GitHub: produção a cada merge no `main` e uma prévia por branch. Nenhum token da Cloudflare fica no repositório nem nos secrets do GitHub. O `main` protegido, com CI, revisão de dependências e CodeQL obrigatórios, é o portão antes da produção.
9. **Mesmo runtime nos testes:** o E2E sobe `wrangler dev` (workerd), com o mesmo `_headers`, a mesma página 404 e o mesmo roteamento de `/api`.

## Alternativas

- **Next.js na Vercel (como o portfolio-web):** funcionaria, mas o app é quase todo estático e local, e o Next traria renderização no servidor que ele não usa. O desenho de Worker, CSP por hash e prévia por branch já está pronto e testado no lojinha-da-lua.
- **Astro com o adaptador da Cloudflare (SSR):** toda página passaria pelo Worker e contaria no limite diário, sem ganho: nenhuma página depende de dado do servidor.
- **SPA com Vite:** perderia o HTML pronto no primeiro carregamento, pior no celular com rede ruim, e a CSP por hash que o Astro gera.
- **Worker em repositório separado:** dois deploys e um contrato duplicado para uma API de poucas rotas.
- **`HTMLRewriter` para ler a nota:** é do runtime, mais rápido, mas não existe no Node. Os testes do leitor teriam de rodar dentro do workerd, com uma dependência nova (`@cloudflare/vitest-pool-workers`). O leitor próprio lê a página em uma passada e é limitado por tamanho, blocos e itens.
- **Deploy por GitHub Actions com `wrangler deploy`:** daria deploy só depois do CI verde, ao custo de guardar um token da conta no GitHub. A proteção do `main` dá a mesma garantia sem segredo.

## Consequências

- Página estática não conta no limite gratuito; cada chamada a `/api` conta. Passou de 100 mil por dia, a API responde com erro até a virada do dia (UTC) e as páginas seguem no ar.
- O limite de 10 ms de CPU por requisição vale para a leitura da nota. A página é limitada a 512 KB e lida em tempo linear; o comportamento com notas reais será medido na prévia e nos logs do Worker (`duracaoMs`), e este ADR é revisto se o limite apertar.
- A API é pública. Ela só consulta os endereços oficiais da lista e confere a origem do pedido, mas ainda não tem limite de requisições por cliente. O plano prevê esse limite antes da rota do assistente (PR 4), e depende de confirmar que o recurso existe no plano gratuito.
- Sem banco e sem estado no servidor neste momento: não há backup nem migração a operar. Quando o assistente chegar, a decisão sobre contadores de uso vira outro ADR.
- **Rollback:** voltar para a versão anterior em Deployments, no painel do Worker. Como as páginas e a API saem no mesmo deploy, voltar uma versão volta as duas juntas.
- O que só o dono faz, fora do repositório: instalar o app da Cloudflare só neste repositório, criar o Worker `cesta-certa` com o comando de build `npm run build` e proteger o `main`. O passo a passo está no [CONTRIBUTING](../../CONTRIBUTING.md).
