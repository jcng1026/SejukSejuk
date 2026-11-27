import { expect, type Page } from "@playwright/test";

export async function demoSignIn(page: Page, who: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${who}` }).click();
  await page.waitForURL(/\/(home|tech)$/);
}

/** Today's date in Malaysia, as the order form's date input expects it. */
export function mytToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

interface OrderOptions {
  technician?: string;
  date?: string;
  quoted?: string;
}

/** Creates an order through the admin form; returns the new order's id. */
export async function createOrder(
  page: Page,
  customer: string,
  options: OrderOptions = {},
): Promise<string> {
  await page.goto("/orders/new");
  await page.getByLabel("Customer name").fill(customer);
  await page.getByLabel("Phone").fill("012-778 4455");
  await page.getByLabel("Address").fill("No. 8, Jalan Kenari 2, Puchong");
  await page.getByLabel("Problem description").fill("Indoor unit dripping water");
  await page.getByLabel("Service type").selectOption({ label: "Repair" });
  await page.getByLabel("Quoted price (RM)").fill(options.quoted ?? "180");
  if (options.date) await page.getByLabel("Date").fill(options.date);
  const technician = page.getByLabel("Technician");
  const value = await technician
    .locator("option", { hasText: options.technician ?? "Yusoff" })
    .getAttribute("value");
  await technician.selectOption(value ?? "");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByText(/^Order ORD-\d{6}-\d{4} created\.$/)).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1) as string;
}
