# ADR-0004: Assistente pelo servidor, com código de acesso e cota no D1

- Status: aceito
- Data: 2026-11-13 (T15)

## Contexto

A [spec 0001](../specs/0001-mvp-compra-do-mes/spec.md) põe um assistente com o Claude dentro do site (escolha do Cleber em 2026-11-10): Claude Haiku 5.5, só para quem tem o código de acesso (CA-29), com limite de 30 perguntas por dia e 300 por mês (CA-30), recusa clara para pergunta ou contexto grandes (CA-31), aviso quando a Anthropic falha, demora ou se recusa (CA-32), segredos só no servidor (CA-34) e respostas gravadas na demonstração (CA-35). O plano descreve o servidor em `worker/assistente/`; faltava decidir como contar a cota sem corrida, como criar o banco sem passo manual, o que fazer com o crédito quando a chamada falha e como o servidor se comporta sem os segredos.

O custo é a restrição que manda: a hospedagem é o plano gratuito da Cloudflare ([ADR-0001](0001-pilha-e-hospedagem.md)), e a chave da Anthropic é paga por uso.

## Decisão

1. **Rota `POST /api/assistente`** no mesmo Worker da nota, atrás das mesmas travas da API (só POST, só o próprio site, 10 pedidos por minuto por IP, com contador próprio por rota). Depois, na ordem, da trava mais barata para a mais cara, e nenhuma chama o provedor antes de passar: assistente ligado; código de acesso (401); tamanho e formato (413, 415, 400); reserva na cota (429); provedor.
2. **Código de acesso:** segredo `ASSISTENTE_CODIGO`, com pelo menos 32 caracteres, enviado pelo app em `Authorization: Bearer`. A comparação resume os dois lados com SHA-256 e confere todos os bytes sem parar no primeiro diferente, então o tempo não revela quanto acertou. Código ausente ou curto no servidor desliga o assistente.
3. **Desligado é 503, não erro:** sem o banco, sem o código ou sem a chave, a rota responde `assistente.indisponivel` e registra o motivo (`sem-banco`, `sem-codigo`, `codigo-curto`, `sem-chave`). O resto do app não muda.
4. **Cota no D1, uma linha por dia de Brasília** (`2026-11-13`) e o mês como a soma das linhas dele. A reserva é um único `UPDATE ... WHERE periodo = dia AND usadas < limite do dia AND (soma do mês) < limite do mês RETURNING`, numa linha só; o D1 executa uma instrução por vez, então dois pedidos no último crédito nunca passam os dois. As quatro instruções (criar a tabela se faltar, abrir o dia, reservar, ler o uso) vão num `batch`, que é uma transação. O plano previa linhas separadas para o dia e o mês: atualizar duas linhas com as duas condições numa instrução depende de quando o SQLite avalia a subconsulta, e uma linha só não depende.
5. **Tabela criada pelo próprio Worker:** `CREATE TABLE IF NOT EXISTS` em cada reserva, igual à `migrations/0001_uso_assistente.sql` (um teste prende as duas). O deploy não depende de alguém aplicar migração.
6. **Banco criado pelo deploy:** binding `USO_ASSISTENTE` sem `database_id`, com `database_name: "cesta-certa-uso"`, no bloco principal e no de prévias. No primeiro deploy, o wrangler acha o banco pelo nome ou cria e liga ao Worker; depois o binding é herdado. O token do Workers Builds não tinha D1 por padrão; o Cleber acrescentou **D1 Edit** em 2026-11-13. Prévia e produção usam o mesmo banco: dividem a cota, que é o teto de custo.
7. **Dia de Brasília em UTC−3 fixo:** o Brasil não tem horário de verão desde 2019. A resposta diz quando a cota volta (`voltaEm`, meia-noite do dia seguinte ou primeiro dia do mês seguinte) e o 429 leva `Retry-After` em segundos.
8. **O crédito reservado não volta** quando o provedor falha, demora ou se recusa: a chamada pode ter custado, e a cota existe para travar o custo. A falha do D1 recusa a pergunta (503), porque sem contador não há trava.
9. **Limites:** 30 por dia e 300 por mês; as variáveis `ASSISTENTE_LIMITE_DIA` e `ASSISTENTE_LIMITE_MES` mudam o padrão até 100 e 1.000. Valor fora disso volta ao padrão, para um erro de digitação não multiplicar o custo.
10. **Tamanhos (CA-31):** pergunta até 500 caracteres contados como a pessoa vê (pontos de código; um emoji vale um), contexto até 32 KB de JSON em UTF-8, corpo inteiro até 36 KB, lido em pedaços e cortado ao passar. Tudo é conferido antes da cota: pedido recusado não gasta crédito.
11. **Provedor `anthropic`:** SDK oficial `@anthropic-ai/sdk` 1.6.0, fixado (Apache-2.0; versão da API 2026-10-21; a mais nova com mais de uma semana de publicada), modelo `claude-haiku-5-5`, `max_tokens` 2.000, `effort` baixo, sem `thinking` (o Haiku 5.5 pensa por padrão e recusa orçamento), sem temperatura, sem ferramentas e sem streaming. Uma retentativa, feita pelo SDK (429, 5xx, 408, 409 e conexão), e 20 segundos no total, com a retentativa, por um `AbortSignal`. `stop_reason: "refusal"` vira `assistente.recusa` (422); resposta sem texto vira indisponível. Log do SDK desligado.
12. **Prompt fixo `assistente-v1`:** português, texto simples, só os números do contexto, sem prometer preço de hoje, sem conselho de saúde ou dinheiro, e o bloco `<dados>` tratado como dado. Os dados vêm antes da pergunta, e o `<` do JSON vira `<` para nenhum texto de nota fechar o bloco antes da hora.
13. **Provedores atrás de uma interface:** `anthropic` em produção, `gravado` quando `ASSISTENTE_PROVEDOR=gravado` (E2E e prévia, sem custo e sem chave) e um falso nos testes. As respostas gravadas não citam valores em reais. A demonstração do app (T16 e T17) usa respostas gravadas no próprio aparelho e não chama o servidor.
14. **Erros:** os do plano mais `assistente.tempo-esgotado` (504), para a tela dizer que demorou. Toda resposta depois da reserva leva `limite: { restantesHoje, restantesMes, voltaEm }`, até as de erro.
15. **Log:** uma linha por pedido com `resultado`, `prompt`, `duracaoMs`, `provedor`, `modelo`, tokens de entrada e saída e custo estimado em dólar (US$ 0,10 e US$ 0,50 por milhão). Pergunta, contexto, resposta e código nunca entram.

