import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, dayOfWeek, resolvePeriod } from "./period";

// Friday 27 Nov 2026, 10:00 in Malaysia.
const FRIDAY = new Date("2026-11-27T02:00:00Z");
const ANY_INSTANT = fc.date({
  min: new Date("2020-01-01T00:00:00Z"),
  max: new Date("2035-12-31T00:00:00Z"),
  noInvalidDate: true,
});

describe("resolvePeriod", () => {
  it("this week runs Monday to Sunday in Malaysia time", () => {
    expect(resolvePeriod({}, FRIDAY)).toMatchObject({
      key: "this_week",
      from: "2026-11-23",
      to: "2026-11-29",
    });
  });

  it("uses the Malaysia date, not UTC, near midnight", () => {
    // Sunday 29 Nov 23:30 UTC is already Monday 30 Nov in Malaysia: a new week.
    const lateSunday = new Date("2026-11-29T23:30:00Z");
    expect(resolvePeriod({ period: "this_week" }, lateSunday)).toMatchObject({
      from: "2026-11-30",
      to: "2026-12-06",
    });
  });

  it("last week is the seven days before this week", () => {
    expect(resolvePeriod({ period: "last_week" }, FRIDAY)).toMatchObject({
      from: "2026-11-16",
      to: "2026-11-22",
    });
  });

  it("this month runs from the 1st to the last day", () => {
    expect(resolvePeriod({ period: "this_month" }, FRIDAY)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    const february = new Date("2028-02-10T02:00:00Z");
    expect(resolvePeriod({ period: "this_month" }, february)).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("accepts a valid custom range", () => {
    expect(
      resolvePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-15" }, FRIDAY),
    ).toMatchObject({ key: "custom", from: "2026-10-01", to: "2026-10-15" });
  });

  it("falls back to this week for a bad custom range", () => {
    for (const bad of [
      { from: "2026-10-15", to: "2026-10-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2024-01-01", to: "2026-01-01" },
      { from: "x", to: "y" },
    ]) {
      expect(resolvePeriod({ period: "custom", ...bad }, FRIDAY).key).toBe("this_week");
    }
  });

  it("ignores unknown period keys and takes the first of repeated values", () => {
    expect(resolvePeriod({ period: "forever" }, FRIDAY).key).toBe("this_week");
    expect(resolvePeriod({ period: ["last_week", "this_month"] }, FRIDAY).key).toBe("last_week");
  });

  it("for any instant, this week is a Monday-to-Sunday span containing today", () => {
    fc.assert(
      fc.property(ANY_INSTANT, (now) => {
        const { from, to } = resolvePeriod({ period: "this_week" }, now);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(
          now,
        );
        return dayOfWeek(from) === 1 && addDays(from, 6) === to && from <= today && today <= to;
      }),
    );
  });

  it("for any instant, last week ends the day before this week starts", () => {
    fc.assert(
      fc.property(ANY_INSTANT, (now) => {
        const thisWeek = resolvePeriod({ period: "this_week" }, now);
        const lastWeek = resolvePeriod({ period: "last_week" }, now);
        return (
          addDays(lastWeek.to, 1) === thisWeek.from && addDays(lastWeek.from, 6) === lastWeek.to
        );
      }),
    );
  });

  it("for any instant, this month starts on the 1st and ends the day before next month", () => {
    fc.assert(
      fc.property(ANY_INSTANT, (now) => {
        const { from, to } = resolvePeriod({ period: "this_month" }, now);
        return (
          from.endsWith("-01") &&
          addDays(to, 1).endsWith("-01") &&
          from.slice(0, 7) === to.slice(0, 7)
        );
      }),
    );
  });
});
