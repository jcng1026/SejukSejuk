import type { SupabaseClient } from "@supabase/supabase-js";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, signInAs, userId } from "./helpers";

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

const PNG = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

interface Completion {
  extraSen?: number;
  remarks?: string | null;
  paidSen?: number | null;
  withPhoto?: boolean;
  scheduledAt?: string;
  quotedSen?: number;
}

async function attachPhoto(orderId: string): Promise<void> {
  const path = `orders/${orderId}/${crypto.randomUUID()}-p.png`;
  await ali.storage.from("job-files").upload(path, PNG, { contentType: "image/png" });
  const reg = await ali.rpc("register_attachment", { p_order_id: orderId, p_storage_path: path });
  if (reg.error) throw new Error(reg.error.message);
}

/** Creates an order for Ali, runs it to Job Done, returns its id. */
async function finishJob(options: Completion = {}): Promise<string> {
  const quoted = options.quotedSen ?? 10000;
  const { id } = await createOrder(admin, {
    p_technician_id: userId("ali"),
    p_quoted_sen: quoted,
    ...(options.scheduledAt ? { p_scheduled_at: options.scheduledAt } : {}),
  });
  if (options.withPhoto ?? true) await attachPhoto(id);
  expect((await ali.rpc("start_job", { p_order_id: id })).error).toBeNull();
  const extra = options.extraSen ?? 0;
  const paid = options.paidSen === undefined ? quoted + extra : options.paidSen;
  const { error } = await ali.rpc("complete_job", {
    p_order_id: id,
    p_work_done: "Done",
    p_extra_sen: extra,
    p_remarks: options.remarks ?? null,
    p_payment_amount_sen: paid,
    p_payment_method: paid === null ? null : "cash",
  });
  if (error) throw new Error(error.message);
  return id;
}

async function openFlags(orderId: string): Promise<string[]> {
  const { data } = await manager
    .from("flags")
    .select("rule_code, severity")
    .eq("order_id", orderId)
    .eq("status", "open");
  return (data ?? []).map((f) => `${f.severity}:${f.rule_code}`).sort();
}

describe("flag rules on Job Done (FR-FLG-1)", () => {
  it("raises nothing for a clean job: on quote, photo attached, paid in full", async () => {
    expect(await openFlags(await finishJob())).toEqual([]);
  });

  it("High when the final amount is more than 20% over the quote", async () => {
    const id = await finishJob({ extraSen: 2001, remarks: "Extra parts" });
    expect(await openFlags(id)).toEqual(["high:over_quote"]);
  });

  it("exactly 20% over with remarks is only Low (explained)", async () => {
    const id = await finishJob({ extraSen: 2000, remarks: "Extra parts" });
    expect(await openFlags(id)).toEqual(["low:over_quote_explained"]);
  });

  it("High when there are extra charges but no remarks", async () => {
    const id = await finishJob({ extraSen: 500, remarks: null });
    expect(await openFlags(id)).toEqual(["high:extras_without_remarks"]);
  });

  it("High when the recorded payment is below the final amount", async () => {
    expect(await openFlags(await finishJob({ paidSen: 5000 }))).toEqual(["high:underpaid"]);
  });

  it("no payment recorded is not 'underpaid' (it may be collected later)", async () => {
    expect(await openFlags(await finishJob({ paidSen: null }))).toEqual([]);
  });

  it("Medium when no photos or documents were attached", async () => {
    expect(await openFlags(await finishJob({ withPhoto: false }))).toEqual([
      "medium:no_attachments",
    ]);
  });

  it("within 20% over with remarks is Low (explained)", async () => {
    const id = await finishJob({ extraSen: 1000, remarks: "Extra parts" });
    expect(await openFlags(id)).toEqual(["low:over_quote_explained"]);
  });

  it("over-quote rule holds for any quote and extra (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 500_000 }),
        fc.integer({ min: 0, max: 100 }),
        async (quotedSen, extraPct) => {
          const extraSen = Math.round((quotedSen * extraPct) / 100) + (extraPct === 20 ? 1 : 0);
          const id = await finishJob({ quotedSen, extraSen, remarks: "Parts" });
          const isOver = (quotedSen + extraSen) * 100 > quotedSen * 120;
          const expected = isOver ? ["high:over_quote"] : extraSen > 0 ? ["low:over_quote_explained"] : [];
          expect(await openFlags(id)).toEqual(expected);
        },
      ),
      { numRuns: 15 },
    );
  });

  it("not late at just under 24 h after the scheduled time", async () => {
    const justUnder = new Date(Date.now() - 24 * 3_600_000 + 5 * 60_000).toISOString();
    expect(await openFlags(await finishJob({ scheduledAt: justUnder }))).toEqual([]);
  });

  it("Low when completed just over 24 h after the scheduled time", async () => {
    const justOver = new Date(Date.now() - 24 * 3_600_000 - 5 * 60_000).toISOString();
    expect(await openFlags(await finishJob({ scheduledAt: justOver }))).toEqual([
      "low:late_completion",
    ]);
  });

  it("Low when completed more than 24 h after the scheduled time", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(await openFlags(await finishJob({ scheduledAt: twoDaysAgo }))).toEqual([
      "low:late_completion",
    ]);
  });

  it("re-evaluates when a job sent back is completed again", async () => {
    const id = await finishJob({ withPhoto: false });
    expect(await openFlags(id)).toEqual(["medium:no_attachments"]);
    await manager.rpc("review_order", {
      p_order_id: id,
      p_decision: "send_back",
      p_reason: "Add photos",
    });
    await attachPhoto(id);
    const { error } = await ali.rpc("complete_job", {
      p_order_id: id,
      p_work_done: "Done again",
      p_extra_sen: 0,
      p_payment_amount_sen: 10000,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();
    expect(await openFlags(id)).toEqual([]);
  });
});

