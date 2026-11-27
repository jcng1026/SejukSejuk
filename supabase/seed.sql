-- Demo seed data (task 1.6). Applied by `supabase start` / `supabase db reset`.
-- Accounts mirror src/lib/demo-users.ts. History is generated relative to
-- today (Asia/Kuala_Lumpur), so the demo always shows the current week.

-- ---------------------------------------------------------------- accounts
do $$
declare
  v_password text := 'SejukDemo#2026'; -- public demo password, see src/features/auth/demo-password.ts
  v_user record;
begin
  for v_user in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'aisyah@sejuk.test', 'Aisyah', 'admin',      true,  '60122223333'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'farid@sejuk.test',  'Farid',  'admin',      true,  '60122224444'),
      ('00000000-0000-4000-8000-000000000003'::uuid, 'rahman@sejuk.test', 'Rahman', 'manager',    true,  '60122225555'),
      ('00000000-0000-4000-8000-000000000011'::uuid, 'ali@sejuk.test',    'Ali',    'technician', true,  '60131110001'),
      ('00000000-0000-4000-8000-000000000012'::uuid, 'john@sejuk.test',   'John',   'technician', true,  '60131110002'),
      ('00000000-0000-4000-8000-000000000013'::uuid, 'bala@sejuk.test',   'Bala',   'technician', true,  '60131110003'),
      ('00000000-0000-4000-8000-000000000014'::uuid, 'yusoff@sejuk.test', 'Yusoff', 'technician', true,  '60131110004'),
      ('00000000-0000-4000-8000-000000000015'::uuid, 'hafiz@sejuk.test',  'Hafiz',  'technician', false, '60131110005')
    ) as t (id, email, full_name, role, is_active, phone)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated', v_user.email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v_user.full_name),
      now() - interval '90 days', now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_user.id, v_user.id::text,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      'email', now(), now(), now()
    );
    insert into public.profiles (id, full_name, role, phone, is_active)
    values (v_user.id, v_user.full_name, v_user.role::public.user_role, v_user.phone, v_user.is_active);
  end loop;
end
$$;

-- ---------------------------------------------------------------- lookups & config
insert into public.service_types (name) values
  ('Installation'),
  ('Aircond Cleaning / Servicing'),
  ('Repair'),
  ('Gas Refill'),
  ('Inspection / Troubleshooting'),
  ('Other');

insert into public.app_config (key, value) values
  ('flag.over_quote_pct', '20'),
  ('flag.late_hours', '24'),
  ('ai.rate_limit_per_hour', '20'),
  ('attachments.max_files', '6'),
  ('attachments.max_image_mb', '10'),
  ('attachments.max_video_mb', '50');

-- ---------------------------------------------------------------- order history
-- Audit triggers are paused while history is generated: they would stamp every
-- row with now() and actor "system". Instead the block below writes backdated
-- audit rows that tell each order's real story (who created, assigned, started,
-- completed, reviewed, closed, rescheduled or sent it back, and when).
alter table public.orders      disable trigger audit_orders;
alter table public.completions disable trigger audit_completions;
alter table public.payments    disable trigger audit_payments;
alter table public.attachments disable trigger audit_attachments;
alter table public.flags       disable trigger audit_flags;

do $$
declare
  c_manager constant uuid := '00000000-0000-4000-8000-000000000003';
  c_admins  constant uuid[] := array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[];
  c_hafiz   constant uuid := '00000000-0000-4000-8000-000000000015';
  -- Weighted so Bala is visibly busier than the rest ("who might be overloaded?").
  c_techs   constant uuid[] := array[
    '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000014'
  ]::uuid[];
  c_names constant text[] := array['Ahmad', 'Mei Ling', 'Kumar', 'Siti', 'Lim', 'Farah', 'Raj', 'Tan', 'Wong',
    'Nurul', 'Lee', 'Hassan', 'Priya', 'Chong', 'Aminah', 'Daniel', 'Zainab', 'Ganesh', 'Hui Min', 'Ismail'];
  c_areas constant text[] := array['Shah Alam', 'Subang Jaya', 'Klang', 'Petaling Jaya', 'Puchong', 'Cyberjaya',
    'Kajang', 'Ampang', 'Bangsar', 'Setia Alam'];
  c_problems constant text[] := array['Aircond not cold', 'Water leaking from indoor unit', 'Unit making loud noise',
    'Annual servicing', 'New unit installation', 'Remote not responding', 'Bad smell when switched on',
    'Compressor not starting'];
  c_work constant text[] := array['Chemical wash, cleaned filters and coil', 'Topped up R32 gas, checked pressure',
    'Replaced capacitor and tested compressor', 'Cleared drain pipe blockage', 'Installed 1.5hp inverter unit with bracket',
    'Replaced fan motor', 'General servicing and inspection'];
  c_today constant date := (now() at time zone 'Asia/Kuala_Lumpur')::date;

  v_day date;
  v_jobs integer;
  v_i integer;
  v_offset integer;
  v_id uuid;
  v_type smallint;
  v_quote integer;
  v_extra integer;
  v_remarks text;
  v_final integer;
  v_paid integer;
  v_tech uuid;
  v_status public.order_status;
  v_scheduled timestamptz;
  v_created timestamptz;
  v_started timestamptz;
  v_completed timestamptz;
  v_roll double precision;
  v_files integer;
  v_resolved boolean;
  v_name text;
  v_creator uuid;
  v_reschedules integer;
  v_reviewed timestamptz;
  v_closed timestamptz;
