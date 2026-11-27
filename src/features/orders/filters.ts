import { isIsoDate, isUuid } from "@/lib/validation";

import { isOrderStatus } from "./labels";
import type { OrderFilters } from "./queries";

type Params = Record<string, string | string[] | undefined>;

const MAX_PAGE = 1000;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** URL search params → validated filters. Anything malformed is dropped. */
export function parseOrderFilters(params: Params): OrderFilters {
  const q = first(params.q)?.trim();
  const status = first(params.status);
  const technician = first(params.technician);
  const from = first(params.from);
  const to = first(params.to);
  const page = Number.parseInt(first(params.page) ?? "1", 10);

  return {
    ...(q ? { q: q.slice(0, 50) } : {}),
    ...(isOrderStatus(status) ? { status } : {}),
    ...(isUuid(technician) ? { technicianId: technician } : {}),
    ...(isIsoDate(from) ? { from } : {}),
    ...(isIsoDate(to) ? { to } : {}),
    flagged: first(params.flagged) === "1",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Filters → "?q=…&page=2", leaving out empty values and page 1. */
export function filtersToQuery(filters: OrderFilters, changes: Partial<OrderFilters>): string {
  const merged = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.technicianId) params.set("technician", merged.technicianId);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.flagged) params.set("flagged", "1");
  if (merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
