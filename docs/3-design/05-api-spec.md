# 05 · API Specification

Status: Draft for approval. Three layers: **Postgres RPC** (source of truth), **Next.js Server Actions** (thin wrappers that validate with Zod and call RPCs as the user), and **one HTTP route** for the AI assistant.

## 0. API style: RPC, not REST

The app uses an **RPC-style API**: screens call named actions (`createOrder`, `startJob`, `completeJob`, `reviewOrder`, …) instead of editing resources with generic CRUD verbs.

| Reason | Detail |
|---|---|
| It's a workflow | Most writes are steps with rules (start, complete, review, close), not "update a row". Named actions match those steps one to one. |
| One locked door per step | `start_job` always checks "is this your job, and is it Assigned?". A generic `PATCH /orders/{id}` would let a caller try any status and would need extra guards. |
| All or nothing | Completing a job writes completion, payment and attachments, changes status, raises flags, builds the WhatsApp link and notifies managers — one transaction in one RPC, not several requests that can fail halfway. |
| Less code, smaller surface | Rules already live in the database; a REST layer would mostly forward calls (~15 extra routes plus rate limiting and CORS for each). Server Actions are not public URLs and give typed calls and automatic page refresh. |

**CRUD still exists underneath:** Create (`create_order`, `raise_flag`), Read (Server Component queries), Update (`update_order`, `reschedule_order`, `resolve_flag`), Delete deliberately absent — orders and audit history are never deleted; technicians are deactivated.

**Trade-off accepted:** no public REST API or OpenAPI document. If another client needs one, REST routes (`GET /api/orders`, `POST /api/orders/{id}/start`, …) can be added over the same RPC functions without moving any rule.

## 1. Response envelope
Every Server Action and the AI route return:

```ts
type Result<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: ErrorCode; message: string; field?: string; fields?: Record<string, string> } };
// `fields` carries one message per form field for VALIDATION errors.

type ErrorCode =
  | 'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'INVALID_TRANSITION' | 'CONFLICT' | 'RATE_LIMITED'
  | 'AI_BLOCKED' | 'AI_UNAVAILABLE' | 'INTERNAL';
```

- `message` is user-safe; raw Postgres errors are logged server-side and never returned.

| ErrorCode | Meaning | Example | HTTP status (AI route) | Screen behaviour |
|---|---|---|---|---|
| `VALIDATION` | Input failed the Zod or database checks | Phone `12345`; extra charges `-50`; 7th attachment | 400 | Highlight `field`, show message |
| `UNAUTHENTICATED` | No valid session | Session expired | 401 | Redirect to login |
| `FORBIDDEN` | Signed in, but this role or user may not do this | Technician starting someone else's job; admin reviewing | 403 | Show message, no retry |
| `NOT_FOUND` | Record doesn't exist **or** isn't visible to you (RLS hides it) | Technician opening another technician's order | 404 | "Order not found" |
| `INVALID_TRANSITION` | Action not allowed from the order's current status | Closing a Job Done order before review; starting a Closed order | 409 | Show message, refresh page to latest status |
| `CONFLICT` | Data changed since you loaded it, or a uniqueness clash | Two admins reassigning the same order at once | 409 | "This order changed — reload" |
| `RATE_LIMITED` | Too many requests in the window | 21st AI question within an hour | 429 | Show when the limit resets |
| `AI_BLOCKED` | A guardrail stage refused the question or answer (logged) | Prompt-injection attempt; off-topic question | 200 (`ok:false`) | Generic "I can't help with that" |
| `AI_UNAVAILABLE` | AI provider failed or timed out (fail closed) | Groq outage | 503 | "Assistant unavailable, try later" |
| `INTERNAL` | Unexpected server error (logged with details) | Bug, database down | 500 | "Something went wrong" + retry |

`NOT_FOUND` is deliberately used instead of `FORBIDDEN` when RLS hides a row, so the app never confirms that someone else's order exists.
- RPCs raise `SQLSTATE` codes mapped to `ErrorCode` (e.g. `P0001` + prefix `INVALID_TRANSITION:`).

## 2. RPC endpoints (Postgres functions)
Each function below is an **RPC API endpoint**: Supabase exposes it over HTTP at `POST /rest/v1/rpc/<function_name>` (e.g. `/rest/v1/rpc/start_job`). Our screens reach them through Server Actions, but **any signed-in user could call them directly**, so every function enforces role, ownership and current status itself and never trusts the UI.

