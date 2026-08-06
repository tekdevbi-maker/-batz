-- Remove the unauthorized test@test.com account created this session.
delete from auth.users where email = 'test@test.com';
