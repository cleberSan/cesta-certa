# ADR-0007: Demonstração com dados fictícios e uso sem internet

- Status: aceito
- Data: 2026-11-13 (T17)

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) pede uma demonstração com bairro, mercados e preços fictícios, marcados e separados dos dados da pessoa, que nunca atribua preço fictício a rede ou loja real (CA-38), com o assistente respondendo pelas gravações (CA-35); que a pessoa sem nenhum preço seja levada a ler a primeira nota, digitar um preço ou abrir a demonstração (CA-40); e que o app abra sem internet depois da primeira visita, com as listas e os preços guardados, avisando que mapa e leitura de nota precisam de conexão (CA-36).

O plano fixou "PWA com manifest e service worker escrito à mão" e `demo.json` como arquivo público. Faltava decidir onde a demonstração vive, como garantir a separação, o que o service worker guarda e com que estratégia, e como ele convive com a regra do [ADR-0001](0001-pilha-e-hospedagem.md) de que só as páginas com ilha carregam JavaScript.

## Decisão

1. **A demonstração é uma página própria, `/demonstracao`,** com a mesma comparação da tela de mercados (o componente `Comparacao` e o otimizador do [ADR-0006](0006-comparacao-da-lista.md)), a lista de exemplo e os mercados fictícios. Ela entra nos buscadores, porque não tem dado de ninguém.
2. **Separação pelo desenho, não por filtro:** a ilha da demonstração não abre o banco do aparelho. A lista, os preços e o objetivo vivem na memória da página; o objetivo mudado some ao sair. O E2E confere que o banco nem é criado ao usar a demonstração e que os dados da pessoa ficam iguais depois dela.
3. **Fonte "demonstracao":** os preços fictícios levam essa fonte, que a tela escreve como "Demonstração: preço fictício de …" e o assistente recebe como "demonstração". O leitor de registros (`lerObservacao`) aceita só "nota" e "digitado", então um preço fictício não entra no aparelho nem pela cópia em arquivo ([ADR-0003](0003-fontes-e-registro-de-precos.md)).
4. **Nomes que se dizem fictícios:** todo mercado, o bairro e a cidade têm no nome "Exemplo", "Fictício", "Imaginário" ou "Faz de Conta", e as marcas de produto são "Marca A" e "Marca B". O teste de unidade confere isso e compara os nomes com uma lista de redes reais (CA-38).
5. **Sem mapa e sem rota na demonstração:** as posições são distância e rumo a partir de uma âncora em 0°, 0°, no oceano, só para a conta das distâncias entre mercados. A opção não ganha "Ir", porque a rota levaria a um lugar de verdade; a tela explica isso.
6. **`demo.json` vai junto com a ilha,** importado pelo código, em vez de baixado de `public/`. O TypeScript confere o formato no build, a demonstração abre sem internet sem regra extra no service worker e os preços ficam sempre recentes: o arquivo guarda "há quantos dias", contados a partir de hoje.
7. **Primeiro uso sem preços (CA-40):** a tela de mercados mostra os mercados sem total e o cartão com três caminhos: ler a nota, digitar um preço ou ver a demonstração. A página inicial também apresenta a demonstração.
8. **Service worker escrito à mão (`public/sw.js`), registrado só pelas páginas com o aplicativo** (lista, mercados, preços, nota, dados e demonstração), por um script pequeno que também mostra o aviso sem conexão. As páginas sem ilha seguem sem JavaScript; elas entram no cache quando o service worker é instalado por qualquer página do aplicativo. Quem nunca abriu uma página do aplicativo não tem dado para ver sem internet.
9. **O que fica guardado:** as páginas, o CSS e os módulos que elas carregam de forma fixa e os ícones do aplicativo instalado. A lista é montada no build (`src/config/offline.ts`) a partir do HTML gerado, seguindo as importações dos módulos; os módulos carregados sob demanda ficam de fora, como o mapa (mais de 1 MB) e o leitor de QR, que precisam de internet de qualquer jeito. Arquivo pedido pelo HTML e ausente no build quebra o build.
10. **Estratégias:** páginas pela rede primeiro, com a cópia guardada sem internet (a pessoa vê sempre a versão nova quando há conexão); arquivos de `/_astro/` e ícones pela cópia guardada primeiro, porque o nome muda quando o conteúdo muda; a base de mercados (`/data/`) pela rede primeiro, guardando a última cópia de cada região baixada, para a comparação abrir sem internet no ponto já usado. `/api/`, outros métodos e outros sites não passam pelo service worker: a nota fiscal e a pergunta ao assistente nunca ficam no cache.
11. **Versão pelo conteúdo:** o build escreve no `sw.js` um resumo SHA-256 de tudo o que entra na lista. Qualquer mudança gera um service worker novo, que se instala, assume as páginas abertas e apaga as listas antigas; a base de mercados guardada fica. O `_headers` manda o navegador conferir o `sw.js` a cada visita (`Cache-Control: no-cache`).
12. **Aviso sem conexão:** uma região viva (`aria-live="polite"`) no topo das páginas do aplicativo diz que a lista e os preços continuam ali e que o mapa, a leitura da nota e o assistente precisam de conexão, e some quando a conexão volta. Ela não usa o papel "status", para não competir com o aviso de cada tela.
13. **Testes:** o `sw.js` roda nos testes de unidade numa máquina virtual do Node com cache e rede de mentira; no E2E, o service worker fica bloqueado por padrão (ele atenderia pedidos fora do alcance do `page.route`) e liberado só em `e2e/offline.spec.ts`, que abre as páginas com a rede desligada.

## Alternativas

- **Demonstração gravando no banco com uma marca "demo":** separa por filtro, e um filtro esquecido mistura os dados. Recusada.
- **Demonstração dentro da tela de mercados, com uma chave "modo demonstração":** reaproveita mais tela, mas leva mapa, rota e cadastro de mercado para dados fictícios e deixa a separação depender de cada componente. A página própria é mais simples de provar.
- **Biblioteca de service worker (Workbox):** resolve a lista de arquivos com plugin, mas é dependência nova para um arquivo de cem linhas, e o plano pediu o service worker escrito à mão.
- **Guardar tudo de `/_astro/`:** mais simples, mas baixa o mapa e o leitor de QR (cerca de 1,7 MB) no primeiro acesso de quem nunca vai usá-los sem internet.
- **Registrar o service worker em todas as páginas:** cobre quem só abriu a página inicial, mas põe JavaScript nas páginas que o ADR-0001 deixou sem script, para um caso sem dado nenhum para mostrar.
- **Cache primeiro para as páginas:** abre mais rápido, mas mostra a versão velha até a segunda visita depois de cada deploy.

## Consequências

- **Privacidade:** o cache do navegador guarda só arquivos públicos do site e as regiões da base que a pessoa já baixou, como o próprio site já entregava; nada da pessoa vai para o cache. A página de privacidade explica isso. Limpar os dados do site apaga o cache junto com o resto.
- **Uso de dados:** a primeira visita a uma página do aplicativo baixa as outras páginas e os módulos fixos, cerca de 530 KB sem compressão; o mapa só baixa quando a pessoa o abre.
- **Operação:** um service worker com defeito é o pior caso de cache. Mitigação: rede primeiro nas páginas, versão pelo conteúdo, `no-cache` no `sw.js` e os testes de unidade e E2E. Para desligar, publicar um `sw.js` que só limpa os caches e se desregistra.
- **Rollback:** voltar o deploy volta a página da demonstração e o aviso; um `sw.js` já instalado continua servindo a cópia guardada das páginas sem internet até o service worker novo se instalar na próxima visita com conexão.
