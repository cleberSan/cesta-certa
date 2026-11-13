# ADR-0005: Mercados do OpenStreetMap em células, localização pedida com explicação e mapa sob demanda

- Status: aceito
- Data: 2026-11-12

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) pede os mercados próximos de qualquer ponto do Brasil (CA-07), sem cidade fixa (decisão do Cleber em 2026-11-10), com a localização pedida só depois de uma explicação (CA-05), sem as coordenadas saírem do aparelho (CA-06, [ADR-0002](0002-dados-da-pessoa-so-no-aparelho.md)), com mapa e uma visão em lista equivalente (CA-37), tudo com custo zero.

Fatos que pesam, conferidos em 2026-11-10 (fontes no [plano](../specs/0001-mvp-compra-do-mes/plano.md#fatos-verificados)) e em 2026-11-12:

- A instância pública da Overpass API atende cerca de 1,5 milhão de requisições por dia para todo mundo; uso regular deve ficar muito abaixo disso, e um app conta a soma dos seus usuários. Consulta por usuário não cabe; um retrato periódico cabe.
- Os dados do OpenStreetMap são ODbL 1.0: uso livre com atribuição ("© colaboradores do OpenStreetMap") e a base derivada sob a mesma licença.
- OpenFreeMap entrega tiles vetoriais sem chave, sem cadastro e sem limite de visualização, com atribuição a OpenMapTiles e OpenStreetMap e sem SLA.
- `maplibre-gl` 6.x é BSD-3-Clause, com cerca de 29 MB descompactado no npm e 18 dependências diretas (registro do npm, 2026-11-12).
- O ambiente onde o Claude trabalha não alcança `overpass-api.de` nem `tiles.openfreemap.org`. A geração de verdade roda no GitHub Actions, e os testes usam respostas sintéticas.

## Decisão

1. **Base nacional mensal, gerada no GitHub Actions** (`scripts/mercados.ts`, workflow `Base de mercados`). Uma consulta à Overpass por UF (27 por mês), pela área `ISO3166-2=BR-XX`, com 20 segundos de pausa entre UFs e até 4 tentativas com espera de 60, 120 e 240 segundos em fila cheia, erro do servidor, falha de rede ou consulta incompleta. A consulta pede `shop=supermarket|wholesale|convenience|greengrocer` e as sedes `place=city|town`.
2. **Só os campos que o app usa, limpos:** id do objeto no OSM, nome (ou a marca, quando não há nome), tipo (`supermercado`; `atacarejo` para `wholesale` ou nome e marca com "atacad"/"atacarej"; `bairro` para conveniência e hortifrúti), ponto com 5 casas, horário (`opening_hours`) e site só `http(s)` sem credenciais. Ficam de fora: loja sem nome nem marca, sem ponto e atacado de outro ramo (`wholesale` com valor que não é de alimento).
3. **Células de 1 grau** em `public/data/mercados/<lat>_<lon>.json` (canto sudoeste em graus inteiros), mais `indice.json` com a quantidade por célula e a data da geração, e `cidades.json` para "Escolher cidade". JSON compacto; a Cloudflare comprime na entrega. A meta é 300 KB comprimidos por célula: o relatório avisa a célula que passar, e a divisão de células só entra se a medição pedir.
4. **Publicação por PR, tudo ou nada.** Se uma UF falhar depois das tentativas, se uma UF vier sem mercado, se a base vier sem cidades ou se o total cair mais de 20%, nada é gravado e a base anterior continua no ar. Se passar, o workflow grava em `public/data`, faz commit na branch `dados/mercados` e abre ou atualiza o PR com o relatório de tamanho. O site só muda depois da revisão e do merge.
5. **Checks do PR mensal:** um PR aberto pelo `GITHUB_TOKEN` não dispara workflows. Quem revisa fecha e reabre o PR para o CI, o CodeQL e a revisão de dependências rodarem. Abrir o PR exige "Allow GitHub Actions to create and approve pull requests" ligado no repositório.
6. **Medição no PR que muda o gerador:** o mesmo workflow roda só SP e RJ, as células mais cheias, e escreve o relatório no resumo, sem publicar nada.
7. **O app baixa só o que precisa:** o índice uma vez, as células que o raio toca (no máximo quatro, com o raio máximo de 30 km) e a lista de cidades só ao tocar em "Escolher cidade". Tudo é conferido campo a campo antes do uso. Distância (em linha reta) e filtro por raio são calculados no aparelho. O site fica sabendo qual célula de cerca de 110 km foi pedida, nunca o ponto.
8. **Localização com explicação primeiro.** Sem ponto definido, a primeira tela diz para que serve a localização e que ela fica no aparelho, com "Usar minha localização" e "Escolher cidade". O pedido do navegador só sai depois do toque; negado, indisponível ou sem resposta em 10 segundos, o app oferece a cidade ou um ponto no mapa.
9. **O ponto e o raio ficam no aparelho, fora da cópia.** Um armazém `ajustes` entra no IndexedDB por migração nova. Ele não vai para o arquivo exportado nem é apagado pela importação: o arquivo pode ser compartilhado e não deve levar a localização de ninguém.
10. **Mapa sob demanda.** A visão em lista é a padrão e tem tudo o que o mapa mostra. O `maplibre-gl` só é baixado quando a pessoa abre o mapa, com tiles do OpenFreeMap. Ao abrir o mapa, o provedor dos tiles vê a região exibida na tela; a tela de explicação e a página de privacidade dizem isso. Na implementação (T10): o código, o worker (servido pelo próprio site) e o CSS do MapLibre só chegam quando um mapa abre; só a página `/mercados` libera `https://tiles.openfreemap.org` na CSP (`connect-src` e `img-src`, por `Astro.csp.insertDirective`), e as outras páginas seguem estritas; sem WebGL ou sem conexão com o provedor, a tela avisa e aponta a lista ou outra forma de escolher o lugar. O mapa não usa texto próprio (nada de fontes baixadas para os pinos) e desenha a pessoinha abaixo dos pinos, para não esconder o mercado mais perto.
11. **Atribuição** "© colaboradores do OpenStreetMap" (ODbL) na lista de mercados, no mapa e na página Sobre.

## Alternativas

- **Consultar a Overpass do aparelho de cada pessoa:** dados sempre frescos, mas fura o uso justo da instância pública e entrega o ponto da pessoa a um terceiro.
- **API paga de lugares (Google Places e afins):** dados melhores de comércio, mas chave, cobrança por uso e termos que proíbem guardar o resultado.
- **Banco no servidor com busca por raio (D1):** um arquivo a menos no aparelho, mas o servidor receberia as coordenadas (CA-06).
- **Um arquivo só para o Brasil:** uma requisição, mas vários megabytes baixados no celular para usar alguns quilômetros.
- **Células menores (0,25 grau):** arquivos menores, mas revelam ao site uma área de cerca de 28 km em vez de 110 km, e multiplicam por 16 o número de arquivos.
- **Extrato do Brasil em PBF (Geofabrik) processado com `osmium`:** sem limite de consulta e mais robusto que a Overpass, mas baixa centenas de megabytes por mês e instala ferramenta nova no workflow. Fica como plano B se a Overpass falhar com frequência.
- **Token de GitHub App no workflow mensal:** o PR dispararia os checks sozinho, ao custo de um app e de dois secrets para configurar. Pode substituir o fechar e reabrir se a rotina mensal incomodar.
- **Leaflet com tiles raster do openstreetmap.org:** biblioteca menor, mas a política de uso dos tiles do OSM não aceita app com tráfego regular.

## Consequências

- A base tem até um mês de atraso e a qualidade do OSM varia por região. Mercado que falta entra como mercado próprio (CA-08), e quem quiser pode corrigi-lo no próprio OpenStreetMap.
- Até o primeiro PR de dados ser mesclado, o site não tem base: a tela diz que a base ainda não foi publicada e oferece cadastrar um mercado.
- Todo mês o dono revisa um PR de dados, fecha e reabre para os checks rodarem e mescla. Se a Overpass estiver fora do ar, o workflow falha, a base anterior fica e dá para rodar de novo pelo **Run workflow**.
- Medição no PR #6 (12/11/2026, só SP e RJ): 7.717 mercados em 40 células, 190,6 KB comprimidos no total; a maior célula (a da capital paulista) tem 2.809 mercados e 60,4 KB comprimidos, um quinto da meta, então a divisão de células fica de fora. A Overpass respondeu 502 na primeira tentativa das duas UFs e a retentativa resolveu, o que confirma a espera entre tentativas.
- O repositório cresce a cada mês com o diff da base. O relatório do PR mostra o tamanho; se pesar, a base pode sair do repositório para um armazenamento gratuito da Cloudflare, por ADR novo.
- As coordenadas da pessoa nunca saem do aparelho. O site vê a célula pedida; o provedor do mapa vê a região na tela só quando o mapa é aberto.
- Safari e Firefox seguem fora do CI; geolocalização e mapa são exercitados no Chromium com localização simulada e tiles interceptados.
