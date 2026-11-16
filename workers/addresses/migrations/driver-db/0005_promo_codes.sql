-- Email promotional codes (10% welcome discount) and marketing consent records.
-- Owner brief 16 Nov 2026. Lives in the Worker's existing D1 database (binding DRIVER_DB) because
-- D1 gives strongly consistent, atomic single-row updates (one redemption per code, no races).
-- Apply once before the feature is used:
--   npx wrangler d1 migrations apply matni-drivers --remote
-- Until it is applied the promo routes answer 503 and checkout ignores nothing silently:
-- a booking that sends a promo code is refused with a clear message; bookings without one are unaffected.

-- Single settings row (owner dashboard). JSON so new switches need no migration.
CREATE TABLE IF NOT EXISTS promo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  -- Address the code was sent to (lower case). Cleared by the retention job (see promo-store.ts).
  email TEXT NOT NULL,
  -- SHA-256 of the canonical address (dots/+tags folded). Enforces one code per customer
  -- without keeping the address once the retention period ends.
  email_hash TEXT NOT NULL,
  -- Terms fixed when the code is issued (later owner changes never alter a code already sent).
  discount_rate REAL NOT NULL,
  minimum_fare_pence INTEGER NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reserved', 'redeemed', 'deactivated', 'expired')),
  -- A checkout in progress holds the code so it cannot be spent twice at once.
  reserved_key TEXT,
  reserved_until TEXT,
  redeemed_at TEXT,
  redeemed_key TEXT,
  booking_reference TEXT,
  discount_pence INTEGER,
  vehicle_fare_pence INTEGER,
  booking_total_pence INTEGER,
  deactivated_at TEXT,
  deactivated_reason TEXT,
  reinstated_at TEXT,
  -- Set when a second paid booking tried to use an already-redeemed code (owner alerted).
  conflict_at TEXT,
  conflict_detail TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  email_sent_at TEXT,
  email_send_count INTEGER NOT NULL DEFAULT 0,
  anonymised_at TEXT
);

-- At most one live (active or reserved) code per customer.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_one_live_per_customer
  ON promo_codes (email_hash) WHERE status IN ('active', 'reserved');
CREATE INDEX IF NOT EXISTS promo_codes_email_hash ON promo_codes (email_hash);
CREATE INDEX IF NOT EXISTS promo_codes_status ON promo_codes (status, expires_at);
CREATE INDEX IF NOT EXISTS promo_codes_issued ON promo_codes (issued_at);

-- Every request for a code (rate limiting, abuse checks, conversion reporting).
-- Kept separately from marketing permission, as the brief requires.
CREATE TABLE IF NOT EXISTS promo_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  -- issued | resent | already_used | blocked | rate_limited | send_failed | disabled
  outcome TEXT NOT NULL,
  code TEXT,
  source TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS promo_requests_email_at ON promo_requests (email_hash, at);
CREATE INDEX IF NOT EXISTS promo_requests_ip_at ON promo_requests (ip_hash, at);
CREATE INDEX IF NOT EXISTS promo_requests_at ON promo_requests (at);

-- Append-only evidence of marketing consent given or withdrawn (UK GDPR / PECR):
-- who, when, the exact wording shown, and where. The live mailing list stays in the existing
-- marketing store (KV) that the Marketing panel, campaigns and unsubscribe links already use.
CREATE TABLE IF NOT EXISTS marketing_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  consented INTEGER NOT NULL,
  wording TEXT NOT NULL,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS marketing_consents_email ON marketing_consents (email_hash, at);
