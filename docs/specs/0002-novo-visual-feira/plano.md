# Plano 0002: Novo visual, direção "Feira"

- Spec: [spec.md](spec.md)
- Data: 2026-11-16

## Contexto técnico

- Astro 7.4.7 estático com ilhas React só onde há dados do aparelho ([ADR-0001](../../adr/0001-pilha-e-hospedagem.md)). As páginas sem ilha saem sem JavaScript, e isso continua.
- CSP por hash, sem `'unsafe-inline'`: todo estilo fica em CSS com classes. Os mockups do artefato de design usam estilo inline só por serem mockups.
- Estilos hoje: `src/styles/global.css` (tokens e peças comuns), `<style>` com escopo nos componentes Astro e um CSS por fatia em `src/features/*/`. A troca de visual acontece nesses mesmos arquivos, sem biblioteca de CSS.
- Restrições do dono: custo zero, nada de dependência nova sem OK, decisão vira ADR. A escolha da direção e das fontes foi feita no card de 2026-11-16.

## Fatos verificados

Conferidos em 2026-11-16.

| Fato                                                                                                                                                                                                                                                                                              | Fonte                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bricolage Grotesque (Mathieu Triay) e Inter (Rasmus Andersson) estão sob a SIL Open Font License 1.1: uso, cópia e redistribuição livres, inclusive embutidas em site, desde que a licença acompanhe os arquivos e o nome reservado não seja usado numa versão modificada.                        | `ofl/bricolagegrotesque/OFL.txt` e `ofl/inter/OFL.txt` no repositório google/fonts                        |
| Subconjunto latino em woff2 servido pelo Google Fonts: Bricolage Grotesque 800 com tamanho óptico 48 tem 22.192 bytes; Inter variável de 400 a 700 tem 48.256 bytes. Juntas, cerca de 70 KB. O subconjunto latino (U+0000-00FF e alguns símbolos) cobre todas as letras do português.             | Download do `fonts.googleapis.com/css2` com navegador moderno, medido com `stat`                          |
| Bricolage Grotesque variável com tamanho óptico e peso (12..96, 500..800) teria 76.888 bytes só ela; por isso o plano usa um corte fixo de 800 para os títulos.                                                                                                                                   | Mesma medição                                                                                             |
| O Astro 7 tem a API de fontes estável, com o provedor `local`: lê arquivos do projeto, gera o `@font-face`, publica os arquivos com hash em `/_astro/` e cria a fonte reserva com métricas ajustadas (`size-adjust`) para evitar salto de layout. Não precisa de rede no build nem de pacote npm. | `node_modules/astro/dist/assets/fonts/providers/local.d.ts` e referência de configuração `fonts` do Astro |
| A CSP das páginas já tem `font-src 'self'` (`src/config/security.ts`).                                                                                                                                                                                                                            | Código                                                                                                    |

## Desenho

### Fontes e tokens (ADR-0009)

- Arquivos em `src/assets/fonts/` (`bricolage-grotesque-800-latin.woff2`, `inter-latin.woff2`) com `OFL-bricolage-grotesque.txt` e `OFL-inter.txt` ao lado. Fora de `public/` para não sair duplicado no build.
- `astro.config.mjs`: `fonts` com `fontProviders.local()`, variáveis `--fonte-titulo` e `--fonte-texto`, `display: "swap"` e reservas `system-ui` e `sans-serif`. O `<Font />` entra no `<head>` do `BaseLayout` com `preload`, o que também põe os arquivos no HTML e, portanto, na lista do service worker.
- Se o `<Font />` gerar estilo inline que a CSP do Astro não cubra, o plano B é declarar o `@font-face` em `global.css` com `url()` relativo (o Vite publica com hash) e a reserva ajustada escrita à mão; a decisão fica registrada no ADR-0009 na tarefa T01.
- Tokens em `global.css`, claro e escuro pelo `prefers-color-scheme`, com os valores do artefato: fundo `#F3F6F1`, superfície `#FFFFFF`, texto `#12201A`, texto suave `#46564C`, marca `#0B6E4F`, marca forte `#084F39`, etiqueta `#FFD43B`, menta `#E3F4EC`, borda `#DCE4DD`; no escuro fundo `#0F1512`, superfície `#18211C`, texto `#EAF1EC`, suave `#AEBDB4`, marca `#5FD3A4` com texto `#052A1C` sobre ela. Raios maiores (16 a 24 px), sombras suaves e escala de títulos com `clamp()`.
- Movimento só dentro de `@media (prefers-reduced-motion: no-preference)`: toque que afunda o bloco, barras que crescem, troca de grupo na lista.

