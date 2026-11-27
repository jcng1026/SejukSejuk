-- Private bucket for job photos, videos, PDFs and receipts (SRS FR-TEC-4).
-- Paths: orders/<order uuid>/<file uuid>-<name>. Read via signed URLs only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-files',
  'job-files',
  false,
  52428800, -- 50 MB: the video cap; images/PDFs are capped at 10 MB by the app
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'application/pdf']
)
on conflict (id) do nothing;

-- Order id from an object path, or NULL when the path is not orders/<uuid>/...
create function private.order_id_from_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^orders/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      then split_part(p_name, '/', 2)::uuid
  end
$$;

-- Who may upload to an order's folder: its assigned technician while the job is
-- open, or an admin (override). Uses the caller's RLS view of orders.
create function private.can_upload_to(p_name text)
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
      and (
        private.current_app_role() = 'admin'
        or (private.current_app_role() = 'technician' and o.technician_id = (select auth.uid()))
      )
  )
$$;

grant execute on function private.order_id_from_path(text), private.can_upload_to(text) to authenticated;

create policy "read job files of visible orders" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-files'
    and exists (select 1 from public.orders o where o.id = private.order_id_from_path(name))
  );

create policy "upload job files to open own jobs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files' and private.can_upload_to(name));
