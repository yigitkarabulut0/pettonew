-- ============================================================
-- 0004_shelters.sql
--
-- Introduces shelter accounts, shelter-owned pets, and the
-- adoption application workflow. Replaces the old user-created
-- adoption listings (drops legacy tables + deletes data).
-- ============================================================

-- ── Shelter accounts ───────────────────────────────────────
-- Separate from app_users and admin_users. Created only by
-- admins; login uses email + password (bcrypt). Shelter is
-- forced to change the temp password on first login.
CREATE TABLE IF NOT EXISTS shelters (
  id TEXT PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  hero_url TEXT,
  address TEXT NOT NULL DEFAULT '',
  city_label TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  hours TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shelters_city ON shelters(city_label);
CREATE INDEX IF NOT EXISTS idx_shelters_status ON shelters(status);

-- ── Shelter-owned adoptable pets ───────────────────────────
CREATE TABLE IF NOT EXISTS shelter_pets (
  id TEXT PRIMARY KEY,
  shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT '',
  breed TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  age_months INT,
  description TEXT NOT NULL DEFAULT '',
  photos TEXT[] NOT NULL DEFAULT '{}',
  vaccines JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_neutered BOOLEAN NOT NULL DEFAULT FALSE,
  microchip_id TEXT NOT NULL DEFAULT '',
  special_needs TEXT NOT NULL DEFAULT '',
  character_tags TEXT[] NOT NULL DEFAULT '{}',
  intake_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','adopted','hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shelter_pets_shelter
  ON shelter_pets(shelter_id, status);
CREATE INDEX IF NOT EXISTS idx_shelter_pets_public
  ON shelter_pets(status, created_at DESC)
  WHERE status IN ('available', 'reserved');
CREATE INDEX IF NOT EXISTS idx_shelter_pets_species
  ON shelter_pets(species) WHERE status = 'available';

-- ── Adoption applications (user → shelter pet) ─────────────
CREATE TABLE IF NOT EXISTS adoption_applications (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES shelter_pets(id) ON DELETE CASCADE,
  shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_avatar_url TEXT,
  housing_type TEXT NOT NULL DEFAULT '',
  has_other_pets BOOLEAN NOT NULL DEFAULT FALSE,
  other_pets_detail TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','chat_open','adopted','withdrawn')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pet_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_adoption_apps_shelter
  ON adoption_applications(shelter_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adoption_apps_user
  ON adoption_applications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adoption_apps_pet
  ON adoption_applications(pet_id, status);

-- ── Conversations bridge ───────────────────────────────────
-- Conversations table gains an optional adoption-application
-- link so shelter↔applicant chats can be retrieved from either
-- direction.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS adoption_application_id TEXT;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS shelter_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_app
  ON conversations(adoption_application_id)
  WHERE adoption_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_shelter
  ON conversations(shelter_id)
  WHERE shelter_id IS NOT NULL;

-- ── Legacy adoption cleanup ────────────────────────────────
-- The old user-created adoption flow is replaced entirely by
-- the shelter workflow. Drop the table rather than keeping
-- dead data around. The API endpoints will 404 (removed).
DROP TABLE IF EXISTS adoption_listings CASCADE;
