create or replace function public.bgau_personal_timetable_menu()
returns table(owner_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select t.owner_id, concat_ws(' ',p.last_name,p.first_name)
  from bgau_private.personal_timetables t join bgau_private.profiles p on p.user_id=t.owner_id
  where t.owner_id=(select auth.uid()) and bgau_private.timetable_access()='ready';
$$;
create or replace function public.bgau_read_personal_timetable(p_owner_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select timetable from bgau_private.personal_timetables
  where owner_id=(select auth.uid()) and (p_owner_id is null or p_owner_id=owner_id)
    and bgau_private.timetable_access()='ready';
$$;
revoke execute on function public.bgau_top_five() from public,anon,authenticated;
create function public.bgau_visits_today() returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(visits),0)::bigint from bgau_private.visit_days
  where visit_day=timezone('Asia/Yekaterinburg',statement_timestamp())::date;
$$;
revoke all on function public.bgau_visits_today() from public;
grant execute on function public.bgau_visits_today() to anon,authenticated;
create function public.bgau_record_site_visit() returns void language plpgsql security definer set search_path='' as $$
declare
  visitor uuid := auth.uid();
  moment timestamptz := statement_timestamp();
begin
  if not exists(select from public.bgau_roles where user_id=visitor and not banned) then return; end if;
  insert into bgau_private.visit_cursor as c(user_id,last_visit) values(visitor,moment)
  on conflict(user_id) do update set last_visit=excluded.last_visit where c.last_visit<=moment-interval '30 minutes';
  if found then
    insert into bgau_private.visit_days as d(user_id,visit_day) values(visitor,timezone('Asia/Yekaterinburg',moment)::date)
    on conflict(user_id,visit_day) do update set visits=d.visits+1;
  end if;
end;
$$;
revoke all on function public.bgau_record_site_visit() from public,anon;
grant execute on function public.bgau_record_site_visit() to authenticated;
notify pgrst,'reload schema';
