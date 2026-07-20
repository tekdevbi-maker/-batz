-- customer_care_request.team_id had no ON DELETE behavior, so deleting a
-- team failed once any support request referenced it. Support tickets are
-- history that should survive the team being deleted later ("tracked ...
-- for follow-up", spec Section 10) -- SET NULL, not CASCADE, matching the
-- same reasoning already applied to block_or_report.activity_feed_item_id
-- in Sprint 7.
alter table customer_care_request drop constraint customer_care_request_team_id_fkey;
alter table customer_care_request add constraint customer_care_request_team_id_fkey
  foreign key (team_id) references team (id) on delete set null;
