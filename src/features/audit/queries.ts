import "server-only";

import { DAY_MS, mytDateTimeToIso } from "@/features/orders/schedule";
import { throwLoadError } from "@/lib/load-error";
import { createClient } from "@/lib/supabase/server";

import { changedFields, type AuditFilters } from "./filters";

export const AUDIT_PAGE_SIZE = 50;

export interface AuditEntry {
  id: number;
  at: string;
  table: string;
  action: string;
  actorName: string;
  orderId: string | null;
  orderNo: string | null;
  fields: string[];
  reason: string | null;
  via: string;
}

async function orderIdFor(orderNo: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) throwLoadError("the order", error.message);
  return data?.id ?? null;
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) throwLoadError("people", error.message);
  return new Map(data.map((row) => [row.id, row.full_name]));
}

async function orderNosFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select("id, order_no").in("id", ids);
  if (error) throwLoadError("orders", error.message);
  return new Map(data.map((row) => [row.id, row.order_no]));
}

/** One page of the audit log, newest first (FR-AUD-2). Dates are Malaysia days. */
export async function listAuditEntries(
  filters: AuditFilters,
): Promise<{ entries: AuditEntry[]; total: number }> {
  const orderId = filters.orderNo ? await orderIdFor(filters.orderNo) : undefined;
  if (orderId === null) return { entries: [], total: 0 };

  const supabase = await createClient();
  const offset = (filters.page - 1) * AUDIT_PAGE_SIZE;
  let query = supabase
    .from("audit_log")
    .select("id, created_at, table_name, action, actor_id, order_id, before, after, reason, via", {
      count: "exact",
    })
    .order("id", { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1);
  if (filters.table) query = query.eq("table_name", filters.table);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.via) query = query.eq("via", filters.via);
  if (orderId) query = query.eq("order_id", orderId);
  const from = filters.from ? mytDateTimeToIso(filters.from, "00:00") : null;
  if (from) query = query.gte("created_at", from);
  const toStart = filters.to ? mytDateTimeToIso(filters.to, "00:00") : null;
  if (toStart) query = query.lt("created_at", new Date(Date.parse(toStart) + DAY_MS).toISOString());
  const { data, error, count } = await query;
  if (error) throwLoadError("the audit log", error.message);

  const actorIds = [...new Set(data.flatMap((row) => (row.actor_id ? [row.actor_id] : [])))];
  const orderIds = [...new Set(data.flatMap((row) => (row.order_id ? [row.order_id] : [])))];
  const [names, orderNos] = await Promise.all([namesFor(actorIds), orderNosFor(orderIds)]);

  return {
    total: count ?? 0,
    entries: data.map((row) => ({
      id: row.id,
      at: row.created_at,
      table: row.table_name,
      action: row.action,
      actorName: row.actor_id ? (names.get(row.actor_id) ?? "Unknown user") : "System",
      orderId: row.order_id,
      orderNo: row.order_id ? (orderNos.get(row.order_id) ?? null) : null,
      fields: changedFields(row.before, row.after),
      reason: row.reason || null,
      via: row.via,
    })),
  };
}

/** Everyone who can appear as an actor, for the filter. */
export async function listAuditActors(): Promise<{ id: string; name: string; role: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name");
  if (error) throwLoadError("people", error.message);
  return data.map((row) => ({ id: row.id, name: row.full_name, role: row.role }));
}
