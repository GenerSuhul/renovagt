-- Checkout now emits one normalized order.created event itself.
-- The legacy trigger emitted a full raw row and caused duplicate queue entries.
DROP TRIGGER IF EXISTS enqueue_order_created ON public.orders;
