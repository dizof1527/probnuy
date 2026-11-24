alter table public.bgau_schedule_edits add column cancelled boolean not null default false;

create table bgau_private.teacher_assignments (
  user_id uuid primary key references public.bgau_roles(user_id) on delete cascade,
  teacher_id integer not null,
  subject_ids integer[] not null check (cardinality(subject_ids) > 0)
);
revoke all on bgau_private.teacher_assignments from public, anon, authenticated;

create view bgau_private.base_lessons as
select g.key as group_key, k.source_key, w.value::smallint as week,
  (l.row_data->>0)::smallint as day, (l.row_data->>1)::smallint as slot,
  (l.row_data->>2)::smallint as kind, (l.row_data->>3)::integer as subject_id,
  (l.row_data->>5)::integer as teacher_id, l.row_data->>4 as room,
  (l.row_data->>7)::smallint as subgroup, l.row_data->>9 as starts_at, l.row_data->>10 as ends_at
from bgau_private.timetable_sources s
cross join lateral jsonb_each(s.payload->'groups') g
cross join lateral jsonb_array_elements(g.value) l(row_data)
cross join lateral (
  select '['||string_agg(case when c.position=9 then replace(c.value::text,', ',',') else c.value::text end,',' order by c.position)||']' as source_key
  from jsonb_array_elements(l.row_data) with ordinality c(value,position)
  where c.position<=11
) k
cross join lateral jsonb_array_elements_text(l.row_data->8) w
where s.version='2026-10-27';

create view bgau_private.current_lessons as
select b.group_key,b.source_key,b.week,
  coalesce(e.day,b.day) as day, coalesce(e.slot,b.slot) as slot, coalesce(e.kind,b.kind) as kind,
  coalesce(e.subject_id,b.subject_id) as subject_id,coalesce(e.teacher_id,b.teacher_id) as teacher_id,
  coalesce(e.room,b.room) as room,coalesce(e.subgroup,b.subgroup) as subgroup,
  coalesce(e.starts_at,b.starts_at) as starts_at,coalesce(e.ends_at,b.ends_at) as ends_at,
  coalesce(e.cancelled,false) as cancelled
from bgau_private.base_lessons b left join public.bgau_schedule_edits e using (group_key,source_key,week)
union all
select group_key,source_key,week,day,slot,kind,subject_id,teacher_id,room,subgroup,starts_at,ends_at,cancelled
from public.bgau_schedule_edits where source_key like 'teacher-added:%';

revoke all on bgau_private.base_lessons,bgau_private.current_lessons from public,anon,authenticated;

