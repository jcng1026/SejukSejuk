// Stages 3–4: the main model may call at most three of the role's tools; every
// call is authorised and validated before it runs (design §6).

import type { Deadline } from "./deadline";
import type { Llm, LlmMessage } from "./llm";
import { mainSystemPrompt } from "./prompt";
import type { SeenInTools } from "./screens";
import {
  authorizeToolCall,
  toolDeclarations,
  ToolFailure,
  type Source,
  type ToolContext,
} from "./tools";

export const MAX_TOOL_CALLS = 3;
/** FR-AI-6: at most three earlier question-and-answer pairs go back to the model. */
export const MAX_HISTORY_TURNS = 3;
const MAIN_TIMEOUT_MS = 20_000;
/** Answers are a few sentences, but reasoning shares this cap; it bounds cost and time per call. */
const MAX_ANSWER_TOKENS = 2000;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentInput {
  llm: Llm;
  model: string;
  userName: string;
  today: string;
  history: readonly ChatTurn[];
  question: string;
  context: ToolContext;
  deadline: Deadline;
}

export type AgentResult =
  | { kind: "answer"; answer: string; sources: Source[]; seen: SeenInTools }
  | { kind: "blocked"; reason: string };

/** Tool output goes to the model as data, inside a block it is told never to obey. */
function asUntrustedData(data: unknown): string {
  // Escaping "<" keeps the data from closing the block early.
  return `<untrusted_data>${JSON.stringify(data).replace(/</g, "\\u003c")}</untrusted_data>`;
}

type SeenSets = { orderNos: Set<string>; phones: Set<string>; addresses: Set<string> };

/** Remembers what the tools returned, so stage 5 can tell repeated data from invented data. */
function collectSeen(data: unknown, seen: SeenSets): void {
  if (!Array.isArray(data)) return;
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const fields = row as Record<string, unknown>;
    if (typeof fields.order_no === "string") seen.orderNos.add(fields.order_no);
    if (typeof fields.customer_phone === "string") seen.phones.add(fields.customer_phone);
    if (typeof fields.customer_address === "string") seen.addresses.add(fields.customer_address);
  }
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const { role } = input.context;
  const messages: LlmMessage[] = [
    { role: "system", content: mainSystemPrompt(role, input.userName, input.today) },
    ...input.history,
    { role: "user", content: input.question },
  ];
  const tools = toolDeclarations(role);
  const sources: Source[] = [];
  const seen: SeenSets = { orderNos: new Set(), phones: new Set(), addresses: new Set() };
  let callsUsed = 0;

  for (;;) {
    const canCall = callsUsed < MAX_TOOL_CALLS;
    const reply = await input.llm(
      {
        model: input.model,
        messages,
        tools,
        tool_choice: canCall ? "auto" : "none",
        reasoning_effort: "low",
        max_tokens: MAX_ANSWER_TOKENS,
      },
      input.deadline.timeoutFor(MAIN_TIMEOUT_MS),
    );
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0 || !canCall) {
      return { kind: "answer", answer: (reply.content ?? "").trim(), sources, seen };
    }
    messages.push({ role: "assistant", content: reply.content, tool_calls: calls });
    for (const call of calls) {
      if (callsUsed >= MAX_TOOL_CALLS) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: '{"error":"tool limit reached"}',
        });
        continue;
      }
      callsUsed += 1;
      const allowed = authorizeToolCall(role, call.function.name, call.function.arguments);
      if (!allowed.ok) return { kind: "blocked", reason: allowed.reason };
      try {
        const output = await allowed.run(input.context);
        sources.push(output.source);
        collectSeen(output.data, seen);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: asUntrustedData(output.data),
        });
      } catch (error) {
        if (!(error instanceof ToolFailure)) throw error;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: asUntrustedData({ error: error.message }),
        });
      }
    }
  }
}
