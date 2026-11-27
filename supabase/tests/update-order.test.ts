import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { anonClient, createOrder, expectErrorCode, signInAs } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;
let ali: SupabaseClient;

beforeAll(async () => {
  [admin, manager, ali] = await Promise.all([signInAs("aisyah"), signInAs("rahman"), signInAs("ali")]);
});

function edits(orderId: string, overrides: Record<string, unknown> = {}) {
  return {
    p_order_id: orderId,
    p_customer_name: "Ahmad bin Ali",
    p_customer_phone: "60198765432",
    p_customer_address: "No. 3, Jalan Bayu, Klang",
    p_problem_description: "Indoor unit leaking",
    p_service_type_id: 3,
    p_quoted_sen: 30000,
    p_admin_notes: "Gate code 1234",
    ...overrides,
  };
}

describe("update_order", () => {
  it("lets an admin edit an Assigned order without a reason", async () => {
    const { id } = await createOrder(admin);
    const { error } = await admin.rpc("update_order", edits(id));
    expect(error).toBeNull();

    const { data } = await admin
      .from("orders")
      .select("customer_name, customer_phone, service_type_id, quoted_sen, admin_notes")
      .eq("id", id)
      .single();
    expect(data).toEqual({
      customer_name: "Ahmad bin Ali",
      customer_phone: "60198765432",
      service_type_id: 3,
      quoted_sen: 30000,
      admin_notes: "Gate code 1234",
    });
  });

  it("requires a reason once the job is In Progress, and records it", async () => {
    const { id } = await createOrder(admin);
    await ali.rpc("start_job", { p_order_id: id });

    expectErrorCode((await admin.rpc("update_order", edits(id))).error, "VALIDATION");
    const ok = await admin.rpc("update_order", edits(id, { p_reason: "Customer corrected address" }));
    expect(ok.error).toBeNull();

    const { data } = await manager
      .from("audit_log")
      .select("reason")
      .eq("order_id", id)
      .eq("action", "UPDATE")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(data?.reason).toBe("Customer corrected address");
  });

  it("lets an admin edit a New (unassigned) order without a reason", async () => {
    const { id } = await createOrder(admin, { p_technician_id: null });
    expect((await admin.rpc("update_order", edits(id))).error).toBeNull();
  });

  it("refuses anonymous callers at the grant level", async () => {
    const { id } = await createOrder(admin);
    const { error } = await anonClient().rpc("update_order", edits(id));
    expect(error?.code).toBe("42501");
  });

  it("refuses edits once the job is done", async () => {
    const { id } = await createOrder(admin);
    expect((await ali.rpc("start_job", { p_order_id: id })).error).toBeNull();
    expect(
      (await ali.rpc("complete_job", { p_order_id: id, p_work_done: "Done", p_extra_sen: 0 }))
        .error,
    ).toBeNull();

    const { error } = await admin.rpc("update_order", edits(id, { p_reason: "Too late" }));
    expectErrorCode(error, "INVALID_TRANSITION");
  });

  it("validates like create_order", async () => {
    const { id } = await createOrder(admin);
    expectErrorCode(
      (await admin.rpc("update_order", edits(id, { p_customer_phone: "0123" }))).error,
      "VALIDATION",
    );
    expectErrorCode(
      (await admin.rpc("update_order", edits(id, { p_quoted_sen: -5 }))).error,
      "VALIDATION",
    );
  });

  it("is admin-only", async () => {
    const { id } = await createOrder(admin);
    expectErrorCode((await manager.rpc("update_order", edits(id))).error, "FORBIDDEN");
    expectErrorCode((await ali.rpc("update_order", edits(id))).error, "FORBIDDEN");
  });
});
