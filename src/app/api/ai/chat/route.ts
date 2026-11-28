import { z } from "zod";

import { MAX_HISTORY_TURNS } from "@/features/ai/agent";
import { createLlm, readAiConfig } from "@/features/ai/llm";
import { answerQuestion, type BlockStage } from "@/features/ai/pipeline";
import { MAX_QUESTION_LENGTH } from "@/features/ai/screens";
import { mytToday } from "@/features/orders/schedule";
import { getCurrentUser } from "@/lib/auth";
import { fail, type ErrorCode } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

// Generous on the wire; the input screen applies the real 500-character rule and logs it.
const bodySchema = z
  .object({
    message: z.string().max(MAX_QUESTION_LENGTH * 4),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(MAX_QUESTION_LENGTH),
          })
          .strict(),
      )
      .max(MAX_HISTORY_TURNS * 2)
      .default([]),
  })
  .strict();

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
};

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type Deps = Parameters<typeof answerQuestion>[0];
type Supabase = Deps["context"]["supabase"];

/** The quota and log RPCs, run as the signed-in user. */
function requestLog(
  supabase: Supabase,
): Pick<Deps, "startRequest" | "logBlocked" | "markAnswered"> {
  return {
    async startRequest(question) {
      const { data, error } = await supabase
        .rpc("ai_take_quota", { p_question: question })
        .single<{ request_id: number | null; allowed: boolean; message: string | null }>();
      if (error) throw new Error(`ai_take_quota failed: ${error.message}`);
      return data.allowed && data.request_id !== null
        ? { ok: true, requestId: data.request_id }
        : { ok: false, message: data.message ?? "You have asked 20 questions this hour." };
    },
    async logBlocked(requestId, stage: BlockStage, reason, input) {
      const { error } = await supabase.rpc("ai_log_blocked", {
        p_request_id: requestId,
        p_stage: stage,
        p_reason: reason,
        p_input: input,
      });
      if (error) console.error("Could not log a blocked AI request", { message: error.message });
    },
    async markAnswered(requestId, tools) {
      const { error } = await supabase.rpc("ai_mark_answered", {
        p_request_id: requestId,
        p_tools: tools,
      });
      if (error) console.error("Could not record an AI answer", { message: error.message });
    },
  };
}

/** POST /api/ai/chat — the assistant (FR-AI, api-spec §4). */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return reply(fail("UNAUTHENTICATED", "Sign in to use the assistant."), 401);
  // A JSON body forces a CORS preflight; browsers also say where a request came from.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return reply(fail("FORBIDDEN", "Ask from the Sejuk Sejuk app."), 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return reply(fail("VALIDATION", "Send JSON."), 400);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(fail("VALIDATION", "That question could not be read."), 400);

  try {
    const supabase = await createClient();
    const config = readAiConfig();
    const result = await answerQuestion(
      {
        llm: config ? createLlm(config) : null,
        models: { main: config?.mainModel ?? "", judge: config?.judgeModel ?? "" },
        context: { supabase, role: user.role, now: new Date() },
        userName: user.fullName,
        today: mytToday(),
        ...requestLog(supabase),
      },
      parsed.data.message,
      parsed.data.history,
    );
    return reply(result, result.ok ? 200 : (STATUS[result.error.code] ?? 200));
  } catch (error) {
    // Fail closed with the standard envelope; the detail stays in the server log.
    console.error("AI chat failed", { message: error instanceof Error ? error.message : error });
    return reply(fail("INTERNAL", "Something went wrong. Try again."), 500);
  }
}
