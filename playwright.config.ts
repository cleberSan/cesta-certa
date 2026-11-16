import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 8787);
const isCI = Boolean(process.env.CI);

// Com E2E_BASE_URL, a mesma suíte roda contra o endereço publicado, sem subir o servidor
// local (a conferência agendada da produção entra na tarefa T19 da spec 0001).
const remoteURL = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL) : undefined;
if (remoteURL && remoteURL.protocol !== "https:") {
  throw new Error(`E2E_BASE_URL precisa usar https: ${remoteURL.href}`);
}
const baseURL = remoteURL?.origin ?? `http://127.0.0.1:${port}`;

// Assistente no E2E local (spec 0001, CA-35; ADR-0004): respostas gravadas, sem chamar a
// Anthropic, com um código de acesso sorteado a cada execução e um D1 local novo, para a cota
// começar zerada. O código vai para o ambiente: os workers do Playwright herdam o mesmo valor
// (e2e/assistente.ts), e nenhum arquivo do repositório o guarda (CA-34). Para reaproveitar um
// `wrangler dev` já aberto, rode os dois com o mesmo E2E_ASSISTENTE_CODIGO.
process.env.E2E_ASSISTENTE_CODIGO ??= randomBytes(32).toString("base64url");
process.env.E2E_PERSISTENCIA ??= mkdtempSync(join(tmpdir(), "cesta-certa-e2e-"));
const variaveisDoAssistente = [
  ["ASSISTENTE_PROVEDOR", "gravado"],
  ["ASSISTENTE_CODIGO", process.env.E2E_ASSISTENTE_CODIGO],
  ["ASSISTENTE_LIMITE_DIA", "100"],
  ["ASSISTENTE_LIMITE_MES", "1000"],
]
  .map(([nome, valor]) => `--var ${nome}:${valor}`)
  .join(" ");

// Permite usar um Chromium já instalado na máquina (por exemplo, em containers sem acesso
// ao download do Playwright). No CI o navegador vem de `npx playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "pt-BR",
    // Contra a produção bastam a mensagem de erro e o screenshot; o trace fica para o CI.
    trace: remoteURL ? "off" : "retain-on-failure",
    screenshot: remoteURL ? "only-on-failure" : "off",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Serve o build (dist/) e o Worker de /api com o mesmo runtime da Cloudflare (workerd),
  // aplicando o _headers e o tratamento de 404 e de barra final de produção (ADR-0001).
  ...(remoteURL
    ? {}
    : {
        webServer: {
          command: `npx wrangler dev --ip 127.0.0.1 --port ${port} --log-level warn --persist-to ${process.env.E2E_PERSISTENCIA} ${variaveisDoAssistente}`,
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          env: { WRANGLER_SEND_METRICS: "false" },
        },
      }),
});
