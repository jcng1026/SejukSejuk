import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, expectErrorCode, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;
let ali: SupabaseClient;

beforeAll(async () => {
  [admin, manager, ali] = await Promise.all([
    signInAs("aisyah"),
    signInAs("rahman"),
    signInAs("ali"),
  ]);
});

const mytDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
const TODAY = { p_from: mytDate(), p_to: mytDate() };

interface Summary {
  jobs_completed: number;
  revenue_sen: number;
  payments_sen: number;
  open_flags: number;
}

async function summary(): Promise<Summary> {
  const { data, error } = await manager.rpc("kpi_summary", TODAY).single<Summary>();
  if (error) throw new Error(error.message);
  return data;
}

/** Ali completes a job today: quote RM 200 + RM 30 extra, paid RM 230. */
async function completeAliJob(serviceTypeId = 3): Promise<string> {
  const { id } = await createOrder(admin, {
    p_quoted_sen: 20000,
    p_service_type_id: serviceTypeId,
    p_scheduled_at: new Date().toISOString(),
  });
  expect((await ali.rpc("start_job", { p_order_id: id })).error).toBeNull();
  const { error } = await ali.rpc("complete_job", {
    p_order_id: id,
    p_work_done: "Done",
    p_extra_sen: 3000,
    p_remarks: "Extra gas",
    p_payment_amount_sen: 23000,
    p_payment_method: "cash",
  });
  if (error) throw new Error(error.message);
  return id;
}

describe("kpi_summary (FR-KPI-1)", () => {
  it("counts a job completed today with its final amount and payment", async () => {
    const before = await summary();
    await completeAliJob();
    const after = await summary();
    expect(after.jobs_completed - before.jobs_completed).toBe(1);
    expect(Number(after.revenue_sen) - Number(before.revenue_sen)).toBe(23000);
    expect(Number(after.payments_sen) - Number(before.payments_sen)).toBe(23000);
  });

  it("a job sent back no longer counts as completed", async () => {
    const id = await completeAliJob();
    const before = await summary();
    const { error } = await manager.rpc("review_order", {
      p_order_id: id,
      p_decision: "send_back",
      p_reason: "Redo",
    });
    expect(error).toBeNull();
    expect((await summary()).jobs_completed).toBe(before.jobs_completed - 1);
  });

  it("is for admins and managers only", async () => {
    expectErrorCode((await ali.rpc("kpi_summary", TODAY)).error, "FORBIDDEN");
    expect((await admin.rpc("kpi_summary", TODAY)).error).toBeNull();
  });

  it("rejects a reversed or over-long range", async () => {
    expectErrorCode(
      (await manager.rpc("kpi_summary", { p_from: mytDate(), p_to: mytDate(-1) })).error,
      "VALIDATION",
    );
    expectErrorCode(
      (await manager.rpc("kpi_summary", { p_from: mytDate(-400), p_to: mytDate() })).error,
      "VALIDATION",
    );
  });
});

describe("kpi_leaderboard (FR-KPI-2)", () => {
  interface Row {
    technician_id: string;
    full_name: string;
    jobs_completed: number;
    revenue_sen: number;
    reschedules: number;
    flags: number;
    avg_minutes: number | null;
  }

  async function aliRow(): Promise<Row> {
    const { data, error } = await manager.rpc("kpi_leaderboard", TODAY);
    if (error) throw new Error(error.message);
    const row = (data as Row[]).find((entry) => entry.technician_id === userId("ali"));
    if (!row) throw new Error("Ali missing from leaderboard");
    return row;
  }

  it("lists every active technician, and only technicians", async () => {
    const { data } = await manager.rpc("kpi_leaderboard", TODAY);
    const names = ((data ?? []) as Row[]).map((row) => row.full_name);
    expect(names).toEqual(expect.arrayContaining(["Ali", "John", "Bala", "Yusoff"]));
    expect(names).not.toContain("Hafiz");
    expect(names).not.toContain("Rahman");
  });

  it("adds a completed job, its revenue and its flags to the technician", async () => {
    const before = await aliRow();
    await completeAliJob();
    const after = await aliRow();
    expect(after.jobs_completed - before.jobs_completed).toBe(1);
    expect(Number(after.revenue_sen) - Number(before.revenue_sen)).toBe(23000);
    // +15% with remarks raises one Low "explained" flag; no photo raises one Medium.
    expect(after.flags - before.flags).toBe(2);
    expect(after.avg_minutes).not.toBeNull();
  });

  it("keeps a technician deactivated since, for a period they worked in", async () => {
    const { data: job } = await manager
      .from("orders")
      .select("completed_at")
      .eq("technician_id", userId("hafiz"))
      .not("completed_at", "is", null)
      .limit(1)
      .single();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(
      new Date(job!.completed_at as string),
    );
    const { data } = await manager.rpc("kpi_leaderboard", { p_from: day, p_to: day });
    const hafiz = ((data ?? []) as Row[]).find((row) => row.full_name === "Hafiz");
    expect(hafiz?.jobs_completed).toBeGreaterThan(0);
  });

  it("counts reschedules made in the period", async () => {
    const { id } = await createOrder(admin);
    const before = await aliRow();
    const { error } = await admin.rpc("reschedule_order", {
      p_order_id: id,
      p_scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      p_reason: "Customer away",
    });
    expect(error).toBeNull();
    expect((await aliRow()).reschedules - before.reschedules).toBe(1);
  });
});

describe("kpi_jobs_per_day and kpi_service_mix (FR-KPI-3)", () => {
  it("returns one row per day, zeros included, oldest first", async () => {
    const { data, error } = await manager.rpc("kpi_jobs_per_day", {
      p_from: mytDate(-6),
      p_to: mytDate(),
    });
    expect(error).toBeNull();
    expect(data?.map((row: { day: string }) => row.day)).toEqual(
      [-6, -5, -4, -3, -2, -1, 0].map(mytDate),
    );
  });

  it("adds today's completions to today and to their service type", async () => {
    const jobsToday = async () => {
      const { data } = await manager.rpc("kpi_jobs_per_day", TODAY);
      return (data as { jobs: number }[])[0].jobs;
    };
    const mix = async () => {
      const { data } = await manager.rpc("kpi_service_mix", TODAY);
      return new Map(
        (data as { service: string; jobs: number }[]).map((row) => [row.service, row.jobs]),
      );
    };
    const { data: service } = await manager
      .from("service_types")
      .select("name")
      .eq("id", 3)
      .single();
    const [dayBefore, mixBefore] = [await jobsToday(), await mix()];
    await completeAliJob(3);
    expect((await jobsToday()) - dayBefore).toBe(1);
    expect(((await mix()).get(service!.name) ?? 0) - (mixBefore.get(service!.name) ?? 0)).toBe(1);
  });
});
