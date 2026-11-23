grant execute on function bgau_private.timetable_access() to authenticated;
drop policy bgau_public_schedule_edits on public.bgau_schedule_edits;
revoke select on public.bgau_schedule_edits from anon;
create policy bgau_signed_in_schedule_edits on public.bgau_schedule_edits
  for select to authenticated using ((select bgau_private.timetable_access())='ready');
