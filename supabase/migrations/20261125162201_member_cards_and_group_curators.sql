create table bgau_private.member_cards(
 user_id uuid primary key references auth.users on delete cascade,
 member_no bigint generated always as identity unique,
 seen_at timestamptz,
 curator_group text references public.bgau_groups(group_key)
);
create function bgau_private.make_member_card() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into bgau_private.member_cards(user_id) values(new.id);return new;end $$;
create trigger bgau_new_card after insert on auth.users for each row execute function bgau_private.make_member_card();
insert into bgau_private.member_cards(user_id) select id from auth.users order by created_at,id;
create function public.bgau_member_cards(ids uuid[]) returns table(user_id uuid,member_no bigint,online boolean,curator_group text)
language sql stable security definer set search_path='' as $$
 select c.user_id,c.member_no,coalesce(c.seen_at>now()-interval '2 minutes',false),c.curator_group
 from bgau_private.member_cards c where c.user_id=any(ids) and (c.user_id=auth.uid() or bgau_private.is_admin())
$$;
create function public.bgau_heartbeat() returns void language sql security definer set search_path='' as $$
 update bgau_private.member_cards set seen_at=now() where user_id=auth.uid() and (seen_at is null or seen_at<now()-interval '25 seconds')
$$;
create function public.bgau_set_curator(target uuid,group_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not bgau_private.is_admin() then raise exception 'Administrator required';end if;
 if not exists(select from public.bgau_roles where user_id=target and role='student') then raise exception 'Student account required';end if;
 update bgau_private.member_cards set curator_group=group_id where user_id=target;
end $$;
create function bgau_private.curates(g text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from bgau_private.member_cards c join public.bgau_roles r using(user_id)
 where c.user_id=auth.uid() and r.role='student' and not r.banned and c.curator_group=g and bgau_private.timetable_access()='ready')
$$;
create policy curator_insert on public.bgau_schedule_edits for insert to authenticated with check(bgau_private.curates(group_key));
create policy curator_update on public.bgau_schedule_edits for update to authenticated using(bgau_private.curates(group_key)) with check(bgau_private.curates(group_key));
create policy curator_delete on public.bgau_schedule_edits for delete to authenticated using(bgau_private.curates(group_key));
revoke all on function public.bgau_member_cards(uuid[]),public.bgau_set_curator(uuid,text),public.bgau_heartbeat(),bgau_private.curates(text),bgau_private.make_member_card() from public,anon;
grant execute on function public.bgau_member_cards(uuid[]),public.bgau_set_curator(uuid,text),public.bgau_heartbeat(),bgau_private.curates(text) to authenticated;
notify pgrst,'reload schema';
