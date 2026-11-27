-- Manual flags, flag resolution, WhatsApp "sent" tracking, notification reads
-- (SRS FR-FLG-2/3, FR-NOT-2/3; api-spec §2).

create function public.raise_flag(p_order_id uuid, p_severity public.flag_severity, p_message text)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  perform private.lock_order(p_order_id);
  if p_severity is null then
    perform private.fail('VALIDATION', 'Choose a level');
  end if;
  perform private.set_audit_context(null);
  insert into public.flags (order_id, rule_code, severity, source, message, raised_by)
  values (p_order_id, null, p_severity, 'manual', private.require_text(p_message, 'A note', 300), auth.uid())
  returning flags.id into v_id;
  return query select v_id;
end
$$;

create function public.resolve_flag(p_flag_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.flag_status;
begin
  perform private.require_role(array['admin', 'manager']::public.user_role[]);
  select status into v_status from public.flags where id = p_flag_id for update;
  if not found then
    perform private.fail('NOT_FOUND', 'Flag not found');
  end if;
  if v_status <> 'open' then
    perform private.fail('INVALID_TRANSITION', 'Flag is already resolved');
  end if;
  perform private.set_audit_context(p_note);
  update public.flags
  set status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_note = private.require_text(p_note, 'A resolution note', 1000)
  where id = p_flag_id;
end
$$;

-- Technicians: only messages for their own jobs (NOT_FOUND otherwise). Staff: any.
create function public.mark_whatsapp_sent(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  -- FR-NOT-2: the technician on the job sends it; admins may resend.
  v_role public.user_role := private.require_role(array['admin', 'technician']::public.user_role[]);
begin
  select m.order_id into v_order_id
  from public.whatsapp_messages m
  join public.orders o on o.id = m.order_id
  where m.id = p_message_id
    and (v_role = 'admin' or o.technician_id = auth.uid());
  if not found then
    perform private.fail('NOT_FOUND', 'Message not found');
  end if;
  update public.whatsapp_messages set sent_at = now(), sent_by = auth.uid() where id = p_message_id;
end
$$;

create function public.mark_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'manager', 'technician']::public.user_role[]);
  update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null;
end
$$;

revoke execute on function
  public.raise_flag(uuid, public.flag_severity, text),
  public.resolve_flag(uuid, text),
  public.mark_whatsapp_sent(uuid),
  public.mark_notifications_read()
from public, anon;
grant execute on function
  public.raise_flag(uuid, public.flag_severity, text),
  public.resolve_flag(uuid, text),
  public.mark_whatsapp_sent(uuid),
  public.mark_notifications_read()
to authenticated;

-- Realtime: let signed-in users subscribe to their own notification rows (RLS applies).
alter publication supabase_realtime add table public.notifications;

-- Each send overwrites sent_at, so the audit log keeps every earlier send time.
create trigger audit_whatsapp_messages after insert or update or delete on public.whatsapp_messages
  for each row execute function private.audit_row();
