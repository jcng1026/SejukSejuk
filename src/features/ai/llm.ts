// A minimal client for an OpenAI-compatible chat API (Groq). No SDK: one POST,
// a timeout, and any failure becomes AiUnavailable (FR-AI-9: no fallback provider).

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  tools?: unknown[];
  tool_choice?: "auto" | "none";
  response_format?: { type: "json_object" };
  /** gpt-oss reasons before answering; its reasoning counts against max_tokens. */
  reasoning_effort?: "low" | "medium" | "high";
  max_tokens?: number;
}

export interface LlmReply {
  content: string | null;
  tool_calls?: ToolCall[];
}

/** The model call the pipeline depends on; tests pass a fake. */
export type Llm = (request: LlmRequest, timeoutMs: number) => Promise<LlmReply>;

export class AiUnavailable extends Error {}

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  mainModel: string;
  judgeModel: string;
}

/** Reads the server-only AI settings; null when no key is set (the assistant is then unavailable). */
export function readAiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig | null {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    mainModel: env.AI_MAIN_MODEL || "openai/gpt-oss-120b",
    judgeModel: env.AI_JUDGE_MODEL || "openai/gpt-oss-20b",
  };
}

export function createLlm(config: AiConfig): Llm {
  return async (request, timeoutMs) => {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ temperature: 0, ...request }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailable(error instanceof Error ? error.name : "network error");
    }
    if (!response.ok) {
      // Only the provider's error code is kept: enough to diagnose, nothing from the prompt.
      const failure = (await response.json().catch(() => null)) as {
        error?: { code?: unknown };
      } | null;
      const code =
        typeof failure?.error?.code === "string" ? ` ${failure.error.code.slice(0, 40)}` : "";
      throw new AiUnavailable(`provider returned ${response.status}${code}`);
    }
    const body = (await response.json().catch(() => null)) as {
      choices?: { message?: LlmReply }[];
    } | null;
    const message = body?.choices?.[0]?.message;
    if (!message) throw new AiUnavailable("provider returned no message");
    return { content: message.content ?? null, tool_calls: message.tool_calls };
  };
}
