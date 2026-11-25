alter table bgau_private.member_cards
  add column account_no bigint generated always as identity (start with 100000001) unique;

drop function public.bgau_member_cards(uuid[]);
create function public.bgau_member_cards(ids uuid[])
returns table(user_id uuid,member_no bigint,online boolean,curator_group text,account_no bigint)
language sql stable security definer set search_path='' as $$
  select c.user_id,c.member_no,coalesce(c.seen_at>now()-interval '2 minutes',false),
    c.curator_group,c.account_no
  from bgau_private.member_cards c
  where c.user_id=any(ids) and (c.user_id=auth.uid() or bgau_private.is_admin())
$$;
revoke all on function public.bgau_member_cards(uuid[]) from public,anon;
grant execute on function public.bgau_member_cards(uuid[]) to authenticated;
notify pgrst,'reload schema';
