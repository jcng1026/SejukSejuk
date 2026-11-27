"use client";

import { useEffect } from "react";

import { playSound, type SoundKind } from "./sound";

/** Plays a sound once when it appears, e.g. on the job-done success screen (FR-NOT-4). */
export function PlaySound({ kind }: { kind: SoundKind }) {
  useEffect(() => {
    playSound(kind);
  }, [kind]);
  return null;
}
