import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { phoneDigits, sanitizeSearch } from "./search";

describe("sanitizeSearch", () => {
  it("keeps names, order numbers and phone fragments", () => {
    expect(sanitizeSearch("  Mei Ling ")).toBe("Mei Ling");
    expect(sanitizeSearch("ORD-261127-0012")).toBe("ORD-261127-0012");
    expect(sanitizeSearch("Siti Nurhaliza")).toBe("Siti Nurhaliza");
  });

  it("strips characters that could add PostgREST filter clauses", () => {
    expect(sanitizeSearch("x),status.eq.closed,(id.neq.0")).toBe("xstatuseqclosedidneq0");
    expect(sanitizeSearch("a*b'c\"d")).toBe("abcd");
  });

  it("never outputs filter syntax characters, for any input", () => {
    // fullUnicode covers non-ASCII letters too; % and _ are LIKE wildcards.
    fc.assert(
      fc.property(
        fc.string({ unit: "binary" }),
        (input) => !/[,()*.:%_'"\\]/.test(sanitizeSearch(input)),
      ),
    );
  });
});

describe("phoneDigits", () => {
  it("drops the leading 0 or 60 so it matches stored numbers", () => {
    expect(phoneDigits("012-345 6789")).toBe("123456789");
    expect(phoneDigits("+60 12 345")).toBe("12345");
  });
});
