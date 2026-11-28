import { describe, expect, it } from "vitest";

import { isIsoDate, isUuid } from "./validation";

describe("isIsoDate", () => {
  it("accepts real dates, leap days included", () => {
    expect(isIsoDate("2026-11-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible dates and other shapes", () => {
    for (const bad of [
      "2026-13-01",
      "2026-02-30",
      "2027-02-29",
      "2026-1-5",
      "28/11/2026",
      20261128,
      null,
    ]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
});

describe("isUuid", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000003")).toBe(true);
    expect(isUuid("ORD-261128-0001")).toBe(false);
  });
});
