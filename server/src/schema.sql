-- The Operator — server schema.
--
-- Deliberately small. Four tables is the whole thing, because every table that
-- exists is a table that can disagree with Stripe.

-- ── Accounts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Stripe is the source of truth for money; these are a cache of it so a
  -- request never has to wait on Stripe's API to know what a man is entitled to.
  -- Reconciled by webhook and by a nightly sweep, because webhooks are
  -- eventually consistent and occasionally never arrive at all.
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text,
  plan            text NOT NULL DEFAULT 'free',
  allowance       int  NOT NULL DEFAULT 0,

  -- Set explicitly rather than inferred. Stripe's default grace period leaves a
  -- subscription "active" after a card fails, and for a metered AI product that
  -- is the single most expensive default in the stack — a non-paying user
  -- burning tokens for days.
  status          text NOT NULL DEFAULT 'none',   -- none|active|past_due|canceled
  paid_through    timestamptz,
  usage_anchor_at timestamptz
);

-- Which install started the checkout that created this account. Without it a man
-- can pay $30 and the desktop app has no way to learn that the payment was his —
-- he comes back from Stripe still anonymous and still behind the free-tier wall.
-- This is what /v1/claim matches on to hand his install a device token.
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_id text;
CREATE INDEX IF NOT EXISTS account_install_idx ON account(install_id);

-- A website buyer has no app install id yet. Checkout gives him a one-time
-- activation code; only its hash is stored, and the first app install to redeem
-- it becomes the only install allowed to retry that code.
ALTER TABLE account ADD COLUMN IF NOT EXISTS purchase_code_hash text;
ALTER TABLE account ADD COLUMN IF NOT EXISTS purchase_redeemed_install_id text;
ALTER TABLE account ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE account ADD COLUMN IF NOT EXISTS free_studies_used int NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS free_asks_used int NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS deleting_at timestamptz;
ALTER TABLE account ADD COLUMN IF NOT EXISTS usage_anchor_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS account_purchase_code_idx ON account(purchase_code_hash)
  WHERE purchase_code_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_email_lower_idx ON account(lower(email));

-- A deleted account must stay deleted, but deletion must not mint another free
-- trial. Only keyed HMACs survive; no email or device identifier is retained.
CREATE TABLE IF NOT EXISTS free_trial_tombstone (
  identity_hash      text PRIMARY KEY,
  identity_kind      text NOT NULL CHECK (identity_kind IN ('email', 'install')),
  free_studies_used  int NOT NULL DEFAULT 0,
  free_asks_used     int NOT NULL DEFAULT 0,
  last_deleted_at    timestamptz NOT NULL DEFAULT now()
);

