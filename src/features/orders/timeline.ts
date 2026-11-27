import { formatMytWhen } from "./schedule";

export interface AuditChange {
  tableName: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const STATUS_STEP: Record<string, string> = {
  "new>assigned": "Assigned the job",
  "assigned>in_progress": "Started the job",
  "in_progress>job_done": "Marked the job done",
  "job_done>reviewed": "Approved the job",
  "job_done>in_progress": "Sent the job back",
  "reviewed>closed": "Closed the order",
};

const RELATED: Record<string, string> = {
  "completions:INSERT": "Recorded the completion",
  "completions:UPDATE": "Updated the completion",
  "payments:INSERT": "Recorded a payment",
  "payments:UPDATE": "Updated the payment",
  "attachments:INSERT": "Uploaded a file",
  "flags:INSERT": "Raised a flag",
  "flags:UPDATE": "Resolved a flag",
};

function name(id: unknown, names: ReadonlyMap<string, string>): string {
  return typeof id === "string" ? (names.get(id) ?? "a technician") : "nobody";
}

/** One plain-English line for an audit_log row, for the order timeline. */
export function describeAuditEntry(entry: AuditChange, names: ReadonlyMap<string, string>): string {
  if (entry.tableName !== "orders") {
    return RELATED[`${entry.tableName}:${entry.action}`] ?? `Changed ${entry.tableName}`;
  }

  const before = entry.before ?? {};
  const after = entry.after ?? {};

  if (entry.action === "INSERT") {
    return after.technician_id
      ? `Created the order and assigned it to ${name(after.technician_id, names)}`
      : "Created the order (unassigned)";
  }

  if (before.status !== undefined && after.status !== undefined && before.status !== after.status) {
    return (
      STATUS_STEP[`${before.status}>${after.status}`] ?? `Changed status to ${String(after.status)}`
    );
  }
  if ("technician_id" in after && before.technician_id !== after.technician_id) {
    return before.technician_id
      ? `Reassigned from ${name(before.technician_id, names)} to ${name(after.technician_id, names)}`
      : `Assigned to ${name(after.technician_id, names)}`;
  }
  if (typeof after.scheduled_at === "string" && before.scheduled_at !== after.scheduled_at) {
    return `Rescheduled to ${formatMytWhen(after.scheduled_at)}`;
  }
  return "Edited order details";
}
