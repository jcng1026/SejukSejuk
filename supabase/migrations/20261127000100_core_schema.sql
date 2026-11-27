-- Core schema (docs/3-design/04-design.md §3).
-- Money is integer sen. Times are timestamptz; "day" logic uses Asia/Kuala_Lumpur.

create schema if not exists private;

-- ---------------------------------------------------------------- enums
create type public.user_role      as enum ('admin', 'technician', 'manager');
create type public.order_status   as enum ('new', 'assigned', 'in_progress', 'job_done', 'reviewed', 'closed');
create type public.flag_severity  as enum ('high', 'medium', 'low');
create type public.flag_status    as enum ('open', 'resolved');
create type public.flag_source    as enum ('auto', 'manual');
create type public.payment_method as enum ('cash', 'transfer', 'card', 'qr');
create type public.audit_via      as enum ('ui', 'ai', 'system');
create type public.whatsapp_kind  as enum ('feedback', 'tech_notify');

-- ---------------------------------------------------------------- people
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (length(full_name) between 1 and 80),
  role          public.user_role not null,
  phone         text check (phone ~ '^60[0-9]{8,10}$'),
  is_active     boolean not null default true,
  sound_enabled boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.service_types (
  id     smallint generated always as identity primary key,
  name   text not null unique,
  active boolean not null default true
);

-- ---------------------------------------------------------------- orders
create table private.order_counters (
  day        date primary key,
  last_value integer not null
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            text not null unique check (order_no ~ '^ORD-[0-9]{6}-[0-9]{4}$'),
  status              public.order_status not null,
  customer_name       text not null check (length(customer_name) between 1 and 120),
  customer_phone      text not null check (customer_phone ~ '^60[0-9]{8,10}$'),
  customer_address    text not null check (length(customer_address) between 1 and 200),
  problem_description text not null check (length(problem_description) between 1 and 2000),
  service_type_id     smallint not null references public.service_types (id),
  quoted_sen          integer not null check (quoted_sen >= 0),
  scheduled_at        timestamptz not null,
  technician_id       uuid references public.profiles (id),
  created_by          uuid references public.profiles (id),
  assigned_by         uuid references public.profiles (id),
  admin_notes         text check (length(admin_notes) <= 2000),
  reschedule_count    integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.profiles (id),
  closed_at           timestamptz,
  closed_by           uuid references public.profiles (id),
  -- Only a New order may be unassigned.
  constraint orders_technician_matches_status check ((status = 'new') = (technician_id is null))
);

create index orders_technician_scheduled_idx on public.orders (technician_id, scheduled_at);
create index orders_status_idx on public.orders (status);
create index orders_scheduled_idx on public.orders (scheduled_at);
create index orders_completed_idx on public.orders (completed_at) where completed_at is not null;

create table public.completions (
  order_id      uuid primary key references public.orders (id) on delete cascade,
  work_done     text not null check (length(work_done) between 1 and 2000),
  extra_sen     integer not null default 0 check (extra_sen >= 0),
  final_sen     integer not null check (final_sen >= 0),
  remarks       text check (length(remarks) <= 2000),
  technician_id uuid not null references public.profiles (id),
  completed_at  timestamptz not null default now()
);

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  storage_path text not null unique,
  mime         text not null,
  size_bytes   integer not null check (size_bytes > 0),
  uploaded_by  uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index attachments_order_idx on public.attachments (order_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  amount_sen   integer not null check (amount_sen > 0),
  method       public.payment_method not null,
  receipt_path text,
  recorded_by  uuid not null references public.profiles (id),
  recorded_at  timestamptz not null default now()
);
-- One payment record per job: re-completing a job that was sent back replaces it.
create unique index payments_order_key on public.payments (order_id);

create table public.flags (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  rule_code       text,
  severity        public.flag_severity not null,
  source          public.flag_source not null,
  message         text not null check (length(message) between 1 and 300),
  status          public.flag_status not null default 'open',
  raised_by       uuid references public.profiles (id),
  raised_at       timestamptz not null default now(),
  resolved_by     uuid references public.profiles (id),
  resolved_at     timestamptz,
  resolution_note text check (length(resolution_note) <= 1000),
  constraint flags_rule_matches_source check ((source = 'auto') = (rule_code is not null)),
  constraint flags_resolution_complete check (
    (status = 'open' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null and resolution_note is not null)
  )
);
create index flags_order_idx on public.flags (order_id);
create index flags_open_idx on public.flags (severity, raised_at) where status = 'open';

create table public.whatsapp_messages (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  kind       public.whatsapp_kind not null,
  to_phone   text not null,
  body       text not null,
  link       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  sent_by    uuid references public.profiles (id)
);
create index whatsapp_order_idx on public.whatsapp_messages (order_id);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  order_id     uuid references public.orders (id) on delete cascade,
  type         text not null,
  severity     public.flag_severity,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------- audit & config
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  uuid,
  order_id   uuid,
  action     text not null,
  actor_id   uuid,
  before     jsonb,
  after      jsonb,
  reason     text,
  via        public.audit_via not null default 'ui',
  created_at timestamptz not null default now()
);
create index audit_order_idx on public.audit_log (order_id, id);
create index audit_created_idx on public.audit_log (created_at desc);

create table public.app_config (
  key   text primary key,
  value jsonb not null
);

create table public.ai_requests (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null,
  tools_used jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

create table public.ai_blocked_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  role       public.user_role,
  stage      text not null,
  reason     text not null,
  input      text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- privileges
-- Default deny. The hosted project auto-exposes new objects, the local one does
-- not (config.jsonc); revoking here makes both behave identically.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public;

-- Signed-in users may only READ (RLS decides which rows). All writes go through
-- SECURITY DEFINER RPCs that check role and state first.
grant select on
  public.profiles, public.service_types, public.orders, public.completions,
  public.attachments, public.payments, public.flags, public.whatsapp_messages,
  public.notifications, public.audit_log, public.app_config, public.ai_blocked_log
to authenticated;

alter table public.profiles          enable row level security;
alter table public.service_types     enable row level security;
alter table public.orders            enable row level security;
alter table public.completions       enable row level security;
alter table public.attachments       enable row level security;
alter table public.payments          enable row level security;
alter table public.flags             enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.notifications     enable row level security;
alter table public.audit_log         enable row level security;
alter table public.app_config        enable row level security;
alter table public.ai_requests       enable row level security;
alter table public.ai_blocked_log    enable row level security;
