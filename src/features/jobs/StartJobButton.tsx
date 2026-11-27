"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { startJobAction } from "./actions";

export function StartJobButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleStart() {
    setError("");
    startTransition(async () => {
      const result = await startJobAction(orderId);
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <div className="sticky bottom-20 mt-auto flex flex-col gap-2">
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
      <Button
        size="lg"
        className="h-14 w-full rounded-full text-base"
        onClick={handleStart}
        disabled={isPending}
      >
        {isPending ? "Starting…" : "Start job"}
      </Button>
    </div>
  );
}
