import { describe, expect, it } from "vitest";

import { homeFor, isProtectedPath, PUBLIC_PATHS } from "./routes";

describe("homeFor", () => {
  it("sends technicians to the mobile job list and staff to the desktop home", () => {
    expect(homeFor("technician")).toBe("/tech");
    expect(homeFor("admin")).toBe("/home");
    expect(homeFor("manager")).toBe("/home");
  });
});

describe("isProtectedPath", () => {
  it("leaves the login page and the root public", () => {
    for (const path of PUBLIC_PATHS) expect(isProtectedPath(path)).toBe(false);
  });

  it("protects every app area, including nested pages", () => {
    for (const path of [
      "/home",
      "/tech",
      "/tech/jobs/123",
      "/orders",
      "/orders/abc",
      "/dashboard",
    ]) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });

  it("does not treat a lookalike prefix as the login page", () => {
    expect(isProtectedPath("/login-help")).toBe(true);
  });
});
