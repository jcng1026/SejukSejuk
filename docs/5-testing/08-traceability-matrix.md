# 08 · Traceability Matrix

Requirement → where it is built → where it is tested. Test files: unit `src/**`, database `supabase/tests/`, end-to-end `e2e/`.

| Req | Built in | Tested by |
|---|---|---|
| FR-AUTH-1..3 | `features/auth`, `lib/auth.ts`, RLS (`current_app_role`) | `e2e/auth.spec`, `supabase/tests/rls` |
| FR-ORD-1..5 | `create_order`, `features/orders/NewOrderForm` | `supabase/tests/orders`, `orders/schema.test`, `phone.test`, `e2e/orders.spec` |
| FR-ORD-6 | `TechnicianPicker`, `findClashes`, `describeClashes` | `orders/schedule.test`, `e2e/orders.spec` |
| FR-ORD-7 | `orders/whatsapp.ts` | `orders/whatsapp.test`, `e2e/orders.spec` |
| FR-ORD-8..10 | `update_order`, `assign_order`, `reschedule_order` | `supabase/tests/update-order`, `transitions`, `e2e/orders.spec` |
| FR-ORD-11..13 | `OrdersTable`, `filters.ts`, `order-detail.ts` | `orders/filters.test`, `search.test`, `timeline.test`, `e2e/orders.spec` |
| FR-TEC-1..6 | `features/jobs`, `start_job`, `complete_job`, `register_attachment` | `supabase/tests/transitions`, `attachments`, `e2e/technician.spec` |
| FR-REV-1..3 | `/review`, `review_order`, `close_order` | `supabase/tests/transitions`, `e2e/review.spec` |
| FR-REV-4 (C) | Not built (stretch) | — |
| FR-FLG-1 | `raise_auto_flags` trigger | `supabase/tests/job-done` (boundaries + property test) |
| FR-FLG-2..4 | `raise_flag`, `resolve_flag`, `/flags`, job page | `supabase/tests/flags-messages`, `e2e/review.spec` |
| FR-NOT-1..2 | `queue_feedback_message` trigger, `WhatsAppSendButton`, `mark_whatsapp_sent` | `supabase/tests/job-done`, `flags-messages`, `e2e/review.spec` |
| FR-NOT-3 | Bell + Realtime (`useNotifications`) | `notifications/notice.test`, `e2e/review.spec` |
| FR-NOT-4 | `notifications/sound.ts`, `SoundToggle` | `e2e` (toggle present); sound itself checked by hand |
| FR-KPI-1..4 | `kpi_*` functions, `/dashboard`, `kpi/period.ts` | `supabase/tests/kpi`, `kpi/period.test` (property), `e2e/insights.spec` |
| FR-CAL-1 | `/calendar`, `GET /api/calendar` | `e2e/insights.spec` (incl. UTC browser) |
| FR-HOME-1 | `/home`, `home/timeline.ts`, `LiveRefresh` | `home/timeline.test` (property), `e2e/insights.spec` |
| FR-AUD-1 | `audit_row` triggers | `supabase/tests/audit` |
| FR-AUD-2 | `/audit`, `audit/filters.ts` | `audit/filters.test`, `e2e/insights.spec` |
| FR-ADM-1 | `/team`, `set_technician_active` | `supabase/tests/transitions`, `e2e/insights.spec` |
| FR-AI-1, -5 | `AiAssistant`, `AiLauncher` | `e2e/ai.spec` |
| FR-AI-2, -3, -10 | `ai_*` tool RPCs, `ai/tools.ts` | `supabase/tests/ai-tools`, `ai/tools.test` |
| FR-AI-4, -9 | `ai/pipeline.ts`, `screens.ts`, `intent.ts`, `agent.ts` | `ai/pipeline.test`, `screens.test`, [ai-attack-cases.md](ai-attack-cases.md) |
| FR-AI-6, -8 | `ai_take_quota`, `ai_log_blocked`, `/ai-log` | `supabase/tests/ai-tools`, `e2e/ai.spec` |
| FR-AI-7 | Tool set + prompts | Live checks in [09](09-test-report.md) |
| NFR-1 Responsive | Mobile-first technician screens | All e2e on Pixel 7 |
| NFR-2 Performance | Server Components, route-split charts/calendar | Measured in [09](09-test-report.md) |
| NFR-3 Security | RLS, RPC-only writes, `security-headers.ts` | `supabase/tests/rls`, `security-headers.test`, `e2e/security.spec` |
| NFR-4 Traceability | Audit triggers, reasons on RPCs | `supabase/tests/audit` |
| NFR-5 Data correctness | Integer sen, MYT bucketing | `money.test`, `schedule.test`, `period.test` (property) |
| NFR-6 Accessibility | Labels, focus, contrast tokens, reduced motion | `e2e/a11y.spec` (axe WCAG 2.2 AA) |
| NFR-7 Reliability | Fail-closed AI, upload retries | `ai/pipeline.test`, `e2e/technician.spec` |
| NFR-8 Maintainability | Strict TS, CI | `npm run check` in CI |
| NFR-9 Licensing | `CREDITS.md` | Review |
| NFR-10 Locale | `formatSen`, `formatMytWhen` | `money.test`, `schedule.test` |