All take the caller from `auth.uid()`; none accept an actor id. Money in sen. Times `timestamptz`.
Argument names are `p_`-prefixed in SQL (`id` → `p_order_id`, `reason` → `p_reason`, …) so they never collide with column names; the table shows them unprefixed for readability. Error codes come back as the message prefix, e.g. `VALIDATION: Reason is required`.

| Function | Caller | Args | Effect / returns |
|---|---|---|---|
| `create_order` | admin | customer_name, customer_phone, customer_address, problem_description, service_type_id, quoted_sen, scheduled_at, technician_id?, admin_notes? | Inserts order (New or Assigned), returns `{id, order_no, status}` |
| `update_order` | admin | id, customer_name, customer_phone, customer_address, problem_description, service_type_id, quoted_sen, admin_notes?, reason? | New/Assigned: free; In Progress: `reason` required (override); Job Done onwards: INVALID_TRANSITION. Technician and schedule change via their own RPCs |
| `assign_order` | admin | id, technician_id, reason? | New→Assigned; reassign while Assigned, or override while In Progress (reason required for both) |
| `reschedule_order` | admin | id, scheduled_at, reason | Updates time, `reschedule_count += 1` |
| `start_job` | tech (assigned) / admin + reason | id, reason? | Assigned→In Progress, `started_at = now()` |
| `complete_job` | tech (assigned) / admin + reason | id, work_done, extra_sen, remarks?, payment_amount_sen?, payment_method?, payment_receipt_path?, reason? | Writes completion and one payment per job (upsert), In Progress→Job Done; Phase 3 adds flags, WhatsApp, notifications. Attachments are registered separately (`register_attachment`, Phase 2) |
| `review_order` | manager | id, decision `approve`\|`send_back`, reason? | Job Done→Reviewed, or →In Progress (reason required) |
| `close_order` | manager | id, note? | Reviewed→Closed; note required when payment < final |
| `raise_flag` | admin, manager | order_id, severity, message | Manual flag |
| `resolve_flag` | admin, manager | flag_id, note | Open→Resolved |
| `mark_whatsapp_sent` | tech (own), admin | message_id | Sets `sent_at`, `sent_by` |
| `set_technician_active` | manager | profile_id, active | Fails if deactivating with open jobs |
| `set_sound_enabled` | any | enabled | Own profile |
| `mark_notifications_read` | any | ids[] \| all | Own rows |
| ~~`technician_day_load`~~ | — | — | Not an RPC: a plain read under RLS (`technicianDayLoad` in `src/features/orders/queries.ts`); counts and clashes are computed client-side by `findClashes` |

**Read RPCs used by AI tools** (also used by dashboard): `ai_jobs_list`, `ai_job_detail`, `ai_job_counts`, `ai_technician_leaderboard`, `ai_technician_workload`, `ai_flags_summary`, `ai_revenue_summary`. Each enforces role inside the function in addition to RLS and returns only the columns listed in §4.

## 3. Server Actions (Next.js)
One per write RPC, colocated with its feature (`src/features/<feature>/actions.ts`). Each:
1. Gets the user's Supabase client from cookies.
2. Validates input with the shared Zod schema (same schema as the form).
3. Calls the RPC; maps errors to the envelope.
4. `revalidatePath` for affected pages.

File uploads: the browser uploads directly to Storage with the user's session (path `job-files/orders/{orderId}/{uuid}-{name}`), allowed by the `storage.objects` policy only for the assigned technician's open job and only while the folder holds fewer than 12 objects. It then calls `registerAttachmentAction(orderId, path)` → `register_attachment(p_order_id, p_storage_path)`, which reads **type and size from Storage's own object metadata** (never from the browser) and enforces the type list, 10 MB / 50 MB limits and ≤ 6 files. Photos are compressed in the browser first. A file whose registration fails stays in the folder as an orphan (bounded by the 12-object cap) and can be retried without re-uploading. The payment receipt is uploaded the same way but not registered: it sits outside the 6-file limit and `complete_job` checks it exists and is an image or PDF.

## 3a. Screen-to-backend map

