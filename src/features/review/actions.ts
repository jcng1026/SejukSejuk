"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reasonSchema } from "@/features/orders/schema";
import { formValues, guardRecord, rpcFailure, validationFailure } from "@/lib/action-helpers";
import type { FormState, Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const noteSchema = z.string().trim().max(500, { error: "Keep the note under 500 characters." });

const guard = (orderId: unknown) => guardRecord(orderId, "Order not found.");

function refresh(orderId: string): void {
  revalidatePath("/review");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function approveOrderAction(orderId: string): Promise<Result<null>> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_order", {
    p_order_id: orderId,
    p_decision: "approve",
  });
  if (error) return rpcFailure("review_order", error);
  refresh(orderId);
  return { ok: true, data: null };
}

export async function sendBackOrderAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const reason = reasonSchema.safeParse(formValues(formData).reason ?? "");
  if (!reason.success) return validationFailure({ reason: "Say what needs redoing." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_order", {
    p_order_id: orderId,
    p_decision: "send_back",
    p_reason: reason.data,
  });
  if (error) return rpcFailure("review_order", error);
  refresh(orderId);
  return { ok: true, data: { message: "Sent back to the technician." } };
}

export async function closeOrderAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const note = noteSchema.safeParse(formValues(formData).note ?? "");
  if (!note.success) return validationFailure({ note: note.error.issues[0].message });
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_order", {
    p_order_id: orderId,
    p_note: note.data || null,
  });
  if (error) {
    const failure = rpcFailure("close_order", error);
    // The database asks for a note when payment is short; show it on the field.
    return failure.error.code === "VALIDATION"
      ? validationFailure({ note: failure.error.message })
      : failure;
  }
  refresh(orderId);
  return { ok: true, data: { message: "Order closed." } };
}
