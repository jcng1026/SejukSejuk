-- Workflow RPCs (docs/3-design/05-api-spec.md §2). Every write in the system
-- goes through one of these. Each is SECURITY DEFINER, checks the caller's role
-- and the order's state first, and sets the audit context before writing.

-- ---------------------------------------------------------------- guards
create function private.require_role(p_allowed public.user_role[])
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.current_app_role();
begin
  if v_role is null or not (v_role = any (p_allowed)) then
    perform private.fail('FORBIDDEN', 'You do not have permission to do this');
  end if;
  return v_role;
end
$$;

create function private.require_text(p_value text, p_field text, p_max_length integer default 2000)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    perform private.fail('VALIDATION', p_field || ' is required');
  end if;
  if length(btrim(p_value)) > p_max_length then
    perform private.fail('VALIDATION', format('%s must be at most %s characters', p_field, p_max_length));
  end if;
  return btrim(p_value);
end
$$;

-- Optional text: NULL when blank, VALIDATION when too long.
create function private.optional_text(p_value text, p_field text, p_max_length integer default 2000)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return private.require_text(p_value, p_field, p_max_length);
end
$$;

create function private.require_active_technician(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_profile_id and role = 'technician' and is_active
  ) then
    perform private.fail('VALIDATION', 'Technician must be an active technician');
  end if;
end
$$;

-- Locks and returns the order, or fails with NOT_FOUND.
create function private.lock_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    perform private.fail('NOT_FOUND', 'Order not found');
  end if;
  return v_order;
end
$$;

