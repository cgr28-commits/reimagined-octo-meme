-- Keep imported profiles linked to the saved driver records in TRACKING_STORE.
ALTER TABLE drivers ADD COLUMN legacy_profile_key TEXT;
ALTER TABLE drivers ADD COLUMN vehicle_make TEXT NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN vehicle_model TEXT NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN vehicle_colour TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS drivers_legacy_profile_key
  ON drivers (legacy_profile_key) WHERE legacy_profile_key IS NOT NULL;
