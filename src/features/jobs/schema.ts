import { z } from "zod";

import { parseRinggitToSen } from "@/features/orders/money";
import { MAX_AMOUNT_SEN } from "@/features/orders/schema";

const PAYMENT_METHODS = ["cash", "transfer", "card", "qr"] as const;

function amount(label: string, { allowZero }: { allowZero: boolean }) {
  return z.string().transform((value, ctx) => {
    const trimmed = value.trim();
    if (allowZero && trimmed === "") return 0;
    const sen = parseRinggitToSen(trimmed);
    if (sen === null || sen > MAX_AMOUNT_SEN || (!allowZero && sen === 0)) {
      ctx.addIssue({ code: "custom", message: `Enter the ${label} in RM, e.g. 120 or 120.50.` });
      return z.NEVER;
    }
    return sen;
  });
}

/** Completion form → complete_job arguments. The order id scopes the receipt path. */
export function completeJobSchema(orderId: string) {
  return z
    .object({
      workDone: z.string().trim().min(1, { error: "Describe the work done." }).max(2000),
      extra: amount("extra charges", { allowZero: true }),
      remarks: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .transform((value) => value || null),
      paymentReceived: z.literal("on").optional(),
      paymentAmount: z.string().optional(),
      paymentMethod: z.string().optional(),
      receiptPath: z.string().optional(),
    })
    .superRefine(
      (form, ctx) => {
        if (!form.paymentReceived) return;
        const paidSen = parseRinggitToSen(form.paymentAmount ?? "");
        if (paidSen === null || paidSen === 0 || paidSen > MAX_AMOUNT_SEN) {
          ctx.addIssue({
            code: "custom",
            path: ["paymentAmount"],
            message: "Enter the amount received.",
          });
        }
        if (!(PAYMENT_METHODS as readonly string[]).includes(form.paymentMethod ?? "")) {
          ctx.addIssue({
            code: "custom",
            path: ["paymentMethod"],
            message: "Choose how the customer paid.",
          });
        }
        if (form.receiptPath && !form.receiptPath.startsWith(`orders/${orderId}/`)) {
          ctx.addIssue({
            code: "custom",
            path: ["receiptPath"],
            message: "Upload the receipt again.",
          });
        }
        // `when` runs these checks even if other fields failed, so every error shows at once.
      },
      { when: () => true },
    )
    .transform((form) => ({
      workDone: form.workDone,
      extraSen: form.extra,
      remarks: form.remarks,
      payment: form.paymentReceived
        ? {
            amountSen: parseRinggitToSen(form.paymentAmount ?? "") as number,
            method: form.paymentMethod as (typeof PAYMENT_METHODS)[number],
            receiptPath: form.receiptPath || null,
          }
        : null,
    }));
}
