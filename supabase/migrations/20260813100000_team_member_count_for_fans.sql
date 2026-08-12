-- get_team_members raises for non-coaches (it returns emails/real names --
-- rightly restricted). The Team Home stats chart only needs a bare count
-- for the "Fans" number, though, and that's not sensitive -- add a
-- count-only RPC any signed-in user can call so fans (not just coaches)
-- see the Players/Fans/Games Played chart.
create or replace function count_team_members(p_team_id uuid) returns integer
language sql stable
security definer
set search_path = public
as $$
  select count(*)::int from (
    select user_id from coach_assignment where team_id = p_team_id
    union
    select user_id from team_membership where team_id = p_team_id
  ) m;
$$;
