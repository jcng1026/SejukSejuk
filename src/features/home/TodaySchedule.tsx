import Link from "next/link";

import { StatusLegend } from "@/features/orders/badges";
import type { OrderStatus } from "@/features/orders/labels";
import { mytParts } from "@/features/orders/schedule";

import type { ScheduledJob } from "./queries";
import { axisFor, axisHours, nowPosition, placeJob, type Axis } from "./timeline";

const STATUS_BORDER: Record<OrderStatus, string> = {
  new: "border-status-new",
  assigned: "border-status-assigned",
  in_progress: "border-status-in-progress",
  job_done: "border-status-job-done",
  reviewed: "border-status-reviewed",
  closed: "border-status-closed",
};

function JobBlock({ job, axis }: { job: ScheduledJob; axis: Axis }) {
  const { leftPct, widthPct } = placeJob(job.scheduledAt, axis);
  if (widthPct === 0) return null;
  const border = job.topFlag === "high" ? "border-flag-high" : STATUS_BORDER[job.status];
  return (
    <Link
      href={`/orders/${job.id}`}
      title={`${job.orderNo} · ${job.customerName} · ${mytParts(job.scheduledAt).time}`}
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      className={`absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded-lg border-l-4 bg-card px-2 text-xs font-semibold whitespace-nowrap shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${border}`}
    >
      {job.topFlag === "high" && (
        <span aria-label="High flag" className="text-flag-high">
          ⚑
        </span>
      )}
      <span className="truncate">
        {mytParts(job.scheduledAt).time} {job.serviceType}
      </span>
    </Link>
  );
}

function Lane({ label, jobs, now, axis, hatched = false }: LaneProps) {
  return (
    <>
      <span className="truncate pt-2.5 text-sm font-semibold">{label}</span>
      <div
        role="list"
        aria-label={`${label}: ${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
        className={`relative h-10 rounded-xl ${hatched ? "bg-[repeating-linear-gradient(45deg,var(--background)_0_8px,var(--sand)_8px_16px)]" : "bg-background"}`}
      >
        {now !== null && (
          <div
            aria-hidden="true"
            className="absolute -inset-y-1 w-0.5 bg-flag-high"
            style={{ left: `${now}%` }}
          />
        )}
        {jobs.map((job) => (
          <div role="listitem" key={job.id}>
            <JobBlock job={job} axis={axis} />
          </div>
        ))}
      </div>
    </>
  );
}

interface LaneProps {
  label: string;
  jobs: ScheduledJob[];
  now: number | null;
  axis: Axis;
  hatched?: boolean;
}

/** Technician × hour view of today (mockup C2), with a red "now" line. */
export function TodaySchedule({
  technicians,
  jobs,
  now,
}: {
  technicians: { id: string; name: string }[];
  jobs: ScheduledJob[];
  now: Date;
}) {
  const axis = axisFor(jobs.map((job) => job.scheduledAt));
  const nowPct = nowPosition(now, axis);
  const unassigned = jobs.filter((job) => job.technicianId === null);
  return (
    <section aria-labelledby="schedule-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="schedule-heading" className="text-lg">
          Today&apos;s schedule
        </h2>
        <StatusLegend />
      </div>
      <div className="overflow-x-auto overflow-y-hidden py-1">
        <div className="grid min-w-[40rem] grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2">
          <span />
          <div aria-hidden="true" className="flex text-xs text-muted-foreground">
            {axisHours(axis).map((hour) => (
              <span key={hour} className="flex-1">
                {hour}
              </span>
            ))}
          </div>
          {technicians.map((technician) => (
            <Lane
              key={technician.id}
              label={technician.name}
              jobs={jobs.filter((job) => job.technicianId === technician.id)}
              now={nowPct}
              axis={axis}
            />
          ))}
          <Lane label="Unassigned" jobs={unassigned} now={nowPct} axis={axis} hatched />
        </div>
      </div>
    </section>
  );
}
