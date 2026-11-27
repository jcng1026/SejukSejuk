"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/orders/ActionDialog";
import { errorProps, FormField } from "@/features/orders/FormField";

import { approveOrderAction, closeOrderAction, sendBackOrderAction } from "./actions";

export function ReviewActions({ orderId, orderNo }: { orderId: string; orderNo: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function approve() {
    setError("");
    startTransition(async () => {
      const result = await approveOrderAction(orderId);
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          onClick={approve}
          disabled={isPending}
          aria-label={`Approve ${orderNo}`}
          className="rounded-full"
        >
          {isPending ? "Approving…" : "Approve"}
        </Button>
        <ActionDialog
          triggerLabel="Send back"
          triggerAriaLabel={`Send back ${orderNo}`}
          title="Send the job back"
          description="The job returns to In Progress for the technician to redo."
          submitLabel="Send back"
          action={sendBackOrderAction.bind(null, orderId)}
        >
          {(errors) => (
            <FormField id="review-reason" label="What needs redoing?" error={errors.reason}>
              <Input
                id="review-reason"
                name="reason"
                {...errorProps("review-reason", errors.reason)}
              />
            </FormField>
          )}
        </ActionDialog>
      </div>
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}

export function CloseOrderButton({
  orderId,
  orderNo,
  isUnderpaid,
}: {
  orderId: string;
  orderNo: string;
  isUnderpaid: boolean;
}) {
  return (
    <ActionDialog
      triggerLabel="Close"
      triggerAriaLabel={`Close ${orderNo}`}
      title="Close order"
      description={
        isUnderpaid
          ? "Recorded payment is below the final amount. Add a settlement note to close."
          : "Payment is settled. Closing finishes this order."
      }
      submitLabel="Close order"
      action={closeOrderAction.bind(null, orderId)}
    >
      {(errors) => (
        <FormField
          id="close-note"
          label={isUnderpaid ? "Settlement note" : "Note (optional)"}
          error={errors.note}
        >
          <Input id="close-note" name="note" {...errorProps("close-note", errors.note)} />
        </FormField>
      )}
    </ActionDialog>
  );
}