-- Billing providers are evidence sources, not the entitlement itself. Stripe,
-- Apple and Google all write verified subscription rows here; account.plan and
-- account.status remain the fast cache read by every study request.
CREATE TABLE IF NOT EXISTS billing_subscription (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  provider           text NOT NULL CHECK (provider IN ('stripe', 'apple', 'google')),
  external_id        text NOT NULL,
  product_id         text NOT NULL,
  plan               text NOT NULL,
  status             text NOT NULL,
  current_period_end timestamptz,
  billing_anchor_at  timestamptz,
  provider_event_at  timestamptz,
  provider_event_rank int NOT NULL DEFAULT 0,
  environment        text NOT NULL DEFAULT 'production',
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS billing_subscription_account_idx
  ON billing_subscription(account_id, updated_at DESC);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS provider_event_at timestamptz;
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS provider_event_rank int NOT NULL DEFAULT 0;
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS billing_anchor_at timestamptz;

CREATE TABLE IF NOT EXISTS google_acknowledgment_outbox (
  purchase_token_hash text PRIMARY KEY,
  purchase_token      text NOT NULL,
  account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  product_id          text NOT NULL,
  base_plan_id        text NOT NULL,
  attempts            int NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_acknowledgment_outbox_due_idx
  ON google_acknowledgment_outbox(next_attempt_at);

-- ── Devices ─────────────────────────────────────────────────────────────────
-- A desktop app cannot hold a browser session. Each install gets a long-lived
-- bearer token tied to an account, revocable individually so one shared laptop
-- never forces a password reset on everything.
CREATE TABLE IF NOT EXISTS device (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,      -- sha256; the raw token is shown once and never stored
  install_id   text,                      -- the app's own per-install uuid, for support
  label        text,                      -- "Cole's MacBook"
  platform     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS device_account_idx ON device(account_id);
ALTER TABLE device ADD COLUMN IF NOT EXISTS platform text;

CREATE TABLE IF NOT EXISTS device_link (
  code_hash             text PRIMARY KEY,
  account_id            uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created_by_device_id  uuid REFERENCES device(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  used_at               timestamptz
);
CREATE INDEX IF NOT EXISTS device_link_account_idx ON device_link(account_id, created_at DESC);

-- Every recovery request lands here, including requests for unknown emails.
-- This keeps the public response and the cooldown behavior indistinguishable
-- without retaining a raw email address.
CREATE TABLE IF NOT EXISTS account_recovery_request (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid REFERENCES account(id) ON DELETE CASCADE,
  email_hash   text NOT NULL,
  install_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_recovery_request_email_rate_idx
  ON account_recovery_request(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_recovery_request_install_rate_idx
  ON account_recovery_request(install_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS account_recovery_code (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  install_hash text NOT NULL,
  code_hash    text NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_recovery_code_lookup_idx
  ON account_recovery_code(account_id, install_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_recovery_code_expiry_idx
  ON account_recovery_code(expires_at) WHERE consumed_at IS NULL;

-- New accounts do not exist yet, so verification is bound to keyed hashes of
-- the normalized email and requesting install. No raw email or code is stored.
CREATE TABLE IF NOT EXISTS account_registration_code (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid REFERENCES account(id) ON DELETE CASCADE,
  email_hash       text NOT NULL,
  install_hash     text NOT NULL,
  source_ip_hash   text NOT NULL,
  code_hash        text NOT NULL,
  platform         text,
  device_label     text,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  attempts         int NOT NULL DEFAULT 0,
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_registration_code
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES account(id) ON DELETE CASCADE;
ALTER TABLE account_registration_code
  ADD COLUMN IF NOT EXISTS source_ip_hash text;
CREATE INDEX IF NOT EXISTS account_registration_code_lookup_idx
  ON account_registration_code(email_hash, install_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_account_idx
  ON account_registration_code(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_email_rate_idx
  ON account_registration_code(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_install_rate_idx
  ON account_registration_code(install_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_source_ip_rate_idx
  ON account_registration_code(source_ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_global_rate_idx
  ON account_registration_code(created_at DESC);
CREATE INDEX IF NOT EXISTS account_registration_code_expiry_idx
  ON account_registration_code(expires_at) WHERE consumed_at IS NULL;

-- ── Usage, one row per account per billing period ────────────────────────────
-- The period is anchored to the SUBSCRIPTION start, never the 1st of the month.
-- Anchoring everyone to the 1st means every reset lands in the same hour, which
-- is also the hour Anthropic's own spend cap resets — the worst possible moment
-- to concentrate a month's opening load.
CREATE TABLE IF NOT EXISTS usage_period (
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,

  studies_used int  NOT NULL DEFAULT 0,

  -- Money promised but not yet reconciled — studies currently running. A
  -- ceiling that ignores this reads $0 for every request in flight, which is
  -- exactly when a burst is happening.
  reserved_usd numeric(10,4) NOT NULL DEFAULT 0,
  -- Money actually spent, from Anthropic's returned token counts.
  actual_usd   numeric(10,4) NOT NULL DEFAULT 0,

  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, period_start)
);
CREATE INDEX IF NOT EXISTS usage_period_updated_idx ON usage_period(updated_at);

CREATE TABLE IF NOT EXISTS study_reservation (
  id           text PRIMARY KEY,
  account_id   uuid REFERENCES account(id) ON DELETE CASCADE,
  install_id   text,
  access_kind  text NOT NULL CHECK (access_kind IN ('recurring', 'topup', 'account_free', 'anon_free')),
  period_start timestamptz NOT NULL,
  reserved_usd numeric(10,4) NOT NULL DEFAULT 0.75,
  state        text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'settled', 'released', 'refunded')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_reservation_account_idx ON study_reservation(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS study_reservation_install_idx ON study_reservation(install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS study_reservation_held_idx ON study_reservation(state, updated_at);

-- ── Per-call ledger ─────────────────────────────────────────────────────────
-- Append-only. This is what finally replaces the estimated cost-per-study with a
-- measured one, and what makes a pricing decision something other than a guess.
CREATE TABLE IF NOT EXISTS usage_event (
  id           bigserial PRIMARY KEY,
  account_id   uuid REFERENCES account(id) ON DELETE SET NULL,
  study_id     text,            -- ties the fan-out, the document, its retries and the verify pass together
  label        text NOT NULL,   -- 'analyze.theme' | 'plain-read' | 'plain-read.retry1' | 'verify' ...
  model        text NOT NULL,
  input_tokens        int NOT NULL DEFAULT 0,
  output_tokens       int NOT NULL DEFAULT 0,
  cache_write_tokens  int NOT NULL DEFAULT 0,
  cache_read_tokens   int NOT NULL DEFAULT 0,
  usd          numeric(10,6) NOT NULL DEFAULT 0,
  reference    text,
  at           timestamptz NOT NULL DEFAULT now()
);
-- Anonymous work has no account_id, so without this column there is nothing tying
-- a free study to the install that paid for it — and the free user could never be
-- allowed to finish the study they already spent their one credit on. Added as an
-- ALTER because the table above is CREATE ... IF NOT EXISTS and will already exist.
ALTER TABLE usage_event ADD COLUMN IF NOT EXISTS install_id text;

CREATE INDEX IF NOT EXISTS usage_event_account_idx ON usage_event(account_id, at);
CREATE INDEX IF NOT EXISTS usage_event_study_idx   ON usage_event(study_id);
CREATE INDEX IF NOT EXISTS usage_event_install_idx ON usage_event(install_id, study_id);

CREATE TABLE IF NOT EXISTS ask_reservation (
  id           text PRIMARY KEY,
  account_id   uuid REFERENCES account(id) ON DELETE SET NULL,
  install_id   text,
  access_kind  text NOT NULL CHECK (access_kind IN ('recurring', 'account_free', 'anon_free')),
  reserved_usd numeric(10,4) NOT NULL DEFAULT 0.08,
  state        text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'settled', 'released')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_reservation_account_idx ON ask_reservation(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ask_reservation_install_idx ON ask_reservation(install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ask_reservation_held_idx ON ask_reservation(state, updated_at);

-- ── Settings ────────────────────────────────────────────────────────────────
-- The kill switch lives HERE and not in an environment variable, so it can be
-- lowered with one SQL statement from a phone, with no redeploy, at the moment
-- it is most needed.
CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO settings (key, value) VALUES ('daily_ceiling_usd', '50')
  ON CONFLICT (key) DO NOTHING;

-- The synthetic account that holds the FREE tier's in-flight reservations.
-- usage_period.account_id has a foreign key, so the row has to exist; free work
-- belongs to no real account but its money still has to be visible to the brake
-- while it is being spent.
INSERT INTO account (id, email, plan, status)
     VALUES ('00000000-0000-0000-0000-000000000001', 'anon-ledger@internal.invalid', 'free', 'none')
ON CONFLICT (id) DO NOTHING;

-- ── Shared document cache ───────────────────────────────────────────────────
-- Content-addressed and NOT keyed to a user, deliberately: the second person to
-- study a passage gets the first person's document at zero marginal cost. This
-- is the single largest margin lever in the hosted model.
CREATE TABLE IF NOT EXISTS document_cache (
  cache_key  text PRIMARY KEY,
  document   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Beta feedback ───────────────────────────────────────────────────────────
-- Was a Supabase project that no longer exists — the host is NXDOMAIN, so every
-- submission from a tester has been failing, and whatever was already submitted
-- is gone. It lives here now, next to everything else, so there is one thing to
-- keep alive instead of two.
CREATE TABLE IF NOT EXISTS feedback (
  id         bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name       text,
  category   text NOT NULL DEFAULT 'General',   -- Bug | Feature | UX | General
  body       text NOT NULL,
  version    text,
  platform   text,
  install_id text,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  decision   text                               -- comply | ignore | null
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);

-- ── Download leads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS download_lead (
  email               text PRIMARY KEY,
  source              text NOT NULL DEFAULT 'operator-website',
  last_platform       text NOT NULL,
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  consent_version     text,
  download_count      int NOT NULL DEFAULT 1,
  first_downloaded_at timestamptz NOT NULL DEFAULT now(),
  last_downloaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_lead_last_idx ON download_lead(last_downloaded_at DESC);
DELETE FROM download_lead WHERE email ILIKE '%.invalid';

-- Account deletion commits locally even when Mailchimp is temporarily down.
-- Only Mailchimp's one-way subscriber hash survives; the email itself does not.
CREATE TABLE IF NOT EXISTS marketing_contact_state (
  subscriber_hash text PRIMARY KEY,
  action          text NOT NULL CHECK (action IN ('sync', 'archive')),
  intent_id       text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_deletion_outbox (
  id                bigserial PRIMARY KEY,
  subscriber_hash   text NOT NULL UNIQUE,
  attempts          int NOT NULL DEFAULT 0,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_deletion_outbox_due_idx
  ON marketing_deletion_outbox(next_attempt_at);

CREATE TABLE IF NOT EXISTS som_purchase (
  session_id          text PRIMARY KEY,
  email               text NOT NULL,
  stripe_customer_id  text,
  payment_intent_id   text,
  amount_total        int NOT NULL,
  currency            text NOT NULL,
  status              text NOT NULL DEFAULT 'paid',
  source              text NOT NULL DEFAULT 'som-digital-early-access',
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  consent_version     text,
  download_count      int NOT NULL DEFAULT 0,
  purchased_at        timestamptz NOT NULL DEFAULT now(),
  last_downloaded_at  timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS som_purchase_email_idx ON som_purchase(lower(email), purchased_at DESC);
CREATE INDEX IF NOT EXISTS som_purchase_recent_idx ON som_purchase(purchased_at DESC);

-- ── Access codes ────────────────────────────────────────────────────────────
-- Comped access, handed out by Cole. Two reasons this is a table and not a
-- constant in the code: a code must be revocable the moment it leaks, and Cole
-- must be able to see who used one without reading a deploy log.
--
-- `uses_max` NULL means unlimited redemptions of the same code (a launch code);
-- 1 means a personal code that dies when it is claimed.
CREATE TABLE IF NOT EXISTS access_code (
  code        text PRIMARY KEY,
  plan        text NOT NULL DEFAULT 'comp',
  label       text,                        -- 'Cole', 'Rikki', 'Beta 7'
  uses_max    int,                         -- NULL = unlimited
  uses_count  int NOT NULL DEFAULT 0,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_code_use (
  code       text NOT NULL REFERENCES access_code(code) ON DELETE CASCADE,
  install_id text NOT NULL,
  account_id uuid REFERENCES account(id) ON DELETE SET NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, install_id)          -- redeeming twice on one install is a no-op
);

-- ── Top-ups ─────────────────────────────────────────────────────────────────
-- A $15 top-up used to take the money and grant nothing: no webhook path, no
-- column, no ledger. The session id is the idempotency key, because Stripe
-- delivers events more than once and a double-credit is as wrong as none.
CREATE TABLE IF NOT EXISTS topup (
  session_id         text PRIMARY KEY,
  stripe_customer_id text,
  studies            int NOT NULL,
  payment_intent_id  text,
  amount_total       integer,
  currency           text,
  refunded_at        timestamptz,
  studies_revoked    integer NOT NULL DEFAULT 0,
  at                 timestamptz NOT NULL DEFAULT now()
);
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
ALTER TABLE account ADD COLUMN IF NOT EXISTS topup_studies int NOT NULL DEFAULT 0;

-- ── Studies ─────────────────────────────────────────────────────────────────
-- A study is a CLAIM, written the moment one is charged for, and it is the only
-- thing /v1/read authorises against.
--
-- Ownership used to be inferred from usage_event — "did this caller's id appear
-- on a model call for this study?" — which was wrong in the most common case in
-- the product: a cache HIT spends nothing, writes no usage rows, and therefore
-- produced a study nobody could prove they owned. A free user would spend their
-- one lifetime credit on a cached analysis and then be refused the reading.
--
-- `state` also makes the one-document rule atomic. Two simultaneous /v1/read
-- calls used to be able to both look, both see no document yet, and both
-- generate at Cole's expense on a single claim. The transition
-- analyzed -> reading is now a conditional UPDATE, so exactly one wins.
CREATE TABLE IF NOT EXISTS study (
  id           text PRIMARY KEY,
  account_id   uuid REFERENCES account(id) ON DELETE SET NULL,
  install_id   text,
  reference    text,
  -- analyzed: paid for, no document yet — may be ridden
  -- reading:  a document is being generated right now
  -- done:     a document was delivered; the claim is spent
  state        text NOT NULL DEFAULT 'analyzed',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE study ADD COLUMN IF NOT EXISTS passage jsonb;
-- How many times this claim has been handed back after a failed reading. An
-- unbounded retry is an unbounded spend on one credit — see releaseStudyForRetry.
ALTER TABLE study ADD COLUMN IF NOT EXISTS retries int NOT NULL DEFAULT 0;
-- A stranded study is refunded ONCE. Without this an anonymous caller could
-- strand on purpose, get the lifetime credit back and repeat — free studies with
-- extra steps, each one spending real Opus tokens.
ALTER TABLE study ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE study ADD COLUMN IF NOT EXISTS analysis jsonb;
ALTER TABLE study ADD COLUMN IF NOT EXISTS document jsonb;
ALTER TABLE study ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE study ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE study ADD COLUMN IF NOT EXISTS workspace jsonb;
ALTER TABLE study ADD COLUMN IF NOT EXISTS workspace_revision int NOT NULL DEFAULT 0;
ALTER TABLE study ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE study ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS study_account_idx ON study(account_id, created_at);
CREATE INDEX IF NOT EXISTS study_install_idx ON study(install_id, created_at);

-- ── Anonymous installs ──────────────────────────────────────────────────────
-- The free tier works with no account at all, so the one lifetime study is
-- tracked against the install's own uuid. Bounded by design: a thousand free
-- users is a one-time cost, not a recurring one.
CREATE TABLE IF NOT EXISTS anon_install (
  install_id   text PRIMARY KEY,
  studies_used int NOT NULL DEFAULT 0,
  asks_used    int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE anon_install ADD COLUMN IF NOT EXISTS asks_used int NOT NULL DEFAULT 0;
