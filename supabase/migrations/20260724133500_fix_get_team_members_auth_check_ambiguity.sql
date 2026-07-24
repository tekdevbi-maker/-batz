-- Third occurrence of the same bug, and the actual one firing first: the
-- coach-authorization check itself ("where team_id = p_team_id and user_id
-- = v_caller") has an unqualified user_id colliding with the RETURNS
-- TABLE output variable of the same name -- this runs before any rows are
-- returned, so it was the real cause of every prior attempt still
-- failing identically.
create or replace function get_team_members(p_team_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  claimed_player_names text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from coach_assignment where coach_assignment.team_id = p_team_id and coach_assignment.user_id = v_caller
  ) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  return query
  select
    m.user_id,
    u.email::text,
    coalesce(
      nullif(trim(coalesce(ca.first_name, tm.first_name, '') || ' ' || coalesce(ca.last_name, tm.last_name, '')), ''),
      u.email::text
    ) as display_name,
    case
      when ca.role = 'primary' then 'head_coach'
      when ca.role = 'assistant' then 'assistant_coach'
      when exists (select 1 from player p where p.parent_user_id = m.user_id and p.id in (
        select re.player_id from roster_entry re where re.team_id = p_team_id
      )) then 'parent'
      else 'follower'
    end as role,
    (
      select string_agg(coalesce(re.first_name, '#' || re.uniform_number::text), ', ')
      from roster_entry re
      join player p on p.id = re.player_id
      where re.team_id = p_team_id and p.parent_user_id = m.user_id
    ) as claimed_player_names
  from (
    select coach_assignment.user_id from coach_assignment where team_id = p_team_id
    union
    select team_membership.user_id from team_membership where team_id = p_team_id
  ) m
  join auth.users u on u.id = m.user_id
  left join coach_assignment ca on ca.team_id = p_team_id and ca.user_id = m.user_id
  left join team_membership tm on tm.team_id = p_team_id and tm.user_id = m.user_id
  order by
    case
      when ca.role = 'primary' then 0
      when ca.role = 'assistant' then 1
      else 2
    end,
    3;
end;
$$;