## Alternativas

- **Cloudflare Access na rota:** login de terceiro e configuração no painel para uma pessoa só. O código de acesso é grátis, não depende de conta e cabe num segredo.
- **Contador no KV:** o KV é eventualmente consistente; duas leituras do último crédito passariam as duas.
- **Durable Object para a cota:** atômico também, mas exige classe, migração de DO e mais código para um contador de 300 por mês.
- **Só o limite por IP da Cloudflare:** é aproximado e conta por local da rede; serve contra rajada, não como teto de custo.
- **Devolver o crédito quando o provedor falha:** a chamada que estourou o tempo pode ter sido cobrada, e uma Anthropic instável viraria chamadas sem teto.
- **Pedir ao Cleber para criar o banco e mandar o id:** recusada por ele no card de 2026-11-13; o token do build ganhou D1 Edit.
- **Streaming e cache de prompt:** a resposta é curta e mostrada inteira; o prompt de sistema fica abaixo do mínimo que o cache aceita e o volume é baixo.
- **`fetch` direto na API:** o projeto usa o SDK oficial, que já traz retentativa, tempo limite e erros tipados.

## Consequências

- O Worker passou a 1,1 MB (196 KB com gzip), por causa do SDK; o limite gratuito é 3 MB.
- Uma pergunta que falha gasta crédito da cota; com 30 por dia, é aceitável.
- A cota vale para prévia e produção juntas.
- As linhas de dias antigos ficam na tabela (uma por dia de uso, poucos bytes cada); limpar fica para quando fizer diferença.
- Os segredos `ANTHROPIC_API_KEY` e `ASSISTENTE_CODIGO` são criados pelo Cleber no painel da Cloudflare antes da T16. **Rotação:** criar a chave nova na Anthropic, trocar o segredo, revogar a antiga; um código novo pede para digitar de novo em cada aparelho.
- **Rollback:** reverter o deploy tira a rota; o banco e a tabela ficam sem uso, sem conteúdo de ninguém, e podem ser apagados no painel.
