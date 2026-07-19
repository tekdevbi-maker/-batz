-- auth.users (and its raw_user_meta_data, where the coach's name lives
-- per Sprint 3's signUp metadata) isn't queryable by other users through
-- the public REST API. The parent join screen needs to show the coach's
-- name (spec Section 4: registration is pre-filled with "the Coach's
-- name"), so it's denormalized onto coach_assignment at registration time
-- instead of standing up a security-definer function just for this.
alter table coach_assignment add column first_name text;
alter table coach_assignment add column last_name text;
