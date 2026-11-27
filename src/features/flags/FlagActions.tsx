"use client";

import { Input } from "@/components/ui/input";
import { ActionDialog } from "@/features/orders/ActionDialog";
import { errorProps, FormField, SELECT_CLASS } from "@/features/orders/FormField";

import { raiseFlagAction, resolveFlagAction } from "./actions";

/** "Raise flag" for admins and managers (FR-FLG-2). */
export function RaiseFlagButton({ orderId }: { orderId: string }) {
  return (
    <ActionDialog
      triggerLabel="Raise flag"
      title="Raise a flag"
      description="Flags are visible to every role on this order."
      submitLabel="Raise flag"
      action={raiseFlagAction.bind(null, orderId)}
    >
      {(errors) => (
        <>
          <FormField id="flag-severity" label="Level" error={errors.severity}>
            <select
              id="flag-severity"
              name="severity"
              defaultValue="medium"
              className={SELECT_CLASS}
              {...errorProps("flag-severity", errors.severity)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </FormField>
          <FormField id="flag-message" label="What's the issue?" error={errors.message}>
            <Input
              id="flag-message"
              name="message"
              placeholder="Customer disputes the final amount"
              {...errorProps("flag-message", errors.message)}
            />
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

/** "Resolve" for one open flag, with a required note (FR-FLG-3). */
export function ResolveFlagButton({ flagId, message }: { flagId: string; message: string }) {
  return (
    <ActionDialog
      triggerLabel="Resolve"
      title="Resolve flag"
      description={message}
      submitLabel="Resolve"
      action={resolveFlagAction.bind(null, flagId)}
    >
      {(errors) => (
        <FormField id="flag-note" label="How was it resolved?" error={errors.note}>
          <Input id="flag-note" name="note" {...errorProps("flag-note", errors.note)} />
        </FormField>
      )}
    </ActionDialog>
  );
}
