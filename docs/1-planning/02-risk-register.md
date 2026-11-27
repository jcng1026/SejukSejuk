# 02 · Risk Register

Scale: Likelihood (L) and Impact (I) 1–3. Score = L × I. Reviewed at each milestone.

| ID | Risk | L | I | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | Scope exceeds 64 hours | 3 | 3 | 9 | Tiered scope; stretch items only after Core + Tier 2 pass; cut list in implementation plan | Dev |
| R2 | Prompt injection (direct or via stored free text) makes AI leak data or misbehave | 2 | 3 | 6 | 6-stage guardrail pipeline; free text excluded from tool results; read-only role-scoped tools under RLS; output screen; fail closed | Dev |
| R3 | Groq free-tier limits (8K TPM, 1K RPD) or outage break the AI demo | 2 | 2 | 4 | ≤5 tools per role, ≤3 history turns, per-user rate limit; fail closed with clear message; Gemini documented as manual fallback | Dev |
| R4 | RLS misconfiguration exposes other users' data | 2 | 3 | 6 | RLS on every table, default deny; RLS integration tests per role in CI | Dev |
| R5 | Supabase free storage (1 GB / 50 MB per file) exceeded by uploads | 2 | 2 | 4 | 10 MB image/PDF and 50 MB video caps; browser photo compression; seed uses tiny placeholders | Dev |
| R6 | Free hosted Supabase project pauses after inactivity before review | 2 | 3 | 6 | Note in deployment guide; check and resume before submission; reset script restores demo | Dev |
| R7 | Font/asset licence breach in a public repo | 1 | 2 | 2 | ITF fonts loaded via Fontshare CDN only; commit only redistributable assets; `CREDITS.md` | Dev |
| R8 | Fontshare CDN slow/unavailable | 2 | 1 | 2 | Fallback to Plus Jakarta Sans 800 for headings | Dev |
| R9 | Free-tier model IDs deprecated or renamed | 2 | 2 | 4 | Model IDs in env vars, not code; tested at deploy | Dev |
| R10 | Flags too noisy (every extra charge flags) annoying managers | 2 | 2 | 4 | Severity levels; only High pushes individual alerts; others grouped | Dev |
| R11 | Time-zone bugs in "today/this week" queries and KPIs | 2 | 2 | 4 | All date bucketing in SQL with `Asia/Kuala_Lumpur`; property tests on date ranges | Dev |
| R12 | Money rounding errors | 1 | 3 | 3 | Integer sen everywhere; property tests on final amount and flag thresholds | Dev |
| R13 | Mobile upload fails on poor field connectivity | 2 | 2 | 4 | Per-file upload with retry and progress; form keeps state; submission only after uploads complete | Dev |
| R14 | Secrets leaked to the repo | 1 | 3 | 3 | `.env*` gitignored; service-role key server-only; `.env.example` with placeholders | Dev |
| R15 | Docker/local Supabase issues slow development on Windows | 2 | 2 | 4 | Fallback: run tests against a second free hosted project | Dev |
