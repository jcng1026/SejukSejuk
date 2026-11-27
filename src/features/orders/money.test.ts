import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatSen, parseRinggitToSen } from "./money";

const MAX_SEN = 10_000_000_00; // RM 10 million: far above any aircond job

describe("parseRinggitToSen", () => {
  it.each([
    ["250", 25000],
    ["250.5", 25050],
    ["250.50", 25050],
    ["RM 1,200.00", 120000],
    ["rm1200", 120000],
    ["0", 0],
    [" 12.30 ", 1230],
  ])("parses %s as %i sen", (input, expected) => {
    expect(parseRinggitToSen(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12.345", "1.2.3", "1,20", "RM", "  "])("rejects %s", (input) => {
    expect(parseRinggitToSen(input)).toBeNull();
  });

  it("never returns a fraction or a negative number", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const sen = parseRinggitToSen(input);
        return sen === null || (Number.isInteger(sen) && sen >= 0);
      }),
    );
  });
});

describe("formatSen", () => {
  it("formats sen as ringgit with two decimals and thousands separators", () => {
    expect(formatSen(25050)).toBe("RM 250.50");
    expect(formatSen(120000)).toBe("RM 1,200.00");
    expect(formatSen(0)).toBe("RM 0.00");
  });

  it("round-trips exactly: parse(format(x)) === x for every amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_SEN }),
        (sen) => parseRinggitToSen(formatSen(sen)) === sen,
      ),
    );
  });
});
