-- Season Totals CSVs now save to the head coach's own account in Supabase
-- Storage instead of requiring an on-device file-system permission prompt
-- (Android's Storage Access Framework / iOS Share Sheet) at the moment a
-- season is marked complete. Private bucket -- this is the coach's own
-- record-keeping export, never meant to be publicly readable -- objects
-- keyed by "{coach_user_id}/{file_name}" so RLS can check ownership via
-- (storage.foldername(name))[1], same pattern as team-logos/player-photos.
insert into storage.buckets (id, name, public)
values ('season-totals', 'season-totals', false)
on conflict (id) do nothing;

create policy "coach can view their own season totals" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'season-totals'
    and (is_app_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );

create policy "coach can upload their own season totals" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'season-totals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "coach can delete their own season totals" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'season-totals'
    and (is_app_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );
