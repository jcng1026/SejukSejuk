import { describe, expect, it } from "vitest";

import { auditQuery, changedFields, parseAuditFilters } from "./filters";

const ID = "00000000-0000-4000-8000-000000000003";

describe("parseAuditFilters", () => {
  it("keeps valid filters", () => {
    expect(
      parseAuditFilters({
        table: "orders",
        action: "UPDATE",
        actor: ID,
        via: "ai",
        order: " ord-261128-0001 ",
        from: "2026-11-01",
        to: "2026-11-30",
        page: "3",
      }),
    ).toEqual({
      table: "orders",
      action: "UPDATE",
      actorId: ID,
      via: "ai",
      orderNo: "ORD-261128-0001",
      from: "2026-11-01",
      to: "2026-11-30",
      page: 3,
    });
  });

  it("drops anything unknown or malformed", () => {
    expect(
      parseAuditFilters({
        table: "pg_shadow",
        action: "TRUNCATE",
        actor: "nope",
        via: "x",
        order: "ORD-1; drop",
        from: "2026-13-01",
        page: "-2",
      }),
    ).toEqual({ page: 1 });
  });

  it("caps the page number", () => {
    expect(parseAuditFilters({ page: "999999" }).page).toBe(1000);
  });
});

describe("auditQuery", () => {
  it("round-trips through parseAuditFilters, leaving out page 1", () => {
    const filters = parseAuditFilters({ table: "flags", from: "2026-11-01", page: "2" });
    const query = auditQuery(filters, { page: 1 });
    expect(query).toBe("?table=flags&from=2026-11-01");
    expect(parseAuditFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual({
      ...filters,
      page: 1,
    });
  });
});

describe("changedFields", () => {
  it("lists the fields an update changed, ignoring bookkeeping timestamps", () => {
    expect(
      changedFields(
        { status: "assigned", technician_id: "a", updated_at: "1", reschedule_count: 0 },
        { status: "in_progress", technician_id: "a", updated_at: "2", reschedule_count: 0 },
      ),
    ).toEqual(["status"]);
  });

  it("treats nested values by content and handles inserts and deletes", () => {
    expect(changedFields({ payload: { n: 1 } }, { payload: { n: 1 } })).toEqual([]);
    expect(changedFields(null, { a: 1, b: 2 })).toEqual(["a", "b"]);
    expect(changedFields({ a: 1 }, null)).toEqual(["a"]);
  });
});
