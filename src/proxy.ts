import type { NextRequest, NextResponse } from "next/server";

import { isProtectedPath, LOGIN_PATH, STAFF_HOME } from "@/lib/routes";
import { redirectKeepingSession, updateSession } from "@/lib/supabase/proxy";

// Optimistic routing only: pages re-check the user and role on the server
// (technicians are bounced from the staff home to their own), and RLS guards
// the data either way.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const session = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return redirectKeepingSession(request, session, session.userId ? STAFF_HOME : LOGIN_PATH);
  }
  if (!session.userId && isProtectedPath(pathname)) {
    return redirectKeepingSession(request, session, LOGIN_PATH);
  }
  return session.response;
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|woff2?)$).*)",
  ],
};
