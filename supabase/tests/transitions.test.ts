import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, expectErrorCode, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;
let ali: SupabaseClient;
let john: SupabaseClient;

beforeAll(async () => {
  [admin, manager, ali, john] = await Promise.all([
    signInAs("aisyah"),
    signInAs("rahman"),
    signInAs("ali"),
    signInAs("john"),
  ]);
});

async function statusOf(id: string): Promise<string> {
  const { data } = await admin.from("orders").select("status").eq("id", id).single();
  return data?.status;
}

async function inProgressOrder(): Promise<string> {
  const { id } = await createOrder(admin);
  const { error } = await ali.rpc("start_job", { p_order_id: id });
  if (error) throw new Error(error.message);
  return id;
}

async function completedOrder(extraSen = 0): Promise<string> {
  const id = await inProgressOrder();
  const { error } = await ali.rpc("complete_job", {
    p_order_id: id,
    p_work_done: "Chemical wash",
    p_extra_sen: extraSen,
    p_remarks: extraSen > 0 ? "Replaced drain pipe" : null,
  });
  if (error) throw new Error(error.message);
  return id;
}

describe("assign_order", () => {
  it("moves a New order to Assigned", async () => {
    const { id } = await createOrder(admin, { p_technician_id: null });
    const { error } = await admin.rpc("assign_order", { p_order_id: id, p_technician_id: userId("john") });
    expect(error).toBeNull();
    expect(await statusOf(id)).toBe("assigned");
  });

  it("requires a reason to reassign an already Assigned order", async () => {
    const { id } = await createOrder(admin);
    const without = await admin.rpc("assign_order", { p_order_id: id, p_technician_id: userId("john") });
    expectErrorCode(without.error, "VALIDATION");

    const withReason = await admin.rpc("assign_order", {
      p_order_id: id,
      p_technician_id: userId("john"),
      p_reason: "Ali on medical leave",
    });
    expect(withReason.error).toBeNull();
  });

  it("is admin-only", async () => {
    const { id } = await createOrder(admin, { p_technician_id: null });
    const { error } = await manager.rpc("assign_order", { p_order_id: id, p_technician_id: userId("ali") });
    expectErrorCode(error, "FORBIDDEN");
  });
});

describe("reschedule_order", () => {
  it("requires a reason and counts the reschedule", async () => {
    const { id } = await createOrder(admin);
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();

    const without = await admin.rpc("reschedule_order", { p_order_id: id, p_scheduled_at: later, p_reason: "" });
    expectErrorCode(without.error, "VALIDATION");

    const ok = await admin.rpc("reschedule_order", { p_order_id: id, p_scheduled_at: later, p_reason: "Customer asked" });
    expect(ok.error).toBeNull();
    const { data } = await admin.from("orders").select("reschedule_count").eq("id", id).single();
    expect(data?.reschedule_count).toBe(1);
  });
});

describe("start_job", () => {
  it("lets the assigned technician start the job", async () => {
    const id = await inProgressOrder();
    expect(await statusOf(id)).toBe("in_progress");
  });

  it("refuses a technician who is not assigned", async () => {
    const { id } = await createOrder(admin);
    const { error } = await john.rpc("start_job", { p_order_id: id });
    expectErrorCode(error, "NOT_FOUND"); // must not reveal that another technician's order exists
  });

  it("lets an admin override only with a reason", async () => {
    const { id } = await createOrder(admin);
    expectErrorCode((await admin.rpc("start_job", { p_order_id: id })).error, "VALIDATION");
    const ok = await admin.rpc("start_job", { p_order_id: id, p_reason: "Technician phone died" });
    expect(ok.error).toBeNull();
  });
});

