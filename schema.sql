-- Vakil Saab Agra — Cloudflare D1 schema for click and view tracking.
--
--   npx wrangler d1 create vakilsaabagra
--   npx wrangler d1 execute vakilsaabagra --remote --file=./schema.sql
--
-- What is deliberately NOT here: ip address, user agent, referrer, cookie id,
-- or anything else that could identify a visitor. `session` is a random id
-- held in sessionStorage for the length of one browser session and exists
-- only so the endpoint can ignore the same click arriving twice.

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  type       TEXT    NOT NULL,
  lawyer_id  TEXT,
  source     TEXT,
  query      TEXT,
  category   TEXT,
  area       TEXT,
  session    TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_lawyer_ts ON events (lawyer_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts   ON events (type, ts);

-- Not in the original spec: the 30-second de-duplication check queries by
-- session, and without this it degrades into a table scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session, ts);
