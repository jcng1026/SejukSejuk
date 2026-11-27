import { describe, expect, it } from "vitest";

import {
  assignSchema,
  fieldErrors,
  newOrderSchema,
  reasonSchema,
  rescheduleSchema,
} from "./schema";

const VALID = {
  customerName: "  Ahmad  ",
  customerPhone: "012-345 6789",
  customerAddress: "No. 12, Jalan Sejuk, Shah Alam",
  problemDescription: "Aircond not cold",
  serviceTypeId: "2",
  quoted: "RM 250",
  date: "2026-11-28",
  time: "10:00",
  technicianId: "00000000-0000-4000-8000-000000000011",
  adminNotes: "",
};

describe("newOrderSchema", () => {
  it("turns form input into exactly what create_order expects", () => {
    const result = newOrderSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      customerName: "Ahmad",
      customerPhone: "60123456789",
      customerAddress: "No. 12, Jalan Sejuk, Shah Alam",
      problemDescription: "Aircond not cold",
      serviceTypeId: 2,
      quotedSen: 25000,
      scheduledAt: "2026-11-28T02:00:00.000Z",
      technicianId: "00000000-0000-4000-8000-000000000011",
      adminNotes: null,
    });
  });

  it("allows leaving the technician unassigned", () => {
    const result = newOrderSchema.safeParse({ ...VALID, technicianId: "" });
    expect(result.data?.technicianId).toBeNull();
  });

  it("reports every invalid field by name, in plain words", () => {
    const result = newOrderSchema.safeParse({
      ...VALID,
      customerName: " ",
      customerPhone: "12345",
      quoted: "two hundred",
      date: "2026-02-30",
    });
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error!);
    expect(Object.keys(errors).sort()).toEqual(["customerName", "customerPhone", "date", "quoted"]);
    expect(errors.customerPhone).toMatch(/012-345 6789/);
  });
});

describe("quoted price limit", () => {
  it("rejects amounts the database integer column could not hold", () => {
    const result = newOrderSchema.safeParse({ ...VALID, quoted: "RM 50,000,000" });
    expect(fieldErrors(result.error!).quoted).toMatch(/too large/);
  });
});

describe("missing service type", () => {
  it("asks the user to choose one instead of showing a type error", () => {
    // A disabled placeholder <option> is not submitted, so the field is absent.
    const result = newOrderSchema.safeParse({ ...VALID, serviceTypeId: undefined });
    expect(fieldErrors(result.error!).serviceTypeId).toBe("Choose a service type.");
  });
});

describe("assignSchema and rescheduleSchema", () => {
  it("require a real technician id", () => {
    expect(assignSchema.safeParse({ technicianId: "' or 1=1", reason: "" }).success).toBe(false);
    expect(
      assignSchema.safeParse({ technicianId: "00000000-0000-4000-8000-000000000011", reason: "" })
        .data,
    ).toEqual({ technicianId: "00000000-0000-4000-8000-000000000011", reason: null });
  });

  it("turn a MYT date, time and reason into the RPC arguments", () => {
    expect(
      rescheduleSchema.safeParse({ date: "2026-11-30", time: "14:30", reason: " Rain " }).data,
    ).toEqual({ scheduledAt: "2026-11-30T06:30:00.000Z", reason: "Rain" });
    const missing = rescheduleSchema.safeParse({ date: "x", time: "", reason: "" });
    expect(Object.keys(fieldErrors(missing.error!)).sort()).toEqual(["date", "reason", "time"]);
  });
});

describe("reasonSchema", () => {
  it("requires a non-blank reason", () => {
    expect(reasonSchema.safeParse("  ").success).toBe(false);
    expect(reasonSchema.safeParse(" Customer asked ").data).toBe("Customer asked");
  });
});
