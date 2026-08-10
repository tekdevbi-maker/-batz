-- Replaces "Coach is unreachable" with "Importing issue" and "Uploading
-- issue" per the revised customer-care topic list -- reclassify any
-- existing coach_unreachable rows to "other" first so the new check
-- constraint validates against existing data.
update customer_care_request set category = 'other' where category = 'coach_unreachable';

alter table customer_care_request drop constraint customer_care_request_category_check;
alter table customer_care_request add constraint customer_care_request_category_check
  check (category in ('registration_issue', 'account_issue', 'importing_issue', 'uploading_issue', 'other'));
