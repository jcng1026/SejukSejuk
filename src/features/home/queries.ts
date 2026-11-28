import "server-only";

import { topOpenSeverity, type FlagSeverity, type OrderStatus } from "@/features/orders/labels";
import { firstOf } from "@/features/orders/queries";
import { DAY_MS, mytDateTimeToIso, mytToday } from "@/features/orders/schedule";
import { throwLoadError } from "@/lib/load-error";
import { createClient } from "@/lib/supabase/server";

const DAY_JOB_LIMIT = 300;
const OPEN_FLAG_LIMIT = 1000;

export interface ScheduledJob {
  id: string;
  orderNo: string;
  status: OrderStatus;
  customerName: string;
  serviceType: string;
  scheduledAt: string;
  technicianId: string | null;
  topFlag: FlagSeverity | null;
}

export interface TodayBoard {
  technicians: { id: string; name: string }[];
  jobs: ScheduledJob[];
  inProgress: number;
  awaitingReview: number;
  flagsBySeverity: Record<FlagSeverity, number>;
}

async function loadTodayJobs(): Promise<ScheduledJob[]> {
  const start = mytDateTimeToIso(mytToday(), "00:00");
  if (!start) throwLoadError("today's jobs", "today's date could not be read");
  const end = new Date(Date.parse(start) + DAY_MS).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_no, status, customer_name, scheduled_at, technician_id,
       service_types(name), flags(severity, status)`,
    )
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .order("scheduled_at")
    .limit(DAY_JOB_LIMIT);
  if (error) throwLoadError("today's jobs", error.message);
  return data.map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    status: row.status as OrderStatus,
    customerName: row.customer_name,
    serviceType: firstOf(row.service_types)?.name ?? "",
    scheduledAt: row.scheduled_at,
    technicianId: row.technician_id,
    topFlag: topOpenSeverity((row.flags ?? []) as { severity: FlagSeverity; status: string }[]),
  }));
}

async function countStatus(status: OrderStatus): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (error) throwLoadError(`${status} orders`, error.message);
  return count ?? 0;
}

async function openFlagCounts(): Promise<Record<FlagSeverity, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flags")
    .select("severity")
    .eq("status", "open")
    .limit(OPEN_FLAG_LIMIT);
  if (error) throwLoadError("open flags", error.message);
  const counts: Record<FlagSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const flag of data) counts[flag.severity as FlagSeverity] += 1;
  return counts;
}

async function allTechnicians(): Promise<{ id: string; name: string; isActive: boolean }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("role", "technician")
    .order("full_name");
  if (error) throwLoadError("technicians", error.message);
  return data.map((row) => ({ id: row.id, name: row.full_name, isActive: row.is_active }));
}

/** Everything the C2 home needs about today (FR-HOME-1). */
export async function getTodayBoard(): Promise<TodayBoard> {
  const [technicians, jobs, inProgress, awaitingReview, flagsBySeverity] = await Promise.all([
    allTechnicians(),
    loadTodayJobs(),
    countStatus("in_progress"),
    countStatus("job_done"),
    openFlagCounts(),
  ]);
  // Active technicians always get a lane; a deactivated one only for jobs still on their name.
  const withJobs = new Set(jobs.map((job) => job.technicianId));
  const lanes = technicians
    .filter((technician) => technician.isActive || withJobs.has(technician.id))
    .map(({ id, name }) => ({ id, name }));
  return { technicians: lanes, jobs, inProgress, awaitingReview, flagsBySeverity };
}
