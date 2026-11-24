create function public.bgau_daily_traffic() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('users',count(*),'visits',coalesce(sum(visits),0))
  from bgau_private.visit_days
  where visit_day=timezone('Asia/Yekaterinburg',statement_timestamp())::date;
$$;
revoke all on function public.bgau_daily_traffic() from public,anon;
grant execute on function public.bgau_daily_traffic() to authenticated;
notify pgrst,'reload schema';
