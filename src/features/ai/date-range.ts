// The AI tools' `date_range` argument (api-spec §4): a named range or explicit
// inclusive Malaysia dates, at most 92 days. Resolved here, never by the model.

import { z } from "zod";

import { addDays, resolvePeriod } from "@/features/kpi/period";
import { mytToday } from "@/features/orders/schedule";
import { isIsoDate } from "@/lib/validation";

export const AI_RANGE_KEYS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "next_week",
  "this_month",
  "last_month",
] as const;
export type AiRangeKey = (typeof AI_RANGE_KEYS)[number];

export const MAX_AI_RANGE_DAYS = 92;

const isoDate = z.string().refine(isIsoDate, { error: "Use a real date, YYYY-MM-DD." });

export const dateRangeSchema = z.union([
  z.enum(AI_RANGE_KEYS),
  z
    .object({ from: isoDate, to: isoDate })
    .strict()
    // Zod still runs this after a field's own check fails, so it re-checks the dates first.
    .refine(
      ({ from, to }) =>
        isIsoDate(from) &&
        isIsoDate(to) &&
        from <= to &&
        addDays(from, MAX_AI_RANGE_DAYS - 1) >= to,
      {
        error: `A range runs forwards and covers at most ${MAX_AI_RANGE_DAYS} days.`,
      },
    ),
]);
export type AiDateRange = z.infer<typeof dateRangeSchema>;

export interface ResolvedRange {
  from: string;
  to: string;
  /** Shown to the user as the answer's period. */
  label: string;
}

function monthBefore(today: string): { from: string; to: string } {
  const to = addDays(`${today.slice(0, 8)}01`, -1);
  return { from: `${to.slice(0, 8)}01`, to };
}

export function resolveAiRange(range: AiDateRange, now: Date = new Date()): ResolvedRange {
  if (typeof range !== "string") {
    return { from: range.from, to: range.to, label: `${range.from} to ${range.to}` };
  }
  const today = mytToday(now);
  const week = resolvePeriod({ period: "this_week" }, now);
  const dates: Record<AiRangeKey, () => { from: string; to: string }> = {
    today: () => ({ from: today, to: today }),
    yesterday: () => ({ from: addDays(today, -1), to: addDays(today, -1) }),
    this_week: () => week,
    last_week: () => ({ from: addDays(week.from, -7), to: addDays(week.from, -1) }),
    next_week: () => ({ from: addDays(week.to, 1), to: addDays(week.to, 7) }),
    this_month: () => resolvePeriod({ period: "this_month" }, now),
    last_month: () => monthBefore(today),
  };
  const { from, to } = dates[range]();
  return { from, to, label: range };
}
