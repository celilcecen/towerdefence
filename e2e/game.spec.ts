import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { computeLayout, toScreen } from "../src/render/layout";

const COLUMNS = 18;
const ROWS = 11;

/** Uses the game's own layout math, so clicks land on the intended cell even when the board is rotated. */
async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const board = page.locator("#board");
  const box = await board.boundingBox();
  if (!box) throw new Error("Board is not visible.");
  const layout = computeLayout(box.width, box.height, COLUMNS, ROWS);
  await board.click({ position: toScreen(layout, x + 0.5, y + 0.5) });
}

const stat = (page: Page, id: string): Locator => page.locator(`#${id}`);

async function numberIn(locator: Locator): Promise<number> {
  return Number(await locator.textContent());
}

async function startClassic(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /Classic/ }).click();
  await expect(stat(page, "wave")).toHaveText("0/15");
}

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  // Onboarding pauses the game to explain things; only its own test wants that.
  if (!test.info().title.includes("tutorial")) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gridlock.coach.v1",
        JSON.stringify(["tutorial", "flyer", "healer", "splitter", "boss", "power", "early"]),
      );
    });
  }
  (page as Page & { problems?: string[] }).problems = problems;
});

test("a new player is taught to build a maze by a hands-on tutorial", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Campaign/ }).click();
  await page.getByRole("button", { name: /Level 1: The Crossing/ }).click();
  await page.getByRole("button", { name: "Defend" }).click();

  const bubble = page.locator("#coach-bubble");
  await expect(bubble).toContainText("red rift");
  await bubble.getByRole("button", { name: "Next" }).click();
  await expect(bubble).toContainText("Tap the Bolt tower");

  await page.getByRole("button", { name: /Bolt/ }).click();
  await expect(bubble).toContainText("glowing tile");
  await clickCell(page, 8, 2);
  await expect(page.getByRole("status").first()).toHaveText("Build on the glowing tile.");
  await clickCell(page, 3, 5);
  await expect(stat(page, "gold")).toHaveText("180");
  await expect(bubble).toContainText("Towers are walls");

  await bubble.getByRole("button", { name: "Skip tutorial" }).click();
  await expect(bubble).toBeHidden();

  await page.reload();
  await page.getByRole("button", { name: /Campaign/ }).click();
  await page.getByRole("button", { name: /Level 1: The Crossing/ }).click();
  await page.getByRole("button", { name: "Defend" }).click();
  await expect(stat(page, "gold")).toHaveText("220");
  await expect(page.locator("#coach")).toBeHidden();
});

test.afterEach(({ page }) => {
  expect((page as Page & { problems?: string[] }).problems ?? []).toEqual([]);
});

