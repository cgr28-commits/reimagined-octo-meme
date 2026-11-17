-- Christmas video viewing figures (owner, 17 Nov 2026): anonymous daily totals per event.
-- The worker also creates this table on first use (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS christmas_video_stats (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
