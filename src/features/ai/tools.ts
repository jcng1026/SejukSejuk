// Stage 3–4 tools (design §6, api-spec §4): what each role may call, how the
// model's arguments are checked, and how each tool reaches the database.
// Every tool calls a read-only RPC as the signed-in user, so RLS still applies.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Role } from "@/lib/roles";

import { dateRangeSchema, resolveAiRange, type ResolvedRange } from "./date-range";

export interface ToolContext {
  supabase: SupabaseClient;
  role: Role;
  now: Date;
}

export interface Source {
  tool: string;
  period: string | null;
}

export interface ToolOutput {
  /** Structured rows only; the model sees them inside an untrusted_data block. */
  data: unknown;
  source: Source;
}

interface ToolDef<Args> {
  name: string;
  description: string;
  args: z.ZodType<Args>;
  roles: readonly Role[];
  run: (context: ToolContext, args: Args) => Promise<ToolOutput>;
}

const STATUSES = ["new", "assigned", "in_progress", "job_done", "reviewed", "closed"] as const;
const EVERY_ROLE: readonly Role[] = ["technician", "admin", "manager"];
const STAFF: readonly Role[] = ["admin", "manager"];
const MAX_ROWS = 20;

export class ToolFailure extends Error {}

/** Runs a read RPC. Database detail stays in the server log; the model gets a fixed message. */
async function runReadRpc(context: ToolContext, rpc: string, params: object): Promise<unknown[]> {
  const { data, error } = await context.supabase.rpc(rpc, params);
  if (error) {
    console.error(`AI tool ${rpc} failed`, { code: error.code, message: error.message });
    throw new ToolFailure("That data could not be loaded.");
  }
  return (data ?? []) as unknown[];
}

function period(range: ResolvedRange) {
  return { p_from: range.from, p_to: range.to };
}

/** Staff may name a technician; the model only ever knows names, never ids. */
async function technicianId(
  context: ToolContext,
  name: string | undefined,
): Promise<string | null> {
  if (!name || context.role === "technician") return null;
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id")
    .eq("role", "technician")
    .ilike("full_name", name.replace(/[%_]/g, ""))
    .limit(1);
  if (error) {
    console.error("AI technician lookup failed", { message: error.message });
    throw new ToolFailure("That data could not be loaded.");
  }
  if (!data?.length) throw new ToolFailure(`No technician called ${name}`);
  return data[0].id as string;
}

const jobsList: ToolDef<{
  technician?: string;
  status?: (typeof STATUSES)[number];
  date_range: z.infer<typeof dateRangeSchema>;
  limit?: number;
}> = {
  name: "jobs_list",
  description:
    "List jobs scheduled in a period (up to 20), optionally for one technician (by name) or status. Technicians always get only their own jobs.",
  args: z
    .object({
      technician: z.string().max(80).optional(),
      status: z.enum(STATUSES).optional(),
      date_range: dateRangeSchema,
      limit: z.number().int().min(1).max(MAX_ROWS).optional(),
    })
    .strict(),
  roles: EVERY_ROLE,
  async run(context, args) {
    const range = resolveAiRange(args.date_range, context.now);
    const data = await runReadRpc(context, "ai_jobs_list", {
      ...period(range),
      p_technician_id: await technicianId(context, args.technician),
      p_status: args.status ?? null,
      p_limit: args.limit ?? MAX_ROWS,
    });
    return { data, source: { tool: "jobs_list", period: range.label } };
  },
};

const jobDetail: ToolDef<{ order_no: string }> = {
  name: "job_detail",
  description:
    "One job by order number (ORD-YYMMDD-NNNN), including customer contact when the user may see it.",
  args: z.object({ order_no: z.string().regex(/^ORD-\d{6}-\d{4}$/) }).strict(),
  roles: EVERY_ROLE,
  async run(context, args) {
    const data = await runReadRpc(context, "ai_job_detail", { p_order_no: args.order_no });
    return { data, source: { tool: "job_detail", period: null } };
  },
};

const jobCounts: ToolDef<{
  status?: (typeof STATUSES)[number] | "completed";
  date_range: z.infer<typeof dateRangeSchema>;
  group_by?: "technician" | "service_type" | "day";
}> = {
  name: "job_counts",
  description:
    'Count jobs in a period. status "completed" counts finished jobs by completion date; other statuses count by scheduled date. Optional group_by.',
  args: z
    .object({
      status: z.enum([...STATUSES, "completed"]).optional(),
      date_range: dateRangeSchema,
      group_by: z.enum(["technician", "service_type", "day"]).optional(),
    })
    .strict(),
  roles: EVERY_ROLE,
  async run(context, args) {
    const range = resolveAiRange(args.date_range, context.now);
    const data = await runReadRpc(context, "ai_job_counts", {
      ...period(range),
      p_status: args.status ?? null,
      p_group_by: args.group_by ?? null,
    });
    return { data, source: { tool: "job_counts", period: range.label } };
  },
};

const LEADERBOARD_METRICS = ["jobs_completed", "revenue", "flags", "reschedules"] as const;
type LeaderboardRow = {
  full_name: string;
  jobs_completed: number;
  revenue_sen: number;
  reschedules: number;
  flags: number;
  avg_minutes: number | null;
};
const METRIC_VALUE: Record<(typeof LEADERBOARD_METRICS)[number], (row: LeaderboardRow) => number> =
  {
    jobs_completed: (row) => row.jobs_completed,
    revenue: (row) => Number(row.revenue_sen),
    flags: (row) => row.flags,
    reschedules: (row) => row.reschedules,
  };

