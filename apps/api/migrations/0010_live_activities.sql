-- v0.15.0 — iOS Live Activities (Dynamic Island) infrastructure.
--
-- Two-table model so we can both push-to-start a Live Activity (using the
-- per-device push-to-start token) and update / end an already-running
-- Activity (using the per-activity token returned by ActivityKit on the
-- device). Apple rotates the per-activity token freely, so the device
-- re-uploads it on every change; ON CONFLICT keeps the row keyed by user
-- and activity id.

CREATE TABLE IF NOT EXISTS live_activities (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  kind            TEXT NOT NULL,
  related_id      TEXT,
  push_token      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  last_update_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_activities_active
  ON live_activities (kind, related_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_activities_user
  ON live_activities (user_id);

CREATE TABLE IF NOT EXISTS live_activity_start_tokens (
  user_id     TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  token       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_la_start_tokens_user_kind
  ON live_activity_start_tokens (user_id, kind);
