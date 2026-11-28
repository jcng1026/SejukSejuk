import { expect, test } from "@playwright/test";

import { createOrder, demoSignIn, mytToday } from "./helpers";

test("the staff home shows today's tiles, schedule and review queue", async ({ page }) => {
  await demoSignIn(page, "admin Aisyah");
  const main = page.getByRole("main");
  await expect(main.getByText("Jobs today")).toBeVisible();
  await expect(main.getByText("Week revenue")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Today's schedule" })).toBeVisible();
  await expect(main.getByRole("list", { name: /^Unassigned: \d+ jobs?$/ })).toBeVisible();
  await main.getByRole("link", { name: "Open review queue" }).click();
  await expect(page).toHaveURL(/\/review$/);
});

test("the dashboard switches periods and lists every active technician", async ({ page }) => {
  await demoSignIn(page, "manager Rahman");
  await page.goto("/dashboard");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "This week" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const board = main.getByRole("region", { name: "Technician leaderboard" });
  for (const name of ["Ali", "John", "Bala", "Yusoff"]) {
    await expect(board.getByRole("cell", { name, exact: true })).toBeVisible();
  }
  await expect(board.getByRole("cell", { name: "Hafiz" })).toHaveCount(0);

  await main.getByRole("link", { name: "Last week" }).click();
  await expect(page).toHaveURL(/period=last_week/);
  await expect(main.getByRole("link", { name: "Last week" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // A reversed custom range falls back to this week instead of erroring.
  await page.goto("/dashboard?period=custom&from=2026-11-30&to=2026-11-01");
  await expect(main.getByRole("link", { name: "This week" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the calendar shows jobs in Malaysia time, filters by technician and opens the order", async ({
  browser,
}) => {
  const customer = `E2E Calendar ${Date.now()}`;
  const office = await browser.newPage();
  await demoSignIn(office, "admin Aisyah");
  const orderId = await createOrder(office, customer, { technician: "Yusoff", date: mytToday() });

  // A viewer whose browser runs on UTC still sees the 10:00 Malaysia booking at 10:00.
  const context = await browser.newContext({ timezoneId: "UTC" });
  const page = await context.newPage();
  await demoSignIn(page, "manager Rahman");
  await page.goto("/calendar");
  await page.getByLabel("Technician").selectOption({ label: "Yusoff" });
  // The list view shows every job in full (the grid folds crowded slots into "+N more").
  await page.getByLabel("List view", { exact: true }).click();
  const event = page.getByRole("main").getByText(customer).first();
  await expect(event).toBeVisible();
  await expect(event.locator("xpath=ancestor::*[contains(., '10:00')][1]")).toBeVisible();

  await page.getByLabel("Technician").selectOption({ label: "Ali" });
  await expect(page.getByText(customer)).toHaveCount(0);
  // Click with the filter on: "Everyone" on a phone-width week squeezes events very thin.
  await page.getByLabel("Technician").selectOption({ label: "Yusoff" });
  await page.getByText(customer).first().click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await context.close();
});

test("managers deactivate technicians only once their jobs are reassigned", async ({ page }) => {
  await demoSignIn(page, "manager Rahman");
  await page.goto("/team");
  await page.getByRole("button", { name: "Deactivate Ali" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Reassign" })).toBeVisible();
  // Read-only beyond this point: other tests (and the mobile project) rely on Hafiz staying
  // deactivated, and reactivation is covered by the database tests.
  await expect(page.getByRole("button", { name: "Reactivate Hafiz" })).toBeVisible();
});

test("the audit log filters by record and shows who changed what", async ({ page }) => {
  await demoSignIn(page, "admin Aisyah");
  await page.goto("/audit");
  await page.getByLabel("Record").selectOption({ label: "Order" });
  await page.getByLabel("Change", { exact: true }).selectOption({ label: "Changed" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/table=orders/);
  await expect(page.getByRole("row").nth(1)).toContainText("Changed Order");
  await expect(page.getByRole("cell", { name: "Created Order" })).toHaveCount(0);
});

test("technicians cannot open the office insight pages", async ({ page }) => {
  await demoSignIn(page, "technician Ali");
  for (const path of ["/dashboard", "/calendar", "/team", "/audit"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/tech$/);
  }
  const response = await page.request.get(
    "/api/calendar?start=2026-11-23T00:00:00Z&end=2026-11-30T00:00:00Z&technician=",
  );
  expect(response.status()).toBe(403);
});
