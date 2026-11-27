import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatPhone, normalizeMalaysianPhone } from "./phone";

describe("normalizeMalaysianPhone", () => {
  it.each([
    ["012-345 6789", "60123456789"],
    ["0123456789", "60123456789"],
    ["+60 12-345 6789", "60123456789"],
    ["60123456789", "60123456789"],
    ["011-2345 6789", "601123456789"],
    ["(03) 5544 3322", "60355443322"],
    ["03-7788 990", "6037788990"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizeMalaysianPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0012345678", "+65 9123 4567", "012-345 6789 ext 2", "6001234567"])(
    "rejects %s",
    (input) => {
      expect(normalizeMalaysianPhone(input)).toBeNull();
    },
  );

  it("always returns a value the database accepts (^60[0-9]{8,10}$) or null", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeMalaysianPhone(input);
        return result === null || /^60[1-9][0-9]{7,9}$/.test(result);
      }),
    );
  });

  it("is idempotent: normalising a normalised number changes nothing", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^0[1-9][0-9]{7,9}$/), (local) => {
        const once = normalizeMalaysianPhone(local);
        return once !== null && normalizeMalaysianPhone(once) === once;
      }),
    );
  });
});

describe("formatPhone", () => {
  it("shows stored numbers the way Malaysians write them", () => {
    expect(formatPhone("60123456789")).toBe("012-345 6789");
    expect(formatPhone("601123456789")).toBe("011-2345 6789");
    expect(formatPhone("60355443322")).toBe("03-5544 3322");
  });

  it("round-trips through normalisation", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^60[1-9][0-9]{7,9}$/), (stored) => {
        return normalizeMalaysianPhone(formatPhone(stored)) === stored;
      }),
    );
  });
});
