// Display names and colour classes for statuses and flags (design §8 tokens).

export const ORDER_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "job_done",
  "reviewed",
  "closed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  job_done: "Job done",
  reviewed: "Reviewed",
  closed: "Closed",
};

export const STATUS_DOT: Record<OrderStatus, string> = {
  new: "bg-status-new",
  assigned: "bg-status-assigned",
  in_progress: "bg-status-in-progress",
  job_done: "bg-status-job-done",
  reviewed: "bg-status-reviewed",
  closed: "bg-status-closed",
};

export const FLAG_SEVERITIES = ["high", "medium", "low"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

export const SEVERITY_LABEL: Record<FlagSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SEVERITY_CHIP: Record<FlagSeverity, string> = {
  high: "bg-flag-high-soft text-flag-high",
  medium: "bg-flag-medium-soft text-flag-medium",
  low: "bg-flag-low-soft text-flag-low-foreground",
};

export const SEVERITY_DOT: Record<FlagSeverity, string> = {
  high: "bg-flag-high",
  medium: "bg-flag-medium",
  low: "bg-flag-low",
};

/** The most serious open flag, for one-glance row markers. */
export function topOpenSeverity(
  flags: readonly { severity: FlagSeverity; status: string }[],
): FlagSeverity | null {
  for (const severity of FLAG_SEVERITIES) {
    if (flags.some((flag) => flag.status === "open" && flag.severity === severity)) return severity;
  }
  return null;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card: "Card",
  qr: "QR (DuitNow)",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
