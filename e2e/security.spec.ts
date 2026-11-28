import { expect, test, type Page } from "@playwright/test";

import { demoSignIn } from "./helpers";

/** Collects the browser's CSP violation messages while pages load. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test("every response carries the security headers", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("the main staff pages load without CSP violations", async ({ page }) => {
  const violations = watchCsp(page);
  await demoSignIn(page, "manager Rahman");
  for (const path of ["/home", "/orders", "/review", "/dashboard", "/calendar", "/audit"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.getByRole("button", { name: "Ask AI" }).click();
  await expect(page.getByRole("dialog", { name: "AI assistant" })).toBeVisible();
  expect(violations).toEqual([]);
});

test("the technician screens load without CSP violations", async ({ page }) => {
  const violations = watchCsp(page);
  await demoSignIn(page, "technician Ali");
  for (const path of ["/tech", "/tech/upcoming", "/tech/history"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});
