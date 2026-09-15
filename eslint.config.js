import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const htmlSinks = ["innerHTML", "outerHTML"].map((property) => ({
  property,
  message: "Build DOM with createElement/textContent. HTML string sinks are an XSS vector.",
}));

export default defineConfig(
  { ignores: ["dist", "coverage", "playwright-report", "test-results"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-new-func": "error",
      "no-restricted-globals": ["error", "eval"],
      "no-restricted-properties": [
        "error",
        ...htmlSinks,
        { property: "insertAdjacentHTML", message: htmlSinks[0].message },
        { object: "document", property: "write", message: htmlSinks[0].message },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // The core is a pure, deterministic simulation. It may not reach into
    // adapters (render, ui, input, platform) or wall-clock / browser globals.
    files: ["src/core/**/*.ts", "src/content/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "**/render/**", "**/ui/**", "**/input/**", "**/platform/**"],
              message: "The simulation core must not depend on adapters.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng for determinism." },
        { object: "Date", property: "now", message: "Simulation time comes from ticks only." },
      ],
    },
  },
  {
    files: ["tests/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
