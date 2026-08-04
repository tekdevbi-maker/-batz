-- Badge counts for pending player-claim requests, so a coach can actually
-- notice one without having to think to check Team Members: one call
-- covering every team they coach (for Home's team rows) plus a per-team
-- count (for the Team Home "Team Members" tile).

create or replace function count_pending_claim_requests_for_team(p_team_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_count int;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  select count(*) into v_count
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where re.team_id = p_team_id and r.status = 'pending';

  return v_count;
end;
$$;

create or replace function list_pending_claim_request_counts_for_coach()
returns table (team_id uuid, pending_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select re.team_id, count(*) as pending_count
  from player_claim_request r
  join roster_entry re on re.id = r.roster_entry_id
  where r.status = 'pending'
    and exists (
      select 1 from coach_assignment ca
      where ca.team_id = re.team_id and ca.user_id = auth.uid()
    )
  group by re.team_id;
$$;