create function public.bgau_teacher_options(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  if not bgau_private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select jsonb_build_object(
    'teachers',s.payload->'teachers','subjects',s.payload->'subjects',
    'courses', (select jsonb_object_agg(c.teacher_id,c.subject_ids) from (
       select b.teacher_id,array_agg(distinct b.subject_id order by b.subject_id) as subject_ids
       from bgau_private.base_lessons b group by b.teacher_id
     ) c),
    'assignment',(select to_jsonb(a)-'user_id' from bgau_private.teacher_assignments a where a.user_id=p_user_id)
  ) into result from bgau_private.timetable_sources s where s.version='2026-10-27';
  return result;
end;
$$;

create function public.bgau_set_teacher_assignment(p_user_id uuid,p_teacher_id integer,p_subject_ids integer[])
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not bgau_private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  perform 1 from public.bgau_roles r where r.user_id=p_user_id and r.role='teacher' for update;
  if not found then raise exception 'Teacher role required' using errcode='22023'; end if;
  if p_teacher_id is null then
    delete from bgau_private.teacher_assignments where user_id=p_user_id;
    return;
  end if;
  if coalesce(cardinality(p_subject_ids),0)=0 or exists (
    select 1 from unnest(p_subject_ids) requested(id)
    where not exists(select 1 from bgau_private.base_lessons b where b.teacher_id=p_teacher_id and b.subject_id=requested.id)
  ) then raise exception 'Select subjects for this teacher' using errcode='22023'; end if;
  insert into bgau_private.teacher_assignments(user_id,teacher_id,subject_ids)
  values (p_user_id,p_teacher_id,array(select distinct id from unnest(p_subject_ids) id order by id))
  on conflict (user_id) do update set teacher_id=excluded.teacher_id, subject_ids=excluded.subject_ids;
end;
$$;

create function bgau_private.teacher_assignment()
returns bgau_private.teacher_assignments language sql stable security definer set search_path=''
as $$
  select a.* from bgau_private.teacher_assignments a
  join public.bgau_roles r on r.user_id=a.user_id
  join auth.users u on u.id=r.user_id
  where a.user_id=(select auth.uid()) and r.role='teacher' and not r.banned and u.email_confirmed_at is not null;
$$;

create function public.bgau_read_teacher_week(p_week integer)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare a bgau_private.teacher_assignments;
declare payload jsonb;
begin
  if not exists(select 1 from public.bgau_roles r where r.user_id=auth.uid() and r.role='teacher' and not r.banned)
    then raise exception 'Teacher access required' using errcode='42501'; end if;
  a := bgau_private.teacher_assignment();
  if a.user_id is null then return jsonb_build_object('assigned',false); end if;
  if p_week not between 1 and 17 then raise exception 'Invalid week' using errcode='22023'; end if;
  select s.payload into strict payload from bgau_private.timetable_sources s where s.version='2026-10-27';
  return jsonb_build_object(
    'assigned',true,'teacher',payload->'teachers'->a.teacher_id,
    'lessons',coalesce((
      select jsonb_agg(to_jsonb(l)||jsonb_build_object('subject',payload->'subjects'->l.subject_id,'group',g.label)
        order by l.day,l.starts_at,g.label)
      from bgau_private.current_lessons l join public.bgau_groups g using (group_key)
      where l.week=p_week and l.teacher_id=a.teacher_id and l.subject_id=any(a.subject_ids)
    ),'[]'::jsonb),
    'offerings',coalesce((
      select jsonb_agg(to_jsonb(o) order by o.group_label,o.subject_id,o.subgroup) from (
        select distinct b.group_key,g.label as group_label,b.subject_id,payload->'subjects'->>b.subject_id as subject,b.subgroup
        from bgau_private.base_lessons b join public.bgau_groups g using (group_key)
        where b.teacher_id=a.teacher_id and b.subject_id=any(a.subject_ids)
      ) o
    ),'[]'::jsonb)
  );
end;
$$;

create function public.bgau_save_teacher_lesson(p_action text,p_lesson jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare a bgau_private.teacher_assignments;
declare l bgau_private.current_lessons%rowtype;
declare selected_week smallint:=(p_lesson->>'week')::smallint;
begin
  perform 1 from public.bgau_roles r where r.user_id=auth.uid() and r.role='teacher' and not r.banned for update;
  a := bgau_private.teacher_assignment();
  if a.user_id is null then raise exception 'Teacher assignment required' using errcode='42501'; end if;
  if selected_week is null or selected_week not between 1 and 17
      or p_action is null or p_action not in ('add','save','cancel','restore') then
    raise exception 'Invalid lesson action' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bgau_schedule_week_'||selected_week,0));
  if p_action='add' then
    select b.group_key, 'teacher-added:'||gen_random_uuid(), selected_week, b.day,b.slot,b.kind,b.subject_id,
      b.teacher_id,b.room,b.subgroup,b.starts_at,b.ends_at,false
    into l from bgau_private.base_lessons b
    where b.group_key=p_lesson->>'group_key' and b.teacher_id=a.teacher_id
      and b.subject_id=(p_lesson->>'subject_id')::integer and b.subject_id=any(a.subject_ids)
      and b.subgroup=(p_lesson->>'subgroup')::smallint limit 1;
  else
    select c.* into l from bgau_private.current_lessons c where c.group_key=p_lesson->>'group_key'
      and c.source_key=p_lesson->>'source_key' and c.week=selected_week
      and c.teacher_id=a.teacher_id and c.subject_id=any(a.subject_ids);
  end if;
  if not found then raise exception 'This lesson is outside the teaching assignment' using errcode='42501'; end if;
  if p_action in ('add','save') then
    l.day := (p_lesson->>'day')::smallint;
    l.slot := (p_lesson->>'slot')::smallint;
    l.room := btrim(p_lesson->>'room');
    l.starts_at := p_lesson->>'starts_at';
    l.ends_at := p_lesson->>'ends_at';
    if l.cancelled or l.day is null or l.day not between 1 and 6 or l.slot is null or l.slot not between 1 and 6
      or l.room is null or char_length(l.room)>120 or l.starts_at is null or l.ends_at is null
      or l.starts_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or l.ends_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or l.starts_at>=l.ends_at then raise exception 'Invalid lesson details' using errcode='22023'; end if;
  end if;
  if p_action in ('add','save','restore') and exists (
    select 1 from bgau_private.current_lessons c where c.week=l.week and c.day=l.day and not c.cancelled
      and (c.group_key,c.source_key)<>(l.group_key,l.source_key)
      and c.starts_at<l.ends_at and c.ends_at>l.starts_at
      and (c.teacher_id=l.teacher_id
        or (c.group_key=l.group_key and (c.subgroup=0 or l.subgroup=0 or c.subgroup=l.subgroup))
        or (l.room<>'' and lower(btrim(c.room))=lower(l.room)))
  ) then raise exception 'Schedule conflict' using errcode='23P01'; end if;
  insert into public.bgau_schedule_edits(group_key,source_key,week,day,slot,kind,subject_id,teacher_id,room,subgroup,starts_at,ends_at,cancelled)
  values (l.group_key,l.source_key,l.week,l.day,l.slot,l.kind,l.subject_id,l.teacher_id,l.room,l.subgroup,l.starts_at,l.ends_at,p_action='cancel')
  on conflict(group_key,source_key,week) do update set day=excluded.day,slot=excluded.slot,kind=excluded.kind,
    subject_id=excluded.subject_id,teacher_id=excluded.teacher_id,room=excluded.room,subgroup=excluded.subgroup,
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,cancelled=excluded.cancelled;
end;
$$;

create function bgau_private.is_teacher()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.bgau_roles r where r.user_id=(select auth.uid()) and r.role='teacher');
$$;

create policy bgau_teacher_no_shared_edits on public.bgau_schedule_edits as restrictive
  for select to authenticated using (not (select bgau_private.is_teacher()));

alter function public.bgau_read_timetable() set schema bgau_private;
revoke all on function bgau_private.bgau_read_timetable() from public,anon,authenticated;
create function public.bgau_read_timetable()
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if bgau_private.is_teacher() then raise exception 'Use the personal timetable' using errcode='42501'; end if;
  return bgau_private.bgau_read_timetable();
end;
$$;

revoke all on function bgau_private.teacher_assignment(),bgau_private.is_teacher(),
  public.bgau_read_timetable(),public.bgau_teacher_options(uuid),public.bgau_set_teacher_assignment(uuid,integer,integer[]),
  public.bgau_read_teacher_week(integer),public.bgau_save_teacher_lesson(text,jsonb) from public,anon,authenticated;
grant execute on function bgau_private.is_teacher(),public.bgau_read_timetable(),public.bgau_teacher_options(uuid),
  public.bgau_set_teacher_assignment(uuid,integer,integer[]),public.bgau_read_teacher_week(integer),
  public.bgau_save_teacher_lesson(text,jsonb) to authenticated;

notify pgrst,'reload schema';
