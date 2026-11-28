import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { demoSignIn } from "./helpers";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** WCAG 2.2 A/AA violations on the current page, as "rule: element" lines. */
async function violations(page: Page, skipRules: string[] = []): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .disableRules(skipRules)
    // The Next.js dev indicator is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")}`),
  );
}

test("the sign-in page meets WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/login");
  expect(await violations(page)).toEqual([]);
});

test("the staff pages meet WCAG 2.2 AA", async ({ page }) => {
  await demoSignIn(page, "manager Rahman");
  const found: string[] = [];
  for (const path of [
    "/home",
    "/orders",
    "/review",
    "/flags",
    "/dashboard",
    "/team",
    "/audit",
    "/ai-log",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    found.push(...(await violations(page)).map((line) => `${path} ${line}`));
  }
  // Calendar: the list view (one full-width row per job) passes every rule, and is the
  // WCAG 2.5.8 "equivalent control" for the dense week grid, which is checked for
  // everything except target size.
  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  found.push(...(await violations(page, ["target-size"])).map((line) => `/calendar grid ${line}`));
  await page.getByLabel("List view", { exact: true }).click();
  await page.waitForLoadState("networkidle");
  found.push(...(await violations(page)).map((line) => `/calendar list ${line}`));

  await page.goto("/orders");
  await page.getByRole("main").getByRole("link", { name: /^ORD-/ }).first().click();
  await page.waitForLoadState("networkidle");
  found.push(...(await violations(page)).map((line) => `order page ${line}`));
  await page.getByRole("button", { name: "Ask AI" }).click();
  found.push(...(await violations(page)).map((line) => `AI panel ${line}`));
  expect(found).toEqual([]);
});

test("the technician screens meet WCAG 2.2 AA", async ({ page }) => {
  await demoSignIn(page, "technician Ali");
  const found: string[] = [];
  for (const path of ["/tech", "/tech/upcoming", "/tech/history"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    found.push(...(await violations(page)).map((line) => `${path} ${line}`));
  }
  await page.goto("/tech/upcoming");
  const job = page.getByRole("main").getByRole("link").first();
  if ((await job.count()) > 0) {
    await job.click();
    await page.waitForLoadState("networkidle");
    found.push(...(await violations(page)).map((line) => `job page ${line}`));
  }
  expect(found).toEqual([]);
});
