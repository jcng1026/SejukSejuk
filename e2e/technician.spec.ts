import { expect, test } from "@playwright/test";

import { createOrder, demoSignIn, mytToday } from "./helpers";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("a technician completes a job on their phone, and the office sees it", async ({ browser }) => {
  const customer = `E2E Field ${Date.now()}`;

  const office = await browser.newPage();
  await demoSignIn(office, "admin Aisyah");
  const orderId = await createOrder(office, customer, {
    technician: "Ali",
    date: mytToday(),
    quoted: "180",
  });

  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await demoSignIn(phone, "technician Ali");
  await expect(phone.getByRole("navigation", { name: "Jobs" })).toBeVisible();
  await expect(phone.getByText(customer).first()).toBeVisible();

  await phone.goto(`/tech/jobs/${orderId}`);
  await phone.getByRole("button", { name: "Start job" }).click();
  await expect(phone.getByRole("heading", { name: "Complete job" })).toBeVisible();

  await phone.getByLabel("Work done").fill("Cleared drain pipe, chemical wash");
  await phone.getByLabel("Extra charges (RM)").fill("50");
  await expect(phone.getByText("RM 230.00", { exact: true })).toBeVisible();
  await phone.getByLabel("Remarks").fill("Replaced drain pipe");

  await phone.locator('input[type="file"][multiple]').setInputFiles({
    name: "outdoor-unit.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(phone.getByText("1 / 6")).toBeVisible();

  await phone.getByLabel("Payment received from customer").check();
  await expect(phone.getByLabel("Amount (RM)")).toHaveValue("230.00");
  await phone.getByLabel("Method").selectOption("qr");
  await phone.getByRole("button", { name: "Mark job done" }).click();
  await expect(phone.getByText("✓ Job marked done. Nice work.")).toBeVisible();
  await expect(phone.getByText("1 file(s) attached")).toBeVisible();

  await office.goto(`/orders/${orderId}`);
  await expect(office.getByText("RM 230.00 · QR (DuitNow)")).toBeVisible();
  await expect(office.getByText("Files (1)")).toBeVisible();
  await expect(office.getByText("Ali marked the job done")).toBeVisible();
});

test("a technician cannot open another technician's job", async ({ browser }) => {
  const office = await browser.newPage();
  await demoSignIn(office, "admin Aisyah");
  const customer = `E2E Private ${Date.now()}`;
  const orderId = await createOrder(office, customer, { technician: "John" });

  const phone = await browser.newPage();
  await demoSignIn(phone, "technician Ali");
  // Streamed pages render not-found UI after the 200 status is sent, so check what
  // the technician sees: the not-found page and none of the job's details.
  await phone.goto(`/tech/jobs/${orderId}`);
  await expect(phone.getByText("This page could not be found.")).toBeVisible();
  await expect(phone.getByText(customer)).toHaveCount(0);
});
