-- `returns table (player_id uuid, ...)` implicitly declares a plpgsql
-- variable named player_id, which collided with the real
-- roster_entry.player_id column wherever it was referenced unqualified
-- ("column reference \"player_id\" is ambiguous"). Qualifying every
-- reference with the table name/alias resolves it.
create or replace function register_player(
  p_team_id uuid,
  p_uniform_number int,
  p_first_name text,
  p_last_name text,
  p_player_tag text
) returns table (player_id uuid, roster_entry_id uuid, claimed_existing boolean)
language plpgsql
as $$
declare
  v_player_id uuid;
  v_roster_entry_id uuid;
  v_existing_id uuid;
  v_claimed boolean := false;
begin
  insert into player (parent_user_id, first_name, last_name, player_tag)
  values (auth.uid(), nullif(p_first_name, ''), nullif(p_last_name, ''), p_player_tag)
  returning id into v_player_id;

  select re.id into v_existing_id
  from roster_entry re
  where re.team_id = p_team_id and re.uniform_number = p_uniform_number and re.player_id is null
  limit 1;

  if v_existing_id is not null then
    update roster_entry
    set player_id = v_player_id
    where roster_entry.id = v_existing_id and roster_entry.player_id is null
    returning roster_entry.id into v_roster_entry_id;

    if v_roster_entry_id is null then
      raise exception 'roster_spot_already_claimed';
    end if;
    v_claimed := true;
  else
    insert into roster_entry (team_id, player_id, uniform_number, first_name, last_name)
    values (p_team_id, v_player_id, p_uniform_number, nullif(p_first_name, ''), nullif(p_last_name, ''))
    returning roster_entry.id into v_roster_entry_id;
  end if;

  insert into team_membership (team_id, user_id)
  values (p_team_id, auth.uid())
  on conflict (team_id, user_id) do nothing;

  return query select v_player_id, v_roster_entry_id, v_claimed;
end;
$$;
