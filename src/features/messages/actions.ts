"use server";

import { guardRecord, rpcFailure } from "@/lib/action-helpers";
import type { Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Records that the WhatsApp link was opened to send the message (FR-NOT-2). */
export async function markWhatsAppSentAction(messageId: string): Promise<Result<null>> {
  const blocked = await guardRecord(messageId, "Message not found.");
  if (blocked) return blocked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_whatsapp_sent", { p_message_id: messageId });
  if (error) return rpcFailure("mark_whatsapp_sent", error);
  return { ok: true, data: null };
}
