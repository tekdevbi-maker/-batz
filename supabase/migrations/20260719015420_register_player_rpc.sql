-- The client was doing player-insert, then roster_entry claim/insert, then
-- team_membership insert as three separate PostgREST calls -- not atomic.
-- A failure on the second or third step (as happened testing the RLS
-- recursion fix above) left a permanently orphaned player row, which then
-- blocked every retry because its auto-generated PlayerTag is
-- deterministic and unique. A single plpgsql function makes the whole
-- registration one transaction: any exception rolls back everything,
-- including the player insert. This is SECURITY INVOKER (the default) --
-- not DEFINER -- so every statement inside still runs as the calling
-- user and is still checked against the existing RLS policies; the
-- function only buys atomicity, not elevated privileges.
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

  select id into v_existing_id
  from roster_entry
  where team_id = p_team_id and uniform_number = p_uniform_number and player_id is null
  limit 1;

  if v_existing_id is not null then
    update roster_entry set player_id = v_player_id
    where id = v_existing_id and player_id is null
    returning id into v_roster_entry_id;

    if v_roster_entry_id is null then
      raise exception 'roster_spot_already_claimed';
    end if;
    v_claimed := true;
  else
    insert into roster_entry (team_id, player_id, uniform_number, first_name, last_name)
    values (p_team_id, v_player_id, p_uniform_number, nullif(p_first_name, ''), nullif(p_last_name, ''))
    returning id into v_roster_entry_id;
  end if;

  insert into team_membership (team_id, user_id)
  values (p_team_id, auth.uid())
  on conflict (team_id, user_id) do nothing;

  return query select v_player_id, v_roster_entry_id, v_claimed;
end;
$$;
