"use server";

import { requireSignedIn, rpcFailure } from "@/lib/action-helpers";
import { fail, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Marks every notification of the signed-in user as read (bell opened). */
export async function markNotificationsReadAction(): Promise<Result<null>> {
  const blocked = await requireSignedIn();
  if (blocked) return blocked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) return rpcFailure("mark_notifications_read", error);
  return { ok: true, data: null };
}

/** FR-NOT-4: the per-user sound switch. */
export async function setSoundEnabledAction(enabled: unknown): Promise<Result<null>> {
  const blocked = await requireSignedIn();
  if (blocked) return blocked;
  if (typeof enabled !== "boolean") return fail("VALIDATION", "Choose on or off.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sound_enabled", { p_enabled: enabled });
  if (error) return rpcFailure("set_sound_enabled", error);
  return { ok: true, data: null };
}
