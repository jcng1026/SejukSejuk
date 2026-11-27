// Response envelope for Server Actions and the AI route (docs/3-design/05-api-spec.md §1).

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AI_BLOCKED"
  | "AI_UNAVAILABLE"
  | "INTERNAL";

export interface ActionError {
  code: ErrorCode;
  message: string;
  field?: string;
}

export type Failure = { ok: false; error: ActionError };
export type Result<T> = { ok: true; data: T } | Failure;

export function fail(code: ErrorCode, message: string, field?: string): Failure {
  return { ok: false, error: field ? { code, message, field } : { code, message } };
}
