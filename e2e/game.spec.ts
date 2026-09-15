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
  test.info().annotations.push({ type: "problems", description: "" });
  (page as Page & { problems?: string[] }).problems = problems;
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

test("start screen explains the game and play starts it", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Gridlock" })).toBeVisible();
  await expect(page.getByRole("link", { name: /source on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/celilcecen/towerdefence",
  );

  const towers = dialog.getByRole("region", { name: "Your towers" }).getByRole("listitem");
  const enemies = dialog.getByRole("region", { name: "Enemies" }).getByRole("listitem");
  await expect(towers).toHaveCount(4);
  await expect(towers.first()).toContainText("Rapid fire");
  await expect(enemies).toHaveCount(4);
  await expect(enemies.last()).toContainText("Boss");

  await page.getByRole("button", { name: "Play" }).click();

  await expect(dialog).toBeHidden();
  await expect(stat(page, "gold")).toHaveText("200");
  await expect(stat(page, "lives")).toHaveText("20");
  await expect(stat(page, "wave")).toHaveText("0/15");
  await expect(page.locator("#wave-preview")).toContainText("8 Grunt");
  await expect(page.locator("#hint")).toContainText("Pick a tower");
});

test("towers, enemies and the board are drawn, not left blank", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();

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
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();

  await page.getByRole("button", { name: /Bolt/ }).click();
  await clickCell(page, 3, 3);
  await expect(stat(page, "gold")).toHaveText("160");

  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(stat(page, "wave")).toHaveText("1/15");
  await page.getByRole("button", { name: "Game speed" }).click();

  await expect.poll(() => numberIn(stat(page, "gold")), { timeout: 20_000 }).toBeGreaterThan(160);
});

test("rejected placements explain why", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await page.keyboard.press("1");
  await clickCell(page, 6, 1);
  await expect(page.getByRole("status")).toHaveText("You can't build there.");
  await expect(stat(page, "gold")).toHaveText("200");
});

test("keyboard shortcuts select and cancel tools", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  const bolt = page.getByRole("button", { name: /Bolt/ });

  await page.keyboard.press("1");
  await expect(bolt).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(bolt).toHaveAttribute("aria-pressed", "false");
});

test("a selected tower can be upgraded, retargeted and sold", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
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
