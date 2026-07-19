-- Core data model (spec Section 2): the entities needed to store what the
-- stat-calculation logic (app/lib/stats.ts) operates over. Auth-dependent
-- tables (CoachInvite, TeamMembership, CoachAssignment, CustomerCareRequest,
-- BlockOrReport) and their RLS policies are deferred to the sprints that
-- build the flows requiring them (Sprints 3, 6-8 per the spec's build order).
--
-- RLS is enabled on every table below with no policies yet, which defaults
-- to deny-all for the anon/authenticated API roles. This is the safe default
-- until granular access rules are designed (Sprint 6) -- it intentionally
-- does not block the service_role key used by migrations/CLI tooling.

create table league (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sanctioning_body text not null check (sanctioning_body in (
    'Little League', 'Babe Ruth League', 'PONY Baseball/Softball',
    'Dixie Youth Baseball', 'USSSA', 'AABC', 'Independent'
  )),
  initials text not null unique,
  admin_user_id uuid references auth.users (id),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified')),
  created_at timestamptz not null default now()
);

create table division (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references league (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

create table team (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references division (id) on delete cascade,
  name text not null,
  logo_url text,
  season text not null check (season in ('Spring', 'Fall')),
  year smallint not null,
  season_status text not null default 'in_season' check (season_status in ('in_season', 'ended')),
  created_at timestamptz not null default now()
);

create table player (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users (id),
  first_name text,
  last_name text,
  reveal_full_name boolean not null default false,
  player_tag text not null unique,
  visibility_scope text not null default 'public' check (visibility_scope in ('public', 'private')),
  created_at timestamptz not null default now()
);

-- One row per Player/team/season (spec Section 2). Created either by a
-- parent's registration or, if unclaimed, by the first game import --
-- player_id is null until a parent claims the spot.
create table roster_entry (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references team (id) on delete cascade,
  player_id uuid references player (id),
  uniform_number smallint not null,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  unique (team_id, uniform_number)
);

-- One imported CSV = one Game record (spec Section 3a).
create table game (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references team (id) on delete cascade,
  game_date date not null,
  game_number integer not null,
  opponent text,
  time_of_day text check (time_of_day in ('Morning', 'Afternoon', 'Night')),
  file_hash text not null,
  created_at timestamptz not null default now(),
  unique (team_id, file_hash)
);

-- Raw per-game batting counts (spec Section 3a): stored per-game and never
-- overwritten. AVG/OBP/SLG/OPS are always derived on read from these rows
-- (see app/lib/stats.ts) -- deleting a Game cascades here and automatically
-- corrects every season/career aggregate with no manual recalculation.
create table game_batting_stat (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references game (id) on delete cascade,
  roster_entry_id uuid not null references roster_entry (id),
  jersey_number smallint,
  ab smallint not null default 0,
  h smallint not null default 0,
  singles smallint not null default 0,
  doubles smallint not null default 0,
  triples smallint not null default 0,
  hr smallint not null default 0,
  rbi smallint not null default 0,
  bb smallint not null default 0,
  hbp smallint not null default 0,
  sf smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, roster_entry_id)
);

alter table league enable row level security;
alter table division enable row level security;
alter table team enable row level security;
alter table player enable row level security;
alter table roster_entry enable row level security;
alter table game enable row level security;
alter table game_batting_stat enable row level security;
