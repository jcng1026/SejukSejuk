import type { Role } from "@/lib/roles";

export const LOGIN_PATH = "/login";
export const STAFF_HOME = "/home";
export const TECHNICIAN_HOME = "/tech";

/** Paths anyone may open without signing in. */
export const PUBLIC_PATHS = ["/", LOGIN_PATH] as const;

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === "technician" ? TECHNICIAN_HOME : STAFF_HOME;
}

export function isProtectedPath(pathname: string): boolean {
  return !(PUBLIC_PATHS as readonly string[]).includes(pathname);
}
