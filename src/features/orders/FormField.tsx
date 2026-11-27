import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}

/** Label + control + hint/error. Pair the control with `fieldProps` to link them. */
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

/** aria-invalid plus aria-describedby pointing at the error, or the hint when there is one. */
export function errorProps(id: string, error?: string, hasHint = false) {
  if (error) return { "aria-invalid": true, "aria-describedby": `${id}-error` };
  return hasHint ? { "aria-describedby": `${id}-hint` } : {};
}

export const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
