import { describe, expect, it } from "vitest";

import { buildCsp, securityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe("buildCsp", () => {
  const hosted = buildCsp({ supabaseUrl: "https://abc.supabase.co", isDev: false });

  it("allows the app, Supabase (HTTPS and Realtime) and the font CDN, nothing else", () => {
    expect(directive(hosted, "default-src")).toBe("default-src 'self'");
    expect(directive(hosted, "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co",
    );
    expect(directive(hosted, "img-src")).toBe("img-src 'self' blob: data: https://abc.supabase.co");
    expect(directive(hosted, "font-src")).toBe("font-src 'self' https://cdn.fontshare.com");
    expect(directive(hosted, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
    );
  });

  it("blocks framing, plugins, base-tag tricks and off-site form posts", () => {
    for (const rule of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(hosted).toContain(rule);
    }
  });

  it("only allows eval in development and only upgrades requests over HTTPS", () => {
    expect(directive(hosted, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(hosted).toContain("upgrade-insecure-requests");

    const local = buildCsp({ supabaseUrl: "http://127.0.0.1:54321", isDev: true });
    expect(directive(local, "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(directive(local, "connect-src")).toBe(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    );
    expect(local).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("sends the CSP with the other hardening headers", () => {
    const names = securityHeaders({ supabaseUrl: "https://abc.supabase.co", isDev: false }).map(
      (header) => header.key,
    );
    expect(names).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
    ]);
  });
});
