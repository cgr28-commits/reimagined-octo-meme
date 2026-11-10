-- Stage 1: each booking affected by a driver suspension is tracked and resolved on its own.
-- The original assignment snapshot is permanent; only the status columns can change.

CREATE TABLE IF NOT EXISTS owner_alert_items (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES owner_alerts(id),
  booking_reference TEXT NOT NULL,
  leg TEXT NOT NULL CHECK (leg IN ('outbound','return')),
  trip_date TEXT NOT NULL,
  trip_time TEXT NOT NULL DEFAULT '',
  pickup TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  -- How the booking was linked to the driver: permanent driver id, or contact details only.
  match_method TEXT NOT NULL CHECK (match_method IN ('driver_id','contact')),
  original_driver_id TEXT NOT NULL REFERENCES drivers(id),
  original_driver_name TEXT NOT NULL,
  original_assignment TEXT NOT NULL DEFAULT '{}',
  suspension_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'needs_replacement'
    CHECK (status IN ('needs_replacement','replacement_confirmed','cancelled','acknowledged')),
  status_note TEXT NOT NULL DEFAULT '',
  status_detail TEXT NOT NULL DEFAULT '{}',
  status_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_alert_items_alert ON owner_alert_items (alert_id);

-- The original booking/assignment snapshot can never be edited or deleted.
CREATE TRIGGER IF NOT EXISTS owner_alert_items_original_locked
BEFORE UPDATE OF alert_id, booking_reference, leg, trip_date, trip_time, pickup, customer_name, match_method,
  original_driver_id, original_driver_name, original_assignment, suspension_reason, created_at ON owner_alert_items
BEGIN SELECT RAISE(ABORT, 'original booking details are permanent'); END;
CREATE TRIGGER IF NOT EXISTS owner_alert_items_no_delete BEFORE DELETE ON owner_alert_items
BEGIN SELECT RAISE(ABORT, 'booking review items are permanent'); END;
CREATE TRIGGER IF NOT EXISTS owner_alerts_no_delete BEFORE DELETE ON owner_alerts
BEGIN SELECT RAISE(ABORT, 'owner alerts are permanent'); END;
