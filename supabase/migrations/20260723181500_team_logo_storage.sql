-- Storage bucket for coach-uploaded team logos. Public bucket (logos are
-- meant to be visible to anyone viewing the team, same visibility as the
-- team name), objects keyed by path "{team_id}/logo.<ext>" so RLS can
-- check the uploader is a coach of that team without a separate lookup
-- table -- (storage.foldername(name))[1] is the team_id path segment.
insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

create policy "anyone can view team logos" on storage.objects for select
  to public
  using (bucket_id = 'team-logos');

create policy "team coaches can upload their team logo" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'team-logos'
    and (
      is_app_admin()
      or exists (
        select 1 from coach_assignment ca
        where ca.user_id = auth.uid()
          and ca.team_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "team coaches can replace their team logo" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (
      is_app_admin()
      or exists (
        select 1 from coach_assignment ca
        where ca.user_id = auth.uid()
          and ca.team_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "team coaches can delete their team logo" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (
      is_app_admin()
      or exists (
        select 1 from coach_assignment ca
        where ca.user_id = auth.uid()
          and ca.team_id::text = (storage.foldername(name))[1]
      )
    )
  );
