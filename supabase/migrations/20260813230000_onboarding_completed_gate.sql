-- The post-Agree click-through wizard (player-onboarding.tsx) must finish
-- before a newly-assigned player shows up under Home's "My Players" --
-- previously that used parent_attested_at, which is stamped the instant
-- Agree is tapped, so the player appeared before the wizard even started.
-- parent_attested_at stays as the legal consent timestamp (unchanged);
-- this new column tracks wizard completion separately.
alter table player add column if not exists onboarding_completed_at timestamptz;
