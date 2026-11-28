import { listCalendarJobs } from "@/features/calendar/queries";

const STATUS_FOR: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
};

/** GET /api/calendar?start=&end=&technician= — scheduled jobs for the calendar (FR-CAL-1). */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const result = await listCalendarJobs(
    { start: params.get("start"), end: params.get("end") },
    params.get("technician") || null,
  );
  const status = result.ok ? 200 : (STATUS_FOR[result.error.code] ?? 500);
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
