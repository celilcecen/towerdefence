import { defineConfig } from "vitest/config";
import { SECURITY_HEADERS } from "./deploy/security-headers.ts";

export default defineConfig({
  build: {
    target: "es2022",
    // The polyfill would be injected as an inline script, which the CSP forbids.
    modulePreload: { polyfill: false },
    // Never inline assets as data: URLs; everything is a same-origin file.
    assetsInlineLimit: 0,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true, headers: { ...SECURITY_HEADERS } },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Everything with logic is unit-tested. DOM and canvas adapters (ui, input,
      // renderer) are covered by the Playwright suite instead.
      include: [
        "src/core/**/*.ts",
        "src/content/**/*.ts",
        "src/app/**/*.ts",
        "src/platform/**/*.ts",
        "src/render/layout.ts",
      ],
      exclude: ["src/app/main.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
