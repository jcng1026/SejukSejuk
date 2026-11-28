# 11 · Release Notes — v1.0 (demo)

Live: https://sejuk-sejuk-roan.vercel.app · Database: hosted Supabase `sejuk-demo` (Singapore).

## What is in v1.0

| Area | Highlights |
|---|---|
| Orders (admin) | Create with database-generated `ORD-YYMMDD-####`, Malaysian phone validation, technician picker with day load and clash warning, WhatsApp notify link, edit / reassign / reschedule with reasons, search and filters, full timeline |
| Technician (phone) | Today / Upcoming / History, start job, completion with photos/videos/PDF (compressed, retryable), payment and receipt, server-stamped name and time, flags on own jobs |
| Review (manager) | Queue flagged-first, approve / send back with reason / close (note required if underpaid) |
| Flags | Automatic rules on Job Done (over quote, extras without remarks, underpaid, no files, late) plus manual flags; resolve with note |
| Notifications | WhatsApp feedback link created by a database trigger; live bell (grouped "jobs completed today", individual High flags); sounds with an off switch |
| Insights | C2 schedule-bento home (live), KPI dashboard with leaderboard and charts, calendar, technicians page, audit log |
| AI assistant | Round button on every screen; answers from role-scoped, read-only tools; six guardrail stages (five checks plus a blocked log); 20 questions/hour; manager-only blocked log |
| Security | Every write through role-checked RPCs; RLS default-deny; audit triggers; CSP and security headers |

## Database migrations (in order)

`20261127000100`–`000600` schema, RLS, audit and state machine, workflow RPCs, storage bucket and upload policy, function privileges · `20261128000100` update order · `000200` attachments · `000300` Job Done effects · `000400` flags/messages RPCs · `000500` KPI functions · `20261129000100` AI tools.

## Known limitations

- AI: English only; answers only what its seven tools cover; Groq free-tier limits; no automatic fallback provider.
- WhatsApp: deep links, not the Business API — a person taps Send.
- Jobs have no duration; the schedule draws each as a 2-hour block.
- Bulk "mark reviewed" via AI (FR-REV-4, stretch) is not built.
- Content-Security-Policy allows inline scripts (required by partial prerendering).
