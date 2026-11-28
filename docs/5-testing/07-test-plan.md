# 07 · Test Plan

## Levels

| Level | Tool | Where | What it proves |
|---|---|---|---|
| Unit + property | Vitest, fast-check | `src/**/*.test.ts` | Pure rules: money, phone, MYT dates and periods, schedule layout, filters, audit diffs, AI screens, tool authorisation, guardrail pipeline (scripted fake model), security headers |
| Database | Vitest against local Supabase | `supabase/tests/*.test.ts` | RPCs, state machine, RLS per role, audit trail, flag rules, KPIs, AI tools and contact rule, rate limit, blocked log |
| End-to-end | Playwright, desktop Chrome + Pixel 7 | `e2e/*.spec.ts` | Real user journeys on the production build |
| Accessibility | axe-core (WCAG 2.2 A/AA) | `e2e/a11y.spec.ts` | Sign-in, every staff page, order page, AI panel, technician screens |
| Security | Playwright | `e2e/security.spec.ts`, `e2e/ai.spec.ts` | Security headers present, no CSP violations, API refuses anonymous / cross-site / non-JSON calls |
| AI attacks | All of the above | [ai-attack-cases.md](ai-attack-cases.md) | 22 attack cases mapped to the test that blocks each |
| Live checks | Browser, real Groq | Manual, recorded in [09](09-test-report.md) | Answers match SQL; contact rule; attacks blocked |

DB tests run file by file (`fileParallelism: false`): they share one database and some state is global.

## Approach

- TDD for logic marked 🧪 in the implementation plan: test first (red), then code (green).
- Property tests for parsers and date/money maths (phone, MYT round-trip, periods, schedule axis, AI date ranges).
- Database rules are tested through the same RPCs the app calls, signed in as each seeded role, so RLS is part of every test.
- E2E tests use one-click demo sign-in and create their own uniquely named orders, so they can run in parallel.
- Tests assert on behaviour users see (roles, labels, text), not on CSS classes.

## Environments and entry/exit

| | Local | CI (every PR) |
|---|---|---|
| Database | Supabase CLI in Docker, `npm run db:reset` | Fresh Supabase stack per run |
| App | `npm run dev` or `next build && next start` | Production build |
| AI | Real Groq when `GROQ_API_KEY` is set | No key: AI tests cover guardrails and "Assistant unavailable" |

**Entry**: migrations apply cleanly. **Exit (merge)**: `npm run check`, `npm run test:db`, `next build` and `npm run test:e2e` all green in CI; `/code-review` findings fixed or answered.

## Out of scope

Load testing; cross-browser beyond Chromium; real WhatsApp delivery (deep links only); throttled-network performance runs.
