BEGIN;

ALTER TABLE topup ADD COLUMN IF NOT EXISTS payment_intent_id text;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS amount_total integer;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE topup ADD COLUMN IF NOT EXISTS studies_revoked integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS topup_payment_intent_id_uidx
  ON topup(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS topup_reconciliation_failure (
  stripe_event_id   text PRIMARY KEY,
  payment_intent_id text NOT NULL,
  reason            text NOT NULL,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  attempt_count     integer NOT NULL DEFAULT 1
);

COMMIT;