describe("WhatsApp feedback message (FR-NOT-1)", () => {
  it("is created by the database when the job becomes Job Done", async () => {
    const id = await finishJob();
    const { data } = await admin
      .from("whatsapp_messages")
      .select("kind, to_phone, body, link")
      .eq("order_id", id)
      .single();
    expect(data?.kind).toBe("feedback");
    expect(data?.to_phone).toBe("60123456789");
    expect(data?.body).toMatch(
      /^Hi .+,\nJob ORD-\d{6}-\d{4} has been completed by Technician Ali at \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\.\nPlease check and leave feedback\.\nThank you!$/,
    );
    expect(data?.link).toBe(`https://wa.me/60123456789?text=${encodeURIComponent(data!.body)}`);
  });

  it("encodes the link exactly like encodeURIComponent, for any customer name", async () => {
    const { id } = await createOrder(admin, {
      p_technician_id: userId("ali"),
      p_customer_name: "李美玲 & Siti Nur'ain (Encik) #2 · café",
    });
    await attachPhoto(id);
    await ali.rpc("start_job", { p_order_id: id });
    await ali.rpc("complete_job", { p_order_id: id, p_work_done: "Done", p_extra_sen: 0 });
    const { data } = await admin
      .from("whatsapp_messages")
      .select("body, link")
      .eq("order_id", id)
      .single();
    expect(data?.link).toBe(`https://wa.me/60123456789?text=${encodeURIComponent(data!.body)}`);
  });

  it("is visible to the technician who did the job", async () => {
    const id = await finishJob();
    const { data } = await ali.from("whatsapp_messages").select("id").eq("order_id", id);
    expect(data).toHaveLength(1);
  });
});

describe("staff notifications (FR-NOT-3)", () => {
  it("each admin and manager gets an individual alert for a High flag", async () => {
    const id = await finishJob({ paidSen: 100 });
    const { data } = await manager
      .from("notifications")
      .select("type, severity")
      .eq("order_id", id);
    expect(data).toEqual([{ type: "flag", severity: "high" }]);
  });

  it("other completions roll into one 'jobs done today' notification per person", async () => {
    const count = async () => {
      const { data } = await manager
        .from("notifications")
        .select("payload")
        .eq("type", "jobs_done")
        .maybeSingle();
      return (data?.payload as { count?: number } | undefined)?.count ?? 0;
    };
    const before = await count();
    await finishJob();
    await finishJob();
    expect(await count()).toBe(before + 2);
  });
});