test("is served with a strict security policy", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("home screen offers the campaign, classic mode and help", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gridlock" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Campaign/ })).toContainText("0/36");
  await expect(page.getByRole("button", { name: /Continue/ })).toBeHidden();
  await expect(page.getByRole("link", { name: /source on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/celilcecen/towerdefence",
  );

  await page.getByRole("button", { name: "How to play" }).click();
  const help = page.getByRole("dialog", { name: "How to play" });
  const towers = help.getByRole("region", { name: "Your towers" }).getByRole("listitem");
  const enemies = help.getByRole("region", { name: "Enemies" }).getByRole("listitem");
  await expect(towers).toHaveCount(4);
  await expect(towers.first()).toContainText("Rapid fire");
  await expect(enemies).toHaveCount(4);
  await expect(enemies.last()).toContainText("Boss");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});

test("switches to Turkish and remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Türkçe" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();
  await page.getByRole("button", { name: "Tamam" }).click();
  await expect(page.getByRole("button", { name: /Hikâye/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /Klasik/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
});

test("classic mode starts with the original rules", async ({ page }) => {
  await startClassic(page);
  await expect(stat(page, "gold")).toHaveText("200");
  await expect(stat(page, "lives")).toHaveText("20");
  await expect(page.locator("#wave-preview")).toContainText("8 Grunt");
  await expect(page.locator("#hint")).toContainText("Pick a tower");
});

test("towers, enemies and the board are drawn, not left blank", async ({ page }) => {
  await startClassic(page);

  const inkedPixels = (selector: string): Promise<number> =>
    page
      .locator(selector)
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext("2d");
        if (!ctx || canvas.width === 0) return 0;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let inked = 0;
        for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) inked++;
        return inked;
      });

  expect(await inkedPixels(".build-icon")).toBeGreaterThan(200);
  await expect.poll(() => inkedPixels(".preview-icon")).toBeGreaterThan(50);
  await expect.poll(() => inkedPixels("#board")).toBeGreaterThan(10_000);
});

test("building a tower and fighting a wave earns gold", async ({ page }) => {
  await startClassic(page);

  await page.getByRole("button", { name: /Bolt/ }).click();
  await clickCell(page, 3, 3);
  await expect(stat(page, "gold")).toHaveText("160");

  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(stat(page, "wave")).toHaveText("1/15");
  await page.getByRole("button", { name: "Game speed" }).click();

  await expect.poll(() => numberIn(stat(page, "gold")), { timeout: 20_000 }).toBeGreaterThan(160);
});

test("rejected placements explain why", async ({ page }) => {
  await startClassic(page);
  await page.keyboard.press("1");
  await clickCell(page, 6, 1);
  await expect(page.getByRole("status")).toHaveText("You can't build there.");
  await expect(stat(page, "gold")).toHaveText("200");
});

test("keyboard shortcuts select tools, cancel and pause", async ({ page }) => {
  await startClassic(page);
  const bolt = page.getByRole("button", { name: /Bolt/ });

  await page.keyboard.press("1");
  await expect(bolt).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(bolt).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(pause).toBeHidden();
});

test("a selected tower can be upgraded, retargeted and sold", async ({ page }) => {
  await startClassic(page);
  await page.keyboard.press("1");
  await clickCell(page, 3, 3);
  await page.keyboard.press("Escape");

  await clickCell(page, 3, 3);
  const panel = page.getByRole("region", { name: "Selected tower" });
  await expect(panel.getByRole("heading")).toHaveText("Bolt · level 1/3");

  await panel.getByRole("button", { name: /Upgrade/ }).click();
  await expect(panel.getByRole("heading")).toHaveText("Bolt · level 2/3");
  await expect(stat(page, "gold")).toHaveText("115");

  const strong = panel.getByRole("button", { name: "Strongest" });
  await strong.click();
  await expect(strong).toHaveAttribute("aria-pressed", "true");

  await panel.getByRole("button", { name: /Sell/ }).click();
  await expect(panel).toBeHidden();
  await expect(stat(page, "gold")).toHaveText(String(115 + Math.floor(85 * 0.7)));
});

test("the campaign opens with a story briefing and locks later levels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Campaign/ }).click();

  await expect(page.getByRole("button", { name: /Level 1: The Crossing/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Level 2: Twin Fords/ })).toBeDisabled();

  await page.getByRole("button", { name: /Level 1: The Crossing/ }).click();
  await expect(page.getByRole("heading", { name: "1. The Crossing" })).toBeVisible();
  await expect(page.locator("#brief-text")).toContainText("Every tower you build is a wall");
  await expect(page.locator("#brief-new")).toContainText("Grunt");

  await page.getByRole("button", { name: "Defend" }).click();
  await expect(stat(page, "wave")).toHaveText("0/8");
  await expect(page.locator(".build-card")).toHaveCount(2);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Quit to map" }).click();
  await expect(page.getByRole("heading", { name: "Campaign" })).toBeVisible();
});

test("saved progress unlocks levels, and powers are aimed on the board", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gridlock.progress.v1",
      JSON.stringify({ levels: { "c1-crossing": { stars: 3, bestLives: 20 } } }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Campaign/ })).toContainText("3/36");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "2. Twin Fords" })).toBeVisible();
  await expect(page.locator("#brief-new")).toContainText("Meteor");
  await page.getByRole("button", { name: "Defend" }).click();

  const meteor = page.getByRole("button", { name: "Meteor" });
  await expect(meteor).toBeDisabled();
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(meteor).toBeEnabled();
  await meteor.click();
  await expect(meteor).toHaveAttribute("aria-pressed", "true");
  await clickCell(page, 1, 5);
  await expect(meteor).toHaveAttribute("aria-pressed", "false");
  await expect(meteor).toBeDisabled();
  await expect(meteor.locator(".power-time")).toHaveText(/\d+/);
});
