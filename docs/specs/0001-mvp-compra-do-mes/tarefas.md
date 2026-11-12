# Tarefas 0001: MVP do comparador da compra do mês

Spec: [spec.md](spec.md) · Plano: [plano.md](plano.md)

Um PR de portão só com documentação e cinco PRs de código, cada tarefa num commit com build verde e teste junto. Marcar `[x]` no commit que conclui.

## PR do portão: spec e plano

- [x] **T00** Base de documentação (README, licença, SECURITY, CODEOWNERS, template de PR, ADR-0000, `docs/specs/README.md`) e esta spec — prova: revisão do PR — cobre: nenhum

## PR 1: fundação e spike da nota fiscal

- [x] **T01** CI no padrão dos sites (formatação, lint, tipos, cobertura de 80%, build, E2E), CodeQL, revisão de dependências, Dependabot, `.nvmrc`, TypeScript estrito e CONTRIBUTING — arquivos: `.github/`, raiz — prova: CI verde — cobre: nenhum
- [x] **T02** Esqueleto Astro + ilha React + Worker `/api`, cabeçalhos e CSP de uma fonte só, manifest do PWA, `/privacidade`, `/sobre` e ADR-0001 — arquivos: `src/`, `worker/`, `public/`, `docs/adr/` — prova: unidade dos cabeçalhos, E2E com axe — cobre: CA-37 (base)
- [ ] **T03** Spike da consulta de NFC-e de São Paulo: validador de link por UF, busca com limites, leitor em TypeScript puro sobre fixture sintética e página de teste `/nota`; o Cleber testa na prévia com uma nota real e manda print do resultado — arquivos: `worker/nfce/`, `src/features/precos/nfce/` — prova: `npm test -- worker/nfce`, `e2e/nota.spec.ts` e print da prévia — cobre: CA-11, CA-12, CA-13 (os códigos de erro e o aviso; o botão de digitar chega na T12) — andamento: código e testes entregues; falta o print da prévia com uma nota real para marcar como concluída

## PR 2: lista e dados no aparelho

- [x] **T04** Domínio da lista (criar, editar, duplicar, duplicidade), tela `/lista` e armazenamento no IndexedDB com migração versionada (versão 1: `listas` e `itens`) e ADR-0002 — arquivos: `src/features/lista/`, `src/shared/armazenamento/`, `src/pages/lista.astro`, `docs/adr/` — prova: unidade e `e2e/lista.spec.ts` — cobre: CA-01, CA-02, CA-03
- [x] **T05** Exportar e importar JSON com validação e limite, tela `/dados` e aviso entre abas quando a importação substitui tudo — arquivos: `src/shared/armazenamento/`, `src/features/dados/`, `src/pages/dados.astro` — prova: unidade e `e2e/dados.spec.ts` — cobre: CA-04 (listas e itens; mercados próprios, associações e preços entram no arquivo nas tarefas T08, T11 e T12)

## PR 3: mercados, mapa e rota

- [x] **T06** Base nacional de mercados: script Overpass por UF, divisão em células de 1 grau, `cidades.json`, medição de tamanho e workflow mensal que abre PR — arquivos: `scripts/mercados.ts`, `.github/workflows/mercados.yml`, `public/data/` — prova: unidade do conversor e da divisão com fixture; relatório de tamanho no PR — cobre: CA-07
- [x] **T07** Primeiro acesso: tela de explicação em `/mercados`, localização só depois do toque, "Escolher cidade", células que o raio toca, raio e distância no aparelho, ponto e raio no armazém `ajustes` (banco na versão 2, fora da cópia) — arquivos: `src/features/mercados/`, `src/shared/armazenamento/` — prova: unidade, `e2e/localizacao.spec.ts`, `e2e/privacidade.spec.ts`, `e2e/mercados.spec.ts` — cobre: CA-05, CA-06, CA-07, CA-39 (aviso de ponto sem mercados ou fora do Brasil com "Aumentar para N km"); "Marcar no mapa" entra com o mapa, na T10
- [ ] **T08** Mercado próprio, "Saber mais" e oferta de cadastrar um mercado quando o raio está vazio — arquivos: `src/features/mercados/` — prova: `e2e/mercados.spec.ts` — cobre: CA-08, CA-09, CA-39, CA-04 (migração do banco e versão nova do arquivo de cópia com este armazém)
- [ ] **T09** Links de rota para Waze e Google Maps, com paradas — arquivos: `src/features/rota/` — prova: unidade e E2E do `href` — cobre: CA-24, CA-25
- [ ] **T10** Mapa com MapLibre carregado sob demanda, pessoinha, pinos e folha inferior, com visão em lista equivalente, e "Marcar no mapa" como terceira forma de escolher o ponto (CA-05) — arquivos: `src/features/mapa/` — prova: E2E com axe e teclado — cobre: CA-37

## PR 4: preços

- [ ] **T11** Importar NFC-e no app (QR pela câmera e link colado) e associar produtos — arquivos: `src/features/precos/nfce/` — prova: unidade e `e2e/nota.spec.ts` com Worker simulado — cobre: CA-10, CA-14, CA-04 (migração do banco e versão nova do arquivo de cópia com este armazém)
- [ ] **T12** Preço digitado, fonte, data e marca de antigo — arquivos: `src/features/precos/manual/` — prova: unidade com relógio controlado — cobre: CA-15, CA-16, CA-04 (migração do banco e versão nova do arquivo de cópia com este armazém)
- [ ] **T13** Leitor de embalagem, preço por unidade e faixa de atacado — arquivos: `src/features/precos/unidades.ts` — prova: unidade com valores-limite — cobre: CA-17, CA-18

## PR 5: comparar, assistente e demonstração

- [ ] **T14** Objetivo em quatro perguntas e otimizador com ranking, teto e combinações — arquivos: `src/features/comparar/` — prova: unidade e teste de desempenho — cobre: CA-19, CA-20, CA-21, CA-22, CA-23
- [ ] **T15** Servidor do assistente: código de acesso, validação de tamanho, limite atômico no D1, provedores `fake`, `gravado` e `anthropic` com tempo limite e tratamento de recusa — arquivos: `worker/assistente/`, `migrations/0001_uso_assistente.sql` — prova: `npm test -- worker/assistente` — cobre: CA-29, CA-30, CA-31, CA-32, CA-34
- [ ] **T16** Tela do assistente: aceite, montador de contexto, conferência de valores e respostas gravadas na demonstração; o Cleber cria os segredos no Cloudflare e testa na prévia, mandando print — arquivos: `src/features/assistente/` — prova: unidade, `e2e/assistente.spec.ts` e print — cobre: CA-26, CA-27, CA-28, CA-33, CA-35
- [ ] **T17** Demonstração com dados fictícios separados, primeiro uso sem preços e uso offline — arquivos: `src/features/demo/`, `public/sw.js` — prova: unidade do `demo.json`, `e2e/demo.spec.ts`, `e2e/offline.spec.ts` — cobre: CA-36, CA-38, CA-40
- [ ] **T18** Documentação: README, os ADRs de 0002 a 0005 que ainda faltarem, página Sobre com atribuições (OSM, OpenFreeMap) — prova: revisão do PR — cobre: nenhum
- [ ] **T19** Fechar: todo critério com teste (`grep -rn "spec 0001 CA-"`), CI verde, conferência de produção ligada, spec com status `implementada` — cobre: todos
