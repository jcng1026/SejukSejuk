-- Row-level security (docs/3-design/04-design.md §5). Read access only:
-- writes happen exclusively inside SECURITY DEFINER RPCs.

-- Role of the signed-in user, or NULL when signed out or deactivated.
-- SECURITY DEFINER so policies on profiles can call it without recursion.
create function private.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;

-- ---------------------------------------------------------------- people & lookups
-- Staff see everyone. Technicians see themselves and staff (to show who assigned
-- or reviewed a job), but not other technicians' details (design §5).
create policy "staff read all profiles, technicians read self and staff" on public.profiles
  for select to authenticated
  using (
    (select private.current_app_role()) in ('admin', 'manager')
    or (
      (select private.current_app_role()) = 'technician'
      and (id = (select auth.uid()) or role in ('admin', 'manager'))
    )
  );

create policy "active users read service types" on public.service_types
  for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy "active users read config" on public.app_config
  for select to authenticated
  using ((select private.current_app_role()) is not null);

-- ---------------------------------------------------------------- orders
create policy "staff read all orders, technicians read their own" on public.orders
  for select to authenticated
  using (
    (select private.current_app_role()) in ('admin', 'manager')
    or (
      (select private.current_app_role()) = 'technician'
      and technician_id = (select auth.uid())
    )
  );

-- Child rows follow their order: the subquery runs under the orders policy above.
create policy "read with visible order" on public.completions
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "read with visible order" on public.attachments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "read with visible order" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "read with visible order" on public.flags
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "read with visible order" on public.whatsapp_messages
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "staff read all history, technicians read their orders' history" on public.audit_log
  for select to authenticated
  using (
    (select private.current_app_role()) in ('admin', 'manager')
    or exists (select 1 from public.orders o where o.id = order_id)
  );

-- ---------------------------------------------------------------- per-user
create policy "recipients read their notifications" on public.notifications
  for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select private.current_app_role()) is not null
  );

create policy "managers read blocked AI requests" on public.ai_blocked_log
  for select to authenticated
  using ((select private.current_app_role()) = 'manager');

-- ai_requests: no policy and no grant; only server-side RPCs touch it.
