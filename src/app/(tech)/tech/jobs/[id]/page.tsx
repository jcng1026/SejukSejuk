import { notFound } from "next/navigation";

import { CompleteJobForm } from "@/features/jobs/CompleteJobForm";
import { mapsLink } from "@/features/jobs/JobCards";
import { getTechJob } from "@/features/jobs/queries";
import { StartJobButton } from "@/features/jobs/StartJobButton";
import { StatusBadge } from "@/features/orders/badges";
import { formatSen } from "@/features/orders/money";
import { formatPhone } from "@/features/orders/phone";
import { formatMytWhen } from "@/features/orders/schedule";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

export default async function TechnicianJobPage({
  params,
  searchParams,
}: PageProps<"/tech/jobs/[id]">) {
  const user = await requireUser(["technician"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const job = await getTechJob(id);
  if (!job) notFound();

  return (
    <>
      {query.done === "1" && (
        <p
          role="status"
          className="rounded-2xl bg-flag-resolved-soft p-4 font-semibold text-flag-resolved"
        >
          ✓ Job marked done. Nice work.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">{job.orderNo}</span>
          <StatusBadge status={job.status} />
        </div>
        <h1 className="text-3xl">{job.serviceType}</h1>
        <p className="text-sm text-muted-foreground">{formatMytWhen(job.scheduledAt)}</p>
      </div>

      <section aria-label="Customer" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <p className="font-semibold">{job.customerName}</p>
        <p>{job.customerAddress}</p>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsLink(job.customerAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-full border bg-background text-sm font-semibold"
          >
            Navigate
          </a>
          <a
            href={`tel:+${job.customerPhone}`}
            className="flex min-h-11 items-center justify-center rounded-full border bg-background text-sm font-semibold"
          >
            Call {formatPhone(job.customerPhone)}
          </a>
        </div>
      </section>

      <section
        aria-label="Job details"
        className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm"
      >
        <p>
          <span className="text-muted-foreground">Problem: </span>
          {job.problemDescription}
        </p>
        {job.adminNotes && (
          <p>
            <span className="text-muted-foreground">Notes from the office: </span>
            {job.adminNotes}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Quoted: </span>
          {formatSen(job.quotedSen)}
        </p>
      </section>

      {job.status === "assigned" && <StartJobButton orderId={job.id} />}

      {job.status === "in_progress" && (
        <CompleteJobForm
          orderId={job.id}
          orderNo={job.orderNo}
          quotedSen={job.quotedSen}
          technicianName={user.fullName}
          alreadyAttached={job.attachments.length}
        />
      )}

      {job.completion && (
        <section
          aria-label="Completion"
          className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm"
        >
          <p className="font-semibold">Completed {formatMytWhen(job.completion.completedAt)}</p>
          <p>{job.completion.workDone}</p>
          <p>
            Extra {formatSen(job.completion.extraSen)} · Final{" "}
            <span className="font-semibold">{formatSen(job.finalSen ?? job.quotedSen)}</span>
          </p>
          {job.completion.remarks && (
            <p className="text-muted-foreground">{job.completion.remarks}</p>
          )}
          <p className="text-muted-foreground">{job.attachments.length} file(s) attached</p>
          {job.attachments.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {job.attachments.map((file, index) => (
                <li key={file.id} className="aspect-square overflow-hidden rounded-xl border">
                  {file.url && file.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img
                      src={file.url}
                      alt={`Job file ${index + 1}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <a
                      href={file.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-full items-center justify-center text-xs text-muted-foreground"
                    >
                      {file.url ? "Open file" : "Demo file"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
