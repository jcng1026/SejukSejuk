import "server-only";

import { severityRank, topOpenSeverity, type FlagSeverity } from "@/features/orders/labels";
import { firstOf } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";

// Fetch the whole queue so the flag-first sort is right across it (seed has ~120).
const QUEUE_LIMIT = 500;

type OpenFlagRow = { severity: FlagSeverity; status: string; message: string };

function topFlagOf(flags: OpenFlagRow[]): Pick<ReviewItem, "topFlag" | "topFlagMessage"> {
  const topFlag = topOpenSeverity(flags);
  const message = flags.find(
    (flag) => flag.status === "open" && flag.severity === topFlag,
  )?.message;
  return { topFlag, topFlagMessage: message ?? null };
}

export interface ReviewItem {
  id: string;
  orderNo: string;
  customerName: string;
  technicianName: string | null;
  finalSen: number;
  paidSen: number;
  completedAt: string;
  topFlag: FlagSeverity | null;
  /** The most serious open flag's message, e.g. "Payment RM 80.00 short". */
  topFlagMessage: string | null;
}

export interface ReviewList {
  items: ReviewItem[];
  /** Every matching order, even past QUEUE_LIMIT. */
  total: number;
}

async function loadByStatus(status: "job_done" | "reviewed"): Promise<ReviewList> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("orders")
    .select(
      `id, order_no, customer_name, completed_at,
       technician:profiles!orders_technician_id_fkey(full_name),
       completions(final_sen), payments(amount_sen), flags(severity, status, message)`,
      { count: "exact" },
    )
    .eq("status", status)
    .order("completed_at")
    .limit(QUEUE_LIMIT);
  if (error) throw new Error(`Could not load the review queue: ${error.message}`);
  const items = data.map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    customerName: row.customer_name,
    technicianName: firstOf(row.technician)?.full_name ?? null,
    finalSen: firstOf(row.completions)?.final_sen ?? 0,
    paidSen: (row.payments ?? []).reduce((sum, payment) => sum + payment.amount_sen, 0),
    completedAt: row.completed_at as string,
    ...topFlagOf((row.flags ?? []) as OpenFlagRow[]),
  }));
  return { items, total: count ?? items.length };
}

/** Job Done orders awaiting review: flagged first (High → Low), then oldest (FR-REV-1). */
export async function listReviewQueue(): Promise<ReviewList> {
  const { items, total } = await loadByStatus("job_done");
  return {
    items: items.toSorted((a, b) => severityRank(a.topFlag) - severityRank(b.topFlag)),
    total,
  };
}

/** Reviewed orders waiting to be closed once payment is settled. */
export function listReadyToClose(): Promise<ReviewList> {
  return loadByStatus("reviewed");
}
