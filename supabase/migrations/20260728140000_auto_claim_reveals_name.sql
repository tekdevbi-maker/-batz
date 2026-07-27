-- Auto-claimed players (coach import) default to showing their real
-- First/Last name everywhere, not a PlayerTag -- the name came straight
-- from an authoritative GameChanger export, not user entry, so there's
-- no pseudonym-worthy ambiguity the way there is for a parent-entered
-- name. Still just a default: whoever ends up owning the player (coach
-- attestation or transfer to the real parent) can flip reveal_full_name
-- back off in Settings same as any other player.
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

  if v_existing_player_id is not null then
    return v_existing_player_id;
  end if;

  select ca.user_id into v_head_coach_id
  from coach_assignment ca
  where ca.team_id = v_team_id and ca.role = 'primary';

  if v_head_coach_id is null then
    raise exception 'no_head_coach_found';
  end if;

  insert into player (parent_user_id, first_name, last_name, player_tag, reveal_full_name)
  values (v_head_coach_id, nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag, true)
  returning id into v_new_player_id;

  update roster_entry
  set player_id = v_new_player_id
  where id = p_roster_entry_id and player_id is null;

  return v_new_player_id;
end;
$$;
