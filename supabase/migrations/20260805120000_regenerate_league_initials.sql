-- Initials were derived from league names back when some names still had
-- "(STATE)" suffixes (e.g. "American Legion Baseball - Post 1 (CO)" ->
-- "ALB-P1("), so a bunch of initials ended in a literal "(" character.
-- Now that 20260805110000 stripped parens from every name, regenerate
-- every league's initials from scratch using the same algorithm the app
-- uses (app/lib/leagueInitials.ts: uppercase first letter of each
-- whitespace-separated word, joined; collisions get a trailing 2, 3, ...).
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  create temporary table used_initials (initials text primary key) on commit drop;

  -- Clear every row to a unique placeholder first so the second pass's
  -- UPDATEs never collide against a not-yet-touched old `initials` value
  -- (the unique constraint is checked immediately, not deferred).
  update league set initials = 'TMP-' || id::text;

  for r in select id, name from league order by name, id loop
    select upper(string_agg(left(tok, 1), '')) into base
    from unnest(regexp_split_to_array(trim(r.name), '\s+')) as tok
    where tok <> '';

    candidate := base;
    n := 2;
    while exists (select 1 from used_initials where initials = candidate) loop
      candidate := base || n::text;
      n := n + 1;
    end loop;

    insert into used_initials (initials) values (candidate);
    update league set initials = candidate where id = r.id;
  end loop;
end $$;
