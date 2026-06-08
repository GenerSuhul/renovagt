-- Ensure manually bootstrapped Auth users remain compatible with Supabase Auth.
-- GoTrue expects these token columns to be empty strings, not NULL.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users is not available; skipping auth token cleanup';
    RETURN;
  END IF;

  UPDATE auth.users
  SET confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      is_super_admin = COALESCE(is_super_admin, false)
  WHERE confirmation_token IS NULL
     OR recovery_token IS NULL
     OR email_change_token_new IS NULL
     OR email_change IS NULL
     OR email_change_token_current IS NULL
     OR reauthentication_token IS NULL
     OR is_super_admin IS NULL;
END $$;
