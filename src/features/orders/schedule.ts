// All scheduling is in Malaysia time (UTC+8, no daylight saving).

const MYT_OFFSET_MINUTES = 8 * 60;
export const DAY_MS = 86_400_000;
const CLASH_WINDOW_MINUTES = 120;

/** Half-hour slots offered in the order form, 08:00–18:00. */
export const TIME_SLOTS: readonly string[] = Array.from({ length: 21 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** The standard slots plus `current` when it is off-grid, so an existing time is never lost. */
export function slotsIncluding(current: string): readonly string[] {
  return TIME_SLOTS.includes(current) ? TIME_SLOTS : [...TIME_SLOTS, current].sort();
}

/** ("2026-11-27", "09:30") in MYT → ISO instant, or null if either part is invalid. */
export function mytDateTimeToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (hour > 23 || minute > 59) return null;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - MYT_OFFSET_MINUTES * 60_000;
  const check = new Date(utcMs + MYT_OFFSET_MINUTES * 60_000);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(utcMs).toISOString();
}

/** ISO instant → MYT { date: "YYYY-MM-DD", time: "HH:mm" }. */
export function mytParts(iso: string): { date: string; time: string } {
  const shifted = new Date(Date.parse(iso) + MYT_OFFSET_MINUTES * 60_000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

const MYT_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Fri 27/11/2026, 10:00" in Malaysia time; built from parts so ICU punctuation can't drift. */
export function formatMytWhen(iso: string): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    MYT_PARTS.formatToParts(new Date(iso)).find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")}/${part("month")}/${part("year")}, ${part("hour")}:${part("minute")}`;
}

/** The Malaysia date `days` from now, "YYYY-MM-DD". */
export function mytDateFromToday(days: number, now: Date = new Date()): string {
  return mytParts(new Date(now.getTime() + days * 86_400_000).toISOString()).date;
}

/** Today's date in Malaysia, "YYYY-MM-DD". */
export function mytToday(now: Date = new Date()): string {
  return mytParts(now.toISOString()).date;
}

export interface ScheduledJob {
  orderNo: string;
  scheduledAt: string;
}

/** Jobs starting less than two hours before or after the candidate time. */
export function findClashes<T extends ScheduledJob>(jobs: readonly T[], candidateIso: string): T[] {
  const candidate = Date.parse(candidateIso);
  return jobs.filter(
    (job) => Math.abs(Date.parse(job.scheduledAt) - candidate) < CLASH_WINDOW_MINUTES * 60_000,
  );
}
