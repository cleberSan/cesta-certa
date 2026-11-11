# Spec 0001: MVP do comparador da compra do mês

- Status: aprovada (OK do Cleber em 2026-11-10)
- Data: 2026-11-10
- Nível: completo (projeto novo, rotas públicas, localização, dependências novas, mais de um PR)
- PRs: cesta-certa#1 (spec e plano, portão do OK); os PRs de código seguem a ordem de [tarefas.md](tarefas.md)
- Relacionados: [ADR-0000](../../adr/0000-registrar-decisoes-com-adr.md); processo em [docs/specs](../README.md)

## Problema

Quem faz a compra do mês com uma lista de 40 a 60 itens não sabe qual mercado (de bairro, supermercado ou atacarejo) sai mais barato para aquela lista, com as marcas que prefere, nem se compensa dividir a compra entre dois mercados. Os preços mudam toda semana, variam entre lojas da mesma rede e por quantidade (preço de atacado a partir de N unidades). Não existe API pública e gratuita de preços de varejo; os programas estaduais que usam a nota fiscal eletrônica (NFC-e) funcionam só no aplicativo deles, com login, e não oferecem API. Hoje a escolha é no palpite.

## Objetivo

Com a lista pronta, a pessoa vê em até dois minutos o ranking dos mercados próximos para aquela lista, de acordo com o objetivo dela (teto de gasto, preferência de marca, até quantos mercados topa ir e até que distância), com cada preço mostrando a fonte e a data, e abre a rota no Waze ou no Google Maps com um toque. Funciona para qualquer pessoa no Brasil: o app pede a localização a quem acessa, explica para que serve, e as coordenadas nunca saem do aparelho.

## Fora de escopo

- Preço "em tempo real" de todos os mercados e raspagem de site de mercado.
- Conta, login e sincronização entre aparelhos (no MVP, exportar e importar um arquivo).
- Leitura de encarte por foto e assistente com ferramentas ou memória de conversa (specs futuras).
- Assistente aberto ao público com chamadas reais: visitantes só veem respostas gravadas.
- Leitura e envio de preços ao Open Prices (spec futura).
- Leitura de código de barras de produto.
- Leitor de NFC-e de outras UFs além de São Paulo: cada UF tem página própria e entra por spec ou PR próprio; até lá, vale a digitação.
- Mercados fora do Brasil.
- Cálculo de rota próprio: o trajeto é do Waze ou do Google Maps.
- Nota de "qualidade" de produto dada pelo app: qualidade é a preferência que a pessoa declara.
- Venda, anúncio, afiliado ou qualquer uso comercial.

## Critérios de aceite

### Lista

- **CA-01:** QUANDO a pessoa cria um item com nome e quantidade e, se quiser, marca preferida, tamanho e preferência ("só esta marca", "marca boa", "o mais barato"), o app DEVE guardá-lo no aparelho e mantê-lo depois de fechar e reabrir.
- **CA-02:** QUANDO a pessoa duplica a lista de um mês, o app DEVE criar uma lista nova com os mesmos itens, quantidades e preferências, com nenhum item marcado como comprado.
- **CA-03:** SE a pessoa adiciona um item cujo nome já existe na lista (ignorando maiúsculas, acentos e plural simples), ENTÃO o app DEVE avisar e oferecer somar as quantidades.
- **CA-04:** QUANDO a pessoa exporta os dados, o app DEVE gerar um arquivo JSON versionado com listas, preços, associações e mercados próprios; QUANDO importa esse arquivo, DEVE restaurar o mesmo estado. SE o arquivo for inválido, maior que 5 MB ou de versão desconhecida, ENTÃO o app DEVE recusá-lo sem alterar nada e dizer o motivo.

### Localização e mercados

- **CA-05:** QUANDO a pessoa abre o app sem um ponto definido, o app DEVE mostrar uma tela que explica que a localização serve para encontrar os mercados próximos e que as coordenadas não saem do aparelho, com as ações "Usar minha localização" e "Escolher cidade"; o pedido de permissão do navegador DEVE acontecer só depois do toque em "Usar minha localização". SE a permissão for negada, não existir ou não responder em 10 segundos, ENTÃO o app DEVE seguir funcionando com uma cidade escolhida numa lista ou um ponto marcado no mapa.
- **CA-06:** O app NÃO DEVE enviar as coordenadas da pessoa a nenhum servidor. As únicas requisições ligadas ao lugar DEVEM ser os arquivos de mercados por célula de 1 grau (cerca de 110 km de lado), ao próprio site, e os quadros do mapa da área exibida, ao provedor do mapa, só quando a visão de mapa é aberta; distância e filtro por raio são calculados no aparelho.
- **CA-07:** QUANDO há um ponto definido, o app DEVE listar os mercados num raio configurável (padrão 5 km, de 1 a 30 km), em ordem de distância em linha reta, vindos da base nacional de mercados publicada com o site e dos mercados que a pessoa cadastrou.
- **CA-39:** SE o ponto está fora do Brasil ou não há mercados da base no raio, ENTÃO o app DEVE dizer isso e oferecer aumentar o raio ou cadastrar um mercado.
- **CA-08:** QUANDO um mercado não está na base, a pessoa DEVE poder cadastrá-lo com nome, tipo e ponto no mapa, e ele fica só no aparelho.
- **CA-09:** QUANDO a pessoa abre "Saber mais" de um mercado, o app DEVE mostrar nome, tipo (bairro, supermercado, atacarejo), distância e, quando a base tiver, horário e site, com links para abrir o local no Google Maps e o site do mercado.

