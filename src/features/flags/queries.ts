import "server-only";

import type { FlagSeverity } from "@/features/orders/labels";
import { firstOf } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";

const OPEN_FLAG_LIMIT = 200;

export interface OpenFlag {
  id: string;
  severity: FlagSeverity;
  source: string;
  message: string;
  raisedAt: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  technicianName: string | null;
}

/** Open flags, most serious first, then oldest first (FR-FLG-4). */
export async function listOpenFlags(): Promise<OpenFlag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flags")
    .select(
      `id, severity, source, message, raised_at,
       orders(id, order_no, customer_name, technician:profiles!orders_technician_id_fkey(full_name))`,
    )
    .eq("status", "open")
    // flag_severity is declared high, medium, low, so ascending puts High first.
    .order("severity")
    .order("raised_at")
    .limit(OPEN_FLAG_LIMIT);
  if (error) throw new Error(`Could not load flags: ${error.message}`);

  return data.flatMap((row) => {
    const order = firstOf(row.orders);
    if (!order) return [];
    return [
      {
        id: row.id,
        severity: row.severity as FlagSeverity,
        source: row.source,
        message: row.message,
        raisedAt: row.raised_at,
        orderId: order.id,
        orderNo: order.order_no,
        customerName: order.customer_name,
        technicianName: firstOf(order.technician)?.full_name ?? null,
      },
    ];
  });
}
