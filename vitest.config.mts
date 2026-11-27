import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["supabase/tests/**/*.test.ts"],
          // Local Supabase URL/keys from .env.local; CI exports them from `supabase status`.
          env: loadEnv(mode, process.cwd(), ""),
          testTimeout: 20_000,
          // Every file shares one database, and some state is global (e.g. the per-person
          // "jobs done today" counter), so files run one at a time to stay deterministic.
          fileParallelism: false,
        },
      },
    ],
  },
}));
