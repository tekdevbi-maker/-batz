-- One-off cleanup: removes the "SeasonTestTeam"/"SeasonTestLeague" test
-- artifacts created while verifying the dev-register-active-check
-- removal (historical-season registration removed from the wizard).
delete from team where name = 'SeasonTestTeam';
delete from league where name = 'SeasonTestLeague';
