
REVOKE EXECUTE ON FUNCTION public.checkout_create_order(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_payment_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_order_reservations(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_inventory_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_enforce_sap_gate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_customer_account() FROM PUBLIC, anon, authenticated;

-- is_admin / is_super_admin son seguras de usar en políticas, pero las restringimos también
-- ya que las políticas RLS las llaman vía el motor con privilegios SECURITY DEFINER.
-- (Mantienen acceso porque las policies se ejecutan internamente.)
