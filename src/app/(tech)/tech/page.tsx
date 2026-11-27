import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DayRing, JobRow, NextJobCard } from "@/features/jobs/JobCards";
import { listTodayJobs } from "@/features/jobs/queries";
import { requireUser } from "@/lib/auth";

const DONE = new Set(["job_done", "reviewed", "closed"]);

export default async function TechnicianTodayPage() {
  const user = await requireUser(["technician"]);
  const jobs = await listTodayJobs();
  const done = jobs.filter((job) => DONE.has(job.status)).length;
  const open = jobs.filter((job) => !DONE.has(job.status));
  const next = open.find((job) => job.status === "in_progress") ?? open[0];
  const later = open.filter((job) => job !== next);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Today</p>
          <h1 className="text-3xl">Hi {user.fullName}</h1>
        </div>
        <DayRing done={done} total={jobs.length} />
      </div>

      {next ? (
        <NextJobCard job={next} />
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
          {jobs.length > 0 ? "All of today's jobs are done." : "No jobs scheduled for today."}
        </p>
      )}

      {later.length > 0 && (
        <section aria-labelledby="later-heading" className="flex flex-col gap-2">
          <h2 id="later-heading" className="text-sm font-semibold text-muted-foreground">
            Later today
          </h2>
          <ul className="flex flex-col gap-2">
            {later.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </section>
      )}

      {next && (
        <div className="sticky bottom-20 mt-auto">
          <Button asChild size="lg" className="h-14 w-full rounded-full text-base">
            <Link href={`/tech/jobs/${next.id}`}>
              {next.status === "in_progress" ? "Continue job" : "Open job"}
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
