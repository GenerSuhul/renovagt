-- Extiende sap_events al contrato del middleware:
-- event, timestamp, correlation_id, idempotency_key, source y payload.data.
ALTER TABLE public.sap_events
  ADD COLUMN IF NOT EXISTS event_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';

UPDATE public.sap_events
SET
  event_timestamp = COALESCE(event_timestamp, received_at),
  correlation_id = COALESCE(correlation_id, id::text),
  idempotency_key = COALESCE(idempotency_key, id::text),
  source = COALESCE(source, 'legacy')
WHERE event_timestamp IS NULL
   OR correlation_id IS NULL
   OR idempotency_key IS NULL
   OR source IS NULL;

ALTER TABLE public.sap_events
  ALTER COLUMN event_timestamp SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sap_events_idempotency_key_key'
      AND conrelid = 'public.sap_events'::regclass
  ) THEN
    ALTER TABLE public.sap_events
      ADD CONSTRAINT sap_events_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sap_events_correlation_id_idx
  ON public.sap_events (correlation_id);

CREATE INDEX IF NOT EXISTS sap_events_source_idx
  ON public.sap_events (source);

CREATE INDEX IF NOT EXISTS sap_events_status_received_idx
  ON public.sap_events (status, received_at DESC);
