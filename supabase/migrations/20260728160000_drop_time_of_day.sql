-- Time of Day was always coach-entered metadata (not derivable from the
-- GameChanger export) and the coach requested it be dropped -- it wasn't
-- used by duplicate detection or anything else, purely a display field.
alter table game drop column if exists time_of_day;
