-- Business email migration (project_pre_submission_email_migration): the
-- app's global admin bootstrap moves off the personal tekdevbi@gmail.com
-- account onto the new business account, atbatz@brain-spell.com. Aborts
-- loudly instead of silently leaving zero admins if the new account
-- can't be found, since that would lock everyone out of admin.
do $$
declare
  v_old_admin uuid;
  v_new_admin uuid;
begin
  select id into v_old_admin from auth.users where email = 'tekdevbi@gmail.com';
  select id into v_new_admin from auth.users where email = 'atbatz@brain-spell.com';

  if v_new_admin is null then
    raise exception 'atbatz@brain-spell.com not found -- sign up in the app first';
  end if;

  insert into app_admin (user_id) values (v_new_admin)
  on conflict (user_id) do nothing;

  if v_old_admin is not null then
    delete from app_admin where user_id = v_old_admin;
  end if;
end $$;
