-- ============================================================
-- 0005_shelter_applications.sql
--
-- Public shelter onboarding flow: legal entities submit a
-- guided wizard, applications land in an admin review queue
-- with a 48h SLA, approval mints a real shelter account with
-- a temp password (same mechanism as admin-led creation).
--
-- Also adds a verified_at marker on shelters so the existing
-- admin-created rows stay usable while the new path tracks
-- verification explicitly.
-- ============================================================

-- ── Verified marker on shelters ──────────────────────────────
ALTER TABLE shelters
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Back-fill: every shelter that already exists was admin-created,
-- so treat them as verified from the moment they were created.
UPDATE shelters SET verified_at = created_at WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shelters_verified_at ON shelters(verified_at);

-- ── Shelter onboarding applications ──────────────────────────
CREATE TABLE IF NOT EXISTS shelter_applications (
  id TEXT PRIMARY KEY,
  -- Status machine:
  --   submitted   — wizard complete, awaiting admin
  --   under_review — (reserved; not currently set from UI)
  --   approved    — admin accepted; created_shelter_id set
  --   rejected    — admin rejected; rejection_reason_code + note set
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  -- SLA deadline = submitted_at + 48h. Stored as a plain column so
  -- admin queue queries can ORDER BY it without recomputing.
  sla_deadline TIMESTAMPTZ NOT NULL,
  -- Entity info
  entity_type TEXT NOT NULL,
  country TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  registration_certificate_url TEXT NOT NULL,
  -- Org info
  org_name TEXT NOT NULL,
  org_address TEXT NOT NULL DEFAULT '',
  operating_region_country TEXT NOT NULL,
  operating_region_city TEXT NOT NULL,
  species_focus TEXT[] NOT NULL DEFAULT '{}',
  donation_url TEXT NOT NULL DEFAULT '',
  -- Primary contact
  primary_contact_name TEXT NOT NULL,
  primary_contact_email CITEXT NOT NULL,
  primary_contact_phone TEXT NOT NULL DEFAULT '',
  -- Decision
  rejection_reason_code TEXT NOT NULL DEFAULT '',
  rejection_reason_note TEXT NOT NULL DEFAULT ''
    CHECK (length(rejection_reason_note) <= 500),
  created_shelter_id TEXT REFERENCES shelters(id) ON DELETE SET NULL,
  -- Public-facing lookup token so applicants can check status
  -- without an account. Opaque, 32+ chars, unique.
  access_token TEXT UNIQUE NOT NULL
);

-- Prevent two simultaneous in-flight submissions from the same email.
-- Rejected/approved applications don't block a resubmit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_apps_email_active
  ON shelter_applications(lower(primary_contact_email))
  WHERE status IN ('submitted','under_review');

CREATE INDEX IF NOT EXISTS idx_shelter_apps_status_sla
  ON shelter_applications(status, sla_deadline);
CREATE INDEX IF NOT EXISTS idx_shelter_apps_submitted
  ON shelter_applications(submitted_at DESC);
