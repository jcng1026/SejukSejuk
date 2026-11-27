import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and local Supabase redirects use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
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
