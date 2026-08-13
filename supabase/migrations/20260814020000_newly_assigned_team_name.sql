-- Home's "approved request" banner copy is switching from the approving
-- coach's own name to the team's name ("[TeamName] coaching staff has
-- approved your request to unlock [Player Name]."), matching the
-- transfer-offer banner's wording. Add the player's current team name
-- alongside the existing fields.
drop function if exists list_newly_assigned_players();
create or replace function list_newly_assigned_players()
returns table (
  player_id uuid,
  display_name text,
  player_first_name text,
  player_last_name text,
  coach_first_name text,
  coach_last_name text,
  team_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.player_tag),
    p.first_name,
    p.last_name,
    ca.first_name,
    ca.last_name,
    t.name
  from player p
  left join lateral (
    select r.decided_by
    from player_claim_request r
    where r.player_id = p.id and r.initiated_by = 'parent' and r.status = 'approved'
    order by r.decided_at desc
    limit 1
  ) latest_approval on true
  left join lateral (
    select re.team_id
    from roster_entry re
    where re.player_id = p.id
    order by re.created_at desc
    limit 1
  ) latest_roster on true
  left join coach_assignment ca on ca.team_id = latest_roster.team_id and ca.user_id = latest_approval.decided_by
  left join team t on t.id = latest_roster.team_id
  where p.parent_user_id = auth.uid() and p.newly_assigned = true;
$$;
