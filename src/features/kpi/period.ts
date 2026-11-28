// FR-KPI-4: reporting periods as inclusive Malaysia dates ("YYYY-MM-DD").
// Weeks run Monday to Sunday. Date maths uses UTC midnights so the host
// time zone never shifts a day.

import { DAY_MS, mytToday } from "@/features/orders/schedule";
import { firstParam as first, isIsoDate } from "@/lib/validation";

export const PERIOD_KEYS = ["this_week", "last_week", "this_month", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
}

/** A year plus a leap day: long enough for any sensible custom report. */
export const MAX_CUSTOM_DAYS = 366;

type QueryValue = string | string[] | undefined;

function toUtc(date: string): number | null {
  return isIsoDate(date) ? Date.parse(`${date}T00:00:00Z`) : null;
}

function fromUtc(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc((toUtc(date) ?? Number.NaN) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(toUtc(date) ?? Number.NaN).getUTCDay();
}

function weekOf(date: string): Period {
  const monday = addDays(date, -((dayOfWeek(date) + 6) % 7));
  return { key: "this_week", from: monday, to: addDays(monday, 6) };
}

function monthOf(date: string): Period {
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const nextMonth = Date.UTC(year, month, 1);
  return { key: "this_month", from: `${date.slice(0, 8)}01`, to: fromUtc(nextMonth - DAY_MS) };
}

function customRange(from: QueryValue, to: QueryValue): Period | null {
  const [start, end] = [first(from) ?? "", first(to) ?? ""];
  const [startTime, endTime] = [toUtc(start), toUtc(end)];
  if (startTime === null || endTime === null || endTime < startTime) return null;
  if ((endTime - startTime) / DAY_MS + 1 > MAX_CUSTOM_DAYS) return null;
  return { key: "custom", from: start, to: end };
}

/** Reads `?period=&from=&to=`; anything invalid falls back to this week. */
export function resolvePeriod(
  query: { period?: QueryValue; from?: QueryValue; to?: QueryValue },
  now: Date = new Date(),
): Period {
  const today = mytToday(now);
  const thisWeek = weekOf(today);
  switch (first(query.period)) {
    case "last_week":
      return { key: "last_week", from: addDays(thisWeek.from, -7), to: addDays(thisWeek.from, -1) };
    case "this_month":
      return monthOf(today);
    case "custom":
      return customRange(query.from, query.to) ?? thisWeek;
    default:
      return thisWeek;
  }
}

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "23 Nov 2026 – 29 Nov 2026" for headings. */
export function formatPeriod(period: Period): string {
  const [from, to] = [period.from, period.to].map((date) =>
    SHORT_DATE.format(new Date(toUtc(date) ?? 0)),
  );
  return from === to ? from : `${from} – ${to}`;
}
