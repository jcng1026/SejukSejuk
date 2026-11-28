import "server-only";

import { z } from "zod";

import { topOpenSeverity, type FlagSeverity, type OrderStatus } from "@/features/orders/labels";
import { firstOf } from "@/features/orders/queries";
import { DAY_MS } from "@/features/orders/schedule";
import { getCurrentUser } from "@/lib/auth";
import { fail, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

import type { CalendarJob } from "./types";

/** A month view shows six weeks; anything wider is not a calendar request. */
const MAX_RANGE_DAYS = 45;
const EVENT_LIMIT = 1000;

const rangeSchema = z
  .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
  .refine(({ start, end }) => {
    const span = Date.parse(end) - Date.parse(start);
    return span > 0 && span <= MAX_RANGE_DAYS * DAY_MS;
  });

/** Scheduled jobs in [start, end), optionally for one technician (FR-CAL-1). */
export async function listCalendarJobs(
  range: unknown,
  technicianId: unknown,
): Promise<Result<CalendarJob[]>> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", "Your session has ended. Sign in again.");
  if (user.role === "technician") return fail("FORBIDDEN", "The calendar is for office staff.");
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return fail("VALIDATION", "Choose a week or month to show.");
  if (technicianId !== null && !isUuid(technicianId)) {
    return fail("VALIDATION", "Choose a technician from the list.");
  }

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      `id, order_no, status, customer_name, scheduled_at,
       service_types(name), technician:profiles!orders_technician_id_fkey(full_name),
       flags(severity, status)`,
    )
    .gte("scheduled_at", parsed.data.start)
    .lt("scheduled_at", parsed.data.end)
    .order("scheduled_at")
    .limit(EVENT_LIMIT);
  if (technicianId !== null) query = query.eq("technician_id", technicianId);
  const { data, error } = await query;
  if (error) {
    console.error("Calendar query failed", { message: error.message });
    return fail("INTERNAL", "Could not load the calendar. Try again.");
  }
  return {
    ok: true,
    data: data.map((row) => ({
      id: row.id,
      orderNo: row.order_no,
      customerName: row.customer_name,
      serviceType: firstOf(row.service_types)?.name ?? "",
      technicianName: firstOf(row.technician)?.full_name ?? null,
      status: row.status as OrderStatus,
      scheduledAt: row.scheduled_at,
      topFlag: topOpenSeverity((row.flags ?? []) as { severity: FlagSeverity; status: string }[]),
    })),
  };
}
