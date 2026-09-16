// Generates the native app icons and launch screens from the game's procedural brand art.
//
//   node scripts/generate-app-assets.mjs
//
// Renders scripts/brand-sheet.html in headless Chromium through a temporary Vite dev
// server, writes the source PNGs to assets/, then lets @capacitor/assets produce every
// Android and iOS size. Run it again whenever src/render/art/brand.ts changes.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets");
const BACKGROUND = "#0a0e13";

const server = await createServer({
  root,
  server: { port: 5199, strictPort: false },
  logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("Vite did not report a local URL.");

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL("scripts/brand-sheet.html", url).href);
  await page.waitForFunction(() => "brand" in window, undefined, { timeout: 30_000 });
  const brand = await page.evaluate(() => window.brand);

  mkdirSync(out, { recursive: true });
  const save = (name, dataUrl) => {
    writeFileSync(join(out, name), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`wrote assets/${name}`);
  };
  save("icon-only.png", brand.icon);
  save("icon-background.png", brand.adaptiveBackground);
  save("icon-foreground.png", brand.adaptiveForeground);
  save("splash.png", brand.splash);
  save("splash-dark.png", brand.splash);
} finally {
  await browser.close();
  await server.close();
}

execFileSync(
  "npx",
  [
    "capacitor-assets",
    "generate",
    "--iconBackgroundColor",
    BACKGROUND,
    "--iconBackgroundColorDark",
    BACKGROUND,
    "--splashBackgroundColor",
    BACKGROUND,
    "--splashBackgroundColorDark",
    BACKGROUND,
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
