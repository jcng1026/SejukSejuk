import { JobRow } from "@/features/jobs/JobCards";
import { listUpcomingJobs } from "@/features/jobs/queries";
import { requireUser } from "@/lib/auth";

export default async function TechnicianUpcomingPage() {
  await requireUser(["technician"]);
  const jobs = await listUpcomingJobs();
  return (
    <>
      <h1 className="text-3xl">Upcoming</h1>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground">No jobs scheduled after today.</p>
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
