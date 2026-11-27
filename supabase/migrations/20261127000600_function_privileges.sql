-- Function privilege lockdown. Runs last so it covers every function above.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and a
-- per-schema ALTER DEFAULT PRIVILEGES cannot remove that global default, so the
-- revokes in 20261127000100 left anon/authenticated able to execute everything.
-- Here: revoke from everyone, then grant back only what each role needs.

-- Future functions created by this role: no implicit EXECUTE for anyone.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Helpers that RLS / storage policies evaluate as the calling user.
grant execute on function
  private.current_app_role(),
  private.order_id_from_path(text),
  private.can_upload_to(text)
to authenticated;

-- Workflow RPCs (each checks role, ownership and state itself).
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

-- Every later migration that adds a function must GRANT EXECUTE explicitly.