begin
  perform setseed(0.42);

  for v_offset in -42 .. 7 loop
    v_day := c_today + v_offset;
    v_jobs := case extract(isodow from v_day)
                when 7 then 2
                when 6 then 6
                else 9 + floor(random() * 5)::int
              end;

    for v_i in 1 .. v_jobs loop
      v_id := gen_random_uuid();
      v_type := (1 + floor(random() * 6))::smallint;
      v_quote := case v_type
                   when 1 then 120000 + floor(random() * 13) * 10000
                   when 2 then 15000 + floor(random() * 4) * 5000
                   when 3 then 20000 + floor(random() * 9) * 5000
                   when 4 then 15000 + floor(random() * 3) * 5000
                   when 5 then 8000 + floor(random() * 3) * 2000
                   else 10000 + floor(random() * 5) * 5000
                 end;
      v_scheduled := (v_day + make_time(9 + floor(random() * 8)::int, (floor(random() * 2) * 30)::int, 0))
                     at time zone 'Asia/Kuala_Lumpur';
      v_created := v_scheduled - make_interval(days => 1 + floor(random() * 3)::int, hours => floor(random() * 6)::int);
      v_tech := case when v_offset < -21 and random() < 0.12 then c_hafiz
                     -- Recent week: Bala takes extra jobs so the overload insight has a real answer.
                     when v_offset between -6 and 1 and random() < 0.15 then '00000000-0000-4000-8000-000000000013'::uuid
                     else c_techs[1 + floor(random() * array_length(c_techs, 1))::int] end;

      -- Status by how far the day is from today.
      v_roll := random();
      v_status := case
        when v_offset > 0 then case when v_roll < 0.15 then 'new' else 'assigned' end
        -- Today always has finished, running and upcoming jobs, whatever time the seed runs.
        when v_offset = 0 then case when v_roll < 0.3 then 'job_done' when v_roll < 0.55 then 'in_progress' else 'assigned' end
        when v_offset >= -3 then case when v_roll < 0.5 then 'job_done' when v_roll < 0.9 then 'reviewed' else 'closed' end
        else case when v_roll < 0.85 then 'closed' when v_roll < 0.97 then 'reviewed' else 'job_done' end
      end;
      if v_status = 'new' then
        v_tech := null;
      end if;
      -- Work that has already happened today must be scheduled in the past.
      if v_offset = 0 and v_status = 'job_done' then
        v_scheduled := now() - interval '5 hours';
      elsif v_offset = 0 and v_status = 'in_progress' then
        v_scheduled := now() - interval '1 hour';
      end if;
      v_created := least(v_created, v_scheduled - interval '1 day');
      v_creator := c_admins[1 + floor(random() * 2)::int];
      v_reschedules := case when random() < 0.08 then 1 + floor(random() * 2)::int else 0 end;

      v_started := case when v_status in ('new', 'assigned') then null
                        else v_scheduled + make_interval(mins => floor(random() * 20)::int) end;
      v_completed := case when v_status in ('job_done', 'reviewed', 'closed')
                          then v_started + case when v_offset < 0 and random() < 0.05 then interval '27 hours'
                                                else make_interval(mins => 60 + floor(random() * 120)::int) end
                     end;
      v_reviewed := case when v_status in ('reviewed', 'closed') then v_completed + interval '20 hours' end;
      v_closed := case when v_status = 'closed' then v_completed + interval '30 hours' end;
      v_name := c_names[1 + floor(random() * array_length(c_names, 1))::int];

      insert into public.orders (
        id, order_no, status, customer_name, customer_phone, customer_address, problem_description,
        service_type_id, quoted_sen, scheduled_at, technician_id, created_by, assigned_by,
        reschedule_count, created_at, updated_at, started_at, completed_at,
        reviewed_at, reviewed_by, closed_at, closed_by
      ) values (
        v_id, private.next_order_no(v_created), v_status, v_name,
        '601' || (2 + floor(random() * 8))::int || lpad(floor(random() * 10000000)::int::text, 7, '0'),
        'No. ' || (1 + floor(random() * 80))::int || ', Jalan ' || (1 + floor(random() * 20))::int || '/'
          || (1 + floor(random() * 9))::int || ', ' || c_areas[1 + floor(random() * array_length(c_areas, 1))::int],
        c_problems[1 + floor(random() * array_length(c_problems, 1))::int],
        v_type, v_quote, v_scheduled, v_tech,
        v_creator, case when v_tech is null then null else v_creator end,
        v_reschedules, v_created, coalesce(v_closed, v_reviewed, v_completed, v_started, v_created),
        v_started, v_completed,
        v_reviewed, case when v_reviewed is not null then c_manager end,
        v_closed, case when v_closed is not null then c_manager end
      );

      -- Backdated history for the order's timeline.
      insert into public.audit_log (table_name, record_id, order_id, action, actor_id, after, via, created_at)
      values ('orders', v_id, v_id, 'INSERT', v_creator,
              jsonb_build_object('status', case when v_tech is null then 'new' else 'assigned' end,
                                 'technician_id', v_tech, 'scheduled_at', v_scheduled),
              'ui', v_created);
      for v_file in 1 .. v_reschedules loop
        insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, reason, via, created_at)
        values ('orders', v_id, v_id, 'UPDATE', v_creator,
                jsonb_build_object('scheduled_at', v_scheduled - make_interval(days => v_file)),
                jsonb_build_object('scheduled_at', v_scheduled - make_interval(days => v_file - 1)),
                (array['Customer asked for a later slot', 'Technician delayed at previous job', 'Parts not yet in stock'])[1 + floor(random() * 3)::int],
                'ui', v_created + make_interval(hours => v_file));
      end loop;
      if v_started is not null then
        insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, via, created_at)
        values ('orders', v_id, v_id, 'UPDATE', v_tech, '{"status":"assigned"}', '{"status":"in_progress"}', 'ui', v_started);
      end if;

      continue when v_completed is null;

      -- A few jobs were sent back once by the manager before being redone.
      if v_reviewed is not null and random() < 0.06 then
        insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, reason, via, created_at)
        values
          ('orders', v_id, v_id, 'UPDATE', v_tech, '{"status":"in_progress"}', '{"status":"job_done"}', null, 'ui', v_completed - interval '1 hour'),
          ('orders', v_id, v_id, 'UPDATE', c_manager, '{"status":"job_done"}', '{"status":"in_progress"}',
           'Missing photo of the outdoor unit', 'ui', v_completed - interval '40 minutes');
      end if;
      insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, via, created_at)
      values ('orders', v_id, v_id, 'UPDATE', v_tech, '{"status":"in_progress"}', '{"status":"job_done"}', 'ui', v_completed);
      if v_reviewed is not null then
        insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, via, created_at)
        values ('orders', v_id, v_id, 'UPDATE', c_manager, '{"status":"job_done"}', '{"status":"reviewed"}', 'ui', v_reviewed);
      end if;
      if v_closed is not null then
        insert into public.audit_log (table_name, record_id, order_id, action, actor_id, before, after, via, created_at)
        values ('orders', v_id, v_id, 'UPDATE', c_manager, '{"status":"reviewed"}', '{"status":"closed"}', 'ui', v_closed);
      end if;

      -- Occasional manual flag raised by an admin after a customer call.
      if random() < 0.04 then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_by, raised_at)
        values (v_id, null, 'medium', 'manual', 'Customer called to dispute the final amount', 'open', v_creator, v_completed + interval '3 hours');
      end if;

      -- Completion: most jobs on quote, some with explained extras, a few not.
      v_roll := random();
      v_extra := case when v_roll < 0.65 then 0
                      when v_roll < 0.90 then (ceil(v_quote * (0.05 + random() * 0.15) / 1000) * 1000)::int
                      when v_roll < 0.97 then (ceil(v_quote * (0.25 + random() * 0.35) / 1000) * 1000)::int
                      else (ceil(v_quote * 0.1 / 1000) * 1000)::int end;
      v_remarks := case when v_extra = 0 then null
                        when v_roll >= 0.97 then null
                        else 'Extra parts: ' || (array['drain pipe', 'capacitor', 'bracket', 'copper piping', 'gas top-up'])[1 + floor(random() * 5)::int] end;
      v_final := v_quote + v_extra;

      insert into public.completions (order_id, work_done, extra_sen, final_sen, remarks, technician_id, completed_at)
      values (v_id, c_work[1 + floor(random() * array_length(c_work, 1))::int], v_extra, v_final, v_remarks, v_tech, v_completed);

      -- Payment: closed jobs are settled; others mostly paid, some pending or short.
      v_roll := random();
      v_paid := case when v_status = 'closed' then v_final
                     when v_roll < 0.75 then v_final
                     when v_roll < 0.92 then 0
                     else v_final - 8000 end;
      if v_paid > 0 then
        insert into public.payments (order_id, amount_sen, method, recorded_by, recorded_at)
        values (v_id, v_paid, (array['cash', 'transfer', 'card', 'qr'])[1 + floor(random() * 4)::int]::public.payment_method,
                v_tech, v_completed);
      end if;

      -- Attachment records (placeholder paths; the UI shows a placeholder when a file is absent).
      v_files := case when random() < 0.12 then 0 else 2 + floor(random() * 2)::int end;
      for v_file in 1 .. v_files loop
        insert into public.attachments (order_id, storage_path, mime, size_bytes, uploaded_by, created_at)
        values (v_id, 'orders/' || v_id || '/seed-photo-' || v_file || '.jpg', 'image/jpeg', 350000, v_tech, v_completed);
      end loop;

      -- Flags, mirroring the rules in SRS FR-FLG-1. Older ones are resolved.
      v_resolved := v_status = 'closed';
      if v_extra > 0 and v_remarks is null then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at, resolved_by, resolved_at, resolution_note)
        values (v_id, 'extras_without_remarks', 'high', 'auto', 'Extra charges with no remarks',
                case when v_resolved then 'resolved' else 'open' end::public.flag_status, v_completed,
                case when v_resolved then c_manager end, case when v_resolved then v_completed + interval '1 day' end,
                case when v_resolved then 'Confirmed with technician' end);
      end if;
      if v_final > v_quote * 1.2 then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at, resolved_by, resolved_at, resolution_note)
        values (v_id, 'over_quote', 'high', 'auto',
                format('Final RM %s is %s%% above quote', to_char(v_final / 100.0, 'FM999990.00'), round((v_final - v_quote) * 100.0 / v_quote)),
                case when v_resolved then 'resolved' else 'open' end::public.flag_status, v_completed,
                case when v_resolved then c_manager end, case when v_resolved then v_completed + interval '1 day' end,
                case when v_resolved then 'Customer agreed to extra work' end);
      elsif v_extra > 0 and v_remarks is not null then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at, resolved_by, resolved_at, resolution_note)
        values (v_id, 'over_quote_explained', 'low', 'auto', format('+RM %s extra, explained', to_char(v_extra / 100.0, 'FM999990.00')),
                case when v_resolved then 'resolved' else 'open' end::public.flag_status, v_completed,
                case when v_resolved then c_manager end, case when v_resolved then v_completed + interval '1 day' end,
                case when v_resolved then 'Remarks checked' end);
      end if;
      if v_paid > 0 and v_paid < v_final then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at)
        values (v_id, 'underpaid', 'high', 'auto', format('Payment RM %s short', to_char((v_final - v_paid) / 100.0, 'FM999990.00')), 'open', v_completed);
      end if;
      if v_files = 0 then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at, resolved_by, resolved_at, resolution_note)
        values (v_id, 'no_attachments', 'medium', 'auto', 'Job done with no photos or documents',
                case when v_resolved then 'resolved' else 'open' end::public.flag_status, v_completed,
                case when v_resolved then c_manager end, case when v_resolved then v_completed + interval '1 day' end,
                case when v_resolved then 'Photos sent by WhatsApp instead' end);
      end if;
      if v_completed > v_scheduled + interval '24 hours' then
        insert into public.flags (order_id, rule_code, severity, source, message, status, raised_at, resolved_by, resolved_at, resolution_note)
        values (v_id, 'late_completion', 'low', 'auto', 'Completed more than 24 hours after scheduled time',
                case when v_resolved then 'resolved' else 'open' end::public.flag_status, v_completed,
                case when v_resolved then c_manager end, case when v_resolved then v_completed + interval '1 day' end,
                case when v_resolved then 'Customer rescheduled on site' end);
      end if;
    end loop;
  end loop;
end
$$;

alter table public.orders      enable trigger audit_orders;
alter table public.completions enable trigger audit_completions;
alter table public.payments    enable trigger audit_payments;
alter table public.attachments enable trigger audit_attachments;
alter table public.flags       enable trigger audit_flags;
