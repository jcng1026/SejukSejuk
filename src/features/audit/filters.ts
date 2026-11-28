// FR-AUD-2: the audit log page's URL filters, validated, and a summary of
// what each change touched.

import { firstParam as first, isIsoDate, isUuid } from "@/lib/validation";

export const AUDITED_TABLES = [
  "orders",
  "completions",
  "payments",
  "attachments",
  "flags",
  "profiles",
  "whatsapp_messages",
] as const;
export type AuditedTable = (typeof AUDITED_TABLES)[number];

export const AUDIT_ACTIONS = ["INSERT", "UPDATE", "DELETE"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_VIA = ["ui", "ai", "system"] as const;
export type AuditVia = (typeof AUDIT_VIA)[number];

export interface AuditFilters {
  table?: AuditedTable;
  action?: AuditAction;
  actorId?: string;
  via?: AuditVia;
  orderNo?: string;
  from?: string;
  to?: string;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

const MAX_PAGE = 1000;
const ORDER_NO = /^ORD-\d{6}-\d{4}$/;
/** Columns every update touches, which say nothing about what changed. */
const BOOKKEEPING = new Set(["updated_at"]);

function oneOf<T extends string>(options: readonly T[], value: string | undefined): T | undefined {
  return (options as readonly string[]).includes(value ?? "") ? (value as T) : undefined;
}

export function parseAuditFilters(params: Params): AuditFilters {
  const orderNo = first(params.order)?.trim().toUpperCase();
  const actor = first(params.actor);
  const from = first(params.from);
  const to = first(params.to);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const table = oneOf(AUDITED_TABLES, first(params.table));
  const action = oneOf(AUDIT_ACTIONS, first(params.action));
  const via = oneOf(AUDIT_VIA, first(params.via));
  return {
    ...(table ? { table } : {}),
    ...(action ? { action } : {}),
    ...(isUuid(actor) ? { actorId: actor } : {}),
    ...(via ? { via } : {}),
    ...(orderNo && ORDER_NO.test(orderNo) ? { orderNo } : {}),
    ...(isIsoDate(from) ? { from } : {}),
    ...(isIsoDate(to) ? { to } : {}),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Filters → "?table=…&page=2", leaving out empty values and page 1. */
export function auditQuery(filters: AuditFilters, changes: Partial<AuditFilters> = {}): string {
  const merged = { ...filters, ...changes };
  const params = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ["table", merged.table],
    ["action", merged.action],
    ["actor", merged.actorId],
    ["via", merged.via],
    ["order", merged.orderNo],
    ["from", merged.from],
    ["to", merged.to],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

type Row = Record<string, unknown> | null;

/** Field names whose value differs between before and after (inserts/deletes list every field). */
export function changedFields(before: Row, after: Row): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys]
    .filter((key) => !BOOKKEEPING.has(key))
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .sort();
}
