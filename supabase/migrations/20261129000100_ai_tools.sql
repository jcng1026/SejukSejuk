-- Phase 5: read-only tools for the AI assistant (FR-AI-2, -3, -10) plus its
-- rate limit (FR-AI-6) and blocked-request log (FR-AI-8). Design §6, api-spec §4.
--
-- Tools are SECURITY INVOKER, so RLS applies on top of the explicit role checks:
-- a technician can only ever reach their own orders. Results carry whitelisted
-- columns only; problem descriptions, remarks, admin notes, work done and flag
-- messages never leave the database through these functions.

-- The AI's period: inclusive Malaysia dates, at most 92 days.
create function private.ai_period(p_from date, p_to date, out p_start timestamptz, out p_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is not null and p_to is not null and p_to - p_from + 1 > 92 then
    perform private.fail('VALIDATION', 'The AI can look at most 92 days at a time');
  end if;
  select b.p_start, b.p_end into p_start, p_end from private.period_bounds(p_from, p_to) b;
end
$$;

create function private.ai_status(p_status text)
returns public.order_status
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_status is null then
    return null;
  end if;
  if p_status not in ('new', 'assigned', 'in_progress', 'job_done', 'reviewed', 'closed') then
    perform private.fail('VALIDATION', 'Unknown status');
  end if;
  return p_status::public.order_status;
end
$$;

-- One whitelisted row per order. Customer contact only for staff or the
-- technician assigned right now (access ends on reassignment); the free-text
-- address is capped and stripped of control characters.
create function private.ai_jobs(
  p_start timestamptz, p_end timestamptz, p_technician_id uuid, p_status public.order_status,
  p_order_no text, p_limit integer
)
returns table (
  order_no text, status text, service_type text, technician_name text,
  scheduled_at timestamptz, completed_at timestamptz, quoted_rm numeric, final_rm numeric,
  flag_severity text, flag_rule_code text, customer_name text, customer_phone text,
  customer_address text
)
language sql
stable
set search_path = ''
as $$
  select
    o.order_no,
    o.status::text,
    s.name,
    p.full_name,
    o.scheduled_at,
    o.completed_at,
    round(o.quoted_sen / 100.0, 2),
    round(c.final_sen / 100.0, 2),
    (select f.severity::text from public.flags f
      where f.order_id = o.id and f.status = 'open' order by f.severity limit 1),
    (select coalesce(f.rule_code, 'manual') from public.flags f
      where f.order_id = o.id and f.status = 'open' order by f.severity limit 1),
    case when v.can_see
      then regexp_replace(o.customer_name, '[[:cntrl:]]', ' ', 'g') end,
    case when v.can_see then o.customer_phone end,
    case when v.can_see
      then regexp_replace(left(o.customer_address, 200), '[[:cntrl:]]', ' ', 'g') end
  from public.orders o
  join public.service_types s on s.id = o.service_type_id
  left join public.profiles p on p.id = o.technician_id
  left join public.completions c on c.order_id = o.id
  cross join lateral (
    select private.current_app_role() in ('admin', 'manager')
        or o.technician_id = auth.uid() as can_see
  ) v
  where (p_order_no is null or o.order_no = p_order_no)
    and (p_start is null or o.scheduled_at >= p_start)
    and (p_end is null or o.scheduled_at < p_end)
    and (p_technician_id is null or o.technician_id = p_technician_id)
    and (p_status is null or o.status = p_status)
  order by o.scheduled_at
  limit p_limit
$$;

-- Technicians are always held to their own jobs, whatever they ask for.
create function private.ai_scope_technician(p_requested uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when private.current_app_role() = 'technician' then auth.uid() else p_requested end
$$;

create function public.ai_jobs_list(
  p_from date, p_to date, p_technician_id uuid default null, p_status text default null,
  p_limit integer default 20
)
returns table (
  order_no text, status text, service_type text, technician_name text,
  scheduled_at timestamptz, completed_at timestamptz, quoted_rm numeric, final_rm numeric,
  flag_severity text, flag_rule_code text, customer_name text, customer_phone text,
  customer_address text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  v_range := private.ai_period(p_from, p_to);
  return query
  select * from private.ai_jobs(
    v_range.p_start, v_range.p_end, private.ai_scope_technician(p_technician_id),
    private.ai_status(p_status), null, least(greatest(coalesce(p_limit, 20), 1), 20)
  );
end
$$;

create function public.ai_job_detail(p_order_no text)
returns table (
  order_no text, status text, service_type text, technician_name text,
  scheduled_at timestamptz, completed_at timestamptz, quoted_rm numeric, final_rm numeric,
  flag_severity text, flag_rule_code text, customer_name text, customer_phone text,
  customer_address text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  if p_order_no is null or p_order_no !~ '^ORD-[0-9]{6}-[0-9]{4}$' then
    perform private.fail('VALIDATION', 'Order numbers look like ORD-261128-0001');
  end if;
  return query
  select * from private.ai_jobs(null, null, private.ai_scope_technician(null), null, p_order_no, 1);
end
$$;

-- Counts by scheduled date; status 'completed' instead counts finished jobs by completion date.
create function public.ai_job_counts(p_from date, p_to date, p_status text, p_group_by text)
returns table (label text, jobs integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
  v_technician uuid := private.ai_scope_technician(null);
  v_completed boolean := p_status = 'completed';
  v_status public.order_status;
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  v_range := private.ai_period(p_from, p_to);
  v_status := case when v_completed then null else private.ai_status(p_status) end;
  if p_group_by is not null and p_group_by not in ('technician', 'service_type', 'day') then
    perform private.fail('VALIDATION', 'Group by technician, service_type or day');
  end if;
  return query
  with picked as (
    select o.technician_id, o.service_type_id, coalesce(o.completed_at, o.scheduled_at) as at_time
    from public.orders o
    where (v_technician is null or o.technician_id = v_technician)
      and case
        when v_completed then o.status in ('job_done', 'reviewed', 'closed')
          and o.completed_at >= v_range.p_start and o.completed_at < v_range.p_end
        else o.scheduled_at >= v_range.p_start and o.scheduled_at < v_range.p_end
          and (v_status is null or o.status = v_status)
      end
  )
  select
    case p_group_by
      when 'technician' then coalesce(
        (select p.full_name from public.profiles p where p.id = k.technician_id), 'Unassigned')
      when 'service_type' then
        (select s.name from public.service_types s where s.id = k.service_type_id)
      when 'day' then to_char(k.at_time at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD')
      else 'All'
    end as label,
    count(*)::integer
  from picked k
  group by 1
  order by 2 desc, 1;
end
$$;

-- Jobs per active technician in a week, against the team average. SQL decides
-- "overloaded" (above 1.5x the average and at least two jobs more); the AI only explains it.
create function public.ai_technician_workload(p_from date, p_to date)
returns table (
  technician_name text, jobs integer, open_jobs integer, team_average numeric, is_overloaded boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  v_range := private.ai_period(p_from, p_to);
  return query
  with load as (
    select p.full_name,
           count(o.id)::integer as jobs,
           count(o.id) filter (where o.status in ('assigned', 'in_progress'))::integer as open_jobs
    from public.profiles p
    left join public.orders o
      on o.technician_id = p.id
     and o.scheduled_at >= v_range.p_start and o.scheduled_at < v_range.p_end
    where p.role = 'technician' and p.is_active
    group by p.id, p.full_name
  ),
  team as (select coalesce(avg(l.jobs), 0) as average from load l)
  select l.full_name, l.jobs, l.open_jobs, round(t.average, 1),
         l.jobs > t.average * 1.5 and l.jobs >= t.average + 2
  from load l cross join team t
  order by l.jobs desc, l.full_name;
end
$$;

-- Flags raised in the period. Codes only: flag messages and resolution notes
-- are free text and stay out of the model's reach.
create function public.ai_flags_summary(p_from date, p_to date, p_severity text, p_status text)
returns table (
  order_no text, severity text, status text, rule_code text, technician_name text,
  raised_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
  v_technician uuid := private.ai_scope_technician(null);
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  v_range := private.ai_period(p_from, p_to);
  if p_severity is not null and p_severity not in ('high', 'medium', 'low') then
    perform private.fail('VALIDATION', 'Severity is high, medium or low');
  end if;
  if p_status is not null and p_status not in ('open', 'resolved') then
    perform private.fail('VALIDATION', 'Status is open or resolved');
  end if;
  return query
  select o.order_no, f.severity::text, f.status::text, coalesce(f.rule_code, 'manual'),
         p.full_name, f.raised_at
  from public.flags f
  join public.orders o on o.id = f.order_id
  left join public.profiles p on p.id = o.technician_id
  where f.raised_at >= v_range.p_start and f.raised_at < v_range.p_end
    and (v_technician is null or o.technician_id = v_technician)
    and (p_severity is null or f.severity::text = p_severity)
    and (p_status is null or f.status::text = p_status)
  order by f.severity, f.raised_at desc
  limit 50;
end
$$;

create function public.ai_revenue_summary(p_from date, p_to date, p_group_by text)
returns table (label text, jobs integer, revenue_rm numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['manager']::public.user_role[]);
  v_range := private.ai_period(p_from, p_to);
  if p_group_by is not null and p_group_by not in ('technician', 'service_type', 'day') then
    perform private.fail('VALIDATION', 'Group by technician, service_type or day');
  end if;
  return query
  select
    case p_group_by
      when 'technician' then
        (select p.full_name from public.profiles p where p.id = d.technician_id)
      when 'service_type' then
        (select s.name from public.service_types s where s.id = d.service_type_id)
      when 'day' then to_char(d.completed_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD')
      else 'All'
    end,
    count(*)::integer,
    round(coalesce(sum(d.final_sen), 0) / 100.0, 2)
  from private.done_jobs(v_range.p_start, v_range.p_end) d
  group by 1
  order by 3 desc, 1;
end
$$;

-- FR-AI-6: 20 questions per user per rolling hour, counted before any model call.
-- Returns the request's id, or a refusal saying when the limit resets. A refusal
-- is logged here (stage "input"), at most once an hour per user, so it cannot flood the log.
create function public.ai_take_quota(p_question text)
returns table (request_id bigint, allowed boolean, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.user_role;
  v_count integer;
  v_oldest timestamptz;
  v_id bigint;
begin
  v_role := private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  -- One user's parallel requests queue here, so the count cannot be raced.
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || v_user::text));
  select count(*), min(r.created_at) into v_count, v_oldest
  from public.ai_requests r
  where r.user_id = v_user and r.created_at > now() - interval '1 hour';
  if v_count >= 20 then
    if not exists (select 1 from public.ai_blocked_log b
                   where b.user_id = v_user and b.reason = 'rate_limited'
                     and b.created_at > now() - interval '1 hour') then
      insert into public.ai_blocked_log (user_id, role, stage, reason, input)
      values (v_user, v_role, 'input', 'rate_limited', left(coalesce(p_question, ''), 500));
    end if;
    return query select null::bigint, false, format(
      'You have asked 20 questions this hour. You can ask again at %s.',
      to_char((v_oldest + interval '1 hour') at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'));
    return;
  end if;
  insert into public.ai_requests (user_id, status) values (v_user, 'started') returning id into v_id;
  return query select v_id, true, null::text;
end
$$;

-- The caller's own open request, or an error. Each request is closed once, as
-- blocked or answered, so the log cannot be written without a counted question.
create function private.close_ai_request(p_request_id bigint, p_status text, p_tools jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_requests r
  set status = p_status, tools_used = coalesce(p_tools, '[]'::jsonb)
  where r.id = p_request_id and r.user_id = auth.uid() and r.status = 'started'
    and r.created_at > now() - interval '5 minutes';
  if not found then
    perform private.fail('NOT_FOUND', 'No open AI request with that id');
  end if;
end
$$;

-- FR-AI-8: records why the caller's request was blocked; managers read the log.
create function public.ai_log_blocked(p_request_id bigint, p_stage text, p_reason text, p_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  if p_stage is null or p_stage not in ('input', 'intent', 'tool', 'output') then
    perform private.fail('VALIDATION', 'Unknown guardrail stage');
  end if;
  perform private.close_ai_request(p_request_id, 'blocked', null);
  insert into public.ai_blocked_log (user_id, role, stage, reason, input)
  values (auth.uid(), v_role, p_stage, left(coalesce(p_reason, ''), 200),
          left(coalesce(p_input, ''), 500));
end
$$;

-- Records which tools answered the request (ai_requests.tools_used).
create function public.ai_mark_answered(p_request_id bigint, p_tools text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  perform private.close_ai_request(p_request_id, 'answered', to_jsonb(coalesce(p_tools, '{}')));
end
$$;

create index ai_blocked_log_created_idx on public.ai_blocked_log (created_at desc);

revoke execute on function
  private.ai_period(date, date),
  private.ai_status(text),
  private.ai_jobs(timestamptz, timestamptz, uuid, public.order_status, text, integer),
  private.ai_scope_technician(uuid)
from public, anon;
grant execute on function
  private.ai_period(date, date),
  private.ai_status(text),
  private.ai_jobs(timestamptz, timestamptz, uuid, public.order_status, text, integer),
  private.ai_scope_technician(uuid)
to authenticated;

revoke execute on function
  public.ai_jobs_list(date, date, uuid, text, integer),
  public.ai_job_detail(text),
  public.ai_job_counts(date, date, text, text),
  public.ai_technician_workload(date, date),
  public.ai_flags_summary(date, date, text, text),
  public.ai_revenue_summary(date, date, text),
  public.ai_take_quota(text),
  public.ai_log_blocked(bigint, text, text, text),
  public.ai_mark_answered(bigint, text[])
from public, anon;
grant execute on function
  public.ai_jobs_list(date, date, uuid, text, integer),
  public.ai_job_detail(text),
  public.ai_job_counts(date, date, text, text),
  public.ai_technician_workload(date, date),
  public.ai_flags_summary(date, date, text, text),
  public.ai_revenue_summary(date, date, text),
  public.ai_take_quota(text),
  public.ai_log_blocked(bigint, text, text, text),
  public.ai_mark_answered(bigint, text[])
to authenticated;

revoke execute on function private.close_ai_request(bigint, text, jsonb) from public, anon, authenticated;
