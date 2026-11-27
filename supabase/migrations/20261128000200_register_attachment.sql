-- Job files (SRS FR-TEC-4). The browser uploads straight to Storage under the
-- storage.objects policy, then calls register_attachment. Type and size are
-- read from Storage's own object metadata, never from what the browser says.

-- Most objects a job folder may hold: 6 attachments, a receipt, and room for a
-- few retries. Caps orphaned uploads (an upload whose registration failed).
create function private.folder_object_count(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects o
  where o.bucket_id = 'job-files' and o.name like 'orders/' || p_order_id::text || '/%'
$$;

create or replace function private.can_upload_to(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = private.order_id_from_path(p_name)
      and o.status in ('assigned', 'in_progress')
      and private.folder_object_count(o.id) < 12
      and (
        private.current_app_role() = 'admin'
        or (private.current_app_role() = 'technician' and o.technician_id = (select auth.uid()))
      )
  )
$$;

grant execute on function private.folder_object_count(uuid) to authenticated;

-- ---------------------------------------------------------------- register_attachment
create function public.register_attachment(p_order_id uuid, p_storage_path text)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order public.orders;
  v_id uuid;
  v_mime text;
  v_size bigint;
  v_max_files integer := coalesce((select (value #>> '{}')::integer from public.app_config where key = 'attachments.max_files'), 6);
  v_max_image_mb integer := coalesce((select (value #>> '{}')::integer from public.app_config where key = 'attachments.max_image_mb'), 10);
  v_max_video_mb integer := coalesce((select (value #>> '{}')::integer from public.app_config where key = 'attachments.max_video_mb'), 50);
begin
  perform private.require_role(array['technician', 'admin']::public.user_role[]);
  v_order := private.lock_order(p_order_id);
  -- Technicians only for their own job; an admin attaching acts as an override.
  perform private.require_job_actor(v_order, case when private.current_app_role() = 'admin' then 'admin upload' end);
  perform private.require_status(v_order, array['assigned', 'in_progress']::public.order_status[]);

  if private.order_id_from_path(p_storage_path) is distinct from p_order_id then
    perform private.fail('VALIDATION', 'File must be uploaded to this order''s folder');
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into v_mime, v_size
  from storage.objects o
  where o.bucket_id = 'job-files' and o.name = p_storage_path;
  if not found then
    perform private.fail('VALIDATION', 'File upload not found; try uploading again');
  end if;

  if v_mime is null or v_mime not in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'application/pdf'
  ) then
    perform private.fail('VALIDATION', 'Only photos, videos and PDFs can be attached');
  end if;
  if v_size is null or v_size <= 0
     or v_size > (case when v_mime like 'video/%' then v_max_video_mb else v_max_image_mb end)::bigint * 1024 * 1024 then
    perform private.fail('VALIDATION', format('File is too large (photos and PDFs up to %s MB, videos up to %s MB)', v_max_image_mb, v_max_video_mb));
  end if;
  if (select count(*) from public.attachments a where a.order_id = p_order_id) >= v_max_files then
    perform private.fail('CONFLICT', format('A job can have at most %s files', v_max_files));
  end if;

  perform private.set_audit_context(null);
  insert into public.attachments (order_id, storage_path, mime, size_bytes, uploaded_by)
  values (p_order_id, p_storage_path, v_mime, v_size::integer, auth.uid())
  on conflict (storage_path) do nothing
  returning attachments.id into v_id;
  if v_id is null then
    select a.id into v_id from public.attachments a where a.storage_path = p_storage_path;
  end if;

  return query select v_id;
end
$$;

revoke execute on function public.register_attachment(uuid, text) from public, anon;
grant execute on function public.register_attachment(uuid, text) to authenticated;

-- ---------------------------------------------------------------- complete_job: real receipts only
-- Same as 20261127000400 plus: a receipt path must name an uploaded image or PDF.
create or replace function public.complete_job(
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
  if p_payment_receipt_path is not null and (
    private.order_id_from_path(p_payment_receipt_path) is distinct from p_order_id
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'job-files' and o.name = p_payment_receipt_path
        and (o.metadata ->> 'mimetype' like 'image/%' or o.metadata ->> 'mimetype' = 'application/pdf')
    )
  ) then
    perform private.fail('VALIDATION', 'Receipt upload not found; upload it again');
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
