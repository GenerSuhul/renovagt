-- Complete Auth string/default cleanup for users created by SQL bootstrap.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users is not available; skipping auth string cleanup';
    RETURN;
  END IF;

  UPDATE auth.users
  SET email_change = COALESCE(email_change, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      is_super_admin = COALESCE(is_super_admin, false)
  WHERE email_change IS NULL
     OR phone_change IS NULL
     OR phone_change_token IS NULL
     OR is_super_admin IS NULL;
END $$;
