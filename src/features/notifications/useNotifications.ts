"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { toNotice, type Notice, type NotificationRow } from "./notice";
import { playSound } from "./sound";

const LIST_LIMIT = 20;
const COLUMNS = "id, order_id, type, severity, payload, created_at, read_at";
const LIVE_ERROR = "Live updates are unavailable. Reload to try again.";

/** The signed-in user's latest notifications, kept current over Realtime (FR-NOT-3). */
export function useNotifications(userId: string) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let isActive = true;

    async function load() {
      const { data, error: loadError } = await supabase
        .from("notifications")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (!isActive) return;
      if (loadError) {
        setError("Could not load notifications.");
        return;
      }
      setError("");
      setNotices((data as NotificationRow[]).map(toNotice));
    }

    const channel = supabase.channel(`notifications:${userId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      (change) => {
        if (change.eventType === "INSERT" && change.new.severity === "high") {
          playSound("high_flag");
        }
        void load();
      },
    );

    async function connect() {
      // The cookie session reaches Realtime asynchronously; without the user's
      // token the channel joins as anon and RLS hides every row.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("No session for live updates");
      await supabase.realtime.setAuth(data.session.access_token);
      if (!isActive) return;
      channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setError(LIVE_ERROR);
      });
    }

    void load();
    connect().catch(() => {
      if (isActive) setError(LIVE_ERROR);
    });

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  function markAllRead() {
    setNotices((current) => current.map((notice) => ({ ...notice, isUnread: false })));
  }

  return { notices, error, markAllRead };
}
