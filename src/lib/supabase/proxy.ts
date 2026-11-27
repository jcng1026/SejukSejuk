import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export interface SessionResult {
  response: NextResponse;
  /** Auth user id from the verified session, or null when signed out. */
  userId: string | null;
  /** No-cache headers Supabase requires on any response that sets auth cookies. */
  cacheHeaders: Record<string, string>;
}

/**
 * Refreshes the Supabase session once per request and writes any rotated
 * auth cookies (plus the cache headers Supabase requires) onto the response.
 * Authorisation is NOT decided here; RLS and RPC checks do that.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getPublicEnv();
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        cacheHeaders = { ...cacheHeaders, ...headers };
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims.sub ?? null, cacheHeaders };
}

/** A redirect that keeps any refreshed auth cookies and their no-cache headers. */
export function redirectKeepingSession(
  request: NextRequest,
  session: SessionResult,
  path: string,
): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  session.response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(session.cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
  return redirect;
}
