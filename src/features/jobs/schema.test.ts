import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/features/orders/schema";

import { completeJobSchema } from "./schema";

const ORDER = "00000000-0000-4000-8000-0000000000aa";

describe("completeJobSchema", () => {
  it("turns the form into complete_job arguments", () => {
    const result = completeJobSchema(ORDER).safeParse({
      workDone: " Chemical wash ",
      extra: "120",
      remarks: "Replaced drain pipe",
      paymentReceived: "on",
      paymentAmount: "370",
      paymentMethod: "qr",
      receiptPath: `orders/${ORDER}/abc-receipt.jpg`,
    });
    expect(result.data).toEqual({
      workDone: "Chemical wash",
      extraSen: 12000,
      remarks: "Replaced drain pipe",
      payment: { amountSen: 37000, method: "qr", receiptPath: `orders/${ORDER}/abc-receipt.jpg` },
    });
  });

  it("treats blank extra charges as zero and no payment as none", () => {
    const result = completeJobSchema(ORDER).safeParse({
      workDone: "Servicing",
      extra: "",
      remarks: "",
    });
    expect(result.data).toEqual({
      workDone: "Servicing",
      extraSen: 0,
      remarks: null,
      payment: null,
    });
  });

  it("requires work done, a valid amount and method when payment is ticked", () => {
    const result = completeJobSchema(ORDER).safeParse({
      workDone: "",
      extra: "-5",
      paymentReceived: "on",
      paymentAmount: "",
      paymentMethod: "bitcoin",
    });
    expect(Object.keys(fieldErrors(result.error!)).sort()).toEqual([
      "extra",
      "paymentAmount",
      "paymentMethod",
      "workDone",
    ]);
  });

  it("treats 0.00 and absurd amounts as missing payment amounts", () => {
    for (const paymentAmount of ["0.00", "0", "RM 5,000,000"]) {
      const result = completeJobSchema(ORDER).safeParse({
        workDone: "x",
        extra: "0",
        paymentReceived: "on",
        paymentAmount,
        paymentMethod: "cash",
      });
      expect(fieldErrors(result.error!).paymentAmount, paymentAmount).toBeDefined();
    }
  });

  it("only accepts a receipt stored in this order's folder", () => {
    const result = completeJobSchema(ORDER).safeParse({
      workDone: "x",
      extra: "0",
      paymentReceived: "on",
      paymentAmount: "10",
      paymentMethod: "cash",
      receiptPath: "orders/00000000-0000-4000-8000-0000000000bb/r.jpg",
    });
    expect(fieldErrors(result.error!).receiptPath).toBeDefined();
  });
});
