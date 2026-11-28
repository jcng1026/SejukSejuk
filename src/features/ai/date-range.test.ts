import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays } from "@/features/kpi/period";

import { AI_RANGE_KEYS, dateRangeSchema, resolveAiRange } from "./date-range";

// Friday 27 Nov 2026, 10:00 in Malaysia.
const FRIDAY = new Date("2026-11-27T02:00:00Z");

describe("resolveAiRange", () => {
  it("resolves the named ranges in Malaysia time", () => {
    expect(resolveAiRange("today", FRIDAY)).toEqual({
      from: "2026-11-27",
      to: "2026-11-27",
      label: "today",
    });
    expect(resolveAiRange("yesterday", FRIDAY)).toMatchObject({
      from: "2026-11-26",
      to: "2026-11-26",
    });
    expect(resolveAiRange("this_week", FRIDAY)).toMatchObject({
      from: "2026-11-23",
      to: "2026-11-29",
    });
    expect(resolveAiRange("last_week", FRIDAY)).toMatchObject({
      from: "2026-11-16",
      to: "2026-11-22",
    });
    expect(resolveAiRange("next_week", FRIDAY)).toMatchObject({
      from: "2026-11-30",
      to: "2026-12-06",
    });
    expect(resolveAiRange("this_month", FRIDAY)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(resolveAiRange("last_month", FRIDAY)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("keeps explicit dates and labels them", () => {
    expect(resolveAiRange({ from: "2026-11-01", to: "2026-11-15" }, FRIDAY)).toEqual({
      from: "2026-11-01",
      to: "2026-11-15",
      label: "2026-11-01 to 2026-11-15",
    });
  });

  it("every named range is ordered and at most 92 days, for any day", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2035-12-31"), noInvalidDate: true }),
        fc.constantFrom(...AI_RANGE_KEYS),
        (now, key) => {
          const { from, to } = resolveAiRange(key, now);
          return from <= to && addDays(from, 91) >= to;
        },
      ),
    );
  });
});

describe("dateRangeSchema", () => {
  it("accepts the named ranges and short explicit ranges", () => {
    expect(dateRangeSchema.safeParse("this_week").success).toBe(true);
    expect(dateRangeSchema.safeParse({ from: "2026-09-01", to: "2026-11-30" }).success).toBe(true);
  });

  it("rejects unknown names, reversed, impossible or over-long ranges", () => {
    for (const bad of [
      "forever",
      { from: "2026-11-30", to: "2026-11-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-01-01", to: "2026-12-31" },
      { from: "2026-11-01" },
    ]) {
      expect(dateRangeSchema.safeParse(bad).success).toBe(false);
    }
  });
});
