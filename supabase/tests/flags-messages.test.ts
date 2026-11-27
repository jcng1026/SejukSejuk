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

async function doneJob(): Promise<string> {
  const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
  await ali.rpc("start_job", { p_order_id: id });
  await ali.rpc("complete_job", { p_order_id: id, p_work_done: "Done", p_extra_sen: 0 });
  return id;
}

describe("raise_flag (FR-FLG-2)", () => {
  it("lets admins and managers raise a manual flag with a level and note", async () => {
    const { id } = await createOrder(admin);
    const { data, error } = await admin
      .rpc("raise_flag", { p_order_id: id, p_severity: "medium", p_message: "Customer disputes price" })
      .single<{ id: string }>();
    expect(error).toBeNull();
    const { data: flag } = await manager
      .from("flags")
      .select("source, severity, raised_by, rule_code")
      .eq("id", data!.id)
      .single();
    expect(flag).toEqual({ source: "manual", severity: "medium", raised_by: userId("aisyah"), rule_code: null });
  });

  it("is refused for technicians and needs a message", async () => {
    const { id } = await createOrder(admin);
    expectErrorCode(
      (await ali.rpc("raise_flag", { p_order_id: id, p_severity: "low", p_message: "x" })).error,
      "FORBIDDEN",
    );
    expectErrorCode(
      (await manager.rpc("raise_flag", { p_order_id: id, p_severity: "low", p_message: " " })).error,
      "VALIDATION",
    );
  });
});

describe("resolve_flag (FR-FLG-3)", () => {
  it("records who resolved it, when, and the note", async () => {
    const { id } = await createOrder(admin);
    const { data } = await admin
      .rpc("raise_flag", { p_order_id: id, p_severity: "high", p_message: "Check this" })
      .single<{ id: string }>();
    expectErrorCode(
      (await manager.rpc("resolve_flag", { p_flag_id: data!.id, p_note: "" })).error,
      "VALIDATION",
    );
    expect(
      (await manager.rpc("resolve_flag", { p_flag_id: data!.id, p_note: "Called customer" })).error,
    ).toBeNull();
    const { data: flag } = await manager
      .from("flags")
      .select("status, resolved_by, resolution_note, resolved_at")
      .eq("id", data!.id)
      .single();
    expect(flag).toMatchObject({
      status: "resolved",
      resolved_by: userId("rahman"),
      resolution_note: "Called customer",
    });
    expect(flag?.resolved_at).not.toBeNull();
    expectErrorCode(
      (await manager.rpc("resolve_flag", { p_flag_id: data!.id, p_note: "again" })).error,
      "INVALID_TRANSITION",
    );
  });
});

describe("mark_whatsapp_sent (FR-NOT-2)", () => {
  it("records the send by the technician on the job, and hides other jobs' messages", async () => {
    const id = await doneJob();
    const { data: message } = await ali.from("whatsapp_messages").select("id").eq("order_id", id).single();
    expectErrorCode((await john.rpc("mark_whatsapp_sent", { p_message_id: message!.id })).error, "NOT_FOUND");
    expect((await ali.rpc("mark_whatsapp_sent", { p_message_id: message!.id })).error).toBeNull();
    const { data } = await admin
      .from("whatsapp_messages")
      .select("sent_at, sent_by")
      .eq("id", message!.id)
      .single();
    expect(data?.sent_by).toBe(userId("ali"));
    expect(data?.sent_at).not.toBeNull();
  });

  it("lets admins resend but not managers, and keeps every send in the audit log", async () => {
    const id = await doneJob();
    const { data: message } = await ali.from("whatsapp_messages").select("id").eq("order_id", id).single();
    expectErrorCode((await manager.rpc("mark_whatsapp_sent", { p_message_id: message!.id })).error, "FORBIDDEN");
    expect((await ali.rpc("mark_whatsapp_sent", { p_message_id: message!.id })).error).toBeNull();
    expect((await admin.rpc("mark_whatsapp_sent", { p_message_id: message!.id })).error).toBeNull();
    const { data: sends } = await manager
      .from("audit_log")
      .select("actor_id")
      .eq("table_name", "whatsapp_messages")
      .eq("record_id", message!.id)
      .eq("action", "UPDATE")
      .order("id");
    expect(sends?.map((row) => row.actor_id)).toEqual([userId("ali"), userId("aisyah")]);
  });
});

describe("mark_notifications_read", () => {
  it("marks only the caller's own notifications as read", async () => {
    await doneJob();
    expect((await manager.rpc("mark_notifications_read")).error).toBeNull();
    const { data: unread } = await manager.from("notifications").select("id").is("read_at", null);
    expect(unread).toEqual([]);
    const { data: adminUnread } = await admin.from("notifications").select("id").is("read_at", null);
    expect((adminUnread ?? []).length).toBeGreaterThan(0);
  });
});
