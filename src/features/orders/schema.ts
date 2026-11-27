import { z } from "zod";

import { parseRinggitToSen } from "./money";
import { normalizeMalaysianPhone } from "./phone";
import { mytDateTimeToIso } from "./schedule";

// One schema per form, shared by the client (instant feedback) and the Server
// Action (authoritative). The database re-checks everything again in the RPC.

const phone = z.string().transform((value, ctx) => {
  const stored = normalizeMalaysianPhone(value);
  if (!stored) {
    ctx.addIssue({ code: "custom", message: "Enter a Malaysian number, e.g. 012-345 6789." });
    return z.NEVER;
  }
  return stored;
});

/** RM 1,000,000: far above any aircond job, well inside the int4 sen columns. */
export const MAX_AMOUNT_SEN = 100_000_000;

const ringgit = z.string().transform((value, ctx) => {
  const sen = parseRinggitToSen(value);
  if (sen === null) {
    ctx.addIssue({ code: "custom", message: "Enter an amount in RM, e.g. 250 or 250.50." });
    return z.NEVER;
  }
  if (sen > MAX_AMOUNT_SEN) {
    ctx.addIssue({ code: "custom", message: "That amount is too large. Check the figure." });
    return z.NEVER;
  }
  return sen;
});

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: `Enter the ${label}.` })
    .max(max, { error: `Keep the ${label} under ${max} characters.` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => value || null);

const customerFields = {
  customerName: required("customer's name", 120),
  customerPhone: phone,
  customerAddress: required("address", 200),
  problemDescription: required("problem description", 2000),
  serviceTypeId: z.coerce
    .number({ error: "Choose a service type." })
    .int()
    .positive({ error: "Choose a service type." }),
  quoted: ringgit,
  adminNotes: optionalText(2000),
};

export const newOrderSchema = z
  .object({
    ...customerFields,
    // Checked per field so their errors show alongside the others; the object
    // transform below only runs once every field is valid.
    date: z.string().refine((date) => mytDateTimeToIso(date, "00:00") !== null, {
      error: "Pick a valid date.",
    }),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Pick a time." }),
    technicianId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  })
  .transform(({ date, time, quoted, ...rest }, ctx) => {
    const scheduledAt = mytDateTimeToIso(date, time);
    if (!scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a valid date and time." });
      return z.NEVER;
    }
    return { ...rest, quotedSen: quoted, scheduledAt };
  });

export type NewOrderInput = z.output<typeof newOrderSchema>;

export const editOrderSchema = z
  .object({ ...customerFields, reason: optionalText(500) })
  .transform(({ quoted, ...rest }) => ({ ...rest, quotedSen: quoted }));

export const reasonSchema = z.string().trim().min(1, { error: "Give a reason." }).max(500);

export const assignSchema = z.object({
  technicianId: z.uuid({ error: "Choose a technician." }),
  reason: optionalText(500),
});

export const rescheduleSchema = z
  .object({
    date: z.string().refine((date) => mytDateTimeToIso(date, "00:00") !== null, {
      error: "Pick a valid date.",
    }),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Pick a time." }),
    reason: reasonSchema,
  })
  .transform(({ date, time, reason }) => ({
    scheduledAt: mytDateTimeToIso(date, time) as string,
    reason,
  }));

/** First message per field, for showing next to each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}
