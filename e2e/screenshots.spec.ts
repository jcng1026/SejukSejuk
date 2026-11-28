import { expect, test, type Page } from "@playwright/test";

import { demoSignIn } from "./helpers";

// Not a test: regenerates the README screenshots. Run with
//   SCREENSHOTS=1 CI=1 npx playwright test e2e/screenshots.spec.ts --project=desktop
// (the AI shot needs GROQ_API_KEY in .env.local).
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to regenerate docs/screenshots");

const DIR = "docs/screenshots";

async function shoot(page: Page, name: string, format: "png" | "jpeg" = "png"): Promise<void> {
  await page.waitForLoadState("networkidle");
  const path = `${DIR}/${name}.${format === "png" ? "png" : "jpg"}`;
  await page.screenshot(format === "png" ? { path } : { path, type: "jpeg", quality: 80 });
}

test("staff screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  // The sign-in hero has a fine grain that makes PNGs huge.
  await shoot(page, "01-login", "jpeg");

  await demoSignIn(page, "manager Rahman");
  await expect(page.getByRole("heading", { name: "Today's schedule" })).toBeVisible();
  await shoot(page, "02-manager-home");

  await page.goto("/review");
  await shoot(page, "03-review-queue");

  await page.goto("/dashboard?period=this_month");
  await expect(page.getByRole("heading", { name: "Jobs by service" })).toBeVisible();
  await shoot(page, "04-dashboard");

  await page.goto("/calendar");
  await page.waitForTimeout(1500); // let FullCalendar lay out its events
  await shoot(page, "05-calendar");

  await page.goto("/home");
  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });
  await panel
    .getByRole("button", { name: "Which technician completed the most jobs this week?" })
    .click();
  await expect(panel.getByText(/^Based on: |^Assistant unavailable/)).toBeVisible({
    timeout: 45_000,
  });
  await shoot(page, "06-ai-assistant");
});

test("technician phone screens", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await demoSignIn(page, "technician Ali");
  await page.goto("/tech/upcoming");
  await shoot(page, "07-technician-jobs");

  await page.getByRole("main").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/tech\/jobs\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(page, "08-technician-job");
  await context.close();
});
