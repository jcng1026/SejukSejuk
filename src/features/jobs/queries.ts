import "server-only";

import { severityRank, type FlagSeverity, type OrderStatus } from "@/features/orders/labels";
import { firstOf } from "@/features/orders/queries";
import { mytDateTimeToIso, mytToday } from "@/features/orders/schedule";
import { createClient } from "@/lib/supabase/server";

// Technician reads. RLS already limits every query to the signed-in
// technician's own jobs; these filters only choose which of them to show.

const SIGNED_URL_SECONDS = 600;
const HISTORY_LIMIT = 30;

export interface TechJob {
  id: string;
  orderNo: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  serviceType: string;
  scheduledAt: string;
  quotedSen: number;
  finalSen: number | null;
}

const JOB_COLUMNS = `id, order_no, status, customer_name, customer_phone, customer_address,
  scheduled_at, quoted_sen, service_types(name), completions(final_sen)`;

interface JobRow {
  id: string;
  order_no: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  scheduled_at: string;
  quoted_sen: number;
  service_types: { name: string } | { name: string }[] | null;
  completions: { final_sen: number } | { final_sen: number }[] | null;
}

function toJob(row: JobRow): TechJob {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status as OrderStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    serviceType: firstOf(row.service_types)?.name ?? "",
    scheduledAt: row.scheduled_at,
    quotedSen: row.quoted_sen,
    finalSen: firstOf(row.completions)?.final_sen ?? null,
  };
}

function todayBounds(): { start: string; end: string } {
  const start = mytDateTimeToIso(mytToday(), "00:00") as string;
  return { start, end: new Date(Date.parse(start) + 86_400_000).toISOString() };
}

/** Today's jobs in any state, plus open jobs (overdue or in progress) from earlier days. */
export async function listTodayJobs(): Promise<TechJob[]> {
  const { start, end } = todayBounds();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(JOB_COLUMNS)
    // Also anything still open from an earlier day (started, or never started),
    // so no job falls between Today and Upcoming. Timestamps quoted for PostgREST.
    .or(
      `and(scheduled_at.gte."${start}",scheduled_at.lt."${end}"),status.eq.in_progress,and(status.eq.assigned,scheduled_at.lt."${start}")`,
    )
    .order("scheduled_at");
  if (error) throw new Error(`Could not load today's jobs: ${error.message}`);
  return (data as JobRow[]).map(toJob);
}

export async function listUpcomingJobs(): Promise<TechJob[]> {
  const { end } = todayBounds();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(JOB_COLUMNS)
    .gte("scheduled_at", end)
    .eq("status", "assigned")
    .order("scheduled_at");
  if (error) throw new Error(`Could not load upcoming jobs: ${error.message}`);
  return (data as JobRow[]).map(toJob);
}

export async function listHistoryJobs(): Promise<TechJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(JOB_COLUMNS)
    .in("status", ["job_done", "reviewed", "closed"])
    .order("completed_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`Could not load job history: ${error.message}`);
  return (data as JobRow[]).map(toJob);
}

export interface TechJobDetail extends TechJob {
  problemDescription: string;
  adminNotes: string | null;
  attachments: { id: string; mime: string; url: string | null }[];
  /** FR-FLG-4: open flags on this job, most serious first. */
  openFlags: { id: string; severity: FlagSeverity; message: string }[];
  completion: {
    workDone: string;
    extraSen: number;
    remarks: string | null;
    completedAt: string;
  } | null;
}

export async function getTechJob(id: string): Promise<TechJobDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_no, status, customer_name, customer_phone, customer_address,
       scheduled_at, quoted_sen, service_types(name), problem_description, admin_notes,
       attachments(id, mime, storage_path, created_at),
       completions(final_sen, work_done, extra_sen, remarks, completed_at),
       flags(id, severity, status, message)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load job: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Omit<JobRow, "completions"> & {
    problem_description: string;
    admin_notes: string | null;
    attachments: { id: string; mime: string; storage_path: string; created_at: string }[];
    flags: { id: string; severity: FlagSeverity; status: string; message: string }[] | null;
    completions:
      | {
          final_sen: number;
          work_done: string;
          extra_sen: number;
          remarks: string | null;
          completed_at: string;
        }
      | {
          final_sen: number;
          work_done: string;
          extra_sen: number;
          remarks: string | null;
          completed_at: string;
        }[]
      | null;
  };
  const files = [...row.attachments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const signed = files.length
    ? await supabase.storage.from("job-files").createSignedUrls(
        files.map((file) => file.storage_path),
        SIGNED_URL_SECONDS,
      )
    : { data: [], error: null };
  if (signed.error) console.error("Could not sign job files", { message: signed.error.message });
  const urls = new Map(
    (signed.data ?? []).map((entry) => [entry.path, entry.error ? null : entry.signedUrl]),
  );
  const completion = firstOf(row.completions);

  return {
    ...toJob({ ...row, completions: completion ? { final_sen: completion.final_sen } : null }),
    problemDescription: row.problem_description,
    adminNotes: row.admin_notes,
    attachments: files.map((file) => ({
      id: file.id,
      mime: file.mime,
      url: urls.get(file.storage_path) ?? null,
    })),
    openFlags: (row.flags ?? [])
      .filter((flag) => flag.status === "open")
      .map(({ id, severity, message }) => ({ id, severity, message }))
      .toSorted((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    completion: completion
      ? {
          workDone: completion.work_done,
          extraSen: completion.extra_sen,
          remarks: completion.remarks,
          completedAt: completion.completed_at,
        }
      : null,
  };
}
