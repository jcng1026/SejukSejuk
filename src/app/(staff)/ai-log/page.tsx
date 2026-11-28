import type { Metadata } from "next";
import { Suspense } from "react";

import { formatMytWhen } from "@/features/orders/schedule";
import { requireUser } from "@/lib/auth";
import { throwLoadError } from "@/lib/load-error";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI log · Sejuk Sejuk Ops" };

const LOG_LIMIT = 100;
const STAGE_LABEL: Record<string, string> = {
  input: "Input screen",
  intent: "Intent check",
  tool: "Tool authorisation",
  output: "Output screen",
};

async function BlockedRequests() {
  await requireUser(["manager"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_blocked_log")
    .select("id, user_id, role, stage, reason, input, created_at")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) throwLoadError("the AI log", error.message);
  const ids = [...new Set(data.flatMap((row) => (row.user_id ? [row.user_id] : [])))];
  const { data: people, error: peopleError } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [], error: null };
  if (peopleError) throwLoadError("people", peopleError.message);
  const names = new Map((people ?? []).map((person) => [person.id, person.full_name]));

  if (data.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-muted-foreground">Nothing blocked yet.</p>
    );
  }
  return (
    <div
      role="region"
      aria-label="Blocked requests table"
      tabIndex={0}
      className="overflow-x-auto rounded-2xl border bg-card"
    >
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-normal">When</th>
            <th className="px-4 py-2 font-normal">Who</th>
            <th className="px-4 py-2 font-normal">Stopped at</th>
            <th className="px-4 py-2 font-normal">Reason</th>
            <th className="px-4 py-2 font-normal">Question</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-t align-top">
              <td className="px-4 py-2 whitespace-nowrap">{formatMytWhen(row.created_at)}</td>
              <td className="px-4 py-2">
                {(row.user_id && names.get(row.user_id)) ?? "Unknown"}
                <span className="block text-xs text-muted-foreground capitalize">{row.role}</span>
              </td>
              <td className="px-4 py-2">{STAGE_LABEL[row.stage] ?? row.stage}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{row.reason}</td>
              {/* Plain text: React escapes it, so a stored attack cannot run here. */}
              <td className="max-w-md px-4 py-2 break-words">{row.input}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AiLogPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Blocked AI requests</h1>
        <p className="text-sm text-muted-foreground">
          Questions the assistant refused, newest first (last {LOG_LIMIT}).
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Loading the log…</p>}>
        <BlockedRequests />
      </Suspense>
    </div>
  );
}
