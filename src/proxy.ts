import type { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  // Skip static assets and image optimisation.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|woff2?)$).*)",
  ],
};
