import { expect, test, type Page } from "@playwright/test";

import { createOrder, demoSignIn, mytToday } from "./helpers";

async function clearBell(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await expect(page.getByRole("button", { name: "Notifications, 0 unread" })).toBeVisible();
  await page.keyboard.press("Escape");
}

test("job done reaches the office live, then the manager reviews, flags and closes it", async ({
  browser,
}) => {
  const customer = `E2E Review ${Date.now()}`;

  const office = await browser.newPage();
  await demoSignIn(office, "admin Aisyah");
  const orderId = await createOrder(office, customer, {
    technician: "Ali",
    date: mytToday(),
    quoted: "180",
  });
  const orderNo = (await office.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
  expect(orderNo).toMatch(/^ORD-\d{6}-\d{4}$/);
  await clearBell(office);

  // The technician finishes the job on their phone.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await demoSignIn(phone, "technician Ali");
  await phone.goto(`/tech/jobs/${orderId}`);
  await phone.getByRole("button", { name: "Start job" }).click();
  await phone.getByLabel("Work done").fill("General service");
  await phone.getByLabel("Payment received from customer").check();
  await phone.getByLabel("Method").selectOption("cash");
  await phone.getByRole("button", { name: "Mark job done" }).click();
  await expect(phone.getByText("✓ Job marked done. Nice work.")).toBeVisible();
  // FR-FLG-4: the technician sees the automatic flag on their own job.
  await expect(phone.getByRole("region", { name: "Flags on this job" })).toContainText(
    "Job done with no photos or documents",
  );

  // FR-NOT-3: the office bell updates without a reload.
  await expect(
    office.getByRole("button", { name: /^Notifications, [1-9]\d* unread$/ }),
  ).toBeVisible();

  // FR-NOT-2: the WhatsApp feedback link uses the brief's template; tapping logs the send.
  await phone.context().route("https://wa.me/**", (route) => route.fulfill({ body: "ok" }));
  const whatsapp = phone.getByRole("link", { name: "Send feedback request on WhatsApp" });
  await expect(whatsapp).toHaveAttribute(
    "href",
    new RegExp(
      `^https://wa\\.me/60127784455\\?text=Hi%20.+Job%20${orderNo}%20has%20been%20completed`,
    ),
  );
  const popup = phone.waitForEvent("popup");
  await whatsapp.click();
  await (await popup).close();
  await expect(phone.getByText(/^Last sent /)).toBeVisible();

  // FR-REV-1/2: the manager approves it from the queue.
  const manager = await browser.newPage();
  await demoSignIn(manager, "manager Rahman");
  await manager.goto("/review");
  await manager.getByRole("button", { name: `Approve ${orderNo}` }).click();
  await expect(manager.getByRole("button", { name: `Close ${orderNo}` })).toBeVisible();

  // FR-FLG-3: staff raise a manual flag and resolve it with a note.
  await manager.goto(`/orders/${orderId}`);
  // FR-NOT-2: managers see when the request went out but do not resend it.
  await expect(manager.getByText(/^Request last sent /)).toBeVisible();
  await manager.getByRole("button", { name: "Raise flag" }).click();
  const raise = manager.getByRole("dialog");
  await raise.getByLabel("Level").selectOption("low");
  await raise.getByLabel("What's the issue?").fill("Customer asked for a call-back");
  await raise.getByRole("button", { name: "Raise flag" }).click();
  await expect(raise).toHaveCount(0);

  await manager.goto("/flags");
  const row = manager.getByRole("listitem").filter({ hasText: "Customer asked for a call-back" });
  await expect(row).toContainText(orderNo);
  await row.getByRole("button", { name: "Resolve" }).click();
  const resolve = manager.getByRole("dialog");
  await resolve.getByLabel("How was it resolved?").fill("Called back, all good");
  await resolve.getByRole("button", { name: "Resolve" }).click();
  await expect(row).toHaveCount(0);

  // FR-REV-3: close once payment is settled.
  await manager.goto("/review");
  await manager.getByRole("button", { name: `Close ${orderNo}` }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "Close order" }).click();
  await expect(manager.getByRole("button", { name: `Close ${orderNo}` })).toHaveCount(0);
});

test("the manager must give a reason to send a job back", async ({ page }) => {
  await demoSignIn(page, "manager Rahman");
  await page.goto("/review");
  const sendBack = page.getByRole("button", { name: /^Send back ORD-/ }).first();
  const orderNo = ((await sendBack.getAttribute("aria-label")) ?? "").replace("Send back ", "");
  await sendBack.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Send back" }).click();
  await expect(dialog.getByText("Say what needs redoing.")).toBeVisible();
  await dialog.getByLabel("What needs redoing?").fill("Photos of the outdoor unit are missing");
  await dialog.getByRole("button", { name: "Send back" }).click();
  await expect(page.getByRole("button", { name: `Send back ${orderNo}` })).toHaveCount(0);
});

test("admins see the review queue but cannot approve", async ({ page }) => {
  await demoSignIn(page, "admin Aisyah");
  await page.goto("/review");
  await expect(page.getByText("Only managers can approve or send back.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Approve ORD-/ })).toHaveCount(0);
});
