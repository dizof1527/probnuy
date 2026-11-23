alter table public.bgau_roles add column banned boolean not null default false;
alter table public.bgau_roles add constraint bgau_admin_not_banned check (role <> 'admin' or not banned);

create table public.bgau_groups (
  group_key text primary key,
  label text not null,
  course smallint not null check (course between 1 and 6),
  study_mode text not null,
  has_subgroups boolean not null
);
alter table public.bgau_groups enable row level security;
revoke all on public.bgau_groups from public, anon, authenticated;
grant select on public.bgau_groups to anon, authenticated;
create policy bgau_read_group_catalog on public.bgau_groups for select to anon, authenticated using (true);

create table bgau_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  patronymic text check (char_length(patronymic) <= 80),
  group_key text not null references public.bgau_groups(group_key),
  subgroup smallint not null check (subgroup between 0 and 2),
  nickname text check (char_length(nickname) between 2 and 24),
  avatar bytea check (octet_length(avatar) <= 131072)
);
create unique index bgau_unique_nickname on bgau_private.profiles (lower(nickname)) where nickname is not null;
create table bgau_private.visit_days (
  user_id uuid references auth.users(id) on delete cascade,
  visit_day date,
  visits bigint not null default 1 check (visits > 0),
  primary key (user_id, visit_day)
);
create table bgau_private.visit_cursor (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_visit timestamptz not null
);
create table bgau_private.timetable_sources (
  version text primary key,
  payload jsonb not null
);
revoke all on all tables in schema bgau_private from public, anon, authenticated;

create function bgau_private.save_profile(p_user_id uuid, p_profile jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_group public.bgau_groups%rowtype;
  v_subgroup smallint;
begin
  if p_user_id is null or jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Invalid profile' using errcode='22023';
  end if;
  select * into v_group from public.bgau_groups where group_key = p_profile->>'group_key';
  if not found or coalesce(p_profile->>'subgroup','') !~ '^[012]$' then
    raise exception 'Invalid academic group or subgroup' using errcode='22023';
  end if;
  v_subgroup := (p_profile->>'subgroup')::smallint;
  if (v_group.has_subgroups and v_subgroup = 0) or (not v_group.has_subgroups and v_subgroup <> 0) then
    raise exception 'Please select a subgroup for this group' using errcode='22023';
  end if;
  insert into bgau_private.profiles (user_id,first_name,last_name,patronymic,group_key,subgroup,nickname)
  values (p_user_id, btrim(p_profile->>'first_name'), btrim(p_profile->>'last_name'),
    nullif(btrim(p_profile->>'patronymic'),''), v_group.group_key, v_subgroup, nullif(btrim(p_profile->>'nickname'),''))
  on conflict (user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,
    patronymic=excluded.patronymic,group_key=excluded.group_key,subgroup=excluded.subgroup,nickname=excluded.nickname;
end;
$$;

create function bgau_private.on_signup_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'bgau_profile' then
    perform bgau_private.save_profile(new.id,new.raw_user_meta_data->'bgau_profile');
    update auth.users set raw_user_meta_data=raw_user_meta_data-'bgau_profile' where id=new.id;
  end if;
  return new;
end;
$$;
create trigger bgau_profile_on_signup after insert on auth.users
  for each row execute function bgau_private.on_signup_profile();

create function bgau_private.timetable_access()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when r.banned then 'banned'
      when u.email_confirmed_at is null then 'sign_in'
      when r.role='admin' or p.user_id is not null then 'ready'
      else 'profile_required' end
    from public.bgau_roles r join auth.users u on u.id=r.user_id
    left join bgau_private.profiles p on p.user_id=r.user_id
    where r.user_id=(select auth.uid())
  ),'sign_in');
$$;

create function public.bgau_access_status()
returns text language sql stable security definer set search_path = ''
as $$ select bgau_private.timetable_access(); $$;

create function public.bgau_my_profile()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('role',r.role,'banned',r.banned,
    'nickname', coalesce(p.nickname,'Участник '||left(md5(r.user_id::text),8)),
    'profile',case when p.user_id is null then null else jsonb_build_object(
      'first_name',p.first_name,'last_name',p.last_name,'patronymic',p.patronymic,
      'group_key',p.group_key,'subgroup',p.subgroup,'nickname',p.nickname
    ) end)
  from public.bgau_roles r left join bgau_private.profiles p on p.user_id=r.user_id
  where r.user_id=(select auth.uid());
$$;

