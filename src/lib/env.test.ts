import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./env";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parsePublicEnv", () => {
  it("returns the values when both variables are valid", () => {
    expect(parsePublicEnv(VALID)).toEqual(VALID);
  });

  it("names every missing variable in the error", () => {
    expect(() => parsePublicEnv({})).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("rejects a Supabase URL that is not a URL", () => {
    expect(() => parsePublicEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "localhost" })).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("rejects an empty publishable key", () => {
    expect(() =>
      parsePublicEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
