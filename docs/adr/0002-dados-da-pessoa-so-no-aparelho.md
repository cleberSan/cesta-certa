# ADR-0002: Dados da pessoa só no aparelho, em IndexedDB com migração versionada

- Status: aceito
- Data: 2026-11-11

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) pede que a lista, os preços e o ponto escolhido fiquem no aparelho de quem usa (CA-01, CA-04, CA-06). O site é público, não tem cadastro e roda com custo zero ([ADR-0001](0001-pilha-e-hospedagem.md)). Guardar esses dados num servidor traria conta, senha, base legal, vazamento possível e custo, para um app que uma pessoa usa sozinha no celular.

O que o navegador oferece para guardar no aparelho:

- `localStorage`: síncrono (trava a tela), só texto, cerca de 5 MB e sem transação. Duas gravações relacionadas (apagar a lista e os itens dela) podem ficar pela metade.
- IndexedDB: assíncrono, guarda objetos, tem transação e versão de esquema. A API é verbosa e baseada em eventos.

Comportamentos do IndexedDB que pesam na decisão, conferidos em 2026-11-11:

- Pela [especificação](https://www.w3.org/TR/IndexedDB/): abrir um banco com versão menor que a gravada falha com `VersionError`; uma conexão aberta recebe `versionchange` quando outra aba pede a atualização do banco, e a atualização fica bloqueada enquanto essa conexão não fecha; uma transação abortada desfaz tudo o que fez. Os dois primeiros são exercitados pelo E2E deste repositório.
- Pelo [MDN, cotas e remoção de dados](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): gravar além da cota falha com `QuotaExceededError`; com o aparelho sem espaço, o navegador apaga primeiro os dados dos sites usados há mais tempo que não têm armazenamento persistente; o Safari, com a prevenção de rastreamento ligada, apaga os dados criados por script de sites sem interação nos últimos sete dias de uso do navegador; `navigator.storage.persist()` pede armazenamento persistente, e Chromium e Safari aceitam ou negam sem perguntar, conforme o histórico de uso do site.

## Decisão

1. **Tudo o que é da pessoa fica só no aparelho**, no banco IndexedDB `cesta-certa`. Nenhuma rota do servidor recebe lista, item, preço ou ponto. O ponto escolhido e as coordenadas seguem a mesma regra; como a localização é pedida e como a base de mercados é baixada sem revelar o ponto entram com o PR 3 e são registrados no ADR daquela fatia.
2. **As fatias falam com uma interface** (`Banco`, em `src/shared/armazenamento/banco.ts`), com três operações: ler tudo, aplicar um conjunto de gravações e remoções numa transação só, e substituir tudo (importação). Há duas implementações: IndexedDB (`indexeddb.ts`) e memória (`memoria.ts`).
3. **Esquema versionado por migrações em sequência** (`migracoes.ts`). A versão do banco é o número de migrações; cada uma leva o banco de uma versão para a seguinte, e uma migração publicada não é alterada. A versão 1 tem só os armazéns `listas` e `itens`. Os de mercados próprios, preços e associações entram por migrações novas, cada um no PR da sua fatia, em vez de nascerem vazios agora com um formato ainda não exercitado.
4. **O estado da lista vive em memória durante o uso** e é lido uma vez ao abrir. Cada operação é uma função pura que devolve o estado novo e as alterações a gravar; a tela só passa a mostrar o estado novo depois que a gravação deu certo. As operações entram numa fila e rodam uma por vez.
5. **Nada lido do aparelho é confiado:** cada registro é reconstruído campo a campo por um validador. O que não está no formato esperado fica de fora, a tela avisa quantos ficaram de fora e o registro não é apagado.
6. **Falhas têm resposta definida:**
   - sem IndexedDB (modo restrito ou política do aparelho): a lista abre em memória e a tela avisa que ela some ao fechar a página;
   - banco gravado por uma versão mais nova do app: nada é aberto nem sobreposto, e a tela pede para recarregar;
   - outra aba atualizou o app: a aba antiga fecha a conexão para não travar a atualização e pede para recarregar;
   - sem espaço: a operação é recusada com esse motivo e o estado da tela não muda.
7. **A cópia de segurança é um arquivo que a pessoa exporta** (JSON com a versão do formato no topo, até 5 MB), gerado e lido no aparelho, sem passar pelo servidor. A importação confere o arquivo inteiro com os mesmos validadores, recusa tudo se um registro estiver fora do formato e só então substitui o que há no aparelho, numa transação só (CA-04). A exportação recusa gerar uma cópia que passaria do limite de importação. Não há sincronização entre aparelhos.
8. **Sem biblioteca nova.** O adaptador é escrito sobre a API do navegador, cerca de 130 linhas.

## Alternativas

- **Conta e banco no servidor (D1):** permitiria usar em dois aparelhos, ao custo de autenticação, dados pessoais guardados por terceiros, política de retenção e uma superfície de ataque que o app não precisa ter. Fica fora do MVP; se um dia entrar, é spec nova.
- **`localStorage`:** mais simples, mas sem transação e síncrono. A lista com preços por mercado cresce, e uma gravação pela metade corrompe o estado sem aviso.
- **Biblioteca de IndexedDB (`idb`, Dexie):** API mais curta e tipada. São poucas operações, e cada dependência nova entra na revisão de licença e de supply chain. O contrato `Banco` isola a escolha: trocar o adaptador não toca nas fatias.
- **OPFS com SQLite em WebAssembly:** consultas de verdade, mas um binário de centenas de KB para dados que cabem em memória.
- **Ler do banco a cada tela, sem estado em memória:** evitaria estado velho com duas abas abertas, mas faria toda interação esperar uma leitura. O volume é pequeno (limites de 60 listas e 200 itens por lista).
- **Criar já na versão 1 os cinco armazéns do plano:** uma migração a menos depois, mas fixaria o formato de preços e associações antes de existir código que os use.
- **`fake-indexeddb` para testar o adaptador em unidade:** dependência nova só de teste. O adaptador é exercitado no navegador de verdade pelo E2E.

## Consequências

- O servidor não guarda dado pessoal da lista: não há o que vazar, reter ou apagar a pedido, e a página de privacidade diz isso.
- Os dados existem em um aparelho e um navegador. Trocar de celular, limpar os dados do navegador ou usar a navegação anônima perde a lista, a não ser que a pessoa exporte antes. A tela da lista e a página de privacidade dizem onde a lista fica, e a página Seus dados oferece a exportação.
- O navegador pode apagar os dados quando falta espaço, e o Safari apaga os de sites sem uso por sete dias. Pedir armazenamento persistente (`navigator.storage.persist()`) fica para a tarefa do PWA (T17): Chromium e Safari decidem pelo histórico de uso, e um app instalado e usado tende a ser aceito.
- **Duas abas abertas:** cada aba tem seu estado em memória. Uma alteração feita em uma só aparece na outra depois de recarregar. Como cada gravação toca só os registros que mudou, uma aba não apaga o que a outra gravou, mas regras que olham a lista inteira (duplicidade, limite de itens) podem ser contornadas entre abas. Aceito para um app de uso individual. A importação é a exceção, porque substitui tudo: a aba que importou avisa as outras por `BroadcastChannel`, e elas passam a recusar gravações e pedem para recarregar. Pelo mesmo motivo, a página que o navegador devolve do cache de voltar e avançar é recarregada. Resta uma janela de milissegundos entre o fim da importação e a chegada do aviso; uma gravação feita nela regrava a lista junto com o item, então não sobra item sem lista.
- O adaptador do IndexedDB fica fora da cobertura de unidade (o Node não tem IndexedDB) e é provado pelo E2E no Chromium: gravar e reabrir, banco de versão mais nova, registro corrompido, aba que atualiza o esquema e navegador sem IndexedDB. Safari e Firefox não estão no CI.
- Mudar o esquema passa a ser uma migração nova com teste, e mudar o arquivo exportado passa a ser uma versão nova do formato com leitura da anterior.
- O arquivo de cópia não tem senha nem criptografia: quem tiver o arquivo lê as listas. A tela e a página de privacidade dizem isso. Cifrar com senha fica para quando o arquivo passar a levar preços e mercados, se fizer falta.
- **Rollback:** voltar o deploy para uma versão anterior do app depois de uma migração faz o app antigo encontrar um banco mais novo. Ele não abre nem sobrepõe os dados e pede para recarregar, então nada se perde, mas a lista fica indisponível até o app novo voltar. Por isso uma migração nova entra isolada no PR da sua fatia, com teste, e a página Seus dados recomenda exportar uma cópia de tempos em tempos.
