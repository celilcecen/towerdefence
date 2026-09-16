// Captures the store screenshots and the Google Play feature graphic from the real game.
//
//   node scripts/store-screenshots.mjs
//
// Serves the game through a temporary Vite dev server and drives it in headless Chromium
// at the exact pixel sizes each store asks for, in every language. Output goes to
// store/screenshots/<device>/<language>-<n>-<scene>.jpg and store/feature-graphic.jpg.
// JPEG, because App Store Connect rejects screenshots that carry an alpha channel.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "store");

/** CSS viewport × device scale = the pixel size the store expects. */
const DEVICES = [
  { id: "appstore-6.9", width: 440, height: 956, scale: 3 }, // 1320 × 2868
  { id: "appstore-6.5", width: 428, height: 926, scale: 3 }, // 1284 × 2778
  { id: "play-phone", width: 360, height: 720, scale: 3 }, // 1080 × 2160, within Play's 2:1 limit
];
const LANGUAGES = ["en", "tr"];

/** Chapters one and two cleared, so the map shows progress and Continue opens chapter three. */
const PROGRESS = {
  levels: Object.fromEntries(
    ["c1-crossing", "c1-fords", "c1-mill", "c2-lake", "c2-pass", "c2-gate"].map((id, i) => [
      id,
      { stars: i === 5 ? 2 : 3, bestLives: 20 - i },
    ]),
  ),
};
const COACH_SEEN = ["tutorial", "flyer", "healer", "splitter", "boss", "power", "early"];

/** A serpentine wall pattern; placements the game refuses (blocked paths, rocks) are simply skipped. */
const MAZE = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((y) => [4, y]),
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((y) => [8, y]),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((y) => [12, y]),
];

const server = await createServer({
  root,
  server: { port: 5198, strictPort: false },
  logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("Vite did not report a local URL.");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tapCell(page, x, y) {
  const point = await page.evaluate(
    async ([cx, cy]) => {
      const { computeLayout, toScreen } = await import("/src/render/layout.ts");
      const board = document.querySelector("#board").getBoundingClientRect();
      const layout = computeLayout(board.width, board.height, 18, 11);
      const p = toScreen(layout, cx + 0.5, cy + 0.5);
      return { x: board.left + p.x, y: board.top + p.y };
    },
    [x, y],
  );
  await page.mouse.click(point.x, point.y);
}

async function capture(browser, device, language) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    locale: language,
    reducedMotion: "no-preference",
  });
  await context.addInitScript(
    ({ progress, seen, language: lang }) => {
      localStorage.setItem("gridlock.progress.v1", JSON.stringify(progress));
      localStorage.setItem("gridlock.coach.v1", JSON.stringify(seen));
      localStorage.setItem(
        "gridlock.settings.v1",
        JSON.stringify({ sfx: 0, music: 0, haptics: false, language: lang }),
      );
    },
    { progress: PROGRESS, seen: COACH_SEEN, language },
  );
  const page = await context.newPage();
  const dir = join(out, "screenshots", device.id);
  mkdirSync(dir, { recursive: true });
  let shot = 0;
  const snap = async (scene) => {
    shot++;
    const file = join(dir, `${language}-${shot}-${scene}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    console.log(`wrote ${file.slice(root.length + 1)}`);
  };

  await page.goto(url);
  await page.locator("#screen-home").waitFor();
  await pause(1500);
  await snap("home");

  await page.locator('#screen-home button:has([data-t="home.campaign"])').click();
  await page.locator("#screen-map").waitFor();
  await pause(800);
  await snap("map");

  await page.locator("#map-back").click();
  await page.locator('#screen-home button:has([data-t="home.continue"])').click();
  await page.locator("#screen-briefing").waitFor();
  await pause(1200);
  await snap("briefing");

  await page.locator("#brief-start").click();
  await page.locator("#board").waitFor();
  await pause(500);
  for (const [i, [x, y]] of MAZE.entries()) {
    await page.keyboard.press(i % 5 === 4 ? "2" : "1");
    await tapCell(page, x, y);
  }
  await page.keyboard.press("Escape");
  await page.locator("#next-wave").click();
  await page.locator("#speed").click();
  await pause(7000);
  await snap("battle");

  // Call the next wave early when the game allows it, so the late shot is busier.
  if (await page.locator("#next-wave").isEnabled()) await page.locator("#next-wave").click();
  await pause(6000);
  await snap("battle-late");

  await context.close();
}

const browser = await chromium.launch();
try {
  for (const device of DEVICES) {
    for (const language of LANGUAGES) await capture(browser, device, language);
  }

  const sheet = await browser.newPage();
  await sheet.goto(new URL("scripts/brand-sheet.html", url).href);
  await sheet.waitForFunction(() => "brand" in window, undefined, { timeout: 30_000 });
  const feature = await sheet.evaluate(() => window.brand.feature);
  writeFileSync(join(out, "feature-graphic.jpg"), Buffer.from(feature.split(",")[1], "base64"));
  console.log("wrote store/feature-graphic.jpg");
} finally {
  await browser.close();
  await server.close();
}
