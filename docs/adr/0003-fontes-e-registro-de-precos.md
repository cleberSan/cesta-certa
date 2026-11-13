# ADR-0003: Fontes de preço do MVP e como cada preço é guardado

- Status: aceito
- Data: 2026-11-13

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) compara a lista do mês entre mercados próximos, e para isso precisa de preços. Não existe API pública e gratuita de preços de varejo no Brasil. Os sites dos mercados mostram preço de vitrine, por loja ou por região, e copiar esses preços (raspagem) esbarra nos termos de uso, quebra a cada mudança de layout e daria ao app uma promessa que ele não cumpre ("preço de hoje"). O Cleber escolheu em 2026-11-10 duas fontes: a nota fiscal das compras dele (NFC-e, pelo QR Code) e o preço digitado no mercado (perguntas abertas da spec).

Um preço sozinho não diz muito: o mesmo produto muda de preço toda semana, varia entre lojas da mesma rede e por quantidade (atacado a partir de N unidades). A spec pede que todo preço mostre a fonte e a data, e que o preço com mais de 30 dias apareça como antigo (CA-16).

## Decisão

1. **Duas fontes no MVP:** `nota` (item lido da NFC-e da pessoa) e `digitado` (preço que a pessoa anotou). Sem raspagem de site de mercado e sem preço de terceiros. A demonstração (T17) usa preços fictícios, marcados como tais e separados dos dados da pessoa.
2. **Cada preço é uma observação**, guardada no armazém `observacoesDePreco` do IndexedDB (migração 4, [ADR-0002](0002-dados-da-pessoa-so-no-aparelho.md)), com: produto (o nome como na lista, por exemplo "Arroz"), marca e tamanho quando houver, a descrição da nota quando veio dela, o preço da embalagem em centavos inteiros, a quantidade mínima do atacado quando houver, o mercado (id da base do OpenStreetMap ou do mercado cadastrado, e o nome do dia do registro), a fonte, o dia em que foi visto (`AAAA-MM-DD`) e, quando veio de nota, um resumo SHA-256 da chave da nota.
3. **O produto liga o preço ao item pelo nome**, comparado sem diferença de maiúsculas, acentos e plural simples (a mesma chave da lista, CA-03). Os itens mudam de id a cada mês (a lista é duplicada), então o preço não guarda o id do item.
4. **O dia visto é o calendário da pessoa**: a data de emissão impressa na nota, ou o dia do aparelho na digitação. "Antigo" é mais de 30 dias corridos entre esse dia e hoje, contados por data, sem hora, para a troca de horário de verão não mudar o resultado.
5. **O nome do mercado vai junto com o id.** O preço continua legível quando o mercado está fora do raio de hoje ou a base do mês trocou o nome.
6. **Os preços entram na cópia em arquivo** (versão 3 do formato), com o mesmo validador do aparelho, campo a campo. O app segue lendo as versões 1 e 2, em que os preços entram vazios.
7. **Limites:** até 5.000 preços no aparelho, preço de até R$ 100 mil, atacado de 2 a 999 unidades, textos com os limites da lista. Um preço é lido do texto digitado direto para centavos, sem ponto flutuante.

## Alternativas

- **Raspagem dos sites dos mercados:** cobertura maior, mas viola termos de uso, quebra sem aviso e vende uma precisão que não existe. Recusada na spec.
- **Open Prices (Open Food Facts):** base aberta de preços enviados por pessoas, ainda com pouca cobertura no Brasil. Fica para uma spec futura, que pode ler e enviar preços.
- **Guardar o preço no item da lista:** mais simples, mas perde o histórico, não compara mercados e some quando a lista do mês seguinte é criada.
- **Ligar o preço ao id do item:** exigiria refazer as ligações a cada mês. O nome já é a identidade do produto para a pessoa e para o aviso de item repetido.
- **Guardar a hora exata em que o preço foi visto:** a nota imprime a hora local sem fuso, e a pessoa pensa em dias. O dia basta para o "antigo" e para o desempate.

## Consequências

- O ranking (T14) compara só os preços que a pessoa registrou, e só nos mercados onde ela comprou ou anotou. Sem preço, o app diz o que falta em vez de inventar (CA-21, CA-40).
- Dois produtos com o mesmo nome e embalagens diferentes ("Arroz 1 kg" e "Arroz 5 kg") ficam no mesmo produto; o tamanho guardado e o preço por unidade (T13) separam a comparação.
- O nome do mercado guardado pode ficar desatualizado se o mercado mudar de nome. É o nome do dia em que o preço foi visto, e a tela mostra assim.
- O arquivo de cópia passa a levar preços e nomes de mercados, sem senha. Preço de prateleira não é dado sensível; a página de privacidade segue dizendo que quem tiver o arquivo lê o que está nele.
- **Rollback:** voltar o deploy para antes da migração 4 faz o app antigo encontrar um banco mais novo; ele não abre nem sobrepõe os dados e pede para recarregar ([ADR-0002](0002-dados-da-pessoa-so-no-aparelho.md)).
