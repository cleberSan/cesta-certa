import eslintPluginAstro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/",
    ".astro/",
    "coverage/",
    "test-results/",
    "playwright-report/",
    "blob-report/",
    ".wrangler/",
  ]),
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  // Regras de acessibilidade do jsx-a11y aplicadas aos componentes .astro.
  ...eslintPluginAstro.configs["jsx-a11y-strict"],
  // Ilhas React (ADR-0001): regras dos hooks e as mesmas regras de acessibilidade.
  {
    files: ["src/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.configs.strict],
  },
  prettier,
]);
