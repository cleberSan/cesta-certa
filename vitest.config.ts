import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Os testes E2E (e2e/*.spec.ts) rodam no Playwright, não no Vitest.
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Regras, configuração, o Worker e os scripts, em TypeScript. Páginas .astro e ilhas React (.tsx)
      // são cobertas pelos testes E2E, que rodam sobre o build (ADR-0001): toda regra que
      // uma ilha usa fica num arquivo .ts ao lado dela, com teste unitário.
      include: ["src/**/*.ts", "worker/**/*.ts", "scripts/**/*.ts"],
      // indexeddb.ts é só a ponte com a API do navegador, que não existe no Node: é provado
      // pelo E2E no IndexedDB de verdade (e2e/lista.spec.ts e e2e/dados.spec.ts). As regras
      // dele ficam em migracoes.ts, arquivo.ts e nas fatias, com teste de unidade.
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/fixtures/**",
        "src/shared/armazenamento/indexeddb.ts",
        // Ponte com o MapLibre, que precisa de WebGL: provada por e2e/mapa.spec.ts. As contas
        // e os dados do mapa ficam em src/features/mapa/geojson.ts e estilo.ts, com teste.
        "src/features/mapa/motor.ts",
        // Só liga o gerador à rede e ao disco; as regras dele ficam em scripts/mercados/,
        // com teste, e a geração de verdade roda no workflow mensal (ADR-0005).
        "scripts/mercados.ts",
      ],
      reporter: ["text", "lcov", "cobertura"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