describe("complete_job", () => {
  it("records the completion with final amount = quoted + extra, stamped by the server", async () => {
    const id = await completedOrder(12000);
    expect(await statusOf(id)).toBe("job_done");

    const { data } = await admin
      .from("completions")
      .select("extra_sen, final_sen, technician_id, completed_at")
      .eq("order_id", id)
      .single();
    expect(data?.extra_sen).toBe(12000);
    expect(data?.final_sen).toBe(25000 + 12000);
    expect(data?.technician_id).toBe(userId("ali"));
    expect(Math.abs(Date.parse(data?.completed_at) - Date.now())).toBeLessThan(60_000);
  });

  it("rejects negative extra charges", async () => {
    const id = await inProgressOrder();
    const { error } = await ali.rpc("complete_job", { p_order_id: id, p_work_done: "x", p_extra_sen: -100 });
    expectErrorCode(error, "VALIDATION");
  });

  it("records a payment when one is given", async () => {
    const id = await inProgressOrder();
    const { error } = await ali.rpc("complete_job", {
      p_order_id: id,
      p_work_done: "Gas top-up",
      p_extra_sen: 0,
      p_payment_amount_sen: 25000,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();
    const { data } = await admin.from("payments").select("amount_sen, method").eq("order_id", id);
    expect(data).toEqual([{ amount_sen: 25000, method: "cash" }]);
  });

  it("cannot skip In Progress", async () => {
    const { id } = await createOrder(admin);
    const { error } = await ali.rpc("complete_job", { p_order_id: id, p_work_done: "x", p_extra_sen: 0 });
    expectErrorCode(error, "INVALID_TRANSITION");
  });
});

describe("review_order and close_order", () => {
  it("manager approves Job Done → Reviewed, then closes once paid", async () => {
    const id = await completedOrder();
    expect((await manager.rpc("review_order", { p_order_id: id, p_decision: "approve" })).error).toBeNull();
    expect(await statusOf(id)).toBe("reviewed");

    expectErrorCode((await manager.rpc("close_order", { p_order_id: id })).error, "VALIDATION");
    const ok = await manager.rpc("close_order", { p_order_id: id, p_note: "Paid by bank transfer, slip filed" });
    expect(ok.error).toBeNull();
    expect(await statusOf(id)).toBe("closed");
  });

  it("re-completing a sent-back job replaces its payment instead of adding a second one", async () => {
    const id = await inProgressOrder();
    const complete = (amount: number) =>
      ali.rpc("complete_job", {
        p_order_id: id,
        p_work_done: "Servicing",
        p_extra_sen: 0,
        p_payment_amount_sen: amount,
        p_payment_method: "cash",
      });
    expect((await complete(25000)).error).toBeNull();
    await manager.rpc("review_order", { p_order_id: id, p_decision: "send_back", p_reason: "Wrong amount" });
    expect((await complete(20000)).error).toBeNull();

    const { data } = await admin.from("payments").select("amount_sen").eq("order_id", id);
    expect(data).toEqual([{ amount_sen: 20000 }]);
  });

  it("send back needs a reason and returns the job to In Progress", async () => {
    const id = await completedOrder();
    const without = await manager.rpc("review_order", { p_order_id: id, p_decision: "send_back" });
    expectErrorCode(without.error, "VALIDATION");
    const ok = await manager.rpc("review_order", { p_order_id: id, p_decision: "send_back", p_reason: "No photos" });
    expect(ok.error).toBeNull();
    expect(await statusOf(id)).toBe("in_progress");
  });

  it("is manager-only", async () => {
    const id = await completedOrder();
    expectErrorCode((await admin.rpc("review_order", { p_order_id: id, p_decision: "approve" })).error, "FORBIDDEN");
  });
});

describe("set_technician_active", () => {
  it("refuses to deactivate a technician who still has open jobs", async () => {
    await createOrder(admin, { p_technician_id: userId("bala") });
    const { error } = await manager.rpc("set_technician_active", {
      p_profile_id: userId("bala"),
      p_active: false,
    });
    expectErrorCode(error, "CONFLICT");
  });
});
