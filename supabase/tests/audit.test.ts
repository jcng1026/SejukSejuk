import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;

beforeAll(async () => {
  [admin, manager] = await Promise.all([signInAs("aisyah"), signInAs("rahman")]);
});

interface AuditRow {
  table_name: string;
  action: string;
  actor_id: string | null;
  reason: string | null;
  via: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

async function history(orderId: string): Promise<AuditRow[]> {
  const { data, error } = await manager
    .from("audit_log")
    .select("table_name, action, actor_id, reason, via, before, after")
    .eq("order_id", orderId)
    .order("id");
  if (error) throw new Error(error.message);
  return data as AuditRow[];
}

describe("audit trail", () => {
  it("records the creating admin as the actor", async () => {
    const order = await createOrder(admin);
    const [first] = await history(order.id);
    expect(first).toMatchObject({ table_name: "orders", action: "INSERT", actor_id: userId("aisyah"), via: "ui" });
  });

  it("stores the reason given for a reassignment, with before and after values", async () => {
    const order = await createOrder(admin);
    await admin.rpc("assign_order", {
      p_order_id: order.id,
      p_technician_id: userId("john"),
      p_reason: "Customer requested John",
    });
    const update = (await history(order.id)).find((row) => row.action === "UPDATE");
    expect(update?.reason).toBe("Customer requested John");
    expect(update?.before?.technician_id).toBe(userId("ali"));
    expect(update?.after?.technician_id).toBe(userId("john"));
  });

  it("cannot be written or edited by any signed-in user", async () => {
    const insert = await manager.from("audit_log").insert({ table_name: "orders", action: "FAKE" });
    expect(insert.error?.code).toBe("42501");
  });
});