### Navegação (CA-01 a CA-04)

- Um só `<nav aria-label="Principal">` no `SiteHeader`. Abaixo de 48 rem ele vira barra fixa no rodapé (`position: fixed`, altura de 64 px mais `env(safe-area-inset-bottom)`), com Início, Lista, Ler nota (círculo verde elevado no centro), Mercados e Preços, ícones SVG em linha com `aria-hidden` e rótulo visível. A partir de 48 rem fica no topo, numa linha, com o "Ler nota" como botão.
- A ordem do DOM é a ordem visual nos dois tamanhos. O link "Sobre" fica no cabeçalho como botão de informação (celular) ou no menu (computador); a cópia que não serve num tamanho fica com `display: none`, fora da árvore de acessibilidade.
- O `body` ganha `padding-bottom` igual à altura da barra no celular (CA-02). O rodapé mantém Seus dados, Privacidade, Sobre e o GitHub (CA-04).
- Sem JavaScript: é HTML e CSS do Astro.

### Início (CA-05 a CA-07)

- Seções: herói (etiqueta "Compra do mês", h1 "Onde a sua lista sai mais barata.", chamada), prévia da demonstração, blocos de atalho em grade (2 colunas no celular, 4 no computador), bloco "Seus dados ficam no aparelho" e um "Como funciona" curto em seguida, para não perder a explicação de hoje.
- Prévia: função pura `previaDaDemonstracao(dados, hoje)` em `src/features/demo/`, chamada no frontmatter do `index.astro` no build. Usa `montarDemonstracao` e `comparar` com o objetivo padrão, os mesmos da ilha da `/demonstracao`, e devolve nomes, total e economia já formatados. Nenhum script vai para a página.

### Lista (CA-08 a CA-10)

- `ListaDoMes` divide os itens em dois `<ul>`: "Faltam N" e "No carrinho N". Ao marcar, o item muda de lista e o foco vai para a caixa do mesmo item no novo grupo (teste de teclado).
- Cartão do item: caixa redonda de comprado (o `input type="checkbox"` continua, com aparência nova), nome e detalhes, controle de quantidade com "−" e "+" de 44 px e o número no meio, e o menu de editar e remover que já existe.
- Quantidade: função pura `ajustarQuantidade(estado, itemId, delta, contexto)` em `lista.ts`, com os mesmos limites de `limites.quantidade` e o mesmo tipo de resultado das outras mudanças, gravada pelo mesmo caminho do `editarItem`.
- Barra de resumo fixa acima da barra inferior, com "N itens" e o link "Comparar" para `/mercados`; a lista ganha espaço no fim para o último item não ficar coberto.

### Comparação (CA-11 a CA-13)

- `OpcaoDeCompra` ganha a variante de destaque para a posição 1: fundo verde, etiqueta amarela com o total, `descreverFrente` e `descreverCaminho` como já existem, e as ações de ver o que comprar e de rota.
- As demais opções mostram a diferença para a mais barata e uma barra com largura proporcional ao total; funções puras `diferencaParaAMelhor` e `larguraDaBarra` em `textos.ts`. A barra é decorativa (`aria-hidden`), e o texto ao lado já diz o total e a diferença.
- Selos: `selosDaLinha(linha, hoje)` devolve os avisos de preço antigo, outra marca e atacado como lista de `{ tipo, texto }`; a tela mostra cada um como selo com texto e cor.

### Demais telas

- Nota, Preços, Mercados, Seus dados, Sobre, Privacidade e 404 herdam tokens, botões, campos, cartões e alertas novos de `global.css`, com ajustes pontuais no CSS de cada fatia.

## Contratos e dados

- Nenhuma rota, evento, schema ou formato de dado muda. A quantidade ajustada usa o mesmo campo `quantidade` do item.
- O `theme-color` do `BaseLayout` passa a `#0B6E4F` e `#0F1512`; no manifest, `theme_color` e `background_color` acompanham as cores novas.

## Segurança