-- The assigned technician may act; an admin may act on their behalf only with a reason.
create function private.require_job_actor(p_order public.orders, p_reason text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.require_role(array['technician', 'admin']::public.user_role[]);
begin
  -- NOT_FOUND, not FORBIDDEN: RLS hides other technicians' orders, so the RPC
  -- must not reveal that the order exists (api-spec §1).
  if v_role = 'technician' and p_order.technician_id is distinct from auth.uid() then
    perform private.fail('NOT_FOUND', 'Order not found');
  end if;
  if v_role = 'admin' and coalesce(btrim(p_reason), '') = '' then
    perform private.fail('VALIDATION', 'A reason is required when acting for the technician');
  end if;
end
$$;

create function private.require_status(p_order public.orders, p_expected public.order_status[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (p_order.status = any (p_expected)) then
    perform private.fail('INVALID_TRANSITION', format('Order is %s', p_order.status));
  end if;
end
$$;

-- ---------------------------------------------------------------- create_order
create function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_problem_description text,
  p_service_type_id smallint,
  p_quoted_sen integer,
  p_scheduled_at timestamptz,
  p_technician_id uuid default null,
  p_admin_notes text default null
)
returns table (id uuid, order_no text, status public.order_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_no text;
  v_status public.order_status := case when p_technician_id is null then 'new' else 'assigned' end;
begin
  perform private.require_role(array['admin']::public.user_role[]);
  perform private.require_text(p_customer_name, 'Customer name', 120);
  perform private.require_text(p_customer_address, 'Address', 200);
  perform private.require_text(p_problem_description, 'Problem description', 2000);
  perform private.optional_text(p_admin_notes, 'Admin notes', 2000);
  if p_customer_phone is null or p_customer_phone !~ '^60[0-9]{8,10}$' then
    perform private.fail('VALIDATION', 'Phone must be a Malaysian number stored as 60XXXXXXXXX');
  end if;
  if p_quoted_sen is null or p_quoted_sen < 0 then
    perform private.fail('VALIDATION', 'Quoted price must be zero or more');
  end if;
  if p_scheduled_at is null then
    perform private.fail('VALIDATION', 'Scheduled time is required');
  end if;
  if not exists (select 1 from public.service_types st where st.id = p_service_type_id and st.active) then
    perform private.fail('VALIDATION', 'Unknown service type');
  end if;
  if p_technician_id is not null then
    perform private.require_active_technician(p_technician_id);
  end if;

  perform private.set_audit_context(null);
  v_no := private.next_order_no();

  insert into public.orders (
    order_no, status, customer_name, customer_phone, customer_address, problem_description,
    service_type_id, quoted_sen, scheduled_at, technician_id, created_by, assigned_by, admin_notes
  ) values (
    v_no, v_status, btrim(p_customer_name), p_customer_phone, btrim(p_customer_address),
    btrim(p_problem_description), p_service_type_id, p_quoted_sen, p_scheduled_at, p_technician_id,
    auth.uid(), case when p_technician_id is null then null else auth.uid() end, nullif(btrim(p_admin_notes), '')
  )
  returning orders.id into v_id;

  return query select v_id, v_no, v_status;
end
$$;

-- ---------------------------------------------------------------- assign / reschedule
create function public.assign_order(p_order_id uuid, p_technician_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_role(array['admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  -- In Progress is the agreed admin override (reason required below), e.g. a
  -- technician falls sick mid-job; once Job Done the technician is fixed.
  perform private.require_status(v_order, array['new', 'assigned', 'in_progress']::public.order_status[]);
  perform private.require_active_technician(p_technician_id);

  if v_order.status <> 'new' then
    if v_order.technician_id = p_technician_id then
      return;
    end if;
    perform private.require_text(p_reason, 'A reason for reassigning');
  end if;

  perform private.set_audit_context(p_reason);
  update public.orders
  set technician_id = p_technician_id,
      assigned_by = auth.uid(),
      status = case when status = 'new' then 'assigned'::public.order_status else status end
  where id = p_order_id;
end
$$;

create function public.reschedule_order(p_order_id uuid, p_scheduled_at timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_role(array['admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_status(v_order, array['new', 'assigned']::public.order_status[]);
  perform private.require_text(p_reason, 'A reason for rescheduling');
  if p_scheduled_at is null then
    perform private.fail('VALIDATION', 'Scheduled time is required');
  end if;

  perform private.set_audit_context(p_reason);
  update public.orders
  set scheduled_at = p_scheduled_at,
      reschedule_count = reschedule_count + 1
  where id = p_order_id;
end
$$;

-- ---------------------------------------------------------------- field work
create function public.start_job(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_role(array['technician', 'admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_job_actor(v_order, p_reason);
  perform private.require_status(v_order, array['assigned']::public.order_status[]);

  perform private.set_audit_context(p_reason);
  update public.orders set status = 'in_progress', started_at = now() where id = p_order_id;
end
$$;

create function public.complete_job(
  p_order_id uuid,
  p_work_done text,
  p_extra_sen integer,
  p_remarks text default null,
  p_payment_amount_sen integer default null,
  p_payment_method public.payment_method default null,
  p_payment_receipt_path text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_role(array['technician', 'admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_job_actor(v_order, p_reason);
  perform private.require_status(v_order, array['in_progress']::public.order_status[]);
  perform private.require_text(p_work_done, 'Work done', 2000);
  perform private.optional_text(p_remarks, 'Remarks', 2000);
  if p_payment_receipt_path is not null
     and private.order_id_from_path(p_payment_receipt_path) is distinct from p_order_id then
    perform private.fail('VALIDATION', 'Receipt must be uploaded to this order''s folder');
  end if;
  if p_extra_sen is null or p_extra_sen < 0 then
    perform private.fail('VALIDATION', 'Extra charges must be zero or more');
  end if;
  if (p_payment_amount_sen is null) <> (p_payment_method is null) then
    perform private.fail('VALIDATION', 'Payment needs both an amount and a method');
  end if;
  if p_payment_amount_sen is not null and p_payment_amount_sen <= 0 then
    perform private.fail('VALIDATION', 'Payment amount must be more than zero');
  end if;

  perform private.set_audit_context(p_reason);

  -- Server-stamped: the technician and time come from the order and the clock,
  -- never from the client (SRS FR-TEC-3). A job sent back is completed again.
  insert into public.completions (order_id, work_done, extra_sen, final_sen, remarks, technician_id, completed_at)
  values (
    p_order_id, btrim(p_work_done), p_extra_sen, v_order.quoted_sen + p_extra_sen,
    nullif(btrim(p_remarks), ''), v_order.technician_id, now()
  )
  on conflict (order_id) do update
  set work_done = excluded.work_done,
      extra_sen = excluded.extra_sen,
      final_sen = excluded.final_sen,
      remarks = excluded.remarks,
      technician_id = excluded.technician_id,
      completed_at = excluded.completed_at;

  if p_payment_amount_sen is not null then
    insert into public.payments (order_id, amount_sen, method, receipt_path, recorded_by, recorded_at)
    values (p_order_id, p_payment_amount_sen, p_payment_method, nullif(btrim(p_payment_receipt_path), ''), auth.uid(), now())
    on conflict (order_id) do update
    set amount_sen = excluded.amount_sen,
        method = excluded.method,
        receipt_path = excluded.receipt_path,
        recorded_by = excluded.recorded_by,
        recorded_at = excluded.recorded_at;
  end if;

  update public.orders set status = 'job_done', completed_at = now() where id = p_order_id;
end
$$;

-- ---------------------------------------------------------------- review / close
create function public.review_order(p_order_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_role(array['manager']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_status(v_order, array['job_done']::public.order_status[]);

  if p_decision = 'approve' then
    perform private.set_audit_context(p_reason);
    update public.orders
    set status = 'reviewed', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_order_id;
  elsif p_decision = 'send_back' then
    perform private.require_text(p_reason, 'A reason for sending the job back');
    perform private.set_audit_context(p_reason);
    update public.orders set status = 'in_progress', completed_at = null where id = p_order_id;
  else
    perform private.fail('VALIDATION', 'Decision must be approve or send_back');
  end if;
end
$$;

create function public.close_order(p_order_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_final integer;
  v_paid integer;
begin
  perform private.require_role(array['manager']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_status(v_order, array['reviewed']::public.order_status[]);

  select c.final_sen into v_final from public.completions c where c.order_id = p_order_id;
  select coalesce(sum(p.amount_sen), 0) into v_paid from public.payments p where p.order_id = p_order_id;
  if v_paid < coalesce(v_final, 0) and coalesce(btrim(p_note), '') = '' then
    perform private.fail('VALIDATION', 'Recorded payment is below the final amount; add a settlement note');
  end if;

  perform private.set_audit_context(p_note);
  update public.orders set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_order_id;
end
$$;

-- ---------------------------------------------------------------- people
create function public.set_technician_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['manager']::public.user_role[]);
  if not exists (select 1 from public.profiles where id = p_profile_id and role = 'technician') then
    perform private.fail('NOT_FOUND', 'Technician not found');
  end if;
  if not p_active and exists (
    select 1 from public.orders
    where technician_id = p_profile_id and status in ('assigned', 'in_progress')
  ) then
    perform private.fail('CONFLICT', 'Reassign this technician''s open jobs before deactivating');
  end if;

  perform private.set_audit_context(null);
  update public.profiles set is_active = p_active where id = p_profile_id;
end
$$;

create function public.set_sound_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'technician', 'manager']::public.user_role[]);
  update public.profiles set sound_enabled = p_enabled where id = auth.uid();
end
$$;

-- ---------------------------------------------------------------- grants
grant execute on function
  public.create_order(text, text, text, text, smallint, integer, timestamptz, uuid, text),
  public.assign_order(uuid, uuid, text),
  public.reschedule_order(uuid, timestamptz, text),
  public.start_job(uuid, text),
  public.complete_job(uuid, text, integer, text, integer, public.payment_method, text, text),
  public.review_order(uuid, text, text),
  public.close_order(uuid, text),
  public.set_technician_active(uuid, boolean),
  public.set_sound_enabled(boolean)
to authenticated;
