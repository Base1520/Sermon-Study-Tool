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
  paid_through    timestamptz
);

-- Which install started the checkout that created this account. Without it a man
-- can pay $30 and the desktop app has no way to learn that the payment was his —
-- he comes back from Stripe still anonymous and still behind the free-tier wall.
-- This is what /v1/claim matches on to hand his install a device token.
ALTER TABLE account ADD COLUMN IF NOT EXISTS install_id text;
CREATE INDEX IF NOT EXISTS account_install_idx ON account(install_id);

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
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS device_account_idx ON device(account_id);

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
  at                 timestamptz NOT NULL DEFAULT now()
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
-- How many times this claim has been handed back after a failed reading. An
-- unbounded retry is an unbounded spend on one credit — see releaseStudyForRetry.
ALTER TABLE study ADD COLUMN IF NOT EXISTS retries int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS study_account_idx ON study(account_id, created_at);
CREATE INDEX IF NOT EXISTS study_install_idx ON study(install_id, created_at);

-- ── Anonymous installs ──────────────────────────────────────────────────────
-- The free tier works with no account at all, so the one lifetime study is
-- tracked against the install's own uuid. Bounded by design: a thousand free
-- users is a one-time cost, not a recurring one.
CREATE TABLE IF NOT EXISTS anon_install (
  install_id   text PRIMARY KEY,
  studies_used int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
