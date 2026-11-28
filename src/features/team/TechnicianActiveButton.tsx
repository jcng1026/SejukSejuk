"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setTechnicianActiveAction } from "./actions";

export function TechnicianActiveButton({
  profileId,
  name,
  isActive,
}: {
  profileId: string;
  name: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    startTransition(async () => {
      const result = await setTechnicianActiveAction(profileId, !isActive);
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={isActive ? "outline" : "default"}
        disabled={isPending}
        onClick={toggle}
        aria-label={`${isActive ? "Deactivate" : "Reactivate"} ${name}`}
        className="rounded-full"
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>
      <p role="alert" className="max-w-64 text-right text-xs text-destructive">
        {error}
      </p>
    </div>
  );
}
