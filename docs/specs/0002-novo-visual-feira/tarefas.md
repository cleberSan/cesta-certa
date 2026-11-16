# Tarefas 0002: Novo visual, direção "Feira"

Spec: [spec.md](spec.md) · Plano: [plano.md](plano.md)

A documentação entrou no PR #16 (portão, mesclado em 2026-11-16). O código vem num PR seguinte, uma tarefa por commit, com build verde e teste junto. Marcar `[x]` no commit que conclui.

## Portão: spec e plano

- [x] **T00** Spec, plano, tarefas e ADR-0009 em rascunho — prova: revisão do PR #16 — cobre: nenhum

## Código

- [x] **T01** Fontes e tokens: woff2 e licenças em `src/assets/fonts/`, `fonts` no `astro.config.mjs`, `<Font />` no `BaseLayout`, tokens claro e escuro e tipografia em `global.css`, `theme-color` novo, fontes na lista do service worker; ADR-0009 aceito — arquivos: `src/assets/fonts/`, `astro.config.mjs`, `src/layouts/`, `src/styles/`, `src/config/offline.ts` — prova: `e2e/fontes.spec.ts`, unidade do service worker, axe — cobre: CA-14, CA-15, CA-16
- [ ] **T02** Navegação: cabeçalho, barra inferior no celular, menu no topo no computador e rodapé — arquivos: `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`, `src/layouts/BaseLayout.astro` — prova: `e2e/navegacao.spec.ts` e o teste do menu em `e2e/pages.spec.ts` — cobre: CA-01, CA-02, CA-03, CA-04
- [ ] **T03** Início: herói, prévia da demonstração calculada no build, atalhos, dados no aparelho e como funciona — arquivos: `src/pages/index.astro`, `src/features/demo/previa.ts` — prova: unidade da prévia e E2E do início — cobre: CA-05, CA-06, CA-07
- [ ] **T04** Peças comuns e demais telas: botões, cartões, campos, alertas, selos e chips; Nota, Preços, Mercados, Seus dados, Sobre, Privacidade e 404 — arquivos: `src/styles/global.css`, `src/features/*/*.css`, `src/pages/` — prova: axe nos dois temas e 320 px em todas as páginas — cobre: CA-17
- [ ] **T05** Lista: grupos "Faltam" e "No carrinho", cartão do item, quantidade com "+" e "−" e barra de resumo — arquivos: `src/features/lista/` — prova: unidade de `ajustarQuantidade`, `e2e/lista.spec.ts` — cobre: CA-08, CA-09, CA-10
- [ ] **T06** Comparação: cartão da opção mais barata, diferença e barra das demais, selos dos avisos — arquivos: `src/features/comparar/`, `src/features/demo/` — prova: unidade de `textos.ts`, `e2e/comparar.spec.ts` e `e2e/demo.spec.ts` — cobre: CA-11, CA-12, CA-13
- [ ] **T07** Movimento e acabamento: transições só sem pedido de movimento reduzido, conferência de LCP e CLS, prints do celular e do computador para o PR, README e status `implementada` — arquivos: CSS, `README.md`, esta pasta — prova: E2E de movimento reduzido, Lighthouse anotado no PR — cobre: CA-18
