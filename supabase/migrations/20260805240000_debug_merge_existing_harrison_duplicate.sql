-- Retroactively merge Steve's two existing "Harrison Flositz" player rows
-- (created before the attest_player_parent fix in 20260805230000) using
-- the same merge_player_into_existing the fix now calls automatically.
do $$
declare
  v_parent uuid := 'b3d23f84-4569-4a1a-904d-039e91983b95';
  v_newer_player_id uuid;
begin
  select id into v_newer_player_id
  from player
  where parent_user_id = v_parent and first_name = 'Harrison' and last_name = 'Flositz'
  order by created_at desc
  limit 1;

  if v_newer_player_id is not null then
    perform merge_player_into_existing(v_parent, v_newer_player_id);
  end if;
end $$;
