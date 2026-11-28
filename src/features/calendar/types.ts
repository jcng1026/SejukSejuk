import type { FlagSeverity, OrderStatus } from "@/features/orders/labels";

/** One scheduled job as the calendar API returns it. */
export interface CalendarJob {
  id: string;
  orderNo: string;
  customerName: string;
  serviceType: string;
  technicianName: string | null;
  status: OrderStatus;
  scheduledAt: string;
  topFlag: FlagSeverity | null;
}