- CSP sem mudança e sem estilo inline; nenhuma origem nova; nenhuma dependência npm nova. As fontes entram como arquivos estáticos versionados, com a licença ao lado, baixados uma vez do Google Fonts, cuja origem é o repositório google/fonts.
- Teste E2E falha se qualquer página pedir recurso de outro domínio além dos já permitidos (o mapa em `/mercados`).

## Observabilidade

- Nada novo no servidor. O console do navegador continua sem erro em toda página (as fixtures do E2E já falham em erro de CSP).

## Testes por critério

| Critério | Teste                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CA-01    | E2E no projeto celular: barra visível no fundo da tela, cinco links na ordem, `aria-current` na página atual                              |
| CA-02    | E2E: rola até o fim e confere que o último link do rodapé fica acima da barra                                                             |
| CA-03    | E2E no projeto computador: menu no topo numa linha (mesma coordenada vertical), barra inferior ausente                                    |
| CA-04    | E2E: Sobre, Seus dados e Privacidade visíveis e com destino certo nos dois tamanhos                                                       |
| CA-05    | E2E: a página inicial não tem `astro-island` nem `script[type=module]` além dos de hoje                                                   |
| CA-06    | Unidade de `previaDaDemonstracao` contra o resultado do otimizador; E2E: o total da prévia é o mesmo da opção 1 na `/demonstracao`        |
| CA-07    | E2E: cada atalho leva à tela certa e mede pelo menos 44 × 44 px                                                                           |
| CA-08    | E2E de teclado: marcar move o item para "No carrinho", contadores mudam e o foco continua no item                                         |
| CA-09    | Unidade de `ajustarQuantidade` (1, 999, item inexistente); E2E: "+" e "−" mudam a quantidade, que sobrevive ao recarregar                 |
| CA-10    | E2E: barra de resumo com a contagem e o link; o último item fica visível acima dela                                                       |
| CA-11    | E2E na demonstração: cartão de destaque com total, comparação com o melhor mercado sozinho, paradas e distância; sem rota na demonstração |
| CA-12    | Unidade de `diferencaParaAMelhor` e `larguraDaBarra`; E2E: ordem por total e diferença escrita                                            |
| CA-13    | Unidade de `selosDaLinha`; E2E na demonstração: selos "Preço antigo", "Outra marca" e de atacado com texto                                |
| CA-14    | E2E: nenhuma requisição de fonte a outro domínio; `document.fonts.check` confirma as duas famílias carregadas                             |
| CA-15    | E2E: o HTML de cada página traz `font-display: swap` e a família reserva com `size-adjust`                                                |
| CA-16    | Unidade de `montarListaDoServiceWorker` com os woff2; E2E sem internet: a página abre com as fontes do cache                              |
| CA-17    | E2E existentes de axe nos dois temas, mais a largura de 320 px sem rolagem horizontal                                                     |
| CA-18    | E2E com `reducedMotion: "reduce"`: `transition-duration` e `animation-name` neutros nos blocos, barras e itens                            |

## Riscos, entrega e rollback

- **Seletores do E2E:** a troca de estrutura quebra testes que dependem de texto ou ordem antigos; os testes usam papéis e nomes acessíveis, então a maior parte segue valendo, e cada tarefa corrige os seus no mesmo commit.
- **Barra inferior cobrindo conteúdo** em telas baixas ou com teclado aberto: `padding-bottom` e teste do CA-02; com o teclado virtual aberto a barra pode ser escondida por CSS quando um campo está em foco, se o teste no celular mostrar o problema.
- **Salto de layout pela fonte:** fonte reserva com métricas ajustadas e `preload`; CLS medido no Lighthouse antes do PR sair de rascunho.
- **Peso:** cerca de 70 KB a mais na primeira visita, guardados com cache de um ano (`/_astro/` tem hash) e no service worker.
- **Entrega:** um PR com uma tarefa por commit, cada commit verde. O deploy é o da Cloudflare no merge; a conferência "Site no ar" roda a mesma suíte em produção no dia seguinte (ou na hora, pelo disparo manual).
- **Rollback:** reverter o merge. Não há dado nem contrato novo, então nada no aparelho da pessoa precisa de migração.

## Decisões

- [ADR-0009](../../adr/0009-identidade-visual-e-fontes.md): identidade visual "Feira" e fontes próprias pela API de fontes do Astro.
