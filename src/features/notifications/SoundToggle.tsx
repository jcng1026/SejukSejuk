"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { setSoundEnabledAction } from "./actions";
import { isSoundEnabled, primeAudio, setSoundEnabled, subscribeSound } from "./sound";

/** Per-user sound switch (FR-NOT-4); also unlocks audio on the first interaction. */
export function SoundToggle({
  initialEnabled,
  className,
}: {
  initialEnabled: boolean;
  /** e.g. a 44px touch target on the technician phone header. */
  className?: string;
}) {
  const isEnabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    setSoundEnabled(initialEnabled);
  }, [initialEnabled]);

  useEffect(() => {
    document.addEventListener("pointerdown", primeAudio);
    document.addEventListener("keydown", primeAudio);
    return () => {
      document.removeEventListener("pointerdown", primeAudio);
      document.removeEventListener("keydown", primeAudio);
    };
  }, []);

  function toggle() {
    const next = !isEnabled;
    setSoundEnabled(next);
    setError("");
    startTransition(async () => {
      const result = await setSoundEnabledAction(next);
      if (!result.ok) {
        setSoundEnabled(!next);
        setError(result.error.message);
      }
    });
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={isEnabled}
        disabled={isPending}
        onClick={toggle}
        className={cn("rounded-full", className)}
      >
        Sound {isEnabled ? "on" : "off"}
      </Button>
      <span role="alert" className="text-xs text-destructive">
        {error}
      </span>
    </span>
  );
}
