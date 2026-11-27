import { expect, test } from "@playwright/test";

test("home page renders with the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Sejuk Sejuk Ops" })).toBeVisible();
});

test("palette C is applied to the page background", async ({ page }) => {
  await page.goto("/");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(246, 241, 234)"); // #F6F1EA
});
