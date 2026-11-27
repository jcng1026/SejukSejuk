-- What happens when a job becomes Job Done (SRS FR-FLG-1, FR-NOT-1, FR-NOT-3).
-- A trigger, not app code, so it runs however the status changes.

-- Percent-encodes like JavaScript's encodeURIComponent (for wa.me links).
create function private.url_encode(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_bytes bytea := convert_to(p_text, 'UTF8');
  v_out text := '';
  v_byte integer;
begin
  for i in 0 .. length(v_bytes) - 1 loop
    v_byte := get_byte(v_bytes, i);
    if (v_byte between 48 and 57) or (v_byte between 65 and 90) or (v_byte between 97 and 122)
       or v_byte in (45, 95, 46, 33, 126, 42, 39, 40, 41) then
      v_out := v_out || chr(v_byte);
    else
      v_out := v_out || '%' || upper(lpad(to_hex(v_byte), 2, '0'));
    end if;
  end loop;
  return v_out;
end
$$;

create function private.config_number(p_key text, p_default numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_config where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------- flag rules
create function private.raise_auto_flags(p_order public.orders)
returns integer -- number of High flags raised
language plpgsql
set search_path = ''
as $$
declare
  v_completion public.completions;
  v_paid integer;
  v_files integer;
  v_over_pct numeric := private.config_number('flag.over_quote_pct', 20);
  v_late_hours numeric := private.config_number('flag.late_hours', 24);
  v_high integer := 0;
begin
  select * into v_completion from public.completions where order_id = p_order.id;
  select amount_sen into v_paid from public.payments where order_id = p_order.id;
  select count(*) into v_files from public.attachments where order_id = p_order.id;

  -- A job completed again after being sent back is judged afresh.
  delete from public.flags where order_id = p_order.id and source = 'auto' and status = 'open';

  if v_completion.final_sen * 100 > p_order.quoted_sen * (100 + v_over_pct) then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'over_quote', 'high', 'auto',
            case when p_order.quoted_sen = 0
              then format('Final RM %s with no quoted price',
                          to_char(v_completion.final_sen / 100.0, 'FM999,990.00'))
              else format('Final RM %s is %s%% above the quoted RM %s',
                          to_char(v_completion.final_sen / 100.0, 'FM999,990.00'),
                          round((v_completion.final_sen - p_order.quoted_sen) * 100.0 / p_order.quoted_sen),
                          to_char(p_order.quoted_sen / 100.0, 'FM999,990.00'))
            end);
    v_high := v_high + 1;
  elsif v_completion.extra_sen > 0 and v_completion.remarks is not null then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'over_quote_explained', 'low', 'auto',
            format('+RM %s extra, explained', to_char(v_completion.extra_sen / 100.0, 'FM999,990.00')));
  end if;

  if v_completion.extra_sen > 0 and v_completion.remarks is null then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'extras_without_remarks', 'high', 'auto', 'Extra charges with no remarks');
    v_high := v_high + 1;
  end if;

  if v_paid is not null and v_paid < v_completion.final_sen then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'underpaid', 'high', 'auto',
            format('Payment RM %s short', to_char((v_completion.final_sen - v_paid) / 100.0, 'FM999,990.00')));
    v_high := v_high + 1;
  end if;

  if v_files = 0 then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'no_attachments', 'medium', 'auto', 'Job done with no photos or documents');
  end if;

  if v_completion.completed_at > p_order.scheduled_at + v_late_hours * interval '1 hour' then
    insert into public.flags (order_id, rule_code, severity, source, message)
    values (p_order.id, 'late_completion', 'low', 'auto',
            format('Completed more than %s hours after the scheduled time', v_late_hours));
  end if;

  return v_high;
end
$$;

-- ---------------------------------------------------------------- WhatsApp feedback
create function private.queue_feedback_message(p_order public.orders)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_body text;
begin
  select format(
    E'Hi %s,\nJob %s has been completed by Technician %s at %s.\nPlease check and leave feedback.\nThank you!',
    p_order.customer_name, p_order.order_no, t.full_name,
    to_char(c.completed_at at time zone 'Asia/Kuala_Lumpur', 'DD/MM/YYYY HH24:MI'))
  into v_body
  from public.completions c
  join public.profiles t on t.id = c.technician_id
  where c.order_id = p_order.id;

  -- Keep one current, unsent message per job (a redo replaces it).
  delete from public.whatsapp_messages where order_id = p_order.id and kind = 'feedback' and sent_at is null;
  insert into public.whatsapp_messages (order_id, kind, to_phone, body, link)
  values (p_order.id, 'feedback', p_order.customer_phone, v_body,
          'https://wa.me/' || p_order.customer_phone || '?text=' || private.url_encode(v_body));
end
$$;

-- ---------------------------------------------------------------- staff notifications
-- High flags alert each admin/manager individually; everything else is one
-- grouped "jobs done today" row per person, so a busy day is not 40 pings.
create function private.notify_staff_job_done(p_order public.orders, p_high_flags integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_staff record;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_updated integer;
begin
  for v_staff in select id from public.profiles where role in ('admin', 'manager') and is_active loop
    if p_high_flags > 0 then
      insert into public.notifications (recipient_id, order_id, type, severity, payload)
      values (v_staff.id, p_order.id, 'flag', 'high',
              jsonb_build_object('order_no', p_order.order_no,
                                 'message', (select string_agg(message, '; ') from public.flags
                                             where order_id = p_order.id and status = 'open' and severity = 'high')));
    else
      update public.notifications
      set payload = jsonb_build_object('count', coalesce((payload ->> 'count')::integer, 0) + 1),
          read_at = null,
          created_at = now()
      where recipient_id = v_staff.id and type = 'jobs_done'
        and (created_at at time zone 'Asia/Kuala_Lumpur')::date = v_today;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        insert into public.notifications (recipient_id, type, payload)
        values (v_staff.id, 'jobs_done', jsonb_build_object('count', 1));
      end if;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------- the trigger
create function private.on_job_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_high integer;
begin
  v_high := private.raise_auto_flags(new);
  perform private.queue_feedback_message(new);
  perform private.notify_staff_job_done(new, v_high);
  return new;
end
$$;

create trigger orders_on_job_done after update of status on public.orders
  for each row when (new.status = 'job_done' and old.status is distinct from 'job_done')
  execute function private.on_job_done();

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.current_app_role(),
  private.order_id_from_path(text),
  private.can_upload_to(text),
  private.folder_object_count(uuid)
to authenticated;
