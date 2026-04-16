-- Petto admin panel enhancements (v0.17.0)
-- Adds: user bans, feature flags, admin announcements, admin RBAC role,
-- plus supporting indexes for paginated admin list queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- User bans (ban workflow with reason, duration, audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_bans (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    admin_id    TEXT NOT NULL,
    reason      TEXT NOT NULL,
    notes       TEXT,
    starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at     TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    revoked_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_bans_active ON user_bans (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Feature flags (runtime toggles + small JSON payloads for mobile)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
    key         TEXT PRIMARY KEY,
    enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    payload     JSONB,
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Admin announcements (banners shown in the mobile app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_announcements (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at         TIMESTAMPTZ,
    target_segment  JSONB,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON admin_announcements (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Admin RBAC: role + status + last_login_at
-- ---------------------------------------------------------------------------
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'superadmin'
        CHECK (role IN ('superadmin','moderator','support'));
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Audit logs (table exists from 0002; ensure indexes for filtering)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON audit_logs (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_admin     ON audit_logs (actor_admin_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_entity    ON audit_logs (entity_type, entity_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Search / pagination indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
        CREATE INDEX IF NOT EXISTS idx_app_users_created ON app_users (created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
        CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
        CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports (status, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'swipes') THEN
        CREATE INDEX IF NOT EXISTS idx_swipes_actor ON swipes (actor_pet_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'matches') THEN
        CREATE INDEX IF NOT EXISTS idx_matches_created ON matches (created_at DESC);
    END IF;
END $$;
