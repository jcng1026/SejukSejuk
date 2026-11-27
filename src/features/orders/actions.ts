"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionError, type Failure, type Result } from "@/lib/result";
import { mapRpcError } from "@/lib/rpc-error";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate, isUuid } from "@/lib/validation";

import { technicianDayLoad, type TechnicianJobSlot } from "./queries";
import {
  assignSchema,
  editOrderSchema,
  fieldErrors,
  newOrderSchema,
  rescheduleSchema,
} from "./schema";

export type FormState = Failure | { ok: true; data: { message: string } } | null;

const UNAUTHENTICATED = fail("UNAUTHENTICATED", "Your session has ended. Sign in again.");
const UNKNOWN_ORDER = fail("NOT_FOUND", "Order not found.");

function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
}

function validationFailure(fields: Record<string, string>): Failure {
  return {
    ok: false,
    error: { code: "VALIDATION", message: "Check the highlighted fields.", fields },
  };
}

/** Maps a database error for the user and logs anything unexpected (api-spec §1). */
function rpcFailure(rpc: string, error: { code?: string; message: string }): Failure {
  const mapped: ActionError = mapRpcError(error);
  if (mapped.code === "INTERNAL" || error.code === "42501" || error.code?.startsWith("23")) {
    console.error(`RPC ${rpc} failed`, { code: error.code, message: error.message });
  }
  return { ok: false, error: mapped };
}

/** Technicians' open jobs on a Malaysia date, for the assignment picker. */
export async function dayLoadAction(date: string): Promise<TechnicianJobSlot[]> {
  if (!(await getCurrentUser()) || !isIsoDate(date)) return [];
  return technicianDayLoad(date);
}

export async function createOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  const parsed = newOrderSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));

  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_order", {
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_customer_address: input.customerAddress,
      p_problem_description: input.problemDescription,
      p_service_type_id: input.serviceTypeId,
      p_quoted_sen: input.quotedSen,
      p_scheduled_at: input.scheduledAt,
      p_technician_id: input.technicianId,
      p_admin_notes: input.adminNotes,
    })
    .single<{ id: string }>();
  if (error) return rpcFailure("create_order", error);

  revalidatePath("/orders");
  redirect(`/orders/${data.id}?created=1`);
}

/** Runs a write RPC for one order. RLS and the RPC itself enforce role and state. */
async function runOrderRpc(
  rpc: "update_order" | "assign_order" | "reschedule_order",
  orderId: string,
  args: Record<string, unknown>,
  message: string,
): Promise<Result<{ message: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_order_id: orderId, ...args });
  if (error) return rpcFailure(rpc, error);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, data: { message } };
}

// The bound orderId comes from the browser, so it is checked like any other input.
async function guard(orderId: unknown): Promise<Failure | null> {
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return isUuid(orderId) ? null : UNKNOWN_ORDER;
}

export async function updateOrderAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const parsed = editOrderSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));
  const input = parsed.data;
  return runOrderRpc(
    "update_order",
    orderId,
    {
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_customer_address: input.customerAddress,
      p_problem_description: input.problemDescription,
      p_service_type_id: input.serviceTypeId,
      p_quoted_sen: input.quotedSen,
      p_admin_notes: input.adminNotes,
      p_reason: input.reason,
    },
    "Order updated.",
  );
}

export async function assignOrderAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const parsed = assignSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));
  return runOrderRpc(
    "assign_order",
    orderId,
    { p_technician_id: parsed.data.technicianId, p_reason: parsed.data.reason },
    "Technician assigned.",
  );
}

export async function rescheduleOrderAction(
  orderId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(orderId);
  if (blocked) return blocked;
  const parsed = rescheduleSchema.safeParse(formValues(formData));
  if (!parsed.success) return validationFailure(fieldErrors(parsed.error));
  return runOrderRpc(
    "reschedule_order",
    orderId,
    { p_scheduled_at: parsed.data.scheduledAt, p_reason: parsed.data.reason },
    "Order rescheduled.",
  );
}
