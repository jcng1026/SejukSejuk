"use server";

import { revalidatePath } from "next/cache";

import { guardRecord, rpcFailure } from "@/lib/action-helpers";
import { fail, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Manager deactivates or reactivates a technician (FR-USR). The database refuses open jobs. */
export async function setTechnicianActiveAction(
  profileId: string,
  active: unknown,
): Promise<Result<null>> {
  const blocked = await guardRecord(profileId, "Technician not found.");
  if (blocked) return blocked;
  if (typeof active !== "boolean") return fail("VALIDATION", "Choose active or inactive.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_technician_active", {
    p_profile_id: profileId,
    p_active: active,
  });
  if (error) return rpcFailure("set_technician_active", error);
  revalidatePath("/team");
  revalidatePath("/orders/new");
  return { ok: true, data: null };
}
