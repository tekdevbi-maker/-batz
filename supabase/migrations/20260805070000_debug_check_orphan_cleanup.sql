create or replace function debug_check_orphan_cleanup(p_ids uuid[])
returns table (id uuid, kind text, still_exists boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  foreach v_id in array p_ids loop
    return query select v_id, 'roster_entry', exists(select 1 from roster_entry where roster_entry.id = v_id);
    return query select v_id, 'player', exists(select 1 from player where player.id = v_id);
  end loop;
end;
$$;
