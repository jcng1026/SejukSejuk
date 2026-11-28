import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { axisFor, axisHours, DEFAULT_AXIS, nowPosition, placeJob, stackRows } from "./timeline";

const at = (time: string) => `2026-11-27T${time}:00+08:00`;

describe("axisFor", () => {
  it("is 08:00–20:00 when every job fits", () => {
    expect(axisFor([at("09:00"), at("17:30")])).toEqual(DEFAULT_AXIS);
  });

  it("stretches to show early and late jobs in full", () => {
    expect(axisFor([at("06:30"), at("19:15")])).toEqual({ startHour: 6, endHour: 22 });
    expect(axisFor([at("23:00")])).toEqual({ startHour: 8, endHour: 24 });
  });

  it("lists one label per hour", () => {
    expect(axisHours({ startHour: 8, endHour: 11 })).toEqual([8, 9, 10]);
  });
});

describe("placeJob", () => {
  it("places a 09:00 job two hours wide on the 08:00–20:00 axis", () => {
    expect(placeJob(at("09:00"))).toEqual({ leftPct: (1 / 12) * 100, widthPct: (2 / 12) * 100 });
  });

  it("clips a job that runs past the end of the day", () => {
    expect(placeJob(at("23:00"), { startHour: 8, endHour: 24 })).toEqual({
      leftPct: (15 / 16) * 100,
      widthPct: (1 / 16) * 100,
    });
  });

  it("for any job, the axis built from it shows the whole block inside the lane", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 * 60 - 1 }), (minute) => {
        const hh = String(Math.floor(minute / 60)).padStart(2, "0");
        const mm = String(minute % 60).padStart(2, "0");
        const job = at(`${hh}:${mm}`);
        const { leftPct, widthPct } = placeJob(job, axisFor([job]));
        return leftPct >= 0 && widthPct > 0 && leftPct + widthPct <= 100 + 1e-9;
      }),
    );
  });
});

describe("nowPosition", () => {
  it("is a percentage inside the axis and null outside it", () => {
    expect(nowPosition(new Date(at("14:00")))).toBe(50);
    expect(nowPosition(new Date(at("07:00")))).toBe(null);
    expect(nowPosition(new Date(at("07:00")), { startHour: 6, endHour: 20 })).toBeCloseTo(
      (1 / 14) * 100,
    );
    expect(nowPosition(new Date(at("20:30")))).toBe(null);
  });
});

describe("stackRows", () => {
  it("keeps jobs that do not overlap on one row", () => {
    expect(stackRows([at("08:00"), at("10:00"), at("12:00")])).toEqual([0, 0, 0]);
  });

  it("moves overlapping jobs to the next free row, so none hides another", () => {
    expect(stackRows([at("09:00"), at("09:00"), at("10:00"), at("11:00")])).toEqual([0, 1, 2, 0]);
  });

  it("never gives two overlapping jobs the same row (any times)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 23 * 60 }), { maxLength: 12 }), (minutes) => {
        const times = minutes.map((m) =>
          at(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`),
        );
        const rows = stackRows(times);
        return times.every((a, i) =>
          times.every((b, j) => {
            if (i === j || rows[i] !== rows[j]) return true;
            return Math.abs(Date.parse(a) - Date.parse(b)) >= 120 * 60_000;
          }),
        );
      }),
    );
  });
});
