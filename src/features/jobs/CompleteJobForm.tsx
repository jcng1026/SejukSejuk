"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorProps, FormField } from "@/features/orders/FormField";
import { formatSen, parseRinggitToSen } from "@/features/orders/money";
import type { FormState } from "@/lib/result";

import { completeJobAction } from "./actions";
import { FileGrid } from "./FileGrid";
import { PaymentFields } from "./PaymentFields";
import { useJobUploads } from "./useJobUploads";

interface CompleteJobFormProps {
  orderId: string;
  orderNo: string;
  quotedSen: number;
  technicianName: string;
  alreadyAttached: number;
}

export function CompleteJobForm({
  orderId,
  orderNo,
  quotedSen,
  technicianName,
  alreadyAttached,
}: CompleteJobFormProps) {
  const [state, submit, isSubmitting] = useActionState<FormState, FormData>(
    completeJobAction.bind(null, orderId),
    null,
  );
  const [, startTransition] = useTransition();
  const uploads = useJobUploads(orderId, alreadyAttached);
  const [fileMessage, setFileMessage] = useState("");
  const [extra, setExtra] = useState("");
  const [isReceiptBusy, setIsReceiptBusy] = useState(false);

  const extraSen = extra.trim() === "" ? 0 : parseRinggitToSen(extra);
  const finalSen = quotedSen + (extraSen ?? 0);
  const errors = state && !state.ok ? (state.error.fields ?? {}) : {};
  const formError = state && !state.ok && !state.error.fields ? state.error.message : "";
  // FR-TEC-6: only after every upload has finished (failed files are retried or removed first).
  const blocker =
    uploads.isUploading || isReceiptBusy
      ? "Waiting for uploads…"
      : uploads.hasFailures
        ? "Retry or remove the failed files first"
        : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || blocker) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isSubmitting}
      className="flex flex-col gap-4"
    >
      <h2 className="text-2xl">Complete job</h2>

      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-2xl border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Order</dt>
        <dd className="font-mono">{orderNo}</dd>
        <dt className="text-muted-foreground">Technician</dt>
        <dd>{technicianName}</dd>
        <dt className="text-muted-foreground">Time</dt>
        <dd>Recorded by the server when you submit</dd>
      </dl>

      <FormField id="job-workDone" label="Work done" error={errors.workDone}>
        <Textarea
          id="job-workDone"
          name="workDone"
          rows={3}
          {...errorProps("job-workDone", errors.workDone)}
        />
      </FormField>

      <section aria-label="Amount" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Quoted</span>
          <span>{formatSen(quotedSen)}</span>
        </div>
        <FormField id="job-extra" label="Extra charges (RM)" error={errors.extra}>
          <Input
            id="job-extra"
            name="extra"
            inputMode="decimal"
            placeholder="0.00"
            className="h-11"
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
            {...errorProps("job-extra", errors.extra)}
          />
        </FormField>
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="font-semibold">Final amount</span>
          <output
            htmlFor="job-extra"
            aria-live="polite"
            className="font-heading text-2xl font-extrabold"
          >
            {formatSen(finalSen)}
          </output>
        </div>
      </section>

      <FormField
        id="job-remarks"
        label="Remarks"
        error={errors.remarks}
        hint="Explain any extra charges."
      >
        <Textarea
          id="job-remarks"
          name="remarks"
          rows={2}
          {...errorProps("job-remarks", errors.remarks, true)}
        />
      </FormField>

      <FileGrid uploads={uploads} message={fileMessage} onMessage={setFileMessage} />

      <PaymentFields
        orderId={orderId}
        finalSen={finalSen}
        errors={errors}
        onBusyChange={setIsReceiptBusy}
      />

      <p role="alert" className="text-sm text-destructive">
        {formError}
      </p>
      <div className="sticky bottom-20 flex flex-col gap-1">
        {blocker && <p className="text-center text-sm text-muted-foreground">{blocker}</p>}
        <Button
          type="submit"
          size="lg"
          className="h-14 w-full rounded-full text-base"
          disabled={isSubmitting || blocker !== null}
        >
          {isSubmitting ? "Saving…" : "Mark job done"}
        </Button>
      </div>
    </form>
  );
}
