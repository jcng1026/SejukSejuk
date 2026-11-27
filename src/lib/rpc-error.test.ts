import { describe, expect, it } from "vitest";

import { mapRpcError } from "./rpc-error";

describe("mapRpcError", () => {
  it("reads our CODE: message prefix", () => {
    expect(mapRpcError({ code: "P0001", message: "VALIDATION: Reason is required" })).toEqual({
      code: "VALIDATION",
      message: "Reason is required",
    });
    expect(
      mapRpcError({ code: "P0001", message: "INVALID_TRANSITION: Order is job_done" }),
    ).toEqual({
      code: "INVALID_TRANSITION",
      message: "Order is job_done",
    });
  });

  it("turns permission errors into FORBIDDEN without leaking internals", () => {
    expect(
      mapRpcError({ code: "42501", message: "permission denied for function create_order" }),
    ).toEqual({
      code: "FORBIDDEN",
      message: "You don't have permission to do this.",
    });
  });

  it("turns constraint violations into a generic VALIDATION message", () => {
    expect(
      mapRpcError({ code: "23514", message: 'violates check constraint "orders_x"' }).code,
    ).toBe("VALIDATION");
  });

  it("never passes unknown database messages through to users", () => {
    const mapped = mapRpcError({ code: "XX000", message: "relation secret_table does not exist" });
    expect(mapped).toEqual({ code: "INTERNAL", message: "Something went wrong. Try again." });
  });

  it("ignores lookalike prefixes that aren't our codes", () => {
    expect(mapRpcError({ code: "P0001", message: "SECRET: dump" }).code).toBe("INTERNAL");
  });
});
