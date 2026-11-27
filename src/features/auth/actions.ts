"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { DEMO_PASSWORD } from "@/features/auth/demo-password";
import { findDemoUser } from "@/lib/demo-users";
import { fail, type Failure } from "@/lib/result";
import { isRole } from "@/lib/roles";
import { homeFor, LOGIN_PATH } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/** Sign-in either redirects (success) or returns a failure for the form. */
export type SignInState = Failure | null;

const credentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "VALIDATION",
      issue?.message ?? "Check your details.",
      String(issue?.path[0] ?? ""),
    );
  }
  return completeSignIn(parsed.data.email, parsed.data.password);
}

// The demo password stays on the server: the button only sends the account key.
export async function demoSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const demoUser = findDemoUser(String(formData.get("user") ?? ""));
  if (!demoUser) return fail("VALIDATION", "Unknown demo account.");
  return completeSignIn(demoUser.email, DEMO_PASSWORD);
}

async function completeSignIn(email: string, password: string): Promise<SignInState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return fail("UNAUTHENTICATED", "Email or password is incorrect.");

  // Deactivated accounts can authenticate, but RLS hides their own profile.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Sign-in: profile lookup failed", profileError);
    await supabase.auth.signOut();
    return fail("INTERNAL", "Couldn't load your account. Try again in a moment.");
  }
  if (!profile || !isRole(profile.role)) {
    await supabase.auth.signOut();
    return fail("FORBIDDEN", "This account has been deactivated. Contact your manager.");
  }

  redirect(homeFor(profile.role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign-out failed; local session cleared anyway", error);
  redirect(LOGIN_PATH);
}
