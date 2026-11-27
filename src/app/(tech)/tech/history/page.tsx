import { JobRow } from "@/features/jobs/JobCards";
import { listHistoryJobs } from "@/features/jobs/queries";
import { requireUser } from "@/lib/auth";

export default async function TechnicianHistoryPage() {
  await requireUser(["technician"]);
  const jobs = await listHistoryJobs();
  return (
    <>
      <h1 className="text-3xl">History</h1>
      <p className="text-sm text-muted-foreground">Your 30 most recent completed jobs.</p>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground">No completed jobs yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} showDate />
          ))}
        </ul>
      )}
    </>
  );
}
