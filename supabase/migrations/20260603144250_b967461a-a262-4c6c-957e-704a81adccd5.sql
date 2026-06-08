
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Admin policies on tables that have RLS but no policies
DROP POLICY IF EXISTS "Admins manage sap events" ON public.sap_events;
CREATE POLICY "Admins manage sap events" ON public.sap_events FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage sap sync log" ON public.sap_sync_log;
CREATE POLICY "Admins manage sap sync log" ON public.sap_sync_log FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
