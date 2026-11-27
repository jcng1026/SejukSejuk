"use client";

import { errorProps, FormField, SELECT_CLASS } from "./FormField";
import type { Technician, TechnicianJobSlot } from "./queries";
import { findClashes } from "./schedule";

const CLASH_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface TechnicianPickerProps {
  id: string;
  technicians: Technician[];
  load: TechnicianJobSlot[];
  /** The job's start time; clashes are checked against it. */
  candidateIso: string | null;
  value: string;
  onChange: (technicianId: string) => void;
  error?: string;
  isLoading?: boolean;
  emptyOption: string;
  /** Excluded, e.g. the technician already on the job when reassigning. */
  excludeId?: string | null;
}

/** Technician select with each person's job count that day and a ±2 h clash warning (FR-ORD-6). */
export function TechnicianPicker({
  id,
  technicians,
  load,
  candidateIso,
  value,
  onChange,
  error,
  isLoading = false,
  emptyOption,
  excludeId,
}: TechnicianPickerProps) {
  const jobsFor = (technicianId: string) =>
    load.filter((slot) => slot.technicianId === technicianId);
  const clashes = value && candidateIso ? findClashes(jobsFor(value), candidateIso) : [];
  const clashText = clashes
    .map((c) => `${c.orderNo} at ${CLASH_TIME.format(new Date(c.scheduledAt))}`)
    .join(", ");
  let status = "Job counts are for the job's date.";
  if (isLoading) status = "Checking schedules…";
  else if (clashes.length > 0) status = `Clash: ${clashText} — you can still assign.`;

  return (
    <FormField
      id={id}
      label="Technician"
      error={error}
      hint={
        // One always-mounted live region, so changes in its text are announced.
        <span
          role="status"
          className={clashes.length > 0 ? "font-medium text-flag-medium" : undefined}
        >
          {status}
        </span>
      }
    >
      <select
        id={id}
        name="technicianId"
        className={SELECT_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...errorProps(id, error, true)}
      >
        <option value="">{emptyOption}</option>
        {technicians
          .filter((tech) => tech.isActive && tech.id !== excludeId)
          .map((tech) => {
            const count = jobsFor(tech.id).length;
            return (
              <option key={tech.id} value={tech.id}>
                {tech.fullName} · {count} {count === 1 ? "job" : "jobs"}
              </option>
            );
          })}
      </select>
    </FormField>
  );
}
