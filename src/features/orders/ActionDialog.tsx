"use client";

import { useActionState, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { FormState } from "@/lib/result";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

interface ActionDialogProps {
  triggerLabel: string;
  /** Accessible name when several identical triggers share a page (e.g. "Send back ORD-…"). */
  triggerAriaLabel?: string;
  title: string;
  description: string;
  submitLabel: string;
  action: Action;
  children: (errors: Record<string, string>) => ReactNode;
}

/** A dialog wrapping one Server Action form; closes itself when the action succeeds. */
export function ActionDialog({
  triggerLabel,
  triggerAriaLabel,
  title,
  description,
  ...form
}: ActionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  // A new key each time it opens gives the form fresh state, so old errors never reappear.
  const [openCount, setOpenCount] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setOpenCount((count) => count + 1);
    setIsOpen(next);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full" aria-label={triggerAriaLabel}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogForm key={openCount} {...form} onDone={() => setIsOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface DialogFormProps {
  submitLabel: string;
  action: Action;
  children: (errors: Record<string, string>) => ReactNode;
  onDone: () => void;
}

function DialogForm({ submitLabel, action, children, onDone }: DialogFormProps) {
  const [, startTransition] = useTransition();
  const [state, submit, isPending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result?.ok) onDone();
      return result;
    },
    null,
  );

  const errors = state && !state.ok ? (state.error.fields ?? {}) : {};
  const formError = state && !state.ok && !state.error.fields ? state.error.message : "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-busy={isPending}>
      {children(errors)}
      <p role="alert" className="text-sm text-destructive">
        {formError}
      </p>
      <DialogFooter>
        <Button type="submit" className="rounded-full" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
