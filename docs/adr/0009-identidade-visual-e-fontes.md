# ADR-0009: Identidade visual "Feira" e fontes próprias

- Status: aceito
- Data: 2026-11-16 ([spec 0002](../specs/0002-novo-visual-feira/spec.md))

## Contexto

O visual do MVP (spec 0001) usa fontes do sistema, páginas em texto corrido e um menu no topo que quebra em duas linhas no celular. O Cleber achou o resultado "estranho e muito formal" e pediu uma repaginada com base no que existe publicado. Três direções foram comparadas num artefato de design em 2026-11-16: "Feira" (verde e amarelo de etiqueta, blocos e barra inferior), "Carrinho fresco" (branco, a lista como tela inicial) e "Noite de ofertas" (escuro com verde-limão). Ele escolheu a "Feira" com fontes hospedadas no próprio site.

As restrições são as de sempre: custo zero, CSP estrita por hash ([ADR-0001](0001-pilha-e-hospedagem.md)), página sem ilha sem JavaScript, WCAG 2.2 AA nos dois temas, nenhuma dependência nova sem OK e nenhum dado da pessoa fora do aparelho ([ADR-0002](0002-dados-da-pessoa-so-no-aparelho.md)).

## Decisão

1. **Direção "Feira":** verde de feira (`#0B6E4F`) como marca, amarelo de etiqueta de preço (`#FFD43B`) para valores e destaques, fundo levemente esverdeado e cartões brancos; no escuro, as mesmas funções com verde-claro (`#5FD3A4`) e superfícies quase pretas. Cores, raios e sombras ficam como variáveis em `src/styles/global.css`.
2. **Fontes:** Bricolage Grotesque, corte fixo 800 com tamanho óptico 48, para títulos e valores; Inter variável de 400 a 700 para o texto. Ambas sob a SIL Open Font License 1.1, só o subconjunto latino em woff2 (cerca de 70 KB juntas), com a licença ao lado dos arquivos em `src/assets/fonts/`.
3. **Como servir:** API de fontes do Astro com o provedor `local`. O build publica os arquivos com hash em `/_astro/`, gera o `@font-face` com `font-display: swap` e uma fonte reserva com métricas ajustadas, e o `<Font preload />` põe os arquivos no HTML, o que os inclui no service worker ([ADR-0007](0007-demonstracao-e-uso-sem-internet.md)).
4. **Navegação:** no celular, barra fixa no rodapé com o "Ler nota" no centro; no computador, menu no topo. Um único `<nav>` em HTML e CSS, sem JavaScript.
5. **Movimento:** só dentro de `prefers-reduced-motion: no-preference`.

## Alternativas

- **Fontes do sistema:** zero byte a mais, mas títulos sem personalidade, que era justamente a queixa. Continua como reserva enquanto a fonte carrega.
- **Google Fonts pelo CDN:** pediria `fonts.googleapis.com` e `fonts.gstatic.com` na CSP, entregaria o IP de quem visita ao Google e deixaria o site depender de outro serviço para abrir sem internet.
- **Provedor Fontsource ou Google no build do Astro:** baixa as fontes a cada build, o que põe uma dependência de rede no build da Cloudflare e no CI; os arquivos versionados no repositório dão o mesmo resultado sem esse risco.
- **Pacote npm `@fontsource-variable/*`:** dependência nova só para entregar dois arquivos que mudam raramente.
- **Bricolage Grotesque variável completa (tamanho óptico e peso):** cerca de 77 KB só ela, contra 22 KB do corte fixo, para variações que os títulos não usam.
- **Direções "Carrinho fresco" e "Noite de ofertas":** a primeira some com a página inicial estática e a prévia da demonstração; a segunda faz do escuro o padrão, o que pesa na leitura sob a luz do mercado.

## Consequências

- Primeira visita com cerca de 70 KB a mais, com cache de um ano e guardados no service worker; as visitas seguintes não baixam de novo.
- A CSP não muda: `font-src 'self'` já existia.
- Atualizar uma fonte é trocar o arquivo e a licença em `src/assets/fonts/`, num PR; o Dependabot não acompanha esses arquivos.
- O README credita as fontes e as licenças.
- Mudar a cor da marca exige conferir o contraste nos dois temas; o axe do E2E barra regressões.
