import { getCurrentUser } from "@/lib/auth";

import { AiAssistant } from "./AiAssistant";

/** Reads the session, so render inside Suspense. Nothing shows when signed out. */
export async function AiLauncher({ isAboveTabs = false }: { isAboveTabs?: boolean }) {
  const user = await getCurrentUser();
  return user ? <AiAssistant role={user.role} isAboveTabs={isAboveTabs} /> : null;
}
