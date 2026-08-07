-- Adds a parent-uploadable photo to the player row, used as the baseball
-- card's photo layer (see components/PlayerCard.tsx). Storage bucket mirrors
-- the team-logos pattern (20260723181500_team_logo_storage.sql): public
-- bucket, objects keyed by "{player_id}/photo.<ext>" so RLS can check
-- ownership via (storage.foldername(name))[1] without a separate lookup.
-- Public-readable because the photo only ever gets uploaded for an unlocked
-- (claimed) player -- a locked player has no owning parent to upload one,
-- and FlipStatsCard/PlayerCard never render a photo for isCoachFallback
-- players regardless of what's stored here.
alter table player add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

create policy "anyone can view player photos" on storage.objects for select
  to public
  using (bucket_id = 'player-photos');

create policy "owning parent can upload their player's photo" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'player-photos'
    and (
      is_app_admin()
      or exists (
        select 1 from player p
        where p.id::text = (storage.foldername(name))[1]
          and p.parent_user_id = auth.uid()
      )
    )
  );

create policy "owning parent can replace their player's photo" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'player-photos'
    and (
      is_app_admin()
      or exists (
        select 1 from player p
        where p.id::text = (storage.foldername(name))[1]
          and p.parent_user_id = auth.uid()
      )
    )
  );

create policy "owning parent can delete their player's photo" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'player-photos'
    and (
      is_app_admin()
      or exists (
        select 1 from player p
        where p.id::text = (storage.foldername(name))[1]
          and p.parent_user_id = auth.uid()
      )
    )
  );
