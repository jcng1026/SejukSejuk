"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fieldErrors } from "@/features/orders/schema";
import { formValues, guardRecord, rpcFailure, validationFailure } from "@/lib/action-helpers";
import type { FormState } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const raiseSchema = z.object({
  severity: z.enum(["high", "medium", "low"], { error: "Choose a level." }),
  message: z.string().trim().min(1, { error: "Describe the issue." }).max(300),
});

const resolveSchema = z.object({
  note: z.string().trim().min(1, { error: "Say how it was resolved." }).max(1000),
});

function refresh(orderId?: string): void {
  revalidatePath("/flags");
  revalidatePath("/orders");
  // Resolving knows only the flag id, so refresh every order page.
  if (orderId) revalidatePath(`/orders/${orderId}`);
  else revalidatePath("/orders/[id]", "page");
}

export async function raiseFlagAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guardRecord(orderId, "Order not found.");
  if (blocked) return blocked;
  const parsed = raiseSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("raise_flag", {
    p_order_id: orderId,
    p_severity: parsed.data.severity,
    p_message: parsed.data.message,
  });
  if (error) return rpcFailure("raise_flag", error);
  refresh(orderId);
  return { ok: true, data: { message: "Flag raised." } };
}

export async function resolveFlagAction(
  flagId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guardRecord(flagId, "Flag not found.");
  if (blocked) return blocked;
  const parsed = resolveSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_flag", {
    p_flag_id: flagId,
    p_note: parsed.data.note,
  });
  if (error) return rpcFailure("resolve_flag", error);
  refresh();
  return { ok: true, data: { message: "Flag resolved." } };
}
