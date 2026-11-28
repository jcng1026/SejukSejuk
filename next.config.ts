import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

// Read when the config loads; Vercel and CI both set it. The local default only
// lets tools that load the config without an .env (typegen, lint) still run.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const nextConfig: NextConfig = {
  // Playwright and local Supabase redirects use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({ supabaseUrl, isDev: process.env.NODE_ENV === "development" }),
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
