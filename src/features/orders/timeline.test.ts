import { describe, expect, it } from "vitest";

import { describeAuditEntry } from "./timeline";

const names = new Map([
  ["t-ali", "Ali"],
  ["t-john", "John"],
]);

const entry = (overrides: Partial<Parameters<typeof describeAuditEntry>[0]>) => ({
  tableName: "orders",
  action: "UPDATE",
  before: null,
  after: null,
  ...overrides,
});

describe("describeAuditEntry", () => {
  it("describes creation with the starting assignment", () => {
    expect(
      describeAuditEntry(
        entry({ action: "INSERT", after: { status: "assigned", technician_id: "t-ali" } }),
        names,
      ),
    ).toBe("Created the order and assigned it to Ali");
    expect(
      describeAuditEntry(
        entry({ action: "INSERT", after: { status: "new", technician_id: null } }),
        names,
      ),
    ).toBe("Created the order (unassigned)");
  });

  it("describes status changes in words", () => {
    expect(
      describeAuditEntry(
        entry({ before: { status: "assigned" }, after: { status: "in_progress" } }),
        names,
      ),
    ).toBe("Started the job");
    expect(
      describeAuditEntry(
        entry({ before: { status: "job_done" }, after: { status: "in_progress" } }),
        names,
      ),
    ).toBe("Sent the job back");
  });

  it("describes reassignment and rescheduling", () => {
    expect(
      describeAuditEntry(
        entry({ before: { technician_id: "t-ali" }, after: { technician_id: "t-john" } }),
        names,
      ),
    ).toBe("Reassigned from Ali to John");
    expect(
      describeAuditEntry(
        entry({
          before: { scheduled_at: "2026-11-27T02:00:00Z" },
          after: { scheduled_at: "2026-11-28T06:30:00Z" },
        }),
        names,
      ),
    ).toBe("Rescheduled to Sat 28/11/2026, 14:30");
  });

  it("describes related records", () => {
    expect(describeAuditEntry(entry({ tableName: "payments", action: "INSERT" }), names)).toBe(
      "Recorded a payment",
    );
    expect(describeAuditEntry(entry({ tableName: "flags", action: "INSERT" }), names)).toBe(
      "Raised a flag",
    );
    expect(
      describeAuditEntry(entry({ tableName: "whatsapp_messages", action: "UPDATE" }), names),
    ).toBe("Sent the feedback request on WhatsApp");
  });

  it("falls back to a generic edit description", () => {
    expect(
      describeAuditEntry(
        entry({ before: { customer_name: "A" }, after: { customer_name: "B" } }),
        names,
      ),
    ).toBe("Edited order details");
  });
});
