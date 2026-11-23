create schema if not exists bgau_private;
revoke all on schema bgau_private from public;
grant usage on schema bgau_private to authenticated;

create table public.bgau_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin'))
);

alter table public.bgau_roles enable row level security;
revoke all on public.bgau_roles from public, anon, authenticated;
grant select on public.bgau_roles to authenticated;

create policy bgau_read_own_role on public.bgau_roles
  for select to authenticated using (user_id = (select auth.uid()));

create function bgau_private.create_student_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.bgau_roles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function bgau_private.create_student_role() from public, anon, authenticated;
create trigger bgau_student_on_signup after insert on auth.users
  for each row execute function bgau_private.create_student_role();

insert into public.bgau_roles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create function bgau_private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.bgau_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function bgau_private.is_admin() from public, anon, authenticated;
grant execute on function bgau_private.is_admin() to authenticated;

create function public.bgau_list_accounts(p_search text default '', p_offset integer default 0)
returns table (user_id uuid, email text, role text, confirmed boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not bgau_private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, r.role, u.email_confirmed_at is not null
    from auth.users u
    join public.bgau_roles r on r.user_id = u.id
    where strpos(lower(coalesce(u.email, '')), lower(left(coalesce(p_search, ''), 254))) > 0
    order by u.created_at desc, u.id
    limit 31 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.bgau_assign_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not bgau_private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('student', 'teacher') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  update public.bgau_roles r
  set role = p_role
  where r.user_id = p_user_id and r.role <> 'admin'
    and (p_role = 'student' or exists (
      select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
    ));

  if not found then
    raise exception 'This account cannot be changed' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.bgau_list_accounts(text, integer) from public, anon, authenticated;
revoke all on function public.bgau_assign_role(uuid, text) from public, anon, authenticated;
grant execute on function public.bgau_list_accounts(text, integer) to authenticated;
grant execute on function public.bgau_assign_role(uuid, text) to authenticated;

create table public.bgau_schedule_edits (
  group_key text check (group_key ~ '^[a-zA-Z0-9_-]{1,64}$'),
  source_key text check (char_length(source_key) between 1 and 512),
  week smallint check (week between 1 and 53),
  day smallint not null check (day between 1 and 6),
  slot smallint not null check (slot between 1 and 6),
  kind smallint not null check (kind in (0, 1)),
  subject_id integer not null check (subject_id >= 0),
  teacher_id integer not null check (teacher_id >= 0),
  room text not null check (char_length(room) <= 120),
  subgroup smallint not null check (subgroup between 0 and 2),
  starts_at text not null check (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ends_at text not null check (ends_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (starts_at < ends_at),
  primary key (group_key, source_key, week)
);

alter table public.bgau_schedule_edits enable row level security;
revoke all on public.bgau_schedule_edits from public, anon, authenticated;
grant select on public.bgau_schedule_edits to anon, authenticated;
grant insert, update, delete on public.bgau_schedule_edits to authenticated;

create policy bgau_public_schedule_edits on public.bgau_schedule_edits
  for select to anon, authenticated using (true);

create policy bgau_admin_add_edit on public.bgau_schedule_edits
  for insert to authenticated with check ((select bgau_private.is_admin()));

create policy bgau_admin_change_edit on public.bgau_schedule_edits
  for update to authenticated using ((select bgau_private.is_admin()))
  with check ((select bgau_private.is_admin()));

create policy bgau_admin_remove_edit on public.bgau_schedule_edits
  for delete to authenticated using ((select bgau_private.is_admin()));