### Preços

- **CA-10:** QUANDO a pessoa lê o QR Code de uma NFC-e de uma UF com leitor (no MVP, São Paulo) ou cola o link dela, o app DEVE importar o mercado, a data e os itens com descrição, quantidade, unidade e preço unitário.
- **CA-11:** O app e o servidor NÃO DEVEM guardar, devolver nem registrar em log a identificação do consumidor que aparece na nota (CPF ou nome), nem o link completo da nota.
- **CA-12:** SE o link informado não pertence a um endereço de consulta de NFC-e da lista permitida, ENTÃO o servidor DEVE recusá-lo sem fazer nenhuma requisição externa.
- **CA-13:** SE a nota é de uma UF sem leitor, ou a consulta falhar, passar de 8 segundos ou exigir captcha, ENTÃO o app DEVE avisar e oferecer digitar os preços daquela compra.
- **CA-14:** QUANDO um item importado não tem correspondência na lista, o app DEVE pedir que a pessoa o associe a um item ou o ignore, e DEVE lembrar a escolha para o mesmo produto do mesmo mercado nas notas seguintes.
- **CA-15:** QUANDO a pessoa registra um preço à mão, o app DEVE pedir produto, marca, tamanho, preço, mercado e, se houver, a quantidade mínima do preço de atacado, e marcar a fonte como "digitado" com a data.
- **CA-16:** Todo preço exibido DEVE mostrar a fonte (nota fiscal, digitado ou demonstração) e a data em que foi visto; SE o preço tem mais de 30 dias, ENTÃO o app DEVE marcá-lo como antigo.
- **CA-17:** QUANDO o tamanho da embalagem é reconhecido (kg, g, L, ml, unidades, rolos, inclusive "12x1L"), o app DEVE comparar pelo preço por unidade de medida e mostrar o preço da embalagem junto.
- **CA-18:** QUANDO um preço vale só a partir de N unidades, a comparação DEVE usar esse preço apenas se a quantidade da lista alcançar N.

### Objetivo e comparação

- **CA-19:** QUANDO a pessoa define o objetivo (teto de gasto opcional, preferência de marca geral ou por item, até 1, 2 ou 3 mercados, raio), o app DEVE ordenar as opções (um mercado ou uma combinação) pelo menor total que respeita as preferências.
- **CA-20:** SE nenhuma opção cabe no teto, ENTÃO o app DEVE mostrar a opção mais barata, quanto ela passa do teto e quais itens trocar por marca mais barata ou retirar para caber, começando pelos que mais economizam.
- **CA-21:** SE um mercado não tem preço para algum item, ENTÃO o app DEVE mostrar quantos e quais itens faltam, e uma opção incompleta NUNCA DEVE ficar à frente de uma opção completa.
- **CA-22:** QUANDO uma opção combina dois ou três mercados, o app DEVE dizer o que comprar em cada um e a distância total estimada, e só DEVE sugerir a combinação se ela economizar pelo menos o valor mínimo configurado (padrão R$ 20) em relação ao melhor mercado único.
- **CA-23:** O ranking DEVE ser determinístico (mesma entrada, mesmo resultado, com desempate documentado) e calculado no aparelho em até 200 ms para 60 itens, 20 mercados e até 3 mercados por opção.

### Rota

- **CA-24:** QUANDO a pessoa escolhe uma opção e toca em "Ir", o app DEVE oferecer Waze e Google Maps e abrir a navegação até o mercado no app escolhido, com o modo (a pé ou carro) que ela escolheu no Google Maps.
- **CA-25:** QUANDO a opção tem mais de um mercado, o Google Maps DEVE abrir com as paradas em ordem (até 3 no celular, limite do próprio Maps) e o Waze DEVE abrir com o primeiro mercado, avisando que ele aceita um destino por vez.

### Assistente do Claude

