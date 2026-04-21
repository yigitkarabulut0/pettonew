-- ============================================================
-- 0007_listing_moderation.sql
--
-- DSA (Regulation (EU) 2022/2065) compliance: 7-state listing
-- lifecycle, auto-flag rule output, Art. 16 notice-and-action
-- queue, Art. 17 statements of reasons, Art. 22 trusted-flagger
-- priority, Art. 23 repeat-offender tracking.
--
-- Mirrors the inline idempotent bootstrap in
-- apps/api/internal/store/pgstore.go → NewPostgresStore. The API
-- binary runs those on every boot; this file is the standalone
-- source-of-truth for fresh environments.
-- ============================================================

-- ── Extend shelter_pets ────────────────────────────────────
-- `listing_state` is the moderation/publishing lifecycle, orthogonal
-- to availability `status` (available|reserved|adopted|hidden), which
-- continues to serve existing code paths.
ALTER TABLE shelter_pets
  ADD COLUMN IF NOT EXISTS listing_state TEXT NOT NULL DEFAULT 'published';
ALTER TABLE shelter_pets
  ADD COLUMN IF NOT EXISTS last_rejection_code TEXT NOT NULL DEFAULT '';
ALTER TABLE shelter_pets
  ADD COLUMN IF NOT EXISTS last_rejection_note TEXT NOT NULL DEFAULT '';
ALTER TABLE shelter_pets
  ADD COLUMN IF NOT EXISTS auto_flag_reasons TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: map availability → lifecycle for pre-existing listings.
UPDATE shelter_pets SET listing_state = 'adopted'
  WHERE status = 'adopted' AND listing_state = 'published';
UPDATE shelter_pets SET listing_state = 'paused'
  WHERE status = 'hidden' AND listing_state = 'published';

-- 7-state enum constraint. Drop first in case of a legacy variant.
DO $$ BEGIN
  ALTER TABLE shelter_pets DROP CONSTRAINT IF EXISTS shelter_pets_listing_state_check;
EXCEPTION WHEN others THEN NULL; END $$;
ALTER TABLE shelter_pets
  ADD CONSTRAINT shelter_pets_listing_state_check
  CHECK (listing_state IN ('draft','pending_review','published','paused','adopted','archived','rejected'));

CREATE INDEX IF NOT EXISTS idx_shelter_pets_listing_state
  ON shelter_pets(listing_state, created_at DESC);

-- ── Append-only transition audit ───────────────────────────
-- One row per state change. Drives the listing detail timeline, the
-- repeat-offender query (shelter_id + new_state='rejected'), and
-- per-listing admin drill-down.
CREATE TABLE IF NOT EXISTS listing_state_transitions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES shelter_pets(id) ON DELETE CASCADE,
  shelter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL CHECK (actor_role IN ('shelter','admin','system')),
  prev_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  reason_code TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_transitions_listing
  ON listing_state_transitions(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_transitions_shelter_rejected
  ON listing_state_transitions(shelter_id, new_state, created_at DESC);

-- ── Notice-and-action queue (DSA Art. 16) ──────────────────
-- Listing-specific user reports. Generic user/post reports still
-- live in `reports`; listing reports dual-write here so admins get
-- listing-aware resolutions (dismiss / warn / remove / suspend) and
-- trusted flaggers (Art. 22) get priority ordering.
CREATE TABLE IF NOT EXISTS listing_reports (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES shelter_pets(id) ON DELETE CASCADE,
  shelter_id TEXT NOT NULL DEFAULT '',
  reporter_id TEXT NOT NULL DEFAULT '',
  reporter_name TEXT NOT NULL DEFAULT '',
  trusted_flagger BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','dismissed','warned','removed','suspended')),
  resolution TEXT NOT NULL DEFAULT '',
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_reports_status
  ON listing_reports(status, trusted_flagger DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_reports_listing
  ON listing_reports(listing_id, created_at DESC);

-- ── Statements of Reasons (DSA Art. 17) ────────────────────
-- Persisted for every listing removal (rejection or report-driven
-- takedown). Retained 10 years per product spec; clients cannot
-- delete, only admins can via a manual SQL override.
CREATE TABLE IF NOT EXISTS listing_statements_of_reasons (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES shelter_pets(id) ON DELETE CASCADE,
  shelter_id TEXT NOT NULL DEFAULT '',
  content_description TEXT NOT NULL DEFAULT '',
  legal_ground TEXT NOT NULL DEFAULT '',
  facts_relied_on TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  redress_options TEXT NOT NULL DEFAULT '',
  issued_by TEXT NOT NULL DEFAULT '',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_sor_listing
  ON listing_statements_of_reasons(listing_id, issued_at DESC);