const leaderboard: ToolDef<{
  date_range: z.infer<typeof dateRangeSchema>;
  metric: (typeof LEADERBOARD_METRICS)[number];
}> = {
  name: "technician_leaderboard",
  description: "Rank technicians in a period by jobs completed, revenue, flags or reschedules.",
  args: z.object({ date_range: dateRangeSchema, metric: z.enum(LEADERBOARD_METRICS) }).strict(),
  roles: STAFF,
  async run(context, args) {
    // Revenue figures and revenue rankings are for managers only (FR-AI-3).
    if (args.metric === "revenue" && context.role !== "manager") {
      throw new ToolFailure("Revenue is only available to managers.");
    }
    const range = resolveAiRange(args.date_range, context.now);
    const rows = (await runReadRpc(context, "kpi_leaderboard", period(range))) as LeaderboardRow[];
    const value = METRIC_VALUE[args.metric];
    const data = rows
      .toSorted((a, b) => value(b) - value(a))
      .map((row) => ({
        technician_name: row.full_name,
        jobs_completed: row.jobs_completed,
        // Revenue is shown to managers only; admins get the ranking without the money.
        ...(context.role === "manager" ? { revenue_rm: Number(row.revenue_sen) / 100 } : {}),
        flags: row.flags,
        reschedules: row.reschedules,
        avg_minutes_start_to_done: row.avg_minutes,
      }));
    return { data, source: { tool: "technician_leaderboard", period: range.label } };
  },
};

const workload: ToolDef<{ week: "this_week" | "last_week" | "next_week" }> = {
  name: "technician_workload",
  description:
    "Jobs per technician in a week against the team average; is_overloaded is decided by the database.",
  args: z.object({ week: z.enum(["this_week", "last_week", "next_week"]) }).strict(),
  roles: STAFF,
  async run(context, args) {
    const range = resolveAiRange(args.week, context.now);
    const rows = (await runReadRpc(context, "ai_technician_workload", period(range))) as {
      team_average: number;
    }[];
    // Design §6: the comparison with the team average is a manager view.
    const data =
      context.role === "manager"
        ? rows
        : rows.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== "team_average")),
          );
    return { data, source: { tool: "technician_workload", period: range.label } };
  },
};

const flagsSummary: ToolDef<{
  severity?: "high" | "medium" | "low";
  status?: "open" | "resolved";
  date_range: z.infer<typeof dateRangeSchema>;
}> = {
  name: "flags_summary",
  description:
    "Flags raised in a period (rule codes, not messages), optionally by severity or status. Technicians get flags on their own jobs only.",
  args: z
    .object({
      severity: z.enum(["high", "medium", "low"]).optional(),
      status: z.enum(["open", "resolved"]).optional(),
      date_range: dateRangeSchema,
    })
    .strict(),
  roles: EVERY_ROLE,
  async run(context, args) {
    const range = resolveAiRange(args.date_range, context.now);
    const data = await runReadRpc(context, "ai_flags_summary", {
      ...period(range),
      p_severity: args.severity ?? null,
      p_status: args.status ?? null,
    });
    return { data, source: { tool: "flags_summary", period: range.label } };
  },
};

const revenueSummary: ToolDef<{
  date_range: z.infer<typeof dateRangeSchema>;
  group_by?: "technician" | "service_type" | "day";
}> = {
  name: "revenue_summary",
  description: "Revenue (final amounts, RM) from jobs completed in a period, optionally grouped.",
  args: z
    .object({
      date_range: dateRangeSchema,
      group_by: z.enum(["technician", "service_type", "day"]).optional(),
    })
    .strict(),
  roles: ["manager"],
  async run(context, args) {
    const range = resolveAiRange(args.date_range, context.now);
    const data = await runReadRpc(context, "ai_revenue_summary", {
      ...period(range),
      p_group_by: args.group_by ?? null,
    });
    return { data, source: { tool: "revenue_summary", period: range.label } };
  },
};

// Each definition keeps its own argument type; the registry erases it once.
type AnyTool = ToolDef<never>;
const TOOLS = [
  jobsList,
  jobDetail,
  jobCounts,
  leaderboard,
  workload,
  flagsSummary,
  revenueSummary,
] as unknown as readonly AnyTool[];

/** The tools a role may see. Others are never sent to the model (FR-AI-3). */
export function toolsFor(role: Role): readonly AnyTool[] {
  return TOOLS.filter((tool) => tool.roles.includes(role));
}

/** The JSON schema the model sees, without the "$schema" key some providers reject. */
function parametersFor(tool: AnyTool): Record<string, unknown> {
  const schema = { ...(z.toJSONSchema(tool.args) as Record<string, unknown>) };
  delete schema.$schema;
  return schema;
}

/** OpenAI-style tool declarations for the main model. */
export function toolDeclarations(role: Role) {
  return toolsFor(role).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: parametersFor(tool),
    },
  }));
}

export type Authorised =
  { ok: true; run: (context: ToolContext) => Promise<ToolOutput> } | { ok: false; reason: string };

/** Stage 4 gate: the tool must be in the caller's set and its arguments must validate. */
export function authorizeToolCall(role: Role, name: string, rawArgs: string): Authorised {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, reason: `unknown tool ${name.slice(0, 40)}` };
  if (!tool.roles.includes(role)) return { ok: false, reason: `${name} not allowed for ${role}` };
  let parsedJson: unknown;
  try {
    parsedJson = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
  } catch {
    return { ok: false, reason: `${name}: arguments are not JSON` };
  }
  const args = tool.args.safeParse(parsedJson);
  if (!args.success) return { ok: false, reason: `${name}: invalid arguments` };
  return { ok: true, run: (context) => tool.run(context, args.data as never) };
}
