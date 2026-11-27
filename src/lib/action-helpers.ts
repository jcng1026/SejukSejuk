import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionError, type Failure } from "@/lib/result";
import { mapRpcError } from "@/lib/rpc-error";
import { isUuid } from "@/lib/validation";

// Shared by every Server Action file: input flattening, the signed-in + id
// check, and turning database errors into user-safe failures (api-spec §1).

export function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
}

export function validationFailure(fields: Record<string, string>): Failure {
  return {
    ok: false,
    error: { code: "VALIDATION", message: "Check the highlighted fields.", fields },
  };
}

/** Signed in, and the record id from the browser is a real UUID; otherwise a failure. */
export async function guardRecord(id: unknown, notFoundMessage: string): Promise<Failure | null> {
  if (!(await getCurrentUser())) {
    return fail("UNAUTHENTICATED", "Your session has ended. Sign in again.");
  }
  return isUuid(id) ? null : fail("NOT_FOUND", notFoundMessage);
}

/** Maps a database error for the user and logs anything unexpected on the server. */
export function rpcFailure(rpc: string, error: { code?: string; message: string }): Failure {
  const mapped: ActionError = mapRpcError(error);
  if (mapped.code === "INTERNAL" || error.code === "42501" || error.code?.startsWith("23")) {
    console.error(`RPC ${rpc} failed`, { code: error.code, message: error.message });
  }
  return { ok: false, error: mapped };
}
