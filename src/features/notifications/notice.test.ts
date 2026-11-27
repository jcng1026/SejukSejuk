import { describe, expect, it } from "vitest";

import { toNotice, type NotificationRow } from "./notice";

const base: NotificationRow = {
  id: "n1",
  order_id: null,
  type: "jobs_done",
  severity: null,
  payload: { count: 12 },
  created_at: "2026-11-28T02:00:00Z",
  read_at: null,
};

describe("toNotice", () => {
  it("groups completions into one daily line linking to the review queue", () => {
    expect(toNotice(base)).toMatchObject({
      text: "12 jobs completed today",
      href: "/review",
      isHigh: false,
      isUnread: true,
    });
  });

  it("uses the singular for one completion", () => {
    expect(toNotice({ ...base, payload: { count: 1 } }).text).toBe("1 job completed today");
  });

  it("shows a High flag individually, linking to its order", () => {
    const notice = toNotice({
      ...base,
      type: "flag",
      severity: "high",
      order_id: "o1",
      payload: { order_no: "ORD-261128-0001", message: "Final amount is over the quote" },
      read_at: "2026-11-28T03:00:00Z",
    });
    expect(notice).toEqual({
      id: "n1",
      text: "High flag on ORD-261128-0001: Final amount is over the quote",
      href: "/orders/o1",
      isHigh: true,
      isUnread: false,
      createdAt: "2026-11-28T02:00:00Z",
    });
  });

  it("copes with a malformed payload", () => {
    expect(toNotice({ ...base, payload: null }).text).toBe("1 job completed today");
    expect(toNotice({ ...base, type: "flag", payload: "x" }).text).toBe("High flag on an order");
  });
});
