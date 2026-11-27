// Turns a notifications row into what the bell shows (FR-NOT-3).

export interface NotificationRow {
  id: string;
  order_id: string | null;
  type: string;
  severity: string | null;
  payload: unknown;
  created_at: string;
  read_at: string | null;
}

export interface Notice {
  id: string;
  text: string;
  href: string;
  isHigh: boolean;
  isUnread: boolean;
  createdAt: string;
}

function field(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

export function toNotice(row: NotificationRow): Notice {
  const base = { id: row.id, isUnread: row.read_at === null, createdAt: row.created_at };
  if (row.type === "jobs_done") {
    const count = Number(field(row.payload, "count")) || 1;
    return {
      ...base,
      text: `${count} ${count === 1 ? "job" : "jobs"} completed today`,
      href: "/review",
      isHigh: false,
    };
  }
  const orderNo = String(field(row.payload, "order_no") ?? "an order");
  const message = field(row.payload, "message");
  return {
    ...base,
    text: `High flag on ${orderNo}${typeof message === "string" && message ? `: ${message}` : ""}`,
    href: row.order_id ? `/orders/${row.order_id}` : "/flags",
    isHigh: row.severity === "high",
  };
}
