import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribes a channel as the signed-in user. The cookie session reaches
 * Realtime asynchronously; without the user's token the channel joins as anon
 * and RLS hides every row. Calls `onFailure` if live updates cannot start.
 */
export async function subscribeAsUser(
  supabase: SupabaseClient,
  channel: RealtimeChannel,
  onFailure: () => void,
  isStillWanted: () => boolean = () => true,
): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("No session for live updates");
    await supabase.realtime.setAuth(data.session.access_token);
  } catch {
    if (isStillWanted()) onFailure();
    return;
  }
  if (!isStillWanted()) return;
  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onFailure();
  });
}
