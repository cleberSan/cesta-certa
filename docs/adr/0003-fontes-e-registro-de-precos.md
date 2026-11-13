# ADR-0003: Fontes de preço do MVP e como cada preço é guardado

- Status: aceito
- Data: 2026-11-13 (itens 8 a 10 acrescentados com a importação da nota, T11, e o 11 com o preço por unidade, T13)

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
8. **Da nota para o preço, a pessoa decide (CA-14).** Cada produto da nota vira preço só depois que a pessoa escolhe o item da lista que corresponde a ele, ou "Ignorar"; o mercado do app também é escolhido por ela. Nada é ligado por semelhança de nome. As escolhas ficam no armazém `associacoes` (migração 5), por loja e código: a do mercado tem id `mercado <CNPJ>`, a do produto `produto <CNPJ> <código na loja>`, com a descrição da nota da última vez e o nome do produto (nulo quando ignorado). Na nota seguinte da mesma loja elas já aparecem escolhidas, e a pessoa pode trocar. Entram na cópia em arquivo (versão 4 do formato; as versões 1 a 3 são lidas com elas vazias), até 20.000 escolhas.
9. **Como a nota vira preço:** o preço guardado é o preço unitário da nota; item vendido a quilo ou a litro (unidade `KG`, `L` ou `LT`) ganha o tamanho "1 kg" ou "1 L", para o preço por unidade (T13). O mesmo código passado duas vezes no caixa vira um produto só, e item com preço zero (brinde, sacola) fica de fora. Ler a mesma nota de novo troca os preços dela, reconhecida pelo resumo SHA-256 da chave de acesso; nem o link nem a chave são guardados (CA-11).
10. **QR Code lido no aparelho.** A câmera de trás abre só no toque, cada quadro é lido no próprio navegador e a câmera desliga quando o link é lido, na hora de fechar ou ao sair da página. Onde o navegador tem o `BarcodeDetector` (Chrome no Android), ele lê; nos outros (Safari no iPhone, Firefox) entra o [jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0, conferido no pacote publicado: JavaScript puro, sem dependências e sem `eval`, baixado só quando a câmera abre (cerca de 130 KB, fora do JavaScript inicial). Só um texto que parece endereço web segue para a consulta; outro QR (Wi-Fi, Pix) não sai do aparelho.

11. **Tamanho e preço por unidade (CA-17, CA-18).** O tamanho é lido do campo do preço ("5 kg", "1,5L", "12x1L", "32 rolos") e, quando ele falta, do fim da descrição da nota ("CAFE SOLUVEL 200G"). Massa vira gramas, volume mililitros e contagem unidades, sempre números inteiros; o preço por kg, litro, unidade ou rolo aparece ao lado do preço da embalagem. As embalagens necessárias para um item são o total pedido na lista (quantidade vezes o tamanho do item) dividido pelo tamanho do preço, arredondado para cima, quando os dois tamanhos são da mesma grandeza; senão, a quantidade da lista. O preço de atacado só entra quando essas embalagens alcançam o mínimo dele. Texto que não segue esse formato não vira tamanho: melhor não comparar do que comparar errado.

## Alternativas

- **Raspagem dos sites dos mercados:** cobertura maior, mas viola termos de uso, quebra sem aviso e vende uma precisão que não existe. Recusada na spec.
- **Open Prices (Open Food Facts):** base aberta de preços enviados por pessoas, ainda com pouca cobertura no Brasil. Fica para uma spec futura, que pode ler e enviar preços.
- **Guardar o preço no item da lista:** mais simples, mas perde o histórico, não compara mercados e some quando a lista do mês seguinte é criada.
- **Ligar o preço ao id do item:** exigiria refazer as ligações a cada mês. O nome já é a identidade do produto para a pessoa e para o aviso de item repetido.
- **Ligar o produto da nota ao item por semelhança de nome:** a descrição vem abreviada pelo mercado ("DESOD AER MEN 150ML") e o erro sairia em silêncio no total. A spec pede confirmação humana.
- **`zxing-wasm` (MIT) no lugar do jsQR:** lê mais formatos e imagens ruins, mas o WebAssembly pede `'wasm-unsafe-eval'` na CSP e o pacote é maior. O QR do cupom é impresso e grande; o jsQR basta.
- **Abrir o leitor de QR do próprio celular:** já funciona hoje (a pessoa copia e cola o link), mas são três passos fora do app. Continua como saída quando não há câmera ou permissão.
- **Guardar a hora exata em que o preço foi visto:** a nota imprime a hora local sem fuso, e a pessoa pensa em dias. O dia basta para o "antigo" e para o desempate.

## Consequências

- O ranking (T14) compara só os preços que a pessoa registrou, e só nos mercados onde ela comprou ou anotou. Sem preço, o app diz o que falta em vez de inventar (CA-21, CA-40).
- Dois produtos com o mesmo nome e embalagens diferentes ("Arroz 1 kg" e "Arroz 5 kg") ficam no mesmo produto; o tamanho guardado e o preço por unidade (T13) separam a comparação.
- O nome do mercado guardado pode ficar desatualizado se o mercado mudar de nome. É o nome do dia em que o preço foi visto, e a tela mostra assim.
- O arquivo de cópia passa a levar preços, nomes de mercados e o CNPJ das lojas das notas (dado público, impresso no cupom), sem senha. Preço de prateleira não é dado sensível; a página de privacidade segue dizendo que quem tiver o arquivo lê o que está nele.
- Uma escolha errada de produto entra nos preços até a pessoa corrigir: ela troca a escolha ao ler a mesma nota de novo (que substitui os preços dela) ou exclui o preço em Preços.
- **Rollback:** voltar o deploy para antes da migração 4 ou 5 faz o app antigo encontrar um banco mais novo; ele não abre nem sobrepõe os dados e pede para recarregar ([ADR-0002](0002-dados-da-pessoa-so-no-aparelho.md)).
