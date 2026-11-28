import { AiUnavailable } from "./llm";

/** One question's whole budget for model calls, so a slow provider cannot hold a request open. */
export const REQUEST_BUDGET_MS = 45_000;

export interface Deadline {
  /** The timeout for the next call: its own limit or what is left, whichever is shorter. */
  timeoutFor: (callLimitMs: number) => number;
}

export function startDeadline(budgetMs = REQUEST_BUDGET_MS, now = () => Date.now()): Deadline {
  const endsAt = now() + budgetMs;
  return {
    timeoutFor(callLimitMs) {
      const left = endsAt - now();
      if (left <= 0) throw new AiUnavailable("request deadline passed");
      return Math.min(callLimitMs, left);
    },
  };
}
