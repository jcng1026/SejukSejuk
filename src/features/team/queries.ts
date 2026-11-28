import "server-only";

import { listTechnicians, type Technician } from "@/features/orders/queries";
import { createClient } from "@/lib/supabase/server";

const OPEN_JOB_LIMIT = 2000;

export interface TeamMember extends Technician {
  openJobs: number;
}

/** Technicians with their open (Assigned / In progress) job counts, active first. */
export async function listTeam(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const [technicians, open] = await Promise.all([
    listTechnicians(),
    supabase
      .from("orders")
      .select("technician_id")
      .in("status", ["assigned", "in_progress"])
      .limit(OPEN_JOB_LIMIT),
  ]);
  if (open.error) throw new Error(`Could not load open jobs: ${open.error.message}`);
  const counts = new Map<string, number>();
  for (const row of open.data) {
    if (row.technician_id) counts.set(row.technician_id, (counts.get(row.technician_id) ?? 0) + 1);
  }
  return technicians
    .map((technician) => ({ ...technician, openJobs: counts.get(technician.id) ?? 0 }))
    .toSorted((a, b) => Number(b.isActive) - Number(a.isActive));
}
