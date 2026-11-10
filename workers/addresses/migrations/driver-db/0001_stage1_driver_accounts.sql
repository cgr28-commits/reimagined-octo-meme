-- Stage 1: individual driver accounts, documents, approval and a permanent audit log.
-- No jobs, no money, no notifications. Staging D1 only (dashboard-staging-drivers).

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL DEFAULT '',
  -- invited → applied → approved | declined; approved ↔ suspended; any → removed
  status TEXT NOT NULL CHECK (status IN ('invited','applied','approved','declined','suspended','removed')),
  status_reason TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0,1)),
  operator_name TEXT NOT NULL DEFAULT '',
  operator_licence_number TEXT NOT NULL DEFAULT '',
  vehicle_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_email_active
  ON drivers (lower(email)) WHERE status <> 'removed';

CREATE TABLE IF NOT EXISTS driver_documents (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  kind TEXT NOT NULL CHECK (kind IN ('operator_licence','phv_driver_licence','dvla_licence','vehicle_licence','insurance')),
  reference TEXT NOT NULL DEFAULT '',
  expires_on TEXT NOT NULL,
  -- Private file key (R2) once uploads are enabled; NULL while only details are recorded.
  file_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','superseded')),
  review_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS driver_documents_driver ON driver_documents (driver_id);

-- Single-use links. Only SHA-256 hashes of tokens are stored.
CREATE TABLE IF NOT EXISTS driver_links (
  token_hash TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','sign_in')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS driver_sessions (
  token_hash TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS driver_sessions_driver ON driver_sessions (driver_id);

-- Messages a driver sends to the office (Contact Office fallback). Stored only — no notification in Stage 1.
CREATE TABLE IF NOT EXISTS driver_office_messages (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

-- Private owner settings (e.g. driver-support phone). Never served to the public site.
CREATE TABLE IF NOT EXISTS owner_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Permanent append-only audit log.
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner','driver','system')),
  actor_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  driver_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_log_driver ON audit_log (driver_id, seq);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
