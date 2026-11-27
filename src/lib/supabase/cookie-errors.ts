// Next.js throws this when a Server Component tries to write cookies
// (next/dist/server/web/spec-extension/adapters/request-cookies.js).
const READONLY_COOKIES_MESSAGE = "Cookies can only be modified in a Server Action or Route Handler";

/** True only for Next's "cookies are read-only here" error; anything else must propagate. */
export function isReadonlyCookiesError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(READONLY_COOKIES_MESSAGE);
}
