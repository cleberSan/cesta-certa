# ADR-0006: Como o app compara a lista entre os mercados

- Status: aceito
- Data: 2026-11-13 (T14)

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) pede que o app ordene as opções de compra (um mercado ou uma combinação de até três) pelo menor total que respeita as preferências da pessoa (CA-19), mostre o que fazer quando nada cabe no teto (CA-20), nunca ponha uma opção incompleta à frente de uma completa (CA-21), só sugira combinação que economize o mínimo configurado (CA-22) e seja determinístico e rápido no aparelho (CA-23). O plano descreve o otimizador em quatro passos; faltava decidir as regras que a spec deixa abertas: como a preferência geral de marca convive com a do item, qual preço vale quando o mesmo produto foi visto várias vezes, como achar a marca no preço da nota, que distância mostrar e como escolher o que tirar para caber no teto.

Os preços vêm só da pessoa ([ADR-0003](0003-fontes-e-registro-de-precos.md)), então a conta usa poucos mercados por vez, mas o raio de 30 km numa capital alcança milhares de mercados da base.

## Decisão

1. **A conta é pura e roda no aparelho** (`src/features/comparar/otimizador.ts`), sem React e sem rede. Recebe os itens da lista ainda não comprados, os preços guardados, os mercados do raio e o objetivo; devolve as opções, o total de cada mercado e o ajuste ao teto. O Claude não faz conta: o assistente recebe as opções já somadas (plano).
2. **Preferência de marca:** vale a mais exigente entre a geral (do objetivo) e a do item, na ordem "o mais barato", "marca boa", "só esta marca". Item sem marca escrita aceita qualquer marca. "Marca boa" usa a marca escrita quando o mercado tem preço dela e, senão, a mais barata de outra marca, avisando "outra marca". A geral "o mais barato" deixa valer o que cada item pede.
3. **A marca confere** quando é a mesma sem diferença de maiúsculas e acentos ou, no preço sem marca (o da nota fiscal), quando as palavras dela aparecem inteiras na descrição ("ARROZ T1 TIO JOAO 5KG"). Abreviação ("TIOJ") não confere: o item "só esta marca" fica sem preço naquele mercado, em vez de comprar errado.
4. **Uma oferta é** o mesmo produto, marca, descrição da nota, tamanho e mínimo de atacado no mesmo mercado, e vale o preço visto por último (dia, depois hora do registro, depois id). O preço antigo não volta a valer só porque era menor. Entre ofertas diferentes, vale a de menor custo para a quantidade pedida, com as embalagens e o atacado da T13 ([ADR-0003](0003-fontes-e-registro-de-precos.md), item 11); no empate, a vista por último e o id.
5. **Combinações:** de 1 até K mercados (K de 1 a 3, padrão 2). Cada item vai para o mercado mais barato da combinação (no empate, o mais perto). Combinação em que um mercado não recebe nenhum item é descartada. Só entram nas combinações os 20 mercados com preço de mais itens (no empate, os mais perto): com 20, são 1.350 combinações de até três.
6. **Quando a combinação vale a pena (CA-21, CA-22):** uma combinação de k mercados entra se tiver menos itens faltando que a melhor opção com menos mercados, ou o mesmo número de itens e uma economia de pelo menos o mínimo configurado (R$ 0, 10, 20, 30 ou 50; padrão R$ 20). Para três mercados, a comparação é com a melhor entre um e dois: cada mercado a mais precisa se pagar.
7. **Ordem das opções (CA-23):** itens faltando, total, distância, quantidade de mercados, nomes e ids. Mercados, itens e preços são ordenados antes da conta, então a mesma entrada em outra ordem dá o mesmo resultado. A tela recebe as dez primeiras e o total de cada mercado sozinho.
8. **Distância:** em linha reta, do ponto até o último mercado, passando por todos, na ordem mais curta (até 6 ordens para três mercados). É a ordem das paradas no "Ir" (CA-25). Sem volta para casa, como a rota que o Google Maps abre.
9. **Teto (CA-20):** se a primeira opção passa do teto, primeiro as trocas por outra marca (o mais barato de qualquer marca nos mercados da opção), da que mais economiza para a que menos, até caber. Se ainda passar, retirar itens: o mais barato que sozinho faz caber ou, se nenhum faz, o mais caro, e segue. Empates pelo nome do item. A troca de um item que acabou retirado sai da lista.
10. **Objetivo guardado nos ajustes:** teto, marcas, até quantos mercados, economia mínima e modo (a pé ou de carro) ficam no armazém `ajustes`, fora da cópia exportada, como o ponto e o raio ([ADR-0005](0005-mercados-localizacao-e-mapa.md)); sem migração. Campo fora do formato volta ao padrão. A distância máxima é o raio da tela de mercados.
11. **Na tela de mercados:** a comparação fica acima do mapa e da lista; cada mercado da lista mostra "Sua lista aqui: R$ …" e o pino do mapa ganha uma etiqueta HTML com o total, escondida do leitor de tela porque a lista diz o mesmo e sem receber o toque, que segue para o pino.

## Alternativas

- **Programação inteira ou busca exaustiva por item:** acha o ótimo em qualquer caso, mas com até três mercados a enumeração já é exata e cabe em milissegundos. Recusada por complexidade sem ganho.
- **A preferência do item sempre vence a geral:** o padrão do item é "o mais barato", então a pergunta geral nunca mudaria nada. A mais exigente das duas responde à pergunta e respeita o item marcado como "só esta marca".
- **Usar o menor preço já visto de cada oferta:** promete um preço que o mercado não pratica mais.
- **Ligar a marca da nota por semelhança de texto:** acharia "TIOJ", mas também ligaria marcas diferentes; o erro sairia em silêncio no total, como na ligação do produto (ADR-0003).
- **Combinação comparada só com o melhor mercado sozinho, como no texto da CA-22:** deixaria três mercados entrarem por centavos sobre a melhor dupla. A regra adotada é mais exigente e ainda cumpre a CA-22.
- **Total escrito pelo próprio MapLibre:** pede fontes baixadas do provedor do mapa, que o ADR-0005 recusou, e falha sem elas.
- **Para caber no teto, retirar sempre o que mais economiza:** tiraria a carne para cortar R$ 2. A regra adotada tira o mínimo que resolve.

## Consequências

- Mesma lista, mesmos preços e mesmo objetivo dão sempre a mesma ordem, provada por teste com entrada embaralhada; 60 itens, 20 mercados e até três por opção calculam bem abaixo de 200 ms no teste de desempenho.
- Item sem tamanho escrito compara embalagens de qualquer tamanho pelo preço da embalagem; a tela mostra o tamanho de cada preço em "O que comprar", e escrever o tamanho no item resolve.
- Preço de nota sem a marca escrita por extenso não conta para "só esta marca".
- O objetivo não vai na cópia em arquivo: num aparelho novo, volta ao padrão.
- **Rollback:** nada muda no banco nem no arquivo de cópia; voltar o deploy tira a comparação e o registro `objetivo` fica sem uso nos ajustes.