create function public.bgau_save_profile(p_profile jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if bgau_private.timetable_access() not in ('ready','profile_required') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform bgau_private.save_profile(auth.uid(),p_profile);
end;
$$;

create function public.bgau_set_avatar(p_jpeg text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_bytes bytea;
begin
  if bgau_private.timetable_access()<>'ready' then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_jpeg is not null then
    if char_length(p_jpeg)>174764 or p_jpeg !~ '^[a-zA-Z0-9+/]+={0,2}$' then
      raise exception 'Invalid image' using errcode='22023';
    end if;
    v_bytes:=decode(p_jpeg,'base64');
    if octet_length(v_bytes) not between 5 and 131072 or
      substring(v_bytes from 1 for 3)<>decode('ffd8ff','hex') or
      substring(v_bytes from octet_length(v_bytes)-1 for 2)<>decode('ffd9','hex') then
      raise exception 'Invalid JPEG image' using errcode='22023';
    end if;
  end if;
  update bgau_private.profiles set avatar=v_bytes where user_id=(select auth.uid());
  if not found then raise exception 'Save the profile first' using errcode='22023'; end if;
end;
$$;

create function public.bgau_get_avatar(p_user_id uuid default null)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_target uuid:=coalesce(p_user_id,auth.uid());
begin
  if auth.uid() is null or (v_target<>auth.uid() and not bgau_private.is_admin()) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  return (select encode(avatar,'base64') from bgau_private.profiles where user_id=v_target);
end;
$$;

create function public.bgau_set_banned(p_user_id uuid,p_banned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not bgau_private.is_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  update public.bgau_roles set banned=p_banned where user_id=p_user_id and role<>'admin';
  if not found then raise exception 'This account cannot be blocked' using errcode='22023'; end if;
end;
$$;

create function public.bgau_list_members(p_search text default '',p_offset integer default 0)
returns table (
  user_id uuid,email text,role text,confirmed boolean,banned boolean,first_name text,last_name text,
  patronymic text,group_label text,course smallint,subgroup smallint,has_avatar boolean,today_visits bigint,total_visits bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not bgau_private.is_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  return query
    with page as (
      select u.id, u.email::text as member_email, r.role as member_role,
        u.email_confirmed_at is not null as verified,r.banned as is_banned,p.first_name,p.last_name,p.patronymic,
        g.label,g.course as group_course,p.subgroup,p.avatar is not null as picture
      from auth.users u join public.bgau_roles r on r.user_id=u.id
      left join bgau_private.profiles p on p.user_id=u.id
      left join public.bgau_groups g on g.group_key=p.group_key
      where strpos(lower(concat_ws(' ',u.email,p.last_name,p.first_name,p.patronymic,g.label)),
        lower(left(coalesce(p_search,''),254)))>0
      order by u.created_at desc,u.id
      limit 31 offset greatest(coalesce(p_offset,0),0)
    )
    select m.id,m.member_email,m.member_role,m.verified,m.is_banned,m.first_name,m.last_name,m.patronymic,
      m.label,m.group_course,m.subgroup,m.picture,
      coalesce(v.today,0)::bigint,coalesce(v.total,0)::bigint
    from page m
    cross join lateral (
      select sum(d.visits) filter (where d.visit_day=timezone('Asia/Yekaterinburg',statement_timestamp())::date) as today,
        sum(d.visits) as total
      from bgau_private.visit_days d where d.user_id=m.id
    ) v;
end;
$$;

create function public.bgau_top_five()
returns table (nickname text) language sql stable security definer set search_path = ''
as $$
  select coalesce(p.nickname,'Участник '||left(md5(r.user_id::text),8))
  from bgau_private.visit_days d join public.bgau_roles r on r.user_id=d.user_id
  left join bgau_private.profiles p on p.user_id=r.user_id
  where not r.banned
  group by r.user_id,p.nickname
  order by sum(d.visits) desc,r.user_id
  limit 5;
$$;

create function public.bgau_read_timetable()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_now timestamptz:=statement_timestamp();
  v_payload jsonb;
  v_profile jsonb;
begin
  if bgau_private.timetable_access()<>'ready' then
    raise exception 'Timetable access denied' using errcode='42501';
  end if;
  select payload into strict v_payload from bgau_private.timetable_sources where version='2026-10-27';
  insert into bgau_private.visit_cursor as cursor(user_id,last_visit) values(v_user,v_now)
  on conflict (user_id) do update set last_visit=excluded.last_visit
    where cursor.last_visit<=v_now-interval '30 minutes';
  if found then
    insert into bgau_private.visit_days as d(user_id,visit_day)
      values(v_user,timezone('Asia/Yekaterinburg',v_now)::date)
    on conflict(user_id,visit_day) do update set visits=d.visits+1;
  end if;
  select jsonb_build_object('group_key',p.group_key,'subgroup',p.subgroup) into v_profile
    from bgau_private.profiles p where p.user_id=v_user;
  return jsonb_build_object('schedule',v_payload,'preferences',v_profile);
end;
$$;

revoke all on function bgau_private.save_profile(uuid,jsonb),bgau_private.on_signup_profile(),bgau_private.timetable_access()
  from public,anon,authenticated;
revoke all on function public.bgau_access_status(),public.bgau_my_profile(),public.bgau_save_profile(jsonb),
  public.bgau_set_avatar(text),public.bgau_get_avatar(uuid),public.bgau_set_banned(uuid,boolean),
  public.bgau_list_members(text,integer),public.bgau_top_five(),public.bgau_read_timetable() from public,anon,authenticated;
grant execute on function public.bgau_access_status(),public.bgau_my_profile(),public.bgau_save_profile(jsonb),
  public.bgau_set_avatar(text),public.bgau_get_avatar(uuid),public.bgau_set_banned(uuid,boolean),
  public.bgau_list_members(text,integer),public.bgau_read_timetable() to authenticated;
grant execute on function public.bgau_top_five() to anon,authenticated;
