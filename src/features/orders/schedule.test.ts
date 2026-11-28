import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  describeClashes,
  findClashes,
  formatMytWhen,
  mytDateTimeToIso,
  mytParts,
  slotsIncluding,
  TIME_SLOTS,
} from "./schedule";

describe("mytDateTimeToIso", () => {
  it("treats the date and time as Malaysia time (UTC+8)", () => {
    expect(mytDateTimeToIso("2026-11-27", "09:30")).toBe("2026-11-27T01:30:00.000Z");
    expect(mytDateTimeToIso("2026-11-28", "07:00")).toBe("2026-11-27T23:00:00.000Z");
  });

  it("rejects impossible dates and times", () => {
    expect(mytDateTimeToIso("2026-02-30", "09:00")).toBeNull();
    expect(mytDateTimeToIso("2026-11-27", "25:00")).toBeNull();
    expect(mytDateTimeToIso("27/11/2026", "09:00")).toBeNull();
  });

  it("round-trips with mytParts for any minute of any day", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2020-01-01T00:00:00Z"),
          max: new Date("2035-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (instant) => {
          const whole = new Date(Math.floor(instant.getTime() / 60_000) * 60_000);
          const { date, time } = mytParts(whole.toISOString());
          return mytDateTimeToIso(date, time) === whole.toISOString();
        },
      ),
    );
  });
});

describe("formatMytWhen", () => {
  it("shows weekday, dd/mm/yyyy and 24-hour time in Malaysia", () => {
    expect(formatMytWhen("2026-11-27T02:00:00.000Z")).toBe("Fri 27/11/2026, 10:00");
    expect(formatMytWhen("2026-11-27T16:30:00.000Z")).toBe("Sat 28/11/2026, 00:30");
  });
});

describe("TIME_SLOTS", () => {
  it("offers half-hour slots across the working day", () => {
    expect(TIME_SLOTS[0]).toBe("08:00");
    expect(TIME_SLOTS.at(-1)).toBe("18:00");
    expect(TIME_SLOTS).toContain("13:30");
  });
});

describe("slotsIncluding", () => {
  it("keeps an off-grid existing time in the list, in order", () => {
    const slots = slotsIncluding("14:17");
    expect(slots).toContain("14:17");
    expect(slots.indexOf("14:17")).toBe(slots.indexOf("14:00") + 1);
  });

  it("returns the standard slots unchanged when the time is on the grid", () => {
    expect(slotsIncluding("10:00")).toBe(TIME_SLOTS);
  });
});

describe("findClashes", () => {
  const at = (time: string) => mytDateTimeToIso("2026-11-27", time) as string;

  it("reports jobs starting within two hours either side", () => {
    const jobs = [
      { orderNo: "ORD-1", scheduledAt: at("08:00") },
      { orderNo: "ORD-2", scheduledAt: at("09:00") },
      { orderNo: "ORD-3", scheduledAt: at("13:00") },
    ];
    expect(findClashes(jobs, at("10:30")).map((j) => j.orderNo)).toEqual(["ORD-2"]);
  });

  it("treats exactly two hours apart as no clash", () => {
    expect(findClashes([{ orderNo: "ORD-1", scheduledAt: at("09:00") }], at("11:00"))).toEqual([]);
  });

  it("is symmetric: if A clashes with B then B clashes with A", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600 }), fc.integer({ min: 0, max: 600 }), (a, b) => {
        const base = Date.parse(at("08:00"));
        const isoA = new Date(base + a * 60_000).toISOString();
        const isoB = new Date(base + b * 60_000).toISOString();
        const ab = findClashes([{ orderNo: "B", scheduledAt: isoB }], isoA).length;
        const ba = findClashes([{ orderNo: "A", scheduledAt: isoA }], isoB).length;
        return ab === ba;
      }),
    );
  });
});

describe("describeClashes", () => {
  const job = (n: number) => ({
    orderNo: `ORD-261128-000${n}`,
    scheduledAt: mytDateTimeToIso("2026-11-28", "10:00") as string,
  });

  it("names every clash when there are only a few", () => {
    expect(describeClashes([job(1), job(2)])).toBe(
      "ORD-261128-0001 at 10:00, ORD-261128-0002 at 10:00",
    );
  });

  it("names the first three and counts the rest, so the warning stays short", () => {
    expect(describeClashes([1, 2, 3, 4, 5].map(job))).toBe(
      "ORD-261128-0001 at 10:00, ORD-261128-0002 at 10:00, ORD-261128-0003 at 10:00 and 2 more",
    );
  });
});
