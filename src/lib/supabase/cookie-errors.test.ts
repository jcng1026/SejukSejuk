import { describe, expect, it } from "vitest";

import { isReadonlyCookiesError } from "./cookie-errors";

describe("isReadonlyCookiesError", () => {
  it("recognises Next's read-only cookies error", () => {
    const error = new Error(
      "Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs",
    );
    expect(isReadonlyCookiesError(error)).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isReadonlyCookiesError(new Error("Invalid cookie name"))).toBe(false);
    expect(isReadonlyCookiesError(new TypeError("boom"))).toBe(false);
  });

  it("ignores non-Error values", () => {
    expect(isReadonlyCookiesError("Cookies can only be modified in a Server Action")).toBe(false);
    expect(isReadonlyCookiesError(undefined)).toBe(false);
  });
});
