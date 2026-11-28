// Security headers for every response (task 6.2).
//
// The CSP has no nonces: this app uses partial prerendering, which cannot carry
// a per-request nonce (Next.js CSP guide, "Static vs Dynamic Rendering with
// CSP"), so inline scripts are allowed. Everything else is locked to this site,
// Supabase and the font CDN, and nothing renders user-supplied HTML.

const FONT_CSS = "https://api.fontshare.com";
const FONT_FILES = "https://cdn.fontshare.com";

interface CspOptions {
  supabaseUrl: string;
  isDev: boolean;
}

export function buildCsp({ supabaseUrl, isDev }: CspOptions): string {
  const supabase = new URL(supabaseUrl);
  const realtime = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${FONT_CSS}`,
    `img-src 'self' blob: data: ${supabase.origin}`,
    `font-src 'self' ${FONT_FILES}`,
    `connect-src 'self' ${supabase.origin} ${realtime}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only where everything is already HTTPS; a local build talks to http://127.0.0.1.
    ...(supabase.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function securityHeaders(options: CspOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Photos come from a file input, which needs no permission; nothing else is used.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
