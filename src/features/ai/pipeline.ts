// The guardrail pipeline (FR-AI-4, design §6). Each stage fails closed; every
// block is logged with its stage. Dependencies are passed in so tests can use a fake model.

import type { Result } from "@/lib/result";

import { runAgent, type ChatTurn } from "./agent";
import { startDeadline } from "./deadline";
import { judgeIntent } from "./intent";
import { AiUnavailable, type Llm } from "./llm";
import { screenInput, screenOutput } from "./screens";
import type { Source, ToolContext } from "./tools";

export type BlockStage = "input" | "intent" | "tool" | "output";

export type QuotaResult = { ok: true; requestId: number } | { ok: false; message: string };

export interface PipelineDeps {
  llm: Llm | null;
  models: { main: string; judge: string };
  context: ToolContext;
  userName: string;
  today: string;
  /**
   * Counts the question against the hourly limit (FR-AI-6). The database logs a
   * refusal itself; an accepted question gets the id that later log entries need.
   */
  startRequest: (question: string) => Promise<QuotaResult>;
  logBlocked: (
    requestId: number,
    stage: BlockStage,
    reason: string,
    input: string,
  ) => Promise<void>;
  markAnswered: (requestId: number, tools: string[]) => Promise<void>;
}

export interface ChatAnswer {
  answer: string;
  sources: Source[];
  proposal: null;
}

export const BLOCKED_MESSAGE =
  "I can't help with that. Ask me about jobs, technicians, schedules or flags.";
export const UNAVAILABLE_MESSAGE = "Assistant unavailable. Please try again later.";

const unavailable = (): Result<ChatAnswer> => ({
  ok: false,
  error: { code: "AI_UNAVAILABLE", message: UNAVAILABLE_MESSAGE },
});

/** History is client-supplied, so every turn is screened like a new question. */
function screenConversation(question: string, history: readonly ChatTurn[]) {
  for (const text of [...history.map((turn) => turn.content), question]) {
    const result = screenInput(text);
    if (!result.ok) return result;
  }
  return { ok: true as const };
}

export async function answerQuestion(
  deps: PipelineDeps,
  question: string,
  history: readonly ChatTurn[],
): Promise<Result<ChatAnswer>> {
  const quota = await deps.startRequest(question);
  if (!quota.ok) return { ok: false, error: { code: "RATE_LIMITED", message: quota.message } };
  const block = async (stage: BlockStage, reason: string): Promise<Result<ChatAnswer>> => {
    await deps.logBlocked(quota.requestId, stage, reason, question);
    return { ok: false, error: { code: "AI_BLOCKED", message: BLOCKED_MESSAGE } };
  };

  const screened = screenConversation(question, history);
  if (!screened.ok) return block("input", screened.reason);
  if (!deps.llm) return unavailable();

  const deadline = startDeadline();
  let verdict;
  try {
    verdict = await judgeIntent(deps.llm, deps.models.judge, question, history, deadline);
  } catch (error) {
    if (!(error instanceof AiUnavailable)) throw error;
    // A judge that cannot answer is a failed check (design §6): log it, then fail closed.
    await deps.logBlocked(
      quota.requestId,
      "intent",
      `judge unavailable: ${error.message}`,
      question,
    );
    return unavailable();
  }
  if (!verdict.ok) return block("intent", verdict.reason);

  try {
    const result = await runAgent({
      llm: deps.llm,
      model: deps.models.main,
      userName: deps.userName,
      today: deps.today,
      history,
      question,
      context: deps.context,
      deadline,
    });
    if (result.kind === "blocked") return block("tool", result.reason);

    const checked = screenOutput(result.answer, result.seen);
    if (!checked.ok) return block("output", checked.reason);
    await deps.markAnswered(
      quota.requestId,
      result.sources.map((source) => source.tool),
    );
    return { ok: true, data: { answer: result.answer, sources: result.sources, proposal: null } };
  } catch (error) {
    if (error instanceof AiUnavailable) return unavailable();
    throw error;
  }
}
