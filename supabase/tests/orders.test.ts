import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, expectErrorCode, newOrder, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;
let ali: SupabaseClient;

beforeAll(async () => {
  [admin, manager, ali] = await Promise.all([signInAs("aisyah"), signInAs("rahman"), signInAs("ali")]);
});

describe("create_order", () => {
  it("creates an Assigned order with a generated MYT-dated number when a technician is given", async () => {
    const order = await createOrder(admin);

    expect(order.status).toBe("assigned");
    const mytDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" })
      .format(new Date())
      .replaceAll("-", "")
      .slice(2);
    expect(order.order_no).toMatch(new RegExp(`^ORD-${mytDate}-\\d{4}$`));
  });

  it("creates a New order when no technician is given", async () => {
    const order = await createOrder(admin, { p_technician_id: null });
    expect(order.status).toBe("new");
  });

  it("records who created and who assigned the order", async () => {
    const order = await createOrder(admin);
    const { data } = await admin
      .from("orders")
      .select("created_by, assigned_by, technician_id")
      .eq("id", order.id)
      .single();
    expect(data).toEqual({
      created_by: userId("aisyah"),
      assigned_by: userId("aisyah"),
      technician_id: userId("ali"),
    });
  });

  it("refuses technicians and managers", async () => {
    for (const client of [ali, manager]) {
      const { error } = await client.rpc("create_order", newOrder());
      expectErrorCode(error, "FORBIDDEN");
    }
  });

  it("rejects a phone that is not stored as 60XXXXXXXXX", async () => {
    const { error } = await admin.rpc("create_order", newOrder({ p_customer_phone: "012-345 6789" }));
    expectErrorCode(error, "VALIDATION");
  });

  it("rejects over-long text with VALIDATION rather than a raw constraint error", async () => {
    const { error } = await admin.rpc("create_order", newOrder({ p_customer_address: "x".repeat(201) }));
    expectErrorCode(error, "VALIDATION");
  });

  it("rejects a negative quoted price", async () => {
    const { error } = await admin.rpc("create_order", newOrder({ p_quoted_sen: -1 }));
    expectErrorCode(error, "VALIDATION");
  });

  it("refuses to assign a deactivated technician or a non-technician", async () => {
    for (const person of ["hafiz", "rahman"] as const) {
      const { error } = await admin.rpc("create_order", newOrder({ p_technician_id: userId(person) }));
      expectErrorCode(error, "VALIDATION");
    }
  });

  it("never issues the same order number twice under concurrent creates", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => createOrder(admin)));
    const numbers = results.map((r) => r.order_no);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("direct table writes", () => {
  it("are not allowed for any role: every change goes through an RPC", async () => {
    const order = await createOrder(admin);
    for (const client of [admin, manager, ali]) {
      const { error } = await client.from("orders").update({ status: "closed" }).eq("id", order.id);
      expect(error?.code).toBe("42501"); // insufficient_privilege
    }
  });
});
