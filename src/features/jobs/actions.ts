"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fieldErrors } from "@/features/orders/schema";
import { formValues, guardRecord, rpcFailure, validationFailure } from "@/lib/action-helpers";
import { fail, type FormState, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { completeJobSchema } from "./schema";

const guard = (orderId: unknown) => guardRecord(orderId, "Job not found.");

function refresh(orderId: string): void {
  revalidatePath("/tech");
  revalidatePath(`/tech/jobs/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

export async function startJobAction(orderId: string): Promise<Result<null>> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_job", { p_order_id: orderId });
  if (error) return rpcFailure("start_job", error);
  refresh(orderId);
  return { ok: true, data: null };
}

/**
 * Records a file the browser has just uploaded to this job's Storage folder.
 * Type and size are read from Storage by the database, not taken from here.
 */
export async function registerAttachmentAction(
  orderId: string,
  path: string,
): Promise<Result<{ id: string }>> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  if (typeof path !== "string" || !path.startsWith(`orders/${orderId}/`)) {
    return fail("VALIDATION", "Upload the file again.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("register_attachment", { p_order_id: orderId, p_storage_path: path })
    .single<{ id: string }>();
  if (error) return rpcFailure("register_attachment", error);
  return { ok: true, data };
}

export async function completeJobAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const parsed = completeJobSchema(orderId).safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));

  const input = parsed.data;
  const supabase = await createClient();
  // Technician name and completion time are stamped by the database, never sent from here.
  const { error } = await supabase.rpc("complete_job", {
    p_order_id: orderId,
    p_work_done: input.workDone,
    p_extra_sen: input.extraSen,
    p_remarks: input.remarks,
    p_payment_amount_sen: input.payment?.amountSen ?? null,
    p_payment_method: input.payment?.method ?? null,
    p_payment_receipt_path: input.payment?.receiptPath ?? null,
  });
  if (error) return rpcFailure("complete_job", error);

  refresh(orderId);
  redirect(`/tech/jobs/${orderId}?done=1`);
}
