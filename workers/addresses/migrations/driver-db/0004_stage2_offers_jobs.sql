-- Stage 2: job offers, bids, assignment, driver job status, change requests and owner escalations.
-- No money moves here: a completed job only records the agreed driver fee. Payments are Stage 3.
-- Staging D1 only (dashboard-staging-drivers).

ALTER TABLE drivers ADD COLUMN vehicle_reg TEXT NOT NULL DEFAULT '';

-- One offer covers one leg of one booking. The snapshot holds only what a driver may see:
-- never the customer fare, the margin or (before assignment) the customer's contact details.
CREATE TABLE IF NOT EXISTS job_offers (
  id TEXT PRIMARY KEY,
  booking_reference TEXT NOT NULL,
  leg TEXT NOT NULL CHECK (leg IN ('outbound','return')),
  -- fixed: first invited driver to accept gets it; bids: owner always chooses; direct: one named driver.
  mode TEXT NOT NULL CHECK (mode IN ('fixed','bids','direct')),
  fee_pence INTEGER,
  trip_date TEXT NOT NULL,
  trip_time TEXT NOT NULL DEFAULT '',
  pickup TEXT NOT NULL DEFAULT '',
  dropoff TEXT NOT NULL DEFAULT '',
  passengers INTEGER NOT NULL DEFAULT 1,
  suitcases INTEGER NOT NULL DEFAULT 0,
  vehicle TEXT NOT NULL DEFAULT '',
  flight_number TEXT NOT NULL DEFAULT '',
  owner_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','withdrawn','declined','expired')),
  awarded_driver_id TEXT REFERENCES drivers(id),
  awarded_fee_pence INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS job_offers_status ON job_offers (status, trip_date);
-- Only one open offer per booking leg at a time.
CREATE UNIQUE INDEX IF NOT EXISTS job_offers_one_open ON job_offers (booking_reference, leg) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS job_offer_recipients (
  offer_id TEXT NOT NULL REFERENCES job_offers(id),
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  state TEXT NOT NULL DEFAULT 'sent' CHECK (state IN ('sent','accepted','declined','bid')),
  bid_pence INTEGER,
  bid_note TEXT NOT NULL DEFAULT '',
  seen_at TEXT,
  responded_at TEXT,
  PRIMARY KEY (offer_id, driver_id)
);
CREATE INDEX IF NOT EXISTS job_offer_recipients_driver ON job_offer_recipients (driver_id);

-- A confirmed job for one driver on one booking leg.
CREATE TABLE IF NOT EXISTS driver_jobs (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES job_offers(id),
  booking_reference TEXT NOT NULL,
  leg TEXT NOT NULL CHECK (leg IN ('outbound','return')),
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  -- The agreed driver fee. Recorded only; nothing is paid from here.
  fee_pence INTEGER NOT NULL,
  trip_date TEXT NOT NULL,
  trip_time TEXT NOT NULL DEFAULT '',
  pickup TEXT NOT NULL DEFAULT '',
  dropoff TEXT NOT NULL DEFAULT '',
  -- confirmed → on_the_way → arrived → completed; released = owner removed the driver;
  -- booking_cancelled = the customer booking itself was cancelled by the owner.
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','on_the_way','arrived','completed','released','booking_cancelled')),
  on_the_way_at TEXT,
  arrived_at TEXT,
  completed_at TEXT,
  -- Private location evidence (owner only). NULL lat/lng = location was not verified.
  arrived_lat REAL, arrived_lng REAL, arrived_accuracy_m REAL,
  completed_lat REAL, completed_lng REAL, completed_accuracy_m REAL,
  released_at TEXT,
  release_reason TEXT NOT NULL DEFAULT '',
  customer_notified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS driver_jobs_driver ON driver_jobs (driver_id, trip_date);
CREATE INDEX IF NOT EXISTS driver_jobs_booking ON driver_jobs (booking_reference, leg);
-- A booking leg can only have one live driver job.
CREATE UNIQUE INDEX IF NOT EXISTS driver_jobs_one_live ON driver_jobs (booking_reference, leg)
  WHERE status IN ('confirmed','on_the_way','arrived');

-- The driver, fee and booking of a job can never be rewritten, and jobs are never deleted.
CREATE TRIGGER IF NOT EXISTS driver_jobs_identity_locked
BEFORE UPDATE OF id, offer_id, booking_reference, leg, driver_id, fee_pence, created_at ON driver_jobs
BEGIN SELECT RAISE(ABORT, 'job identity and fee are permanent'); END;
CREATE TRIGGER IF NOT EXISTS driver_jobs_no_delete BEFORE DELETE ON driver_jobs
BEGIN SELECT RAISE(ABORT, 'driver jobs are permanent'); END;
CREATE TRIGGER IF NOT EXISTS job_offers_no_delete BEFORE DELETE ON job_offers
BEGIN SELECT RAISE(ABORT, 'job offers are permanent'); END;

-- A material change to a confirmed job (date, time, pickup or drop-off) that the driver must answer.
CREATE TABLE IF NOT EXISTS job_change_requests (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES driver_jobs(id),
  old_values TEXT NOT NULL,
  new_values TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cant_do','superseded')),
  created_at TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS job_change_requests_job ON job_change_requests (job_id, status);

-- Things the owner must see. High-priority ones repeat until acknowledged.
-- Acknowledging stops the reminders; it never changes a booking or a job.
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('message','change','offer','job')),
  source_id TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id),
  priority TEXT NOT NULL CHECK (priority IN ('high','normal')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  last_notified_at TEXT,
  next_notify_at TEXT,
  acknowledged_at TEXT,
  closed_at TEXT,
  close_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS escalations_open ON escalations (closed_at, acknowledged_at, next_notify_at);
CREATE TRIGGER IF NOT EXISTS escalations_no_delete BEFORE DELETE ON escalations
BEGIN SELECT RAISE(ABORT, 'escalations are permanent'); END;
