-- Stage 1 refinements: message priority, owner alerts (e.g. suspended driver with upcoming bookings).

ALTER TABLE driver_office_messages ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent'));
ALTER TABLE driver_office_messages ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE driver_office_messages ADD COLUMN handled_at TEXT;

-- Alerts for the owner to review by hand. Nothing here changes a booking.
CREATE TABLE IF NOT EXISTS owner_alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS owner_alerts_open ON owner_alerts (resolved_at, created_at);