How to read it: **Front-end call** is what the screen invokes. A *Server Component* loads data while the page renders (a direct Supabase query as the signed-in user, so RLS applies). An *action* is a Next.js Server Action — not a public URL. **Backend** is the RPC, table query, Storage call or channel that does the work. The only public HTTP endpoint is `/api/ai/chat`.

### Sign-in
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Login → Sign in | `signIn` action | Supabase Auth `signInWithPassword`; then `profiles` (role, `is_active`) | All |
| Login → demo button | `signInDemo(user)` action | Same as above with seeded credentials | All |
| Any page (guard) | Middleware | Supabase Auth session refresh; `profiles.role` → redirect | All |
| Sign out | `signOut` action | Supabase Auth `signOut` | All |

### Admin / Manager — home (C2 schedule bento)
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| KPI tiles | Server Component | `kpi_summary(date_range)` | Admin, Manager |
| Flags-by-severity bar | Server Component | `flags` count by severity where `status = open` | Admin, Manager |
| Technician × hour schedule | Server Component + Realtime | `orders` where `scheduled_at` is today, joined to `profiles`; `orders` channel | Admin, Manager |
| Review queue tile | Server Component + Realtime | `orders` where `status = job_done`, ordered by worst open flag | Admin, Manager |

### Orders
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Order list (search, filters, pages) | Server Component (URL search params) | `orders` query with filters, `range()` 25 per page | Admin, Manager |
| New order form → service type dropdown | Server Component | `service_types` where `active` | Admin |
| New order form / Reassign dialog → technician picker | Server Component + `dayLoadAction` on date change | read of `orders` for the MYT day (RLS) | Admin |
| New order form → Submit | `createOrder` action | `create_order` | Admin |
| Post-submit summary → Notify technician | Link (no call) | `wa.me` link built from returned order | Admin |
| Order detail (fields, flags, payment, timeline) | Server Component | `orders` + `completions` + `payments` + `flags` + `audit_log` for the order | Admin, Manager, assigned Technician |
| Order detail → attachments | Server Component | `attachments` rows + Storage `createSignedUrls` | Admin, Manager, assigned Technician |
| Edit order | `updateOrder` action | `update_order` | Admin |
| Reassign | `assignOrder` action | `assign_order` | Admin |
| Reschedule | `rescheduleOrder` action | `reschedule_order` | Admin |
| Override start / complete | `startJob` / `completeJob` action with `reason` | `start_job` / `complete_job` | Admin |
| Resend WhatsApp feedback | Link + `markWhatsappSent` action | `whatsapp_messages` row → `mark_whatsapp_sent` | Admin |

### Review and flags
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Review queue page | Server Component | `orders` where `status = job_done` + open flags | Manager |
| Approve / Send back | `reviewOrder` action | `review_order` | Manager |
| Close order | `closeOrder` action | `close_order` | Manager |
| Flags page | Server Component | `flags` joined to `orders`, sorted High → Low | Admin, Manager |
| Raise flag | `raiseFlag` action | `raise_flag` | Admin, Manager |
| Resolve flag | `resolveFlag` action | `resolve_flag` | Admin, Manager |

### Technician (mobile)
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Today / Upcoming / History tabs | Server Component | `orders` where `technician_id = auth.uid()` (RLS), filtered by date | Technician |
| Next-job card → Navigate / Call | Links (no call) | Google Maps URL / `tel:` from the order | Technician |
| Start job | `startJob` action | `start_job` | Technician |
| Completion → add files | direct `storage.upload` (user session, RLS), then `registerAttachmentAction` | `register_attachment` | Technician |
| Completion → Mark job done | `completeJob` action | `complete_job` (fires flag, WhatsApp and notification triggers) | Technician |
| Success → Send feedback on WhatsApp | Link + `markWhatsappSent` action | `whatsapp_messages` row → `mark_whatsapp_sent` | Technician |

### Insights and admin
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Dashboard cards, leaderboard, charts | Server Component (period in URL) | `kpi_summary`, `kpi_leaderboard`, `kpi_jobs_per_day`, `kpi_service_mix` | Admin, Manager |
| Calendar (week / month, technician filter) | `getCalendarEvents(range, technician?)` action | `orders` in date range | Admin, Manager |
| Technicians page | Server Component | `profiles` where `role = technician` + open job counts | Manager |
| Deactivate / reactivate | `setTechnicianActive` action | `set_technician_active` | Manager |
| Audit log page | Server Component | `audit_log` with filters, paged | Admin, Manager |
| Blocked AI requests page | Server Component | `ai_blocked_log`, paged | Manager |

