-- Auto-claim on import must land on the team's Head Coach, not whichever
-- coach (possibly an assistant) happened to run the import -- and a
-- client-side "insert player, then update roster_entry" pair can't do
-- that at all, since "parents can create their own player" requires
-- parent_user_id = auth.uid(), which fails the moment the importer isn't
-- also the head coach. SECURITY DEFINER sidesteps that: the caller only
-- needs to be A coach on the team, the row itself is always owned by
-- whoever holds the 'primary' coach_assignment for that team.
create or replace function auto_claim_roster_entry(
  p_roster_entry_id uuid,
  p_first_name text,
  p_last_name text,
  p_player_tag text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_existing_player_id uuid;
  v_head_coach_id uuid;
  v_new_player_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, re.player_id into v_team_id, v_existing_player_id
  from roster_entry re
  where re.id = p_roster_entry_id;

  if v_team_id is null then
    raise exception 'roster_entry_not_found';
  end if;

  if not exists (select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_caller) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  -- Already claimed (e.g. a re-import matched an existing claimed spot) --
  -- return the existing owner rather than touching anything.
  if v_existing_player_id is not null then
    return v_existing_player_id;
  end if;

  select ca.user_id into v_head_coach_id
  from coach_assignment ca
  where ca.team_id = v_team_id and ca.role = 'primary';

  if v_head_coach_id is null then
    raise exception 'no_head_coach_found';
  end if;

  insert into player (parent_user_id, first_name, last_name, player_tag)
  values (v_head_coach_id, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag)
  returning id into v_new_player_id;

  update roster_entry
  set player_id = v_new_player_id
  where id = p_roster_entry_id and player_id is null;

  return v_new_player_id;
end;
$$;
