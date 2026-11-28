import "server-only";

import { throwLoadError } from "@/lib/load-error";
import { createClient } from "@/lib/supabase/server";

import type { Period } from "./period";

export interface KpiSummary {
  jobsCompleted: number;
  revenueSen: number;
  paymentsSen: number;
  openFlags: number;
}

export interface LeaderboardRow {
  technicianId: string;
  name: string;
  jobsCompleted: number;
  revenueSen: number;
  reschedules: number;
  flags: number;
  avgMinutes: number | null;
}

const range = (period: Period) => ({ p_from: period.from, p_to: period.to });

export async function getKpiSummary(period: Period): Promise<KpiSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_summary", range(period)).single<{
    jobs_completed: number;
    revenue_sen: number;
    payments_sen: number;
    open_flags: number;
  }>();
  if (error) throwLoadError("KPIs", error.message);
  return {
    jobsCompleted: data.jobs_completed,
    // bigint arrives as a number for values this size.
    revenueSen: Number(data.revenue_sen),
    paymentsSen: Number(data.payments_sen),
    openFlags: data.open_flags,
  };
}

export async function getLeaderboard(period: Period): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_leaderboard", range(period));
  if (error) throwLoadError("the leaderboard", error.message);
  const rows = (data ?? []) as {
    technician_id: string;
    full_name: string;
    jobs_completed: number;
    revenue_sen: number;
    reschedules: number;
    flags: number;
    avg_minutes: number | null;
  }[];
  return rows.map((row) => ({
    technicianId: row.technician_id,
    name: row.full_name,
    jobsCompleted: row.jobs_completed,
    revenueSen: Number(row.revenue_sen),
    reschedules: row.reschedules,
    flags: row.flags,
    avgMinutes: row.avg_minutes,
  }));
}

export async function getJobsPerDay(period: Period): Promise<{ day: string; jobs: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_jobs_per_day", range(period));
  if (error) throwLoadError("jobs per day", error.message);
  return (data ?? []) as { day: string; jobs: number }[];
}

export async function getServiceMix(period: Period): Promise<{ service: string; jobs: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_service_mix", range(period));
  if (error) throwLoadError("the service mix", error.message);
  return (data ?? []) as { service: string; jobs: number }[];
}
