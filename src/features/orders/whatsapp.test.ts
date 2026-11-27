import { describe, expect, it } from "vitest";

import { technicianJobMessage, whatsappLink } from "./whatsapp";

describe("whatsappLink", () => {
  it("builds a wa.me deep link with the message URL-encoded", () => {
    expect(whatsappLink("60123456789", "Hi Ali & team\nJob #1")).toBe(
      "https://wa.me/60123456789?text=Hi%20Ali%20%26%20team%0AJob%20%231",
    );
  });

  it("refuses numbers that are not stored in 60XXXXXXXXX form", () => {
    expect(() => whatsappLink("012-345 6789", "x")).toThrow();
  });
});

describe("technicianJobMessage", () => {
  it("tells the technician what, where and when, in Malaysia time", () => {
    const message = technicianJobMessage({
      technicianName: "Ali",
      orderNo: "ORD-261127-0001",
      serviceType: "Repair",
      customerName: "Ahmad",
      customerPhone: "60123456789",
      address: "No. 12, Jalan Sejuk, Shah Alam",
      scheduledAt: "2026-11-27T02:00:00.000Z",
    });
    expect(message).toBe(
      [
        "Hi Ali, new job assigned:",
        "ORD-261127-0001 – Repair",
        "When: Fri 27/11/2026, 10:00",
        "Customer: Ahmad (012-345 6789)",
        "Address: No. 12, Jalan Sejuk, Shah Alam",
      ].join("\n"),
    );
  });
});
