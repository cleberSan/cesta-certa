# Spec 0002: Novo visual, direção "Feira"

- Status: aprovada (OK do Cleber em 2026-11-16)
- Data: 2026-11-16
- Nível: completo (fontes novas com licença OFL; muda a navegação e a cara de todas as páginas)
- PRs: cesta-certa#16 (spec e plano, portão do OK); o código segue a ordem de [tarefas.md](tarefas.md) no PR seguinte
- Relacionados: [spec 0001](../0001-mvp-compra-do-mes/spec.md), [ADR-0001](../../adr/0001-pilha-e-hospedagem.md), [ADR-0009](../../adr/0009-identidade-visual-e-fontes.md); direções comparadas no artefato de design de 2026-11-16 (privado do Cleber)

## Problema

O MVP funciona, mas tem cara de documento: no celular o menu quebra em duas linhas e deixa "Sobre" sozinho embaixo, a página inicial é um texto corrido com lista numerada, a comparação aparece como frases e não há uma ação fixa ao alcance do polegar. Para um app de compra do mês, usado em pé no mercado e com uma mão, isso parece formal e esconde o que importa: quanto custa e onde comprar.

## Objetivo

Trocar a estrutura visual do site pela direção "Feira", escolhida pelo Cleber em 2026-11-16: verde de feira com amarelo de etiqueta de preço, títulos em Bricolage Grotesque e texto em Inter, navegação inferior no celular com o botão de ler a nota no centro, início em blocos (bento) com uma prévia da demonstração, lista em cartões com quantidade ajustável e comparação com a opção mais barata em destaque. O comportamento do MVP continua o mesmo; o que muda está nos critérios abaixo.

## Fora de escopo

- Logotipo, ícones do aplicativo e imagem de compartilhamento novos (continuam os atuais).
- Botão para escolher o tema: o escuro continua seguindo a preferência do sistema.
- Funções novas além das listadas nos critérios (sem filtro por categoria, sem escolha de mês no topo da lista, sem bairro no resumo da lista).
- Telas e textos do assistente além das cores e fontes herdadas.
- As tarefas abertas da spec 0001 (prints de produção da T03 e da T16).

## Critérios de aceite

### Navegação

- **CA-01:** ENQUANTO a tela tem menos de 48 rem de largura, toda página DEVE mostrar uma barra de navegação fixa no rodapé com Início, Lista, Ler nota (destacado, no centro), Mercados e Preços, com a página atual marcada por `aria-current="page"`.
- **CA-02:** ENQUANTO a barra inferior está visível, nenhum conteúdo da página nem do rodapé DEVE ficar escondido atrás dela ao rolar até o fim.
- **CA-03:** ENQUANTO a tela tem 48 rem ou mais, a navegação principal DEVE ficar no topo, numa linha só, com o botão "Ler nota", e a barra inferior NÃO DEVE aparecer.
- **CA-04:** Sobre, Seus dados e Privacidade DEVEM continuar acessíveis em toda página, pelo cabeçalho ou pelo rodapé.

### Início

- **CA-05:** A página inicial DEVE continuar sem JavaScript: nenhuma ilha e nenhum script além dos que o layout já carrega hoje.
- **CA-06:** A página inicial DEVE mostrar uma prévia da demonstração, marcada como demonstração com preços fictícios, com o total da opção mais barata e a economia calculados no build a partir dos mesmos dados e do mesmo otimizador da `/demonstracao`, e um link para ela.
- **CA-07:** A página inicial DEVE oferecer os atalhos Montar a lista, Ler a nota, Mercados perto e Digitar um preço, cada um levando à tela certa e com alvo de toque de pelo menos 44 × 44 px.

### Lista

- **CA-08:** A lista DEVE mostrar primeiro os itens que faltam comprar e depois, sob "No carrinho", os já marcados, cada grupo com o número de itens; marcar ou desmarcar um item o move de grupo sem perder o foco do teclado.
- **CA-09:** QUANDO a pessoa toca em "+" ou "−" num item, a quantidade DEVE mudar em 1 e ficar guardada no aparelho; o "−" DEVE ficar desativado em 1 e o "+" no máximo já aceito pela lista (999).
- **CA-10:** ENQUANTO a lista tem itens a comprar, a tela DEVE mostrar uma barra de resumo fixa com o número de itens e o link "Comparar" para `/mercados`, sem cobrir o último item.

### Comparação

- **CA-11:** A comparação (em `/mercados` e na `/demonstracao`) DEVE destacar a opção mais barata num cartão próprio com o total, a comparação com o melhor mercado sozinho quando houver (CA-22 da spec 0001), o número de paradas, a distância e as ações de ver o que comprar e de rota (esta só fora da demonstração, CA-38 da spec 0001).
- **CA-12:** As demais opções DEVEM aparecer em ordem de total, cada uma com a diferença para a mais barata ("+R$ 4,00") e uma barra proporcional ao total que tem texto equivalente para leitor de tela.
- **CA-13:** Os avisos de preço antigo, outra marca e preço de atacado DEVEM aparecer como selos com texto, nunca só por cor.

### Fontes, tema e acessibilidade

- **CA-14:** O site DEVE usar Bricolage Grotesque nos títulos e Inter no texto, servidas pelo próprio site: nenhuma página DEVE pedir fonte a outro domínio.
- **CA-15:** SE a fonte ainda não chegou ou falhou, ENTÃO o texto DEVE aparecer na hora com uma fonte do sistema ajustada (`font-display: swap` e fonte reserva com métricas ajustadas).
- **CA-16:** QUANDO o app é aberto sem internet depois da primeira visita, as fontes DEVEM vir do service worker, junto com as páginas.
- **CA-17:** Toda página DEVE passar no axe (WCAG 2.2 AA) nos temas claro e escuro e não ter rolagem horizontal a 320 px de largura.
- **CA-18:** ENQUANTO o sistema pede movimento reduzido, nenhuma transição ou animação DEVE rodar.

## Requisitos não funcionais

- **Peso:** fontes em woff2, só o subconjunto latino (cobre o português), no máximo 75 KB somadas; JavaScript inicial de cada página igual ou menor que antes.
- **Performance:** LCP abaixo de 2,5 s e CLS abaixo de 0,1 na página inicial (Lighthouse mobile, 4G emulado).
- **Segurança:** a CSP não muda (`font-src 'self'` já existe); nenhum estilo inline, nenhuma origem nova, nenhuma dependência npm nova.
- **Acessibilidade:** alvos de toque de 44 px, foco visível, ordem do DOM igual à ordem visual, contraste AA conferido nos dois temas.
- **Compatibilidade:** a mesma da spec 0001 (Chrome Android e Safari iOS nas duas últimas versões; Chrome, Edge, Firefox e Safari no computador), incluindo a área segura do iPhone na barra inferior.
- **Custo:** zero. As fontes são OFL e ficam no repositório com a licença.

## Perguntas abertas

- Decidido em 2026-11-16 (card): direção A "Feira", com Bricolage Grotesque e Inter hospedadas no próprio site.

Nenhuma pergunta aberta.
