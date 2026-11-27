import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import { isReadonlyCookiesError } from "@/lib/supabase/cookie-errors";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user (their JWT), so RLS applies to every query.
 */
export async function createClient(): Promise<SupabaseClient> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // The `headers` argument (no-cache headers) is applied by src/proxy.ts,
      // which owns the response for every request that refreshes a session.
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch (error) {
          // Server Components cannot write cookies; src/proxy.ts refreshes the
          // session on every request, so this one case is safe to skip.
          if (!isReadonlyCookiesError(error)) throw error;
        }
      },
    },
  });
}
