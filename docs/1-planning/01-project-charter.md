# 01 · Project Charter — Sejuk Sejuk Ops

| | |
|---|---|
| Document status | Draft for approval |
| Date | 2026-11-27 |
| Deadline | ~2026-11-30 (≈64 hours from start) |

## 1. Background
Sejuk Sejuk Service Sdn Bhd (fictional) installs, services and repairs air-conditioners for homes and businesses: 5 branches, 40+ field technicians, admins on desktop, technicians on mobile. Today the workflow is not digitised end to end.

## 2. Goal
Digitise the service workflow **Order → Assignment → Service Completion → Manager/Accounts Review** in one responsive web app, with traceability, low-noise notifications, performance metrics and a guarded AI assistant.

## 3. Objectives (measurable)
1. An admin can create and assign an order in under 1 minute on desktop.
2. A technician can start and complete a job in ≤ 3 screens on a 375px phone.
3. Every status change and edit is recorded with actor and timestamp (100% trigger coverage on `orders`).
4. Completed jobs are automatically checked against 6 flag rules at submission.
5. Managers see weekly KPIs and can ask the AI assistant operational questions answered only from role-scoped, tool-retrieved data.
6. Live demo on Vercel + public GitHub repo with SDLC docs and README.

## 4. Scope
**In scope (v1):** modules 1–3 of the brief (admin order form, technician completion, WhatsApp trigger), KPI dashboard, calendar, rule-based flags (auto + manual), audit log, in-app notifications with sound, AI operations assistant with a 6-stage guardrail pipeline, real auth with one-click demo logins, technician deactivation, rescheduling with reasons.

**Stretch:** AI-proposed bulk "mark Reviewed" with UI confirmation; full job transfer.

**Out of scope (future work):** multi-branch, technician leave/unavailability, Cancelled status, customers table, discounts/negative extras, monthly reports, drag-to-reschedule, paid WhatsApp API.

## 5. Stakeholders and roles
| Role | Interest |
|---|---|
| Admin (desktop) | Create, assign, reschedule orders; resolve flags |
| Technician (mobile) | See jobs, complete them fast in the field |
| Manager (desktop) | Review, close, KPIs, oversight, AI insights |
| Assessor | Evaluates system thinking, UX, AI integration, explanation |

## 6. Assumptions
- Single branch is sufficient to demonstrate the design; `branch` can be added later.
- Each technician account is one person (team lead's phone).
- `wa.me` deep links are acceptable in place of a paid WhatsApp API.
- Free tiers (Supabase, Vercel, Groq) are sufficient for a reviewer demo.
- Final amount = quoted price + extra charges (extras ≥ 0).

## 7. Constraints
- Time: ~64 hours total, one developer with AI assistance.
- Cost: free tiers only. Supabase free: 1 GB storage, 50 MB per file. Groq free: ~30 RPM / 1K RPD / 8K TPM per model.
- Stack: Next.js + TypeScript + Tailwind + Supabase + Vercel (brief's preference).
- Fonts and assets limited to licences that allow the use made of them (see design doc §9).

## 8. Milestones
| # | Milestone | Target |
|---|---|---|
| M0 | Requirements and design docs 1–6 approved | Day 1 |
| M1 | Repo, CI, schema, RLS, seed, auth | Day 1 |
| M2 | Admin order flow + technician completion + flags + audit | Day 2 |
| M3 | WhatsApp trigger, notifications, review/close | Day 2 |
| M4 | KPI dashboard, calendar | Day 3 |
| M5 | AI assistant + guardrails | Day 3 |
| M6 | Tests green, deploy, docs 7–13, README | Day 3 (deadline) |

Detailed tasks: [06-implementation-plan.md](../4-implementation/06-implementation-plan.md). Risks: [02-risk-register.md](02-risk-register.md).

## 9. Success criteria
- All "Must" requirements in the SRS pass their acceptance tests.
- CI green on `main`; live demo reachable; seeded data shows every status and flag level.
- Guardrail attack cases in the test plan are all blocked and logged.

## 10. Approval
| Name | Role | Decision | Date |
|---|---|---|---|
| (owner) | Developer / product owner | ☐ Approved ☐ Changes requested | |
