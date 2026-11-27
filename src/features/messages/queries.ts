import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface FeedbackMessage {
  id: string;
  link: string;
  sentAt: string | null;
}

/** The current customer feedback message for a finished job, if the trigger made one. */
export async function getFeedbackMessage(orderId: string): Promise<FeedbackMessage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, link, sent_at")
    .eq("order_id", orderId)
    .eq("kind", "feedback")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the feedback message: ${error.message}`);
  return data ? { id: data.id, link: data.link, sentAt: data.sent_at } : null;
}
