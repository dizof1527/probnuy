create table bgau_private.schedule_layout_access (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table bgau_private.schedule_layout_access enable row level security;
revoke all on bgau_private.schedule_layout_access from public, anon, authenticated;

create function public.bgau_has_schedule_layout_access()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select from bgau_private.schedule_layout_access a
    where a.user_id=(select auth.uid())
  );
$$;
revoke all on function public.bgau_has_schedule_layout_access() from public, anon;
grant execute on function public.bgau_has_schedule_layout_access() to authenticated;
notify pgrst,'reload schema';