### Shared (every screen)
| Screen / control | Front-end call | Backend | Role |
|---|---|---|---|
| Bell (list + unread count) | Server Component + Realtime subscription | `notifications` where `recipient_id = auth.uid()`; `notifications` channel | All |
| Bell → mark read | `markNotificationsRead` action | `mark_notifications_read` | All |
| Sound toggle | `setSoundEnabled` action | `set_sound_enabled` | All |
| AI button → chat panel | `fetch('POST /api/ai/chat')` | Guardrail pipeline → `ai_*` read RPCs + Groq | All |
| AI bulk-review card → Confirm (stretch) | `reviewOrder` action per order, `via = ai` | `review_order` | Manager |

New read functions introduced by this map: `kpi_summary`, `kpi_leaderboard`, `kpi_jobs_per_day`, `kpi_service_mix` — `SECURITY INVOKER`, MYT date bucketing, Admin/Manager only.

## 4. AI route — `POST /api/ai/chat`

**Request**
```json
{ "message": "Which technician completed the most jobs this week?",
  "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }] }
```
- Auth: Supabase session cookie (required). `history` ≤ 3 turns, each ≤ 500 chars, server re-validates.

**Response (200)**
```json
{ "ok": true,
  "data": {
    "answer": "Bala completed 11 jobs this week — the team average is 7.",
    "sources": [{ "tool": "technician_leaderboard", "period": "this_week" }],
    "proposal": null } }
```
`proposal` is non-null only for the stretch bulk-review tool: `{ "type": "bulk_review", "order_ids": [...], "count": 7 }`.

**Errors**: `RATE_LIMITED` (429), `AI_BLOCKED` (200 with `ok:false`, generic message, stage logged), `AI_UNAVAILABLE` (503), `UNAUTHENTICATED` (401).

**Tool schemas** (sent to the model; Zod mirrors them server-side)

```ts
const DateRange = z.union([
  z.enum(['today','yesterday','this_week','last_week','this_month','last_month']),
  z.object({ from: z.string().date(), to: z.string().date() })   // ≤ 92 days
]);

jobs_list:              { technician?: string; status?: Status; date_range: DateRange; limit?: number /* ≤ 20 */ }
job_detail:             { order_no: string /* ^ORD-\d{6}-\d{4}$ */ }
job_counts:             { status?: Status; date_range: DateRange; group_by?: 'technician'|'service_type'|'day' }
technician_leaderboard: { date_range: DateRange; metric: 'jobs_completed'|'revenue'|'flags'|'reschedules' }
technician_workload:    { week: 'this_week'|'last_week'|'next_week' }
flags_summary:          { severity?: 'high'|'medium'|'low'; status?: 'open'|'resolved'; date_range: DateRange }
revenue_summary:        { date_range: DateRange; group_by?: 'technician'|'service_type'|'day' }
```

**Tool result columns (whitelist)**: `order_no, status, service_type, technician_name, scheduled_at, completed_at, quoted_rm, final_rm, flag_severity, flag_rule_code`, plus aggregates.
**Customer contact** `customer_name, customer_phone, customer_address` is added per row only when the caller is Admin, Manager, or the technician currently assigned to that order (checked inside the RPC, backed by RLS). Address is capped at 200 chars and wrapped as untrusted data.
**Never returned**: problem description, remarks, admin notes, work done, flag/resolution notes.

**Intent judge contract** (`gpt-oss-20b`, `response_format: json_object`)
```json
{ "intent": "in_scope" | "out_of_scope" | "malicious", "reason": "string ≤ 120 chars" }
```
Anything else → block (`stage: "intent"`).

## 5. Realtime channels
| Channel | Filter | Consumer |
|---|---|---|
| `notifications` (postgres_changes INSERT/UPDATE) | `recipient_id=eq.{uid}` | Bell + chime |
| `orders` (UPDATE) | admin/manager only | Home schedule and review queue refresh |

## 6. WhatsApp deep link format
```
https://wa.me/{customer_phone}?text={urlencoded body}
```
Feedback body (brief's template):
```
Hi {customer_name},
Job {order_no} has been completed by Technician {technician_name} at {completed_at dd/mm/yyyy HH:mm}.
Please check and leave feedback.
Thank you!
```
