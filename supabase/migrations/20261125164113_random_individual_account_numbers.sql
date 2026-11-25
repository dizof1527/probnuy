alter table bgau_private.member_cards alter column account_no drop identity;

create function bgau_private.random_account_number()
returns bigint language sql volatile set search_path='' as $$
  select 100000000 + floor(random() * 900000000)::bigint
$$;
revoke all on function bgau_private.random_account_number() from public,anon,authenticated;

do $$
declare card record;
begin
  for card in select user_id,account_no from bgau_private.member_cards loop
    loop
      begin
        update bgau_private.member_cards
        set account_no=bgau_private.random_account_number()
        where user_id=card.user_id;
        exit when (select account_no from bgau_private.member_cards where user_id=card.user_id)<>card.account_no;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end
$$;

create or replace function bgau_private.make_member_card()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  loop
    insert into bgau_private.member_cards(user_id,account_no)
    values(new.id,bgau_private.random_account_number())
    on conflict(account_no) do nothing;
    exit when found;
  end loop;
  return new;
end
$$;
