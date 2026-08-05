-- One-off: "Harrison Flositz" (player 50b0e7b6-cae8-4136-88b5-393fed6dec7f,
-- roster_entry 3a164c5c-ca66-4274-b837-4b95d949b5ef) on the Rays team was
-- left behind by the created_by_game_id bug fixed in 20260805150000 --
-- confirmed still unclaimed (is_coach_fallback), zero games on the team,
-- zero stat rows anywhere. Remove it now; going forward the fixed RPC
-- catches this automatically.
do $$
begin
  delete from roster_entry where id = '3a164c5c-ca66-4274-b837-4b95d949b5ef';
  delete from player where id = '50b0e7b6-cae8-4136-88b5-393fed6dec7f';
end $$;
