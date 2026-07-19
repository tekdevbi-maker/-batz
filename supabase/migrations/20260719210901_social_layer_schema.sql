-- Sprint 7: Player Search + Follow + Activity Feed + Team Leaderboard +
-- Block/Report (spec Section 8). Search itself needs no new table -- it
-- reads `player` directly and inherits Sprint 6's can_view_player() RLS,
-- so a Private player a searcher can't see never appears in results.

create table follow (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references auth.users (id),
  player_id uuid not null references player (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_user_id, player_id)
);

-- spec Section 2: "A user blocking or reporting another user on the
-- social layer." Record-keeping table, matching how CustomerCareRequest
-- (Section 10) is "tracked ... for follow-up" rather than deeply
-- automated -- the one functional enforcement point is the follow policy
-- below; there's no messaging surface to hide content from otherwise.
create table block_or_report (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id),
  target_user_id uuid not null references auth.users (id),
  action_type text not null check (action_type in ('block', 'report')),
  reason text,
  created_at timestamptz not null default now()
);

-- Was the blocker (their player's owning parent) blocking this user?
-- Checked at follow-time (spec Section 10: block/report is available "on
-- the social layer (follow, achievement posts)").
create or replace function is_blocked_by_players_owner(target_player_id uuid, target_user_id uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from block_or_report bor
    join player p on p.parent_user_id = bor.reporter_user_id
    where p.id = target_player_id
      and bor.target_user_id = target_user_id
      and bor.action_type = 'block'
  );
$$;

alter table follow enable row level security;

-- Follower identity is readable by anyone who can view the target player
-- (no stated privacy requirement on who follows whom, spec Section 8) --
-- this also lets any viewer compute an accurate follower count, not just
-- the follower themselves.
create policy "viewers of a player can read its follows" on follow for select
  to authenticated
  using (can_view_player(player_id));

create policy "users can follow a player they can view and aren't blocked from" on follow for insert
  to authenticated
  with check (
    follower_user_id = auth.uid()
    and can_view_player(player_id)
    and not is_blocked_by_players_owner(player_id, auth.uid())
  );

create policy "users can unfollow" on follow for delete
  to authenticated
  using (follower_user_id = auth.uid());

alter table block_or_report enable row level security;

create policy "reporters and admin can read block/report records" on block_or_report for select
  to authenticated
  using (is_app_admin() or reporter_user_id = auth.uid());

create policy "users can block or report as themselves" on block_or_report for insert
  to authenticated
  with check (reporter_user_id = auth.uid());

-- One row per star-tier increase, detected at import time (spec Section 9:
-- tiers are derived from existing counts, no new data needed for the
-- rating itself -- this table only records WHEN a tier was crossed, for
-- the feed). Deleting the Game that triggered it removes the claim too,
-- consistent with Section 3a's "no audit log, kept simple by design."
create table activity_feed_item (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references player (id) on delete cascade,
  team_id uuid not null references team (id) on delete cascade,
  game_id uuid not null references game (id) on delete cascade,
  category text not null check (category in ('hits', 'doubles', 'triples', 'home_runs')),
  tier smallint not null,
  created_at timestamptz not null default now()
);

alter table activity_feed_item enable row level security;

create policy "viewers of a player can read its activity" on activity_feed_item for select
  to authenticated
  using (can_view_player(player_id));

-- Inserted by the importing coach's own session as part of the game
-- import flow (app/lib/gamesRepository.ts), not a privileged process.
create policy "team coaches can post milestones for their team's games" on activity_feed_item for insert
  to authenticated
  with check (exists (select 1 from coach_assignment ca where ca.team_id = activity_feed_item.team_id and ca.user_id = auth.uid()));

create table activity_feed_like (
  id uuid primary key default gen_random_uuid(),
  activity_feed_item_id uuid not null references activity_feed_item (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (activity_feed_item_id, user_id)
);

alter table activity_feed_like enable row level security;

create policy "viewers of the underlying post can read its likes" on activity_feed_like for select
  to authenticated
  using (
    exists (
      select 1 from activity_feed_item afi
      where afi.id = activity_feed_like.activity_feed_item_id and can_view_player(afi.player_id)
    )
  );

create policy "users can like a post they can view" on activity_feed_like for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from activity_feed_item afi
      where afi.id = activity_feed_like.activity_feed_item_id and can_view_player(afi.player_id)
    )
  );

create policy "users can unlike" on activity_feed_like for delete
  to authenticated
  using (user_id = auth.uid());
