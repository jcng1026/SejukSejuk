import { expect, test, type Page } from "@playwright/test";

import { DEMO_PASSWORD } from "../src/features/auth/demo-password";

async function demoSignIn(page: Page, who: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Every job, from order to closed/ }),
  ).toBeVisible();
});

test("login page uses palette C", async ({ page }) => {
  await page.goto("/login");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(246, 241, 234)"); // #F6F1EA
});

test("admin demo sign-in lands on the staff home and can sign out", async ({ page }) => {
  await demoSignIn(page, "admin Aisyah");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Hi Aisyah" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});

test("technicians land on their own home and cannot open the staff home", async ({ page }) => {
  await demoSignIn(page, "technician Ali");
  await expect(page).toHaveURL(/\/tech$/);
  await expect(page.getByRole("heading", { name: "Hi Ali" })).toBeVisible();

  await page.goto("/home");
  await expect(page).toHaveURL(/\/tech$/);
});

test("a wrong password shows an error and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("aisyah@sejuk.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await expect(page).toHaveURL(/\/login$/);
});

test("a deactivated technician is refused with a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("hafiz@sejuk.test");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/deactivated/);
  await page.goto("/tech");
  await expect(page).toHaveURL(/\/login$/);
});
