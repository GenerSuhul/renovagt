
CREATE TABLE public.sap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE INDEX sap_events_event_type_idx ON public.sap_events (event_type);
CREATE INDEX sap_events_received_at_idx ON public.sap_events (received_at DESC);
CREATE INDEX sap_events_unprocessed_idx ON public.sap_events (received_at) WHERE processed_at IS NULL;

GRANT ALL ON public.sap_events TO service_role;

ALTER TABLE public.sap_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: tabla server-only (service_role bypassa RLS).
