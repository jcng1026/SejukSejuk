# 13 · Ops Runbook

Setup and environment variables: [10 Deployment guide](../6-deployment/10-deployment-guide.md).

## Routine

| Task | How |
|---|---|
| Release | Merge a PR to `main` (CI green). Vercel deploys automatically. Then apply new migrations: `npx supabase db push --remote`. |
| Check migrations | `npx supabase migration list --remote` — every local migration must show a remote timestamp. |
| Before a demo | Free-tier Supabase pauses after ~7 idle days: resume it in the dashboard. Demo data is relative to when it was seeded; reseed if "today" looks empty (below). |
| Reseed demo data | `npx supabase db reset --remote` — **destructive**: wipes the hosted database and reloads migrations + seed. |

## Incidents

| Symptom | Likely cause | Fix |
|---|---|---|
| AI always says "Assistant unavailable" | `GROQ_API_KEY` missing/revoked, Groq outage or free-tier limit | Check Vercel env vars and the Groq console; the AI log (`/ai-log`) shows `judge unavailable: provider returned …` with the provider's error code |
| AI refuses normal questions | Intent judge too strict | `/ai-log` shows the stage and reason; adjust examples in `src/features/ai/prompt.ts` |
| "You can ask again at HH:MM" | 20 questions/hour per user | Wait, or delete that user's recent rows from `ai_requests` (SQL editor) |
| Sign-in fails for everyone | Supabase paused or keys rotated | Resume project; update `NEXT_PUBLIC_SUPABASE_*` in Vercel and redeploy |
| Bell / home not live | Realtime disconnected | Reload; check the project's Realtime status |
| Vercel toolbar missing on Preview deployments | The CSP blocks `vercel.live` (by design) | Use the Vercel dashboard instead |
| A migration fails on push | Out-of-order or edited migration | Never edit a pushed migration; add a new one |

## Rotating secrets

- **Groq key**: create a new key in the Groq console → update `GROQ_API_KEY` in Vercel (Production + Preview) and `.env.local` (`GROQ_API_KEY=…`) → redeploy → delete the old key.
- **Supabase secret key**: rotate in the dashboard; update local `.env.local` only (it is never in Vercel).

## Where to look

Vercel → Logs (server errors are logged without personal data); Supabase → Logs; `audit_log` (`/audit`) for who changed what; `ai_blocked_log` (`/ai-log`) and `ai_requests` for the assistant.
