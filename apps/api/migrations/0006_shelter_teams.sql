-- ============================================================
-- 0006_shelter_teams.sql
--
-- Multi-user access per shelter: 3 roles (admin/editor/viewer),
-- 72h invite links, append-only audit log, 20-member cap,
-- last-admin protection, session invalidation on revoke.
--
-- Runs after 0004 (shelters) and 0005 (onboarding applications).
-- The API binary also keeps an idempotent copy of this DDL inside
-- NewPostgresStore, so fresh deploys pick it up automatically —
-- this file is the source of truth for the next env that spins up.
-- ============================================================

-- ── Shelter members ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shelter_members (
  id TEXT PRIMARY KEY,
  shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending','revoked')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by_member_id TEXT REFERENCES shelter_members(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

-- One email per shelter (per-member identity). A person could still
-- be a member of different shelters with the same email — that's
-- allowed by design.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_members_email
  ON shelter_members(shelter_id, lower(email::text));

CREATE INDEX IF NOT EXISTS idx_shelter_members_shelter
  ON shelter_members(shelter_id, status);

-- ── Shelter member invites ───────────────────────────────────
CREATE TABLE IF NOT EXISTS shelter_member_invites (
  id TEXT PRIMARY KEY,
  shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  invited_by_member_id TEXT REFERENCES shelter_members(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_member_id TEXT REFERENCES shelter_members(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

-- At most one active invite per (shelter, email): active = not yet
-- accepted and not revoked. Expired-but-still-open rows count as
-- active because the admin may resend (which just rolls the token).
CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_invites_active
  ON shelter_member_invites(shelter_id, lower(email::text))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shelter_invites_shelter
  ON shelter_member_invites(shelter_id, created_at DESC);

-- ── Shelter audit log ────────────────────────────────────────
-- Append-only. Actor fields are denormalised at write time so
-- revoked/renamed members still appear correctly in history.
CREATE TABLE IF NOT EXISTS shelter_audit_logs (
  id TEXT PRIMARY KEY,
  shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  actor_member_id TEXT,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shelter_audit_shelter
  ON shelter_audit_logs(shelter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shelter_audit_action
  ON shelter_audit_logs(shelter_id, action);

-- ── Back-fill: every existing shelter becomes its own admin member
-- Uses WHERE NOT EXISTS so running this migration twice is a no-op.
INSERT INTO shelter_members (
  id, shelter_id, email, password_hash, name, role, status,
  must_change_password, joined_at, last_login_at, password_changed_at
)
SELECT
  'member-owner-' || s.id,
  s.id,
  s.email,
  s.password_hash,
  COALESCE(s.name, ''),
  'admin',
  'active',
  s.must_change_password,
  s.created_at,
  s.last_login_at,
  s.password_changed_at
FROM shelters s
WHERE NOT EXISTS (
  SELECT 1 FROM shelter_members m WHERE m.shelter_id = s.id
);
