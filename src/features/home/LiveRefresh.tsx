"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { subscribeAsUser } from "@/lib/supabase/realtime";

/** Waits for a burst of changes (e.g. a job done writes several rows) to settle. */
const REFRESH_DELAY_MS = 1500;

/** Re-renders the page when any order changes, so the home board stays live. */
export function LiveRefresh() {
  const router = useRouter();
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let isActive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("home-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
      });
    void subscribeAsUser(
      supabase,
      channel,
      () => setIsLive(false),
      () => isActive,
    );
    return () => {
      isActive = false;
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return isLive ? null : (
    <p role="status" className="text-sm text-muted-foreground">
      Live updates are off. Reload to see the latest.
    </p>
  );
}
