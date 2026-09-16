// Captures the README pictures from the real game.
//
//   node scripts/readme-screenshots.mjs
//
// Serves the game through a temporary Vite dev server and drives it in headless Chromium:
// docs/start-screen.png (desktop home), docs/screenshot.png (desktop, mid-wave in the
// Ashlands with the Sentinel fighting) and docs/mobile.png (phone, mid-wave in Classic).
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");

/** Chapters one and two cleared, so the home screen offers Continue and the map shows stars. */
const PROGRESS = {
  levels: Object.fromEntries(
    ["c1-crossing", "c1-fords", "c1-mill", "c2-lake", "c2-pass", "c2-gate"].map((id, i) => [
      id,
      { stars: i === 5 ? 2 : 3, bestLives: 20 - i },
    ]),
  ),
};
const COACH_SEEN = ["tutorial", "flyer", "healer", "splitter", "boss", "power", "early"];

/** Towers on both banks of the Cinder Fields lane; placements the game refuses (rocks) are skipped. */
const LANE = [
  [6, 2],
  [9, 2],
  [12, 2],
  [6, 6],
  [9, 6],
  [12, 6],
  [3, 6],
];

const server = await createServer({
  root,
  server: { port: 5199, strictPort: false },
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

/** Holds a movement key so the Sentinel walks; the board may be rotated, keys are board-relative. */
async function walk(page, key, ms) {
  await page.keyboard.down(key);
  await pause(ms);
  await page.keyboard.up(key);
}

async function buildMaze(page, cells) {
  for (const [i, [x, y]] of cells.entries()) {
    await page.keyboard.press(i % 5 === 4 ? "2" : "1");
    await tapCell(page, x, y);
  }
  // A right-click on the board drops the build tool; Escape would pause when nothing is selected.
  const box = await page.locator("#board").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 4, { button: "right" });
}

async function context(browser, options) {
  const ctx = await browser.newContext({
    reducedMotion: "no-preference",
    locale: "en",
    ...options,
  });
  await ctx.addInitScript(
    ({ progress, seen }) => {
      localStorage.setItem("gridlock.progress.v1", JSON.stringify(progress));
      localStorage.setItem("gridlock.coach.v1", JSON.stringify(seen));
      localStorage.setItem(
        "gridlock.settings.v1",
        JSON.stringify({ sfx: 0, music: 0, haptics: false, language: "en" }),
      );
    },
    { progress: PROGRESS, seen: COACH_SEEN },
  );
  return ctx;
}

const browser = await chromium.launch();
try {
  // Home screen.
  const home = await context(browser, {
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const homePage = await home.newPage();
  await homePage.goto(url);
  await homePage.locator("#screen-home").waitFor();
  await pause(1500);
  await homePage.screenshot({ path: join(docs, "start-screen.png") });
  console.log("wrote docs/start-screen.png");
  await home.close();

  // Desktop battle: chapter three opens from Continue; the Sentinel walks into the middle lane.
  const desktop = await context(browser, {
    viewport: { width: 1280, height: 760 },
    deviceScaleFactor: 2,
  });
  const page = await desktop.newPage();
  await page.goto(url);
  await page.locator('#screen-home button:has([data-t="home.continue"])').click();
  await page.locator("#brief-start").click();
  await page.locator("#board").waitFor();
  await pause(400);
  // The Sentinel walks down into the middle lane and out to meet the wave; towers line the lane.
  await walk(page, "s", 350);
  await walk(page, "a", 3300);
  await buildMaze(page, LANE);
  await page.locator("#next-wave").click();
  await page.locator("#speed").click();
  await pause(Number(process.env.WAIT ?? 4200));
  await page.screenshot({ path: join(docs, "screenshot.png") });
  console.log("wrote docs/screenshot.png");
  await desktop.close();

  // Phone: Classic mode with the stick and hero buttons on screen.
  const phone = await context(browser, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(url);
  await phonePage.locator('#screen-home button:has([data-t="home.classic"])').click();
  await phonePage.locator("#board").waitFor();
  await pause(400);
  await buildMaze(phonePage, [
    [4, 4],
    [7, 6],
    [10, 4],
    [4, 6],
    [10, 6],
  ]);
  // Movement keys are screen-relative: on the rotated board "w" walks up the lane towards the rift.
  await walk(phonePage, "w", 2200);
  await phonePage.locator("#next-wave").click();
  await pause(Number(process.env.WAIT_PHONE ?? 5500));
  await phonePage.screenshot({ path: join(docs, "mobile.png") });
  console.log("wrote docs/mobile.png");
  await phone.close();
} finally {
  await browser.close();
  await server.close();
}
