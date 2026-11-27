# Sejuk Sejuk Ops

Internal operations system for an air-conditioner service company: **Order → Assignment → Service Completion → Manager Review**, with rule-based issue flags, WhatsApp feedback links, KPIs and a guarded AI assistant.

> Work in progress. Full write-up (what was built, architecture, AI design, limitations) lands at the end of the build. Planning, requirements and design: [docs/](docs/README.md).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, Realtime) · Vercel · Groq. Reasons and trade-offs: [design doc §2](docs/3-design/04-design.md#2-stack-decisions-pros-and-cons).

## Run locally

Requires Node 24+ and Docker.

```bash
npm install
npm run db:start            # local Supabase in Docker
cp .env.example .env.local  # then fill values from `npx supabase status`
npm run dev                 # http://127.0.0.1:3000
```

## Scripts

| Script             | Does                                                      |
| ------------------ | --------------------------------------------------------- |
| `npm run check`    | lint + typecheck + format check + unit tests              |
| `npm test`         | unit tests (Vitest)                                       |
| `npm run test:e2e` | end-to-end tests (Playwright, desktop + mobile viewports) |
| `npm run db:reset` | rebuild the local database from migrations and seed       |

CI runs `check`, a production build and `test:e2e` on every pull request, against a throwaway local Supabase started from the migrations.
