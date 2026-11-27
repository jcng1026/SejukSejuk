import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { FlagSeverity, OrderStatus } from "./labels";
import { firstOf } from "./queries";
import { describeAuditEntry } from "./timeline";

const SIGNED_URL_SECONDS = 600;

export interface OrderDetail {
  id: string;
  orderNo: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  problemDescription: string;
  serviceTypeId: number;
  serviceType: string;
  quotedSen: number;
  scheduledAt: string;
  adminNotes: string | null;
  rescheduleCount: number;
  technician: { id: string; fullName: string; phone: string | null } | null;
  createdBy: string | null;
  assignedBy: string | null;
  createdAt: string;
  completion: {
    workDone: string;
    extraSen: number;
    finalSen: number;
    remarks: string | null;
    completedAt: string;
  } | null;
  payment: { amountSen: number; method: string; recordedAt: string } | null;
  attachments: { id: string; mime: string; url: string | null }[];
  flags: {
    id: string;
    severity: FlagSeverity;
    source: string;
    message: string;
    status: string;
    raisedAt: string;
    raisedBy: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    resolutionNote: string | null;
  }[];
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  id: number;
  at: string;
  actorName: string;
  description: string;
  reason: string | null;
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_no, status, customer_name, customer_phone, customer_address, problem_description,
       service_type_id, quoted_sen, scheduled_at, admin_notes, reschedule_count, created_at,
       service_types(name),
       technician:profiles!orders_technician_id_fkey(id, full_name, phone),
       creator:profiles!orders_created_by_fkey(full_name),
       assigner:profiles!orders_assigned_by_fkey(full_name),
       completions(work_done, extra_sen, final_sen, remarks, completed_at),
       payments(amount_sen, method, recorded_at),
       attachments(id, mime, storage_path),
       flags(id, severity, source, message, status, raised_at, resolved_at, resolution_note,
         raiser:profiles!flags_raised_by_fkey(full_name), resolver:profiles!flags_resolved_by_fkey(full_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load order: ${error.message}`);
  if (!order) return null;

  const [timeline, attachments] = await Promise.all([
    loadTimeline(id),
    signAttachments(order.attachments ?? []),
  ]);

  const technician = firstOf(order.technician);
  const completion = firstOf(order.completions);
  const payment = firstOf(order.payments);
  return {
    id: order.id,
    orderNo: order.order_no,
    status: order.status as OrderStatus,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    problemDescription: order.problem_description,
    serviceTypeId: order.service_type_id,
    serviceType: firstOf(order.service_types)?.name ?? "",
    quotedSen: order.quoted_sen,
    scheduledAt: order.scheduled_at,
    adminNotes: order.admin_notes,
    rescheduleCount: order.reschedule_count,
    technician: technician
      ? { id: technician.id, fullName: technician.full_name, phone: technician.phone }
      : null,
    createdBy: firstOf(order.creator)?.full_name ?? null,
    assignedBy: firstOf(order.assigner)?.full_name ?? null,
    createdAt: order.created_at,
    completion: completion
      ? {
          workDone: completion.work_done,
          extraSen: completion.extra_sen,
          finalSen: completion.final_sen,
          remarks: completion.remarks,
          completedAt: completion.completed_at,
        }
      : null,
    payment: payment
      ? { amountSen: payment.amount_sen, method: payment.method, recordedAt: payment.recorded_at }
      : null,
    attachments,
    flags: (order.flags ?? [])
      .map((flag) => ({
        id: flag.id,
        severity: flag.severity as FlagSeverity,
        source: flag.source,
        message: flag.message,
        status: flag.status,
        raisedAt: flag.raised_at,
        raisedBy: firstOf(flag.raiser)?.full_name ?? null,
        resolvedAt: flag.resolved_at,
        resolvedBy: firstOf(flag.resolver)?.full_name ?? null,
        resolutionNote: flag.resolution_note,
      }))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    timeline,
  };
}

function severityRank(severity: FlagSeverity): number {
  return { high: 0, medium: 1, low: 2 }[severity];
}

async function loadTimeline(orderId: string): Promise<TimelineEntry[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("audit_log")
    .select("id, created_at, actor_id, action, before, after, reason, table_name")
    .eq("order_id", orderId)
    .order("id");
  if (error) throw new Error(`Could not load history: ${error.message}`);

  // Only the people this history mentions: actors and technicians assigned or replaced.
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.actor_id) ids.add(row.actor_id);
    for (const value of [row.before?.technician_id, row.after?.technician_id]) {
      if (typeof value === "string") ids.add(value);
    }
  }
  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...ids]);
  if (peopleError) throw new Error(`Could not load names for history: ${peopleError.message}`);

  const names = new Map(people.map((p) => [p.id, p.full_name]));
  return rows.map((row) => ({
    id: row.id,
    at: row.created_at,
    actorName: row.actor_id ? (names.get(row.actor_id) ?? "Staff") : "System",
    description: describeAuditEntry(
      { tableName: row.table_name, action: row.action, before: row.before, after: row.after },
      names,
    ),
    reason: row.reason,
  }));
}

async function signAttachments(
  rows: { id: string; mime: string; storage_path: string }[],
): Promise<OrderDetail["attachments"]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("job-files").createSignedUrls(
    rows.map((row) => row.storage_path),
    SIGNED_URL_SECONDS,
  );
  // The page still renders (files show as placeholders), but the failure is recorded.
  if (error) console.error("Could not sign attachment URLs", { message: error.message });
  const urls = new Map(
    (data ?? []).map((entry) => [entry.path, entry.error ? null : entry.signedUrl]),
  );
  // Seeded demo rows have no stored file; they render as placeholders.
  return rows.map((row) => ({
    id: row.id,
    mime: row.mime,
    url: urls.get(row.storage_path) ?? null,
  }));
}
