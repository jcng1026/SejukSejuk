-- Audit trail, status state machine and order numbers (design §3–§4).

-- ---------------------------------------------------------------- shared helpers
-- Raises an error whose message starts with an API error code (api-spec §1).
create function private.fail(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_code || ': ' || p_message, errcode = 'P0001';
end
$$;

-- Records why/how the current transaction changes data; read by the audit trigger.
create function private.set_audit_context(p_reason text, p_via public.audit_via default 'ui')
returns void
language sql
set search_path = ''
as $$
  select set_config('app.reason', coalesce(p_reason, ''), true),
         set_config('app.via', p_via::text, true);
$$;

-- ---------------------------------------------------------------- audit trigger
create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_actor uuid := auth.uid();
  v_via text := nullif(current_setting('app.via', true), '');
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, reason, via)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'order_id')::uuid,
    case when tg_table_name = 'orders' then (v_row ->> 'id')::uuid else (v_row ->> 'order_id')::uuid end,
    tg_op,
    v_actor,
    v_old,
    v_new,
    nullif(current_setting('app.reason', true), ''),
    coalesce(v_via, case when v_actor is null then 'system' else 'ui' end)::public.audit_via
  );
  return coalesce(new, old);
end
$$;

create trigger audit_orders      after insert or update or delete on public.orders      for each row execute function private.audit_row();
create trigger audit_completions after insert or update or delete on public.completions for each row execute function private.audit_row();
create trigger audit_payments    after insert or update or delete on public.payments    for each row execute function private.audit_row();
create trigger audit_attachments after insert or update or delete on public.attachments for each row execute function private.audit_row();
create trigger audit_flags       after insert or update or delete on public.flags       for each row execute function private.audit_row();
create trigger audit_profiles    after insert or update or delete on public.profiles    for each row execute function private.audit_row();

-- ---------------------------------------------------------------- orders housekeeping
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger orders_touch_updated_at before update on public.orders
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- state machine
-- The only legal status changes. Any other change is rejected, whoever makes it.
create function private.guard_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.status, new.status) not in (
    ('new'::public.order_status,         'assigned'::public.order_status),
    ('assigned'::public.order_status,    'in_progress'::public.order_status),
    ('in_progress'::public.order_status, 'job_done'::public.order_status),
    ('job_done'::public.order_status,    'reviewed'::public.order_status),
    ('job_done'::public.order_status,    'in_progress'::public.order_status),
    ('reviewed'::public.order_status,    'closed'::public.order_status)
  ) then
    perform private.fail('INVALID_TRANSITION', format('%s -> %s is not allowed', old.status, new.status));
  end if;
  return new;
end
$$;

create trigger orders_guard_status before update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function private.guard_order_status();

-- ---------------------------------------------------------------- order numbers
-- ORD-YYMMDD-#### using the Malaysia date; the upsert row-locks the day's
-- counter, so concurrent creates can never receive the same number.
create function private.next_order_no(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (p_at at time zone 'Asia/Kuala_Lumpur')::date;
  v_n integer;
begin
  insert into private.order_counters as c (day, last_value)
  values (v_day, 1)
  on conflict (day) do update set last_value = c.last_value + 1
  returning c.last_value into v_n;

  if v_n > 9999 then
    perform private.fail('CONFLICT', 'Daily order number limit reached');
  end if;
  return 'ORD-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_n::text, 4, '0');
end
$$;
