"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { errorProps, FormField, SELECT_CLASS } from "@/features/orders/FormField";

import { uploadToJobFolder } from "./useJobUploads";

type ReceiptState =
  | { status: "uploading" }
  | { status: "done"; path: string }
  | { status: "error"; message: string; file: File };

interface PaymentFieldsProps {
  orderId: string;
  finalSen: number;
  errors: Record<string, string>;
  /** Lets the form block submit while a receipt is still uploading. */
  onBusyChange: (isBusy: boolean) => void;
}

/** Optional payment received on site; unticked by default so nothing is logged by accident. */
export function PaymentFields({ orderId, finalSen, errors, onBusyChange }: PaymentFieldsProps) {
  const [isPaid, setIsPaid] = useState(false);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const latest = useRef(0);

  async function uploadReceipt(file: File) {
    const attempt = ++latest.current;
    setReceipt({ status: "uploading" });
    onBusyChange(true);
    try {
      const path = await uploadToJobFolder(orderId, file, "receipt-");
      // A newer pick wins; ignore answers for receipts the user replaced.
      if (attempt === latest.current) setReceipt({ status: "done", path });
    } catch (error) {
      if (attempt === latest.current) {
        setReceipt({
          status: "error",
          file,
          message: error instanceof Error ? error.message : "Receipt upload failed.",
        });
      }
    } finally {
      if (attempt === latest.current) onBusyChange(false);
    }
  }

  function handlePaidChange(checked: boolean) {
    setIsPaid(checked);
    // Suggest the final amount the first time; never overwrite what was typed.
    if (checked && amount === "") setAmount((finalSen / 100).toFixed(2));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <legend className="px-1 font-semibold">Payment</legend>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          name="paymentReceived"
          checked={isPaid}
          onChange={(event) => handlePaidChange(event.target.checked)}
          className="size-5 accent-primary"
        />
        Payment received from customer
      </label>
      {isPaid && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="job-paymentAmount" label="Amount (RM)" error={errors.paymentAmount}>
              <Input
                id="job-paymentAmount"
                name="paymentAmount"
                inputMode="decimal"
                className="h-11"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                {...errorProps("job-paymentAmount", errors.paymentAmount)}
              />
            </FormField>
            <FormField id="job-paymentMethod" label="Method" error={errors.paymentMethod}>
              <select
                id="job-paymentMethod"
                name="paymentMethod"
                defaultValue="cash"
                className={`${SELECT_CLASS} h-11`}
                {...errorProps("job-paymentMethod", errors.paymentMethod)}
              >
                <option value="cash">Cash</option>
                <option value="transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="qr">QR (DuitNow)</option>
              </select>
            </FormField>
          </div>
          <FormField id="job-receipt" label="Receipt photo (optional)" error={errors.receiptPath}>
            <Input
              id="job-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="h-11"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadReceipt(file);
              }}
            />
          </FormField>
          {receipt?.status === "done" && (
            <input type="hidden" name="receiptPath" value={receipt.path} />
          )}
          <p role="status" className="text-sm">
            {receipt?.status === "uploading" && "Uploading receipt…"}
            {receipt?.status === "done" && "Receipt uploaded."}
            {receipt?.status === "error" && (
              <span className="flex items-center gap-2 text-destructive">
                {receipt.message}
                <button
                  type="button"
                  className="min-h-11 rounded-full px-3 font-semibold text-primary underline"
                  onClick={() => void uploadReceipt(receipt.file)}
                >
                  Retry
                </button>
              </span>
            )}
          </p>
        </>
      )}
    </fieldset>
  );
}
