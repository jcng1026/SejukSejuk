import { describe, expect, it } from "vitest";

import { filtersToQuery, parseOrderFilters } from "./filters";

const TECH = "00000000-0000-4000-8000-000000000011";

describe("parseOrderFilters", () => {
  it("keeps valid filters", () => {
    expect(
      parseOrderFilters({
        q: "Ahmad",
        status: "job_done",
        technician: TECH,
        from: "2026-11-01",
        to: "2026-11-30",
        flagged: "1",
        page: "3",
      }),
    ).toEqual({
      q: "Ahmad",
      status: "job_done",
      technicianId: TECH,
      from: "2026-11-01",
      to: "2026-11-30",
      flagged: true,
      page: 3,
    });
  });

  it("drops anything malformed instead of passing it to the query", () => {
    expect(
      parseOrderFilters({
        status: "deleted",
        technician: "1 or 1=1",
        from: "yesterday",
        page: "-2",
        flagged: "yes",
      }),
    ).toEqual({ page: 1, flagged: false });
  });

  it("uses the first value when a param repeats", () => {
    expect(parseOrderFilters({ status: ["new", "closed"] }).status).toBe("new");
  });

  it("caps silly page numbers", () => {
    expect(parseOrderFilters({ page: "99999999999" }).page).toBe(1000);
  });
});

describe("filtersToQuery", () => {
  it("round-trips through the URL and omits defaults", () => {
    const filters = parseOrderFilters({ q: "Lim", status: "new", page: "2" });
    expect(filtersToQuery(filters, { page: 3 })).toBe("?q=Lim&status=new&page=3");
    expect(filtersToQuery(parseOrderFilters({}), {})).toBe("");
  });
});
