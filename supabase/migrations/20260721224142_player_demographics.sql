-- Voluntary player demographics (Roster/Career Profile redesign): a
-- parent can optionally fill these in from Player Settings after
-- claiming a player. All nullable -- nothing here is required, and
-- unset fields just don't render on the Career Profile demographics
-- block.
alter table player add column height_feet smallint;
alter table player add column height_inches smallint;
alter table player add column weight_lbs smallint;
alter table player add column bats text check (bats in ('Right', 'Left', 'Switch'));
alter table player add column throws text check (throws in ('Right', 'Left', 'Switch'));
