-- Edit an order's customer and job details (SRS FR-ORD-8, api-spec §2).
-- Technician and schedule changes have their own RPCs (assign / reschedule).
-- New/Assigned: free edits. In Progress: admin override with a reason.
-- Job Done onwards: locked, because the final amount is already computed.

create function public.update_order(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_problem_description text,
  p_service_type_id smallint,
  p_quoted_sen integer,
  p_admin_notes text default null,
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
  perform private.require_role(array['admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  perform private.require_status(v_order, array['new', 'assigned', 'in_progress']::public.order_status[]);
  if v_order.status = 'in_progress' then
    perform private.require_text(p_reason, 'A reason for editing a job in progress', 500);
  end if;

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
  if not exists (select 1 from public.service_types st where st.id = p_service_type_id and st.active) then
    perform private.fail('VALIDATION', 'Unknown service type');
  end if;

  perform private.set_audit_context(p_reason);
  update public.orders
  set customer_name = btrim(p_customer_name),
      customer_phone = p_customer_phone,
      customer_address = btrim(p_customer_address),
      problem_description = btrim(p_problem_description),
      service_type_id = p_service_type_id,
      quoted_sen = p_quoted_sen,
      admin_notes = private.optional_text(p_admin_notes, 'Admin notes', 2000)
  where id = p_order_id;
end
$$;

revoke execute on function public.update_order(uuid, text, text, text, text, smallint, integer, text, text)
  from public, anon;
grant execute on function public.update_order(uuid, text, text, text, text, smallint, integer, text, text)
  to authenticated;
