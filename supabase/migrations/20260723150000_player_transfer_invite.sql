-- Coach-initiated player transfer: a coach can claim a player themselves
-- (via the same register_player() path parents use) to get them on the
-- roster before the real parent has signed up, then hand ownership off via
-- a one-time, player-specific link -- separate from the team-wide join
-- link, which only ever creates a NEW claim, never reassigns an existing
-- one.
--
-- The table is RLS-enabled with zero policies (default-deny): nothing
-- reads or writes it directly over PostgREST. All access goes through the
-- SECURITY DEFINER functions below, same pattern as join_as_assistant_coach
-- (see 20260720023457) -- the authorization logic (coach-only creation,
-- one-time use on claim) lives in the function body, not in RLS.
create table player_transfer_invite (
  id uuid primary key default gen_random_uuid(),
  roster_entry_id uuid not null references roster_entry(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);

alter table player_transfer_invite enable row level security;

-- Coach-only: generates a one-time token for a roster entry that already
-- has a claimed player. Errors if the caller isn't a coach on that team.
create or replace function create_player_transfer(p_roster_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team_id uuid;
  v_player_id uuid;
  v_token text;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select re.team_id, re.player_id into v_team_id, v_player_id
  from roster_entry re
  where re.id = p_roster_entry_id;

  if v_team_id is null then
    raise exception 'roster_entry_not_found';
  end if;
  if v_player_id is null then
    raise exception 'roster_entry_not_claimed';
  end if;

  if not exists (
    select 1 from coach_assignment ca where ca.team_id = v_team_id and ca.user_id = v_caller
  ) then
    raise exception 'not_a_coach_on_this_team';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into player_transfer_invite (roster_entry_id, token, created_by)
  values (p_roster_entry_id, v_token, v_caller);

  return v_token;
end;
$$;

-- Read-only lookup so the transfer-link screen can show "you're about to
-- claim #12 on the Rays" before the visitor even logs in, and reject a
-- token that's already been used.
create or replace function get_player_transfer_info(p_token text)
returns table (
  team_id uuid,
  team_name text,
  uniform_number int,
  player_display_name text,
  already_used boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite player_transfer_invite%rowtype;
  v_team_id uuid;
  v_uniform_number int;
  v_player_id uuid;
  v_team_name text;
  v_player_tag text;
begin
  select * into v_invite from player_transfer_invite pti where pti.token = p_token;
  if v_invite is null then
    raise exception 'invalid_transfer_token';
  end if;

  select re.team_id, re.uniform_number, re.player_id into v_team_id, v_uniform_number, v_player_id
  from roster_entry re
  where re.id = v_invite.roster_entry_id;

  select t.name into v_team_name from team t where t.id = v_team_id;
  select p.player_tag into v_player_tag from player p where p.id = v_player_id;

  return query select v_team_id, v_team_name, v_uniform_number, v_player_tag, (v_invite.used_at is not null);
end;
$$;

-- Self-serve claim: whoever opens the link, once authenticated, becomes
-- the player's new parent_user_id. One-time use, guarded by a row lock so
-- two people opening the same link at once can't both succeed. Stat
-- history is untouched -- it's keyed off roster_entry_id, not player_id.
create or replace function claim_player_transfer(p_token text)
returns table (player_id uuid, roster_entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_invite player_transfer_invite%rowtype;
  v_team_id uuid;
  v_player_id uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_invite
  from player_transfer_invite pti
  where pti.token = p_token
  for update;

  if v_invite is null then
    raise exception 'invalid_transfer_token';
  end if;
  if v_invite.used_at is not null then
    raise exception 'transfer_already_used';
  end if;

  select re.team_id, re.player_id into v_team_id, v_player_id
  from roster_entry re
  where re.id = v_invite.roster_entry_id;

  update player set parent_user_id = v_caller where id = v_player_id;

  insert into team_membership (team_id, user_id)
  values (v_team_id, v_caller)
  on conflict (team_id, user_id) do nothing;

  update player_transfer_invite
  set used_at = now(), used_by = v_caller
  where id = v_invite.id;

  return query select v_player_id, v_invite.roster_entry_id;
end;
$$;
