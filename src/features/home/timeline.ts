// Positions on the home page's "Today's schedule" (mockup C2): one lane per
// technician, normally 08:00–20:00 Malaysia time, stretched to fit any job
// booked earlier or later. Jobs have no stored duration, so each is drawn as
// the same two-hour window the clash check uses.

import { mytParts } from "@/features/orders/schedule";

export interface Axis {
  startHour: number;
  endHour: number;
}

export const DEFAULT_AXIS: Axis = { startHour: 8, endHour: 20 };
export const JOB_BLOCK_MINUTES = 120;
const LAST_HOUR = 24;

function minuteOfDay(iso: string): number {
  const [hours, minutes] = mytParts(iso).time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** The default axis, widened to whole hours so every job's block fits. */
export function axisFor(scheduledAts: readonly string[]): Axis {
  let { startHour, endHour } = DEFAULT_AXIS;
  for (const iso of scheduledAts) {
    const start = minuteOfDay(iso);
    startHour = Math.min(startHour, Math.floor(start / 60));
    endHour = Math.max(endHour, Math.min(LAST_HOUR, Math.ceil((start + JOB_BLOCK_MINUTES) / 60)));
  }
  return { startHour, endHour };
}

export function axisHours({ startHour, endHour }: Axis): number[] {
  return Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
}

function toPct(minutes: number, axis: Axis): number {
  return (minutes / ((axis.endHour - axis.startHour) * 60)) * 100;
}

/** Left offset and width of a job block, clipped to the lane (percentages). */
export function placeJob(
  scheduledAt: string,
  axis: Axis = DEFAULT_AXIS,
): { leftPct: number; widthPct: number } {
  const length = (axis.endHour - axis.startHour) * 60;
  const start = minuteOfDay(scheduledAt) - axis.startHour * 60;
  const clippedStart = Math.min(Math.max(start, 0), length);
  const clippedEnd = Math.min(Math.max(start + JOB_BLOCK_MINUTES, 0), length);
  return { leftPct: toPct(clippedStart, axis), widthPct: toPct(clippedEnd - clippedStart, axis) };
}

/** Where the red "now" line sits, or null outside the axis. */
export function nowPosition(now: Date, axis: Axis = DEFAULT_AXIS): number | null {
  const minutes = minuteOfDay(now.toISOString()) - axis.startHour * 60;
  return minutes < 0 || minutes > (axis.endHour - axis.startHour) * 60
    ? null
    : toPct(minutes, axis);
}

/**
 * A row for each job (in the order given) so that jobs whose two-hour blocks
 * overlap never share a row and never hide each other.
 */
export function stackRows(scheduledAts: readonly string[]): number[] {
  const order = scheduledAts
    .map((iso, index) => ({ index, start: Date.parse(iso) }))
    .toSorted((a, b) => a.start - b.start);
  const rowEnds: number[] = [];
  const rows = new Array<number>(scheduledAts.length);
  for (const { index, start } of order) {
    const free = rowEnds.findIndex((end) => end <= start);
    const row = free === -1 ? rowEnds.length : free;
    rowEnds[row] = start + JOB_BLOCK_MINUTES * 60_000;
    rows[index] = row;
  }
  return rows;
}
