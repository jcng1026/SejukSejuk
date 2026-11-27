import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { FlagSeverity, OrderStatus } from "./labels";
import { mytDateTimeToIso } from "./schedule";
import { phoneDigits, sanitizeSearch } from "./search";

// Reads only. Every query runs as the signed-in user, so RLS decides the rows.

export const PAGE_SIZE = 25;

export interface ServiceType {
  id: number;
  name: string;
}

export interface Technician {
  id: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
}

export async function listServiceTypes(): Promise<ServiceType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_types")
    .select("id, name")
    .eq("active", true)
    .order("id");
  if (error) throw new Error(`Could not load service types: ${error.message}`);
  return data;
}

export async function listTechnicians(): Promise<Technician[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, is_active")
    .eq("role", "technician")
    .order("full_name");
  if (error) throw new Error(`Could not load technicians: ${error.message}`);
  return data.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    isActive: p.is_active,
  }));
}

export interface TechnicianJobSlot {
  technicianId: string;
  orderNo: string;
  scheduledAt: string;
}

/** Open jobs per technician on one Malaysia day, for the assignment picker. */
export async function technicianDayLoad(date: string): Promise<TechnicianJobSlot[]> {
  const start = mytDateTimeToIso(date, "00:00");
  if (!start) return [];
  const end = new Date(Date.parse(start) + 86_400_000).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("technician_id, order_no, scheduled_at")
    .gte("scheduled_at", start)
    .lt("scheduled_at", end)
    .in("status", ["assigned", "in_progress"])
    .not("technician_id", "is", null);
  if (error) throw new Error(`Could not load technician schedules: ${error.message}`);
  return data.map((row) => ({
    technicianId: row.technician_id as string,
    orderNo: row.order_no,
    scheduledAt: row.scheduled_at,
  }));
}

export interface OrderFilters {
  q?: string;
  status?: OrderStatus;
  technicianId?: string;
  from?: string;
  to?: string;
  flagged?: boolean;
  page: number;
}

export interface OrderRow {
  id: string;
  orderNo: string;
  status: OrderStatus;
  customerName: string;
  serviceType: string;
  technicianName: string | null;
  scheduledAt: string;
  quotedSen: number;
  finalSen: number | null;
  flags: { severity: FlagSeverity; status: string }[];
}

export async function listOrders(
  filters: OrderFilters,
): Promise<{ rows: OrderRow[]; total: number }> {
  const supabase = await createClient();
  const flagsEmbed = filters.flagged ? "flags!inner(severity, status)" : "flags(severity, status)";
  let query = supabase.from("orders").select(
    `id, order_no, status, customer_name, scheduled_at, quoted_sen,
       service_types(name), technician:profiles!orders_technician_id_fkey(full_name),
       completions(final_sen), ${flagsEmbed}`,
    { count: "exact" },
  );

  const q = sanitizeSearch(filters.q ?? "");
  if (q) {
    const digits = phoneDigits(q);
    const clauses = [`order_no.ilike.*${q}*`, `customer_name.ilike.*${q}*`];
    if (digits.length >= 4) clauses.push(`customer_phone.ilike.*${digits}*`);
    query = query.or(clauses.join(","));
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.technicianId) query = query.eq("technician_id", filters.technicianId);
  if (filters.from) {
    const from = mytDateTimeToIso(filters.from, "00:00");
    if (from) query = query.gte("scheduled_at", from);
  }
  if (filters.to) {
    const to = mytDateTimeToIso(filters.to, "00:00");
    if (to) query = query.lt("scheduled_at", new Date(Date.parse(to) + 86_400_000).toISOString());
  }
  if (filters.flagged) query = query.eq("flags.status", "open");

  const offset = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("scheduled_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  // A page past the end (e.g. after filtering) is a 416 from PostgREST: show an empty
  // page with the real total instead of an error.
  if (error?.code === "PGRST103" && filters.page > 1) {
    const { total } = await listOrders({ ...filters, page: 1 });
    return { rows: [], total };
  }
  if (error) throw new Error(`Could not load orders: ${error.message}`);

  const rows = data.map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    status: row.status as OrderStatus,
    customerName: row.customer_name,
    serviceType: firstOf(row.service_types)?.name ?? "",
    technicianName: firstOf(row.technician)?.full_name ?? null,
    scheduledAt: row.scheduled_at,
    quotedSen: row.quoted_sen,
    finalSen: firstOf(row.completions)?.final_sen ?? null,
    flags: (row.flags ?? []) as { severity: FlagSeverity; status: string }[],
  }));
  return { rows, total: count ?? 0 };
}

// PostgREST returns to-one embeds as an object, but the generic client types
// them as arrays; accept both.
export function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
