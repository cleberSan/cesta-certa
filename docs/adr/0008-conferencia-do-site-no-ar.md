# ADR-0008: Conferência agendada do site no ar

- Status: aceito
- Data: 2026-11-13 (T19)

## Contexto

O [plano da spec 0001](../specs/0001-mvp-compra-do-mes/plano.md) pede, para produção, uma "conferência diária com a suíte E2E contra o site publicado (pipeline do ecossistema), abrindo issue quando falha", e a tarefa T19 só fecha com ela ligada. O CI testa o build servido pelo `wrangler dev`, mas não vê o que chegou ao público: os cabeçalhos servidos pela Cloudflare, o Worker de `/api` com os bindings de produção, o service worker com o build real, uma configuração mudada no painel ou um recurso da Cloudflare que injete script e quebre a CSP.

O padrão do ecossistema é o da lojinha-da-lua ([ADR-0008 de lá](https://github.com/cleberSan/lojinha-da-lua/blob/main/docs/adr/0008-conferencia-do-site-no-ar.md), modelo em `claude-works/pipelines/conferencia-producao.yml`). Aqui há duas diferenças: a API tem limite de 10 pedidos por minuto por cliente, contado pela Cloudflare em cada local da rede ([ADR-0001](0001-pilha-e-hospedagem.md)), e contra a produção todos os pedidos saem do mesmo IP; e o assistente pede um código de acesso que o E2E não tem ([ADR-0004](0004-assistente-pelo-servidor.md)).

## Decisão

1. **A mesma suíte, outro endereço:** com `E2E_BASE_URL`, o `playwright.config.ts` aponta os testes para o site publicado e não sobe o servidor local. Nenhum teste novo só para produção.
2. **GitHub Actions agendado** (`.github/workflows/producao.yml`, "Site no ar"): todo dia às 09:43 UTC e disparável à mão em **Actions → Site no ar → Run workflow**. Repositório público, então os minutos são gratuitos.
3. **Sem gatilho de PR:** a suíte de um PR já testa telas que a produção só recebe no merge, então rodaria contra a versão anterior e falharia sem defeito no ar. Mudança no próprio workflow se confere com o disparo manual depois do merge.
4. **A API dentro do limite:** contra a produção, `e2e/api.spec.ts` roda só no projeto desktop (a API não muda com o aparelho), um teste por vez, e não manda o `CF-Connecting-IP` forjado. Um 429 espera o `Retry-After` (no máximo 60 s) e repete o pedido uma vez. O teste que conta a 11ª consulta fica só no workerd local, porque na Cloudflare a contagem é aproximada e por local. Todos os pedidos da suíte são recusados antes de qualquer consulta à Secretaria da Fazenda.
5. **Assistente sem código:** contra a produção vale só o pedido sem código, que responde 401 (ou 503 antes dos segredos); a tela do assistente já fica de fora (T16). Nenhum código de acesso vai para o workflow nem para os secrets do GitHub.
6. **Aviso por issue:** se a execução agendada falhar, um job separado, o único com permissão de escrita em issues, abre a issue "Site no ar falhou na conferência agendada" ou comenta na que já está aberta. O relatório do Playwright fica nos artefatos por 14 dias.
7. **Endereço amarrado ao código:** um teste unitário confere que o `E2E_BASE_URL` do workflow é o `productionSiteUrl` de `src/config/site.ts`.

## Alternativas

- **Suíte separada só para produção:** duplicaria testes, e as duas suítes divergiriam.
- **Rodar a API nos dois projetos e esperar o limite entre todos os pedidos:** dobra os pedidos contados e alonga a execução, sem conferir nada a mais.
- **Liberar o IP do runner no limite:** abriria uma exceção na trava de produção para os testes; o runner muda de IP a cada execução.
- **Rodar a cada merge, logo após o deploy:** o build da Cloudflare termina minutos depois do merge, e o workflow teria de esperar pelo check dela. Fica como melhoria se o diário não bastar.
- **Monitor externo (UptimeRobot, Better Stack):** só confere se a página responde, não vê CSP, cabeçalhos nem a API, e é mais uma conta com acesso ao projeto.

## Consequências

- Um problema em produção aparece em até 24 horas, ou na hora com o disparo manual depois de um deploy.
- Cada execução faz poucas dezenas de pedidos ao Worker, dentro do plano gratuito; os arquivos estáticos não passam pelo Worker. A espera de um período do limite soma cerca de um minuto à execução.
- Entre um merge e o fim do deploy, a execução pode comparar a suíte nova com o site anterior; o horário fixo de madrugada torna isso improvável.
- O GitHub desativa agendamentos de repositório público sem atividade por 60 dias e avisa por e-mail. Basta reativar em **Actions → Site no ar**.
- Mudar o endereço (um domínio próprio, por exemplo) é um PR que troca `productionSiteUrl` e `E2E_BASE_URL` juntos; o teste unitário não deixa um mudar sem o outro.
