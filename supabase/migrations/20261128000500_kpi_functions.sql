-- Phase 4.1: KPI read functions (FR-KPI-1..4). Admin/Manager only.
-- Periods are inclusive Malaysia dates; a job counts on the MYT day it was
-- completed, and only while it is still Job Done, Reviewed or Closed (a job
-- sent back loses completed_at until it is done again).
--
-- The functions are SECURITY INVOKER (design §5: read RPCs keep RLS on), so
-- they also check the role explicitly and filter on plain timestamp ranges
-- that the indexes below can use.

-- Rejects a reversed or over-long period; returns the period as a
-- [start, end) pair of instants.
create function private.period_bounds(p_from date, p_to date, out p_start timestamptz, out p_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    perform private.fail('VALIDATION', 'The period must end on or after its start');
  end if;
  if p_to - p_from + 1 > 366 then
    perform private.fail('VALIDATION', 'The period can be at most 366 days');
  end if;
  p_start := p_from::timestamp at time zone 'Asia/Kuala_Lumpur';
  p_end := (p_to + 1)::timestamp at time zone 'Asia/Kuala_Lumpur';
end
$$;

-- Jobs completed in [p_start, p_end) that still count as done.
create function private.done_jobs(p_start timestamptz, p_end timestamptz)
returns table (order_id uuid, technician_id uuid, service_type_id smallint, completed_at timestamptz,
               started_at timestamptz, final_sen integer)
language sql
stable
set search_path = ''
as $$
  select o.id, o.technician_id, o.service_type_id, o.completed_at, o.started_at, c.final_sen
  from public.orders o
  join public.completions c on c.order_id = o.id
  where o.status in ('job_done', 'reviewed', 'closed')
    and o.completed_at >= p_start and o.completed_at < p_end
$$;

create function public.kpi_summary(p_from date, p_to date)
returns table (jobs_completed integer, revenue_sen bigint, payments_sen bigint, open_flags integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  v_range := private.period_bounds(p_from, p_to);
  return query
  select
    (select count(*)::integer from private.done_jobs(v_range.p_start, v_range.p_end)),
    (select coalesce(sum(d.final_sen), 0)::bigint from private.done_jobs(v_range.p_start, v_range.p_end) d),
    (select coalesce(sum(p.amount_sen), 0)::bigint
       from public.payments p
      where p.recorded_at >= v_range.p_start and p.recorded_at < v_range.p_end),
    -- Open flags are a current count, not tied to the period.
    (select count(*)::integer from public.flags f where f.status = 'open');
end
$$;

create function public.kpi_leaderboard(p_from date, p_to date)
returns table (
  technician_id uuid,
  full_name text,
  jobs_completed integer,
  revenue_sen bigint,
  reschedules integer,
  flags integer,
  avg_minutes integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  v_range := private.period_bounds(p_from, p_to);
  return query
  with done as (
    select d.technician_id, d.final_sen, extract(epoch from d.completed_at - d.started_at) / 60 as minutes
    from private.done_jobs(v_range.p_start, v_range.p_end) d
  ),
  moved as (
    -- A reschedule is an orders update that raised reschedule_count, credited
    -- to the technician the job was with at the time.
    select (a.after ->> 'technician_id')::uuid as technician_id
    from public.audit_log a
    where a.table_name = 'orders'
      and a.action = 'UPDATE'
      and (a.after ->> 'reschedule_count')::integer > (a.before ->> 'reschedule_count')::integer
      and a.created_at >= v_range.p_start and a.created_at < v_range.p_end
  ),
  raised as (
    -- Flags go to the technician who completed the job, else the one assigned now.
    select coalesce(c.technician_id, o.technician_id) as technician_id
    from public.flags f
    join public.orders o on o.id = f.order_id
    left join public.completions c on c.order_id = f.order_id
    where f.raised_at >= v_range.p_start and f.raised_at < v_range.p_end
  ),
  board as (
    select
      p.id,
      p.full_name,
      p.is_active,
      (select count(*)::integer from done d where d.technician_id = p.id) as jobs,
      (select coalesce(sum(d.final_sen), 0)::bigint from done d where d.technician_id = p.id) as revenue,
      (select count(*)::integer from moved m where m.technician_id = p.id) as moves,
      (select count(*)::integer from raised r where r.technician_id = p.id) as flag_count,
      (select round(avg(d.minutes))::integer from done d where d.technician_id = p.id) as minutes
    from public.profiles p
    where p.role = 'technician'
  )
  -- Technicians deactivated since still appear for periods they worked in.
  select b.id, b.full_name, b.jobs, b.revenue, b.moves, b.flag_count, b.minutes
  from board b
  where b.is_active or b.jobs > 0 or b.moves > 0 or b.flag_count > 0
  order by b.jobs desc, b.revenue desc, b.full_name;
end
$$;

create function public.kpi_jobs_per_day(p_from date, p_to date)
returns table (day date, jobs integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  v_range := private.period_bounds(p_from, p_to);
  return query
  with per_day as (
    select (d.completed_at at time zone 'Asia/Kuala_Lumpur')::date as day, count(*)::integer as jobs
    from private.done_jobs(v_range.p_start, v_range.p_end) d
    group by 1
  )
  select g::date, coalesce(pd.jobs, 0)
  from generate_series(p_from, p_to, interval '1 day') as g
  left join per_day pd on pd.day = g::date
  order by 1;
end
$$;

create function public.kpi_service_mix(p_from date, p_to date)
returns table (service text, jobs integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_range record;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  v_range := private.period_bounds(p_from, p_to);
  return query
  select s.name, count(*)::integer
  from private.done_jobs(v_range.p_start, v_range.p_end) d
  join public.service_types s on s.id = d.service_type_id
  group by s.name
  order by 2 desc, 1;
end
$$;

create index audit_log_created_idx on public.audit_log (created_at);
create index flags_raised_idx on public.flags (raised_at);
create index payments_recorded_idx on public.payments (recorded_at);

-- Home schedule and review tile refresh live (api-spec §5); RLS still applies.
alter publication supabase_realtime add table public.orders;

-- Invoker functions run as the caller, who therefore needs these helpers.
-- require_role only reports on the caller; fail only raises.
revoke execute on function
  private.period_bounds(date, date),
  private.done_jobs(timestamptz, timestamptz)
from public, anon;
grant execute on function
  private.require_role(public.user_role[]),
  private.fail(text, text),
  private.period_bounds(date, date),
  private.done_jobs(timestamptz, timestamptz)
to authenticated;

revoke execute on function
  public.kpi_summary(date, date),
  public.kpi_leaderboard(date, date),
  public.kpi_jobs_per_day(date, date),
  public.kpi_service_mix(date, date)
from public, anon;
grant execute on function
  public.kpi_summary(date, date),
  public.kpi_leaderboard(date, date),
  public.kpi_jobs_per_day(date, date),
  public.kpi_service_mix(date, date)
to authenticated;
