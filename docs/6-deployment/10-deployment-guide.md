# 10 · Deployment Guide

Status: living document — finalised in Phase 6.

## Environments

| Env | App | Database | Notes |
|---|---|---|---|
| Local | `npm run dev` → http://127.0.0.1:3000 | Supabase CLI in Docker (`npm run db:start`) | Migrations + `supabase/seed.sql` applied on start/reset |
| CI | `next build && next start` | Fresh Supabase CLI stack per run | Lint, typecheck, unit, DB tests, e2e (desktop + mobile) |
| Preview | Vercel preview per PR | Hosted `sejuk-demo` | Same env vars as production |
| Production (demo) | https://sejuk-sejuk-roan.vercel.app | Hosted `sejuk-demo` | Assessor-facing |

Hosted Supabase project: `sejuk-demo`, ref `vwkcuzyjrjeszmruyenh`, region `ap-southeast-1` (Singapore), Postgres 17.

## Environment variables

| Name | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Prod + Preview), `.env.local` | No (bundled to browser) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel (Prod + Preview), `.env.local` | No (RLS protects data) |
| `GROQ_API_KEY` | Vercel (Prod + Preview, *Sensitive*), `.env.local` | **Yes** |
| `AI_BASE_URL`, `AI_MAIN_MODEL`, `AI_JUDGE_MODEL` | Vercel, `.env.local` | No |
| `SUPABASE_SECRET_KEY` | Local `.env.local` only, for seed/reset scripts | **Yes** — never in Vercel |

Next.js inlines `NEXT_PUBLIC_*` at build time: redeploy after changing them.

## Database changes

Schema lives in `supabase/migrations/` (timestamped SQL, applied in order).

```powershell
npm run db:reset          # local: rebuild from migrations + seed
npm run test:db           # local: RPC / RLS / audit tests
npx supabase db push      # hosted: apply new migrations (project is linked)
```

Seeding the hosted demo (destructive — wipes and reloads demo data):

```powershell
npx supabase db reset --linked
```

Never run `supabase config push`: it would copy the local `site_url` (`127.0.0.1`) over the hosted one.

## Hosted parity notes

- Hosted Supabase auto-exposes new tables to the Data API; local config does not. The first migration revokes all default privileges and grants SELECT explicitly, so both behave the same.
- Sign-up is disabled in both (local `config.jsonc`, hosted dashboard → Authentication).
- Free-tier projects pause after a week of inactivity; resume from the dashboard before a demo.
