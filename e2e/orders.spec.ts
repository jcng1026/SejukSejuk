import { expect, test, type Page } from "@playwright/test";

async function demoSignIn(page: Page, who: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL(/\/(home|tech)$/);
}

async function createOrder(page: Page, customer: string): Promise<void> {
  await page.goto("/orders/new");
  await page.getByLabel("Customer name").fill(customer);
  await page.getByLabel("Phone").fill("012-778 4455");
  await page.getByLabel("Address").fill("No. 8, Jalan Kenari 2, Puchong");
  await page.getByLabel("Problem description").fill("Indoor unit dripping water");
  await page.getByLabel("Service type").selectOption({ label: "Repair" });
  await page.getByLabel("Quoted price (RM)").fill("180");
  const technician = page.getByLabel("Technician");
  const yusoff = await technician.locator("option", { hasText: "Yusoff" }).getAttribute("value");
  await technician.selectOption(yusoff ?? "");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByText(/^Order ORD-\d{6}-\d{4} created\.$/)).toBeVisible();
}

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => demoSignIn(page, "admin Aisyah"));

  test("sees every field's problem when submitting an empty order form", async ({ page }) => {
    await page.goto("/orders/new");
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page.getByText("Enter the customer's name.")).toBeVisible();
    await expect(page.getByText("Enter a Malaysian number, e.g. 012-345 6789.")).toBeVisible();
    await expect(page.getByText("Choose a service type.")).toBeVisible();
    await expect(page.getByLabel("Customer name")).toHaveAttribute("aria-invalid", "true");
  });

  test("creates an order and can notify the technician on WhatsApp", async ({ page }) => {
    const customer = `E2E Create ${Date.now()}`;
    await createOrder(page, customer);

    const notify = page.getByRole("link", { name: "Notify Yusoff on WhatsApp" });
    await expect(notify).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/60131110004\?text=Hi%20Yusoff/,
    );
    await expect(page.getByText(customer)).toBeVisible();
    await expect(page.getByText("012-778 4455")).toBeVisible();
    await expect(page.getByText("created the order and assigned it to Yusoff")).toBeVisible();
  });

  test("reassigns with a reason, which appears in the history", async ({ page }) => {
    await createOrder(page, `E2E Reassign ${Date.now()}`);

    await page.getByRole("button", { name: "Reassign" }).click();
    const dialog = page.getByRole("dialog", { name: "Reassign technician" });
    const picker = dialog.getByLabel("Technician");
    const ali = await picker.locator("option", { hasText: "Ali" }).getAttribute("value");
    await picker.selectOption(ali ?? "");
    await dialog.getByRole("button", { name: "Assign" }).click();
    await expect(dialog.getByText("A reason for reassigning is required")).toBeVisible();

    await dialog.getByLabel("Reason").fill("Yusoff on medical leave");
    await dialog.getByRole("button", { name: "Assign" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("reassigned from Yusoff to Ali")).toBeVisible();
    await expect(page.getByText("“Yusoff on medical leave”")).toBeVisible();
  });

  test("finds an order by customer name", async ({ page }) => {
    const customer = `E2E Search ${Date.now()}`;
    await createOrder(page, customer);

    // The top-bar search box submits to the order list.
    await page.getByLabel("Search orders").fill(customer);
    await page.getByLabel("Search orders").press("Enter");
    await expect(page).toHaveURL(/\/orders\?q=/);
    await expect(page.getByText("1 order", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: customer })).toBeVisible();
  });
});

test("managers can browse orders but cannot create or edit them", async ({ page }) => {
  await demoSignIn(page, "manager Rahman");
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ New order" })).toHaveCount(0);

  await page.getByRole("link", { name: /^ORD-/ }).first().click();
  await expect(page.getByRole("heading", { name: /^ORD-/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);

  await page.goto("/orders/new");
  await expect(page).toHaveURL(/\/home$/);
});

test("technicians cannot open the staff order screens", async ({ page }) => {
  await demoSignIn(page, "technician Ali");
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/tech$/);
});
