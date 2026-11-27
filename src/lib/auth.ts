import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { isRole, type Role } from "@/lib/roles";
import { homeFor, LOGIN_PATH } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  fullName: string;
  role: Role;
}

/**
 * The signed-in, active user, or null. Deactivated users get null because RLS
 * hides every profile from them. Cached per request with React `cache`.
 * Reads cookies, so callers must render inside a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // The Supabase client reads the clock (Date.now) to check token expiry;
  // with Cache Components that must be marked as request-time work.
  await connection();
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!profile || !isRole(profile.role)) return null;

  return { id: profile.id, fullName: profile.full_name, role: profile.role };
});

/** Returns the user if their role may open this page; otherwise redirects. */
export async function requireUser(allowed: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  if (!allowed.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
