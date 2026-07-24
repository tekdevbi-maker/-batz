-- The join screen now collects First/Last Name for Followers (previously
-- only email/password) -- store it on team_membership so the Team Members
-- screen can show a real name instead of just an email address.
alter table team_membership
  add column first_name text,
  add column last_name text;

-- Old single-arg signature must go first -- otherwise a 1-arg call becomes
-- ambiguous between it and the new 3-arg-with-defaults version.
drop function if exists join_team_as_follower(uuid);

create or replace function join_team_as_follower(
  p_team_id uuid,
  p_first_name text default null,
  p_last_name text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from team_membership where team_id = p_team_id and user_id = v_caller)
    or exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
    return;
  end if;

  if team_member_count(p_team_id) >= 100 then
    raise exception 'team_at_capacity';
  end if;

  insert into team_membership (team_id, user_id, first_name, last_name)
  values (p_team_id, v_caller, nullif(p_first_name, ''), nullif(p_last_name, ''));
end;
$$;

-- Team Members list: prefer the stored name (Follower/Parent sign-up, or
-- imported roster name for a claimed player) over a bare email address.
-- Return shape gained a column (display_name), so the old signature must
-- be dropped first -- Postgres won't CREATE OR REPLACE across an OUT
-- parameter list change.
drop function if exists get_team_members(uuid);

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

  if not exists (select 1 from coach_assignment where team_id = p_team_id and user_id = v_caller) then
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
    select user_id from coach_assignment where team_id = p_team_id
    union
    select user_id from team_membership where team_id = p_team_id
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
    display_name;
end;
$$;