- **CA-26:** QUANDO a pessoa autorizada faz uma pergunta ao assistente, o app DEVE enviar ao servidor a pergunta, o objetivo, a lista e as três melhores opções já calculadas (com preços, fontes, datas e economias entre elas) e mostrar a resposta como texto simples.
- **CA-27:** O pedido ao assistente NÃO DEVE conter coordenadas nem endereço da pessoa, e as distâncias DEVEM ir arredondadas para 1 km.
- **CA-28:** QUANDO a pessoa usa o assistente pela primeira vez num aparelho, o app DEVE explicar que a pergunta e a lista vão para a Anthropic e só enviar depois do aceite.
- **CA-29:** SE a requisição não traz o código de acesso válido, ENTÃO o servidor DEVE responder 401 sem chamar a Anthropic.
- **CA-30:** SE o limite diário (padrão 30 perguntas) ou mensal (padrão 300) foi atingido, ENTÃO o servidor DEVE recusar sem chamar a Anthropic, e o app DEVE dizer quando o limite volta.
- **CA-31:** SE a pergunta passa de 500 caracteres ou o contexto passa de 32 KB, ENTÃO o servidor DEVE recusar com mensagem clara, sem chamar a Anthropic.
- **CA-32:** SE a Anthropic falha, demora mais de 20 segundos ou se recusa a responder, ENTÃO o app DEVE avisar e manter o ranking disponível.
- **CA-33:** SE a resposta cita um valor em reais que não está nos dados enviados, ENTÃO o app DEVE marcá-lo como "valor não conferido".
- **CA-34:** A chave da API da Anthropic e o código de acesso DEVEM existir só como segredos do servidor; nenhum arquivo entregue ao navegador e nenhum arquivo do repositório DEVE contê-los.
- **CA-35:** ENQUANTO o app está em modo demonstração, o assistente DEVE usar respostas gravadas e NÃO DEVE chamar a Anthropic.

### Uso no celular, acessibilidade e demonstração

- **CA-36:** QUANDO o app é aberto sem internet depois da primeira visita, DEVE mostrar listas e preços guardados e avisar que mapa e leitura de nota precisam de conexão.
- **CA-37:** Toda informação do mapa DEVE estar também na visão em lista, que funciona por teclado e leitor de tela.
- **CA-38:** QUANDO a pessoa abre a demonstração, o app DEVE usar um bairro, mercados e preços fictícios, marcados como "demonstração" e separados dos dados dela, e NUNCA DEVE atribuir preço fictício a uma rede ou loja real.
- **CA-40:** ENQUANTO a pessoa não tem nenhum preço registrado, o app DEVE mostrar os mercados próximos sem total e orientar a ler a primeira nota, digitar um preço ou abrir a demonstração.

## Requisitos não funcionais

- **Segurança e privacidade:** dados da pessoa (listas, preços, associações, ponto escolhido) só no aparelho; o servidor guarda só contadores de uso do assistente, sem conteúdo; o texto da pergunta vai à Anthropic apenas com aceite (CA-28) e nunca é registrado em log; consulta de nota sem log de conteúdo; OWASP Top 10, CSP estrita, cabeçalhos do padrão do ecossistema. O mapa baixa os quadros da área que está na tela, então o provedor do mapa vê a região exibida (não as coordenadas), e o próprio site vê só a célula de 1 grau pedida: isso fica escrito na tela de explicação e na página de privacidade. Quem não quiser abrir o mapa usa a visão em lista (CA-37).
- **Performance:** LCP abaixo de 2,5 s em celular intermediário com 4G emulado (Lighthouse mobile); JavaScript inicial abaixo de 200 KB gzip sem o mapa, que carrega sob demanda; ranking em até 200 ms (CA-23).
- **Observabilidade:** logs estruturados do servidor com correlation id, resultado e duração da consulta de nota, sem conteúdo; tela de diagnóstico no app com os últimos erros, para print; sem telemetria de terceiros.
- **Acessibilidade:** WCAG 2.2 AA, axe sem violações nos temas claro e escuro, alvos de toque de 44 px, `prefers-reduced-motion` respeitado na animação do mapa.
- **Compatibilidade:** Chrome Android e Safari iOS nas duas últimas versões; Chrome, Edge, Firefox e Safari no computador.
- **Custo:** hospedagem e serviços gratuitos e sem risco de cobrança; o único custo variável, escolhido pelo Cleber em 2026-11-10, é a API da Anthropic no assistente, limitado a 300 perguntas por mês (menos de US$ 1 no pior caso) e travado também pelo limite de gasto da conta.

## Perguntas abertas

- Decidido em 2026-11-10: repositório novo e público, criado vazio pelo Cleber, com o padrão do ecossistema.
- Decidido em 2026-11-10: fonte de preços do MVP são as notas fiscais da própria pessoa (QR da NFC-e) e o preço digitado; sem raspagem.
- Decidido em 2026-11-10: assistente dentro do site, com a chave guardada no servidor e o modelo Claude Haiku 5.5, só para o dono; visitantes usam respostas gravadas.
- Decidido em 2026-11-10: sem cidade fixa. O app pede a localização a quem acessa, com a explicação do motivo, e a base de mercados cobre o Brasil.
- Decidido em 2026-11-10: o primeiro leitor de NFC-e é o de São Paulo; as outras UFs entram depois.
- Decidido em 2026-11-10: o repositório e o app se chamam `cesta-certa` (Cesta Certa).

Nenhuma pergunta aberta.
