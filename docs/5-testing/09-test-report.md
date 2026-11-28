# 09 · Test Report — v1.0

Run on 28 Nov 2026 against `chore/release` (local Supabase; e2e with `CI=1`, which serves the production build). Plan: [07](07-test-plan.md) · coverage by requirement: [08](08-traceability-matrix.md).

## Results

| Suite | Command | Result |
|---|---|---|
| Lint, typecheck, format | `npm run check` | Pass |
| Unit + property (24 files) | `npm run check` | **167 / 167** |
| Database (10 files) | `npm run test:db` | **102 / 102** |
| Production build | `npm run build` | Pass |
| End-to-end, desktop + Pixel 7 (9 specs, incl. accessibility and security) | `npm run test:e2e` | **68 / 68** |

The same suites run in CI on every pull request; all seven phase PRs merged green.

## Accessibility (axe, WCAG 2.2 A/AA)

Sign-in, all nine staff pages, an order page, the AI panel and the technician screens: no violations, on desktop and phone. Fixed during the pass: flag chip text contrast (new darker text tokens), demo button names matching their visible text, the calendar's "Today" button name, chart layers inside hidden regions, keyboard access to wide scrolling tables, two low-contrast labels. Reduced motion is honoured globally.

WCAG 2.2's target-size rule (2.5.8) also found jobs drawn over each other on the home schedule (now stacked into rows) and crowded calendar events. The calendar's list view, one full-width row per job and the default on phones, passes every rule and is the "equivalent control" 2.5.8 allows; the dense week grid is checked for everything except target size.

## Security

- No HSTS header of our own: Vercel sets it on every `*.vercel.app` response.
- Security headers on every response (CSP, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies); no CSP violations on any main page.
- RLS per role tested through the app's own RPCs; signed-out API calls get 401; cross-site and non-JSON posts to the AI route are refused.
- AI: all 22 [attack cases](ai-attack-cases.md) covered by automated tests; 8 also tried live.

## Live checks (deployed demo and local, real Groq models)

| Check | Result |
|---|---|
| Manager: "Which technician completed the most jobs this week?" | Bala, matching SQL (local 22, demo 16) |
| Manager: revenue by technician, overload next week, jobs completed today | Correct, each with its source |
| Technician: own jobs, own count, own customer's phone | Correct; phone matches the database |
| Technician: another technician's customer phone | "I don't have that data." |
| Off-topic, bulk-data, history-planted attacks | Blocked and logged |
| Deployed demo: all staff pages, AI answer | Load and answer (HTTP 200) |
| Technician home JavaScript | 156 KB compressed (budget 300 KB) |

## Defects found and fixed during the build (highlights)

| Found by | Defect | Fix |
|---|---|---|
| CI | Reassign dialog grew past the window (44 clashes listed) | Dialogs scroll; clash warning names 3 + "and N more" |
| E2E on phone | Home schedule covered the review tile's link | Grid item `min-w-0` |
| Live AI | Judge got HTTP 400 (`json_validate_failed`): reasoning used up the token cap | Low reasoning effort, larger caps |
| Live AI | Judge refused a technician's own customer phone | Judge examples; the database still decides access |
| Review | Blocked-request log could be flooded | Log rows need the caller's own counted request |
| Browser | Realtime joined before the session, so RLS hid every row | Set the Realtime token from the session first |

## Not covered / known gaps

- Largest Contentful Paint on throttled 4G was not measured (no Lighthouse run).
- Sounds were checked by ear, not automatically.
- The SQL side of Malaysia-day bucketing has no midnight-boundary test (completion times are set by the server); the TypeScript period maths is property-tested.
- Only Chromium is tested.
- Bulk "mark reviewed" by AI (FR-REV-4, stretch) is not built.
