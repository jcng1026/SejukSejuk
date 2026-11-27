import type { ReactNode } from "react";

import { FlagChip, StatusBadge } from "./badges";
import { PAYMENT_METHOD_LABEL, topOpenSeverity } from "./labels";
import { formatSen } from "./money";
import type { OrderDetail } from "./order-detail";
import { formatPhone } from "./phone";
import { formatMytWhen } from "./schedule";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OrderHeader({ order }: { order: OrderDetail }) {
  const severity = topOpenSeverity(order.flags);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-mono text-2xl font-bold">{order.orderNo}</h1>
      <StatusBadge status={order.status} />
      {severity && <FlagChip severity={severity}>Open {severity} flag</FlagChip>}
    </div>
  );
}

export function OrderDetailView({ order }: { order: OrderDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <Section title="Customer">
          <dl className="flex flex-col gap-2">
            <Row label="Name">{order.customerName}</Row>
            <Row label="Phone">{formatPhone(order.customerPhone)}</Row>
            <Row label="Address">{order.customerAddress}</Row>
          </dl>
        </Section>

        <Section title="Job">
          <dl className="flex flex-col gap-2">
            <Row label="Service">{order.serviceType}</Row>
            <Row label="Problem">{order.problemDescription}</Row>
            <Row label="Scheduled">
              {formatMytWhen(order.scheduledAt)}
              {order.rescheduleCount > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · rescheduled {order.rescheduleCount}×
                </span>
              )}
            </Row>
            <Row label="Quoted">{formatSen(order.quotedSen)}</Row>
            {order.adminNotes && <Row label="Admin notes">{order.adminNotes}</Row>}
          </dl>
        </Section>

        {order.completion && (
          <Section title="Completion">
            <dl className="flex flex-col gap-2">
              <Row label="Work done">{order.completion.workDone}</Row>
              <Row label="Extra charges">{formatSen(order.completion.extraSen)}</Row>
              <Row label="Final amount">
                <span className="font-semibold">{formatSen(order.completion.finalSen)}</span>
              </Row>
              {order.completion.remarks && <Row label="Remarks">{order.completion.remarks}</Row>}
              <Row label="Completed">{formatMytWhen(order.completion.completedAt)}</Row>
              <Row label="Payment">
                {order.payment
                  ? `${formatSen(order.payment.amountSen)} · ${PAYMENT_METHOD_LABEL[order.payment.method] ?? order.payment.method}`
                  : "Not recorded"}
              </Row>
            </dl>
          </Section>
        )}

        {order.attachments.length > 0 && (
          <Section title={`Files (${order.attachments.length})`}>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {order.attachments.map((file, index) => (
                <li key={file.id}>
                  {file.url ? (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square overflow-hidden rounded-xl border"
                    >
                      {file.mime.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                        <img
                          src={file.url}
                          alt={`Attachment ${index + 1}`}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-xs">
                          Open file
                        </span>
                      )}
                    </a>
                  ) : (
                    <span className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                      Demo file
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Section title="Assignment">
          <dl className="flex flex-col gap-2">
            <Row label="Technician">{order.technician?.fullName ?? "Unassigned"}</Row>
            <Row label="Assigned by">{order.assignedBy ?? "—"}</Row>
            <Row label="Created by">{order.createdBy ?? "—"}</Row>
          </dl>
        </Section>

        {order.flags.length > 0 && (
          <Section title="Flags">
            <ul className="flex flex-col gap-2 text-sm">
              {order.flags.map((flag) => (
                <li key={flag.id} className="flex flex-col gap-1">
                  {flag.status === "open" ? (
                    <FlagChip severity={flag.severity} />
                  ) : (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-flag-resolved-soft px-2.5 py-0.5 text-xs font-semibold text-flag-resolved">
                      ✓ Resolved
                    </span>
                  )}
                  <span>{flag.message}</span>
                  <span className="text-xs text-muted-foreground">
                    {flag.source === "auto"
                      ? "Raised automatically"
                      : `Raised by ${flag.raisedBy ?? "staff"}`}{" "}
                    · {formatMytWhen(flag.raisedAt)}
                  </span>
                  {flag.resolvedAt && (
                    <span className="text-xs text-muted-foreground">
                      Resolved by {flag.resolvedBy ?? "staff"} · {formatMytWhen(flag.resolvedAt)}
                      {flag.resolutionNote && <>: “{flag.resolutionNote}”</>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="History">
          <ol className="flex flex-col gap-3 border-l-2 border-border pl-4 text-sm">
            {order.timeline.map((entry) => (
              <li key={entry.id} className="flex flex-col">
                <span>
                  <span className="font-semibold">{entry.actorName}</span>{" "}
                  {entry.description.charAt(0).toLowerCase()}
                  {entry.description.slice(1)}
                </span>
                {entry.reason && <span className="text-muted-foreground">“{entry.reason}”</span>}
                <time dateTime={entry.at} className="text-xs text-muted-foreground">
                  {formatMytWhen(entry.at)}
                </time>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
