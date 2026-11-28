import type { ActionError, ErrorCode } from "@/lib/result";

const OUR_CODES: readonly ErrorCode[] = [
  "VALIDATION",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "CONFLICT",
  "RATE_LIMITED",
];

interface DbError {
  code?: string;
  message: string;
}

/**
 * Maps a Postgres/PostgREST error to a user-safe ActionError (api-spec §1).
 * Only messages our RPCs raised deliberately ("CODE: text") reach the user.
 */
export function mapRpcError(error: DbError): ActionError {
  const prefixed = /^([A-Z_]+): ([\s\S]+)$/.exec(error.message);
  if (prefixed && (OUR_CODES as readonly string[]).includes(prefixed[1])) {
    return { code: prefixed[1] as ErrorCode, message: prefixed[2] };
  }
  if (error.code === "42501") {
    return { code: "FORBIDDEN", message: "You don't have permission to do this." };
  }
  if (error.code?.startsWith("23")) {
    return {
      code: "VALIDATION",
      message: "Some details aren't valid. Check the form and try again.",
    };
  }
  return { code: "INTERNAL", message: "Something went wrong. Try again." };
}
