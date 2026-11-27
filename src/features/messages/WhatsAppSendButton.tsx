"use client";

import { useState, useTransition } from "react";

import { formatMytWhen } from "@/features/orders/schedule";

import { markWhatsAppSentAction } from "./actions";
import type { FeedbackMessage } from "./queries";

/** Opens WhatsApp with the pre-filled feedback request and records the send. */
export function WhatsAppSendButton({ message }: { message: FeedbackMessage }) {
  const [sentAt, setSentAt] = useState(message.sentAt);
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    // The link opens in a new tab; recording the send runs alongside it.
    setError("");
    startTransition(async () => {
      const result = await markWhatsAppSentAction(message.id);
      if (result.ok) setSentAt(new Date().toISOString());
      else setError(`WhatsApp opened, but the send was not recorded: ${result.error.message}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <a
        href={message.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="flex min-h-12 items-center justify-center rounded-full bg-whatsapp px-4 text-sm font-semibold text-white"
      >
        {sentAt ? "Resend feedback request on WhatsApp" : "Send feedback request on WhatsApp"}
      </a>
      <p role="status" className="text-center text-xs text-muted-foreground">
        {sentAt ? `Last sent ${formatMytWhen(sentAt)}` : "Not sent yet"}
      </p>
      <p role="alert" className="text-center text-xs text-destructive">
        {error}
      </p>
    </div>
  );
}
