create table bgau_private.personal_timetables (
  owner_id uuid primary key references public.bgau_roles(user_id) on delete cascade,
  timetable jsonb not null check (jsonb_typeof(timetable)='object')
);
revoke all on bgau_private.personal_timetables from public, anon, authenticated;

create function public.bgau_personal_timetable_menu()
returns table (owner_id uuid, display_name text)
language sql stable security definer set search_path = ''
as $$
  select t.owner_id, concat_ws(' ',p.last_name,p.first_name)
  from bgau_private.personal_timetables t
  join bgau_private.profiles p on p.user_id=t.owner_id
  where (select auth.uid()) is not null
    and (bgau_private.is_admin()
      or (t.owner_id=(select auth.uid()) and bgau_private.timetable_access()='ready'))
  order by p.last_name,p.first_name,t.owner_id;
$$;

create function public.bgau_read_personal_timetable(p_owner_id uuid default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select t.timetable from bgau_private.personal_timetables t
  where t.owner_id=coalesce(p_owner_id,(select auth.uid()))
    and ((select auth.uid()) is not null)
    and (bgau_private.is_admin()
      or (t.owner_id=(select auth.uid()) and bgau_private.timetable_access()='ready'));
$$;
revoke all on function public.bgau_personal_timetable_menu(),public.bgau_read_personal_timetable(uuid) from public,anon,authenticated;
grant execute on function public.bgau_personal_timetable_menu(),public.bgau_read_personal_timetable(uuid) to authenticated;
notify pgrst,'reload schema';
