package store

import (
	"context"
	cryptorand "crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
)

// PostgresStore implements the Store interface using direct SQL queries
// against a PostgreSQL database (Neon) via pgx/v5.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore creates a new PostgresStore connected to the given databaseURL.
func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.ParseConfig: %w", err)
	}
	config.MaxConns = 10
	config.MinConns = 0
	config.MaxConnLifetime = 5 * time.Minute
	config.MaxConnIdleTime = 2 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.NewWithConfig: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pool.Ping: %w", err)
	}
	// Auto-migrate: add group discovery columns
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NOT NULL DEFAULT 0`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NOT NULL DEFAULT 0`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS city_label TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS code TEXT`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_community_groups_code ON community_groups(code) WHERE code IS NOT NULL AND code != ''`)
	pool.Exec(ctx, `ALTER TABLE taxonomies ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}'`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS rules TEXT[] NOT NULL DEFAULT '{}'`)
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`)

	// ── Group Chat v0.2.0 ───────────────────────────────────────────
	// messages: richer payloads + moderation state
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by TEXT`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`)
	pool.Exec(ctx, `ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by TEXT`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(conversation_id) WHERE pinned_at IS NOT NULL`)

	// community_groups: ownership
	pool.Exec(ctx, `ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS owner_user_id TEXT NOT NULL DEFAULT ''`)

	// group admins + mutes
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS community_group_admins (
		group_id   TEXT NOT NULL,
		user_id    TEXT NOT NULL,
		granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (group_id, user_id)
	)`)
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS community_group_mutes (
		group_id    TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		muted_until TIMESTAMPTZ,
		muted_by    TEXT NOT NULL,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (group_id, user_id)
	)`)

	// ── Playdates v0.10.0 ───────────────────────────────────────────
	// Geocoded columns so the discovery hub can filter/sort by distance.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NOT NULL DEFAULT 0`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NOT NULL DEFAULT 0`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS city_label TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS cover_image_url TEXT`)
	// v0.11.1 — optional venue link so the Discover map can highlight
	// venues that currently host a playdate.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS venue_id TEXT`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_playdates_venue_id ON playdates(venue_id)`)

	// ── Playdates v0.11.0 ───────────────────────────────────────────
	// Rules list, soft-cancel, per-playdate chat, FIFO waitlist.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS rules TEXT[] NOT NULL DEFAULT '{}'`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS waitlist TEXT[] NOT NULL DEFAULT '{}'`)

	// ── Host controls v0.16.0 ───────────────────────────────────────
	// "Locked" is a soft close the host can use to stop new joins without
	// advertising it — we intentionally do NOT surface a user-facing badge.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE`)

	// ── My Playdates v0.15.0 ────────────────────────────────────────
	// Idempotency log for the background reminder scheduler — one row per
	// (playdate, user, kind) the very first time a reminder fires.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS playdate_reminders_sent (
		playdate_id TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		kind        TEXT NOT NULL,
		sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (playdate_id, user_id, kind)
	)`)

	// ── Playdate chat v0.14.0 ───────────────────────────────────────
	// Host moderation: muted users can read but not send into the chat.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS playdate_chat_mutes (
		playdate_id TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		muted_by    TEXT NOT NULL,
		muted_until TIMESTAMPTZ,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (playdate_id, user_id)
	)`)
	// Per-user notification mute on any conversation — silences OS push only.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS conversation_mutes (
		conversation_id TEXT NOT NULL,
		user_id         TEXT NOT NULL,
		muted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (conversation_id, user_id)
	)`)
	// v0.11.5 — timed mutes: nullable expiry column. NULL = muted forever.
	pool.Exec(ctx, `ALTER TABLE conversation_mutes ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ`)

	// ── v0.11.0: Notification preferences ────────────────────────────
	// Global per-user opt-outs gating SendExpoPush fan-out. No row = all
	// categories enabled (default for existing users). The mobile
	// notification-settings page is the only writer.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS notification_preferences (
		user_id    TEXT PRIMARY KEY,
		matches    BOOLEAN NOT NULL DEFAULT TRUE,
		messages   BOOLEAN NOT NULL DEFAULT TRUE,
		playdates  BOOLEAN NOT NULL DEFAULT TRUE,
		groups     BOOLEAN NOT NULL DEFAULT TRUE,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)

	// ── v0.11.0: pet photo index ──────────────────────────────────────
	// Speeds up the per-attendee photo lookup in GetPlaydateForUser, which
	// used to scan pet_photos once per attendee in the detail page (the
	// "detail page inanılmaz uzun suruyor" report).
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_pet_photos_pet_id_order ON pet_photos(pet_id, display_order)`)

	// ── Care v0.14.0: Health Profile + Symptom Logs ──────────────────
	// Health profile: at-a-glance "what should an emergency vet know"
	// card surfaced in Care. Allergies + dietary restrictions + free-form
	// emergency notes. Single row per pet (PK pet_id).
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS pet_health_profiles (
		pet_id                TEXT PRIMARY KEY,
		allergies             TEXT[] NOT NULL DEFAULT '{}',
		dietary_restrictions  TEXT[] NOT NULL DEFAULT '{}',
		emergency_notes       TEXT   NOT NULL DEFAULT '',
		updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	// Symptom logs: timeline of categorised pet symptoms. Distinct from
	// diary — designed to be vet-export-ready. One row per observation.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS pet_symptom_logs (
		id              TEXT PRIMARY KEY,
		pet_id          TEXT NOT NULL,
		categories      TEXT[] NOT NULL DEFAULT '{}',
		severity        SMALLINT NOT NULL DEFAULT 1,
		duration_hours  INT NOT NULL DEFAULT 0,
		notes           TEXT NOT NULL DEFAULT '',
		photo_url       TEXT,
		occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_pet_symptom_logs_pet ON pet_symptom_logs(pet_id, occurred_at DESC)`)

	// ── Care v0.14.1: Medications + Weekly Summary ──────────────────
	// pet_medications: recurring schedule (HH:MM in stored timezone +
	// days-of-week mask). last_push_date stores the YYYY-MM-DD in the
	// medication's TZ that was already pushed for, so the per-minute
	// sweeper never double-fires for the same dose.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS pet_medications (
		id              TEXT PRIMARY KEY,
		pet_id          TEXT NOT NULL,
		name            TEXT NOT NULL,
		dosage          TEXT NOT NULL DEFAULT '',
		notes           TEXT NOT NULL DEFAULT '',
		time_of_day     TEXT NOT NULL DEFAULT '',
		days_of_week    SMALLINT[] NOT NULL DEFAULT '{}',
		timezone        TEXT NOT NULL DEFAULT 'UTC',
		start_date      TEXT NOT NULL DEFAULT '',
		end_date        TEXT NOT NULL DEFAULT '',
		last_given_at   TIMESTAMPTZ,
		last_push_date  TEXT NOT NULL DEFAULT '',
		active          BOOLEAN NOT NULL DEFAULT TRUE,
		created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_pet_medications_pet ON pet_medications(pet_id) WHERE active`)

	// user_weekly_summary_log: idempotency for the Sunday push. One row
	// per (user, week_start) means "we already sent this week's summary".
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS user_weekly_summary_log (
		user_id     TEXT NOT NULL,
		week_start  TEXT NOT NULL,
		sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (user_id, week_start)
	)`)

	// ── Care v0.14.2: Documents + Calorie Counter ───────────────────
	// pet_documents: vaccine cards / microchip papers / insurance / etc.
	// File lives in R2; this row keeps the metadata. file_kind separates
	// images from PDFs so the mobile preview can branch.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS pet_documents (
		id          TEXT PRIMARY KEY,
		pet_id      TEXT NOT NULL,
		kind        TEXT NOT NULL DEFAULT 'other',
		title       TEXT NOT NULL,
		file_url    TEXT NOT NULL,
		file_kind   TEXT NOT NULL DEFAULT 'image',
		expires_at  TEXT NOT NULL DEFAULT '',
		notes       TEXT NOT NULL DEFAULT '',
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_pet_documents_pet ON pet_documents(pet_id, created_at DESC)`)

	// Food database. Public rows are admin-curated and shared; private
	// rows are user-scoped. Store kcal at the canonical 100g basis so the
	// meal log can compute calories from grams without an extra fetch.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS food_items (
		id              TEXT PRIMARY KEY,
		name            TEXT NOT NULL,
		brand           TEXT NOT NULL DEFAULT '',
		kind            TEXT NOT NULL DEFAULT 'dry',
		species_label   TEXT NOT NULL DEFAULT '',
		kcal_per_100g   DOUBLE PRECISION NOT NULL DEFAULT 0,
		is_public       BOOLEAN NOT NULL DEFAULT FALSE,
		created_by_user TEXT NOT NULL DEFAULT '',
		created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_food_items_search ON food_items(is_public, species_label)`)

	// Seed common foods once. Idempotent: ON CONFLICT skips duplicates.
	pool.Exec(ctx, `
		INSERT INTO food_items(id, name, brand, kind, species_label, kcal_per_100g, is_public)
		VALUES
		  ('food-seed-rc-medium-adult', 'Medium Adult', 'Royal Canin', 'dry', 'dog', 380, TRUE),
		  ('food-seed-rc-mini-adult', 'Mini Adult', 'Royal Canin', 'dry', 'dog', 395, TRUE),
		  ('food-seed-rc-puppy', 'Maxi Puppy', 'Royal Canin', 'dry', 'dog', 410, TRUE),
		  ('food-seed-hill-adult', 'Adult Chicken', 'Hill''s Science Diet', 'dry', 'dog', 360, TRUE),
		  ('food-seed-purina-pro', 'Pro Plan Adult', 'Purina', 'dry', 'dog', 405, TRUE),
		  ('food-seed-acana-adult', 'Adult', 'Acana', 'dry', 'dog', 360, TRUE),
		  ('food-seed-orijen-adult', 'Original', 'Orijen', 'dry', 'dog', 380, TRUE),
		  ('food-seed-pedigree-wet', 'Adult Beef', 'Pedigree', 'wet', 'dog', 95, TRUE),
		  ('food-seed-rc-cat-indoor', 'Indoor Adult', 'Royal Canin', 'dry', 'cat', 395, TRUE),
		  ('food-seed-hill-cat-adult', 'Adult Optimal Care', 'Hill''s Science Diet', 'dry', 'cat', 380, TRUE),
		  ('food-seed-whiskas-wet', 'Adult Tuna', 'Whiskas', 'wet', 'cat', 70, TRUE),
		  ('food-seed-iams-cat', 'ProActive Health', 'Iams', 'dry', 'cat', 405, TRUE),
		  ('food-seed-treat-dental', 'Dental Treat', 'Generic', 'treat', '', 350, TRUE),
		  ('food-seed-treat-jerky', 'Jerky Treat', 'Generic', 'treat', '', 320, TRUE),
		  ('food-seed-chicken-cooked', 'Chicken (cooked)', 'Home-cooked', 'wet', '', 165, TRUE),
		  ('food-seed-rice-cooked', 'White rice (cooked)', 'Home-cooked', 'dry', '', 130, TRUE),
		  ('food-seed-fish-cooked', 'Fish (cooked)', 'Home-cooked', 'wet', '', 140, TRUE)
		ON CONFLICT (id) DO NOTHING`)

	// Meal log. We snapshot kcal at write-time (Kcal field) so editing a
	// food item later doesn't retroactively rewrite history.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS pet_meal_logs (
		id            TEXT PRIMARY KEY,
		pet_id        TEXT NOT NULL,
		food_item_id  TEXT NOT NULL DEFAULT '',
		custom_name   TEXT NOT NULL DEFAULT '',
		grams         DOUBLE PRECISION NOT NULL DEFAULT 0,
		kcal          DOUBLE PRECISION NOT NULL DEFAULT 0,
		notes         TEXT NOT NULL DEFAULT '',
		eaten_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_pet_meal_logs_pet ON pet_meal_logs(pet_id, eaten_at DESC)`)

	// ── Care v0.14.3: Breed Care Guides + First-Aid Topics ──────────
	// Breed care: admin writes one row per (species, breed). breed_id may
	// be empty for a species-wide entry. Lookup prefers breed-specific.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS breed_care_guides (
		id              TEXT PRIMARY KEY,
		species_id      TEXT NOT NULL,
		species_label   TEXT NOT NULL DEFAULT '',
		breed_id        TEXT NOT NULL DEFAULT '',
		breed_label     TEXT NOT NULL DEFAULT '',
		title           TEXT NOT NULL,
		summary         TEXT NOT NULL DEFAULT '',
		body            TEXT NOT NULL DEFAULT '',
		hero_image_url  TEXT NOT NULL DEFAULT '',
		created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	// Only one row per (species_id, breed_id) — including the
	// species-wide row where breed_id = ''. Easy to enforce because
	// pgcrypto tolerates empty strings as distinct primary-key values.
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_breed_care_guide_unique ON breed_care_guides(species_id, breed_id)`)

	// First-aid topics for the offline handbook.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS first_aid_topics (
		id             TEXT PRIMARY KEY,
		slug           TEXT NOT NULL,
		title          TEXT NOT NULL,
		severity       TEXT NOT NULL DEFAULT 'info',
		summary        TEXT NOT NULL DEFAULT '',
		body           TEXT NOT NULL DEFAULT '',
		display_order  INT NOT NULL DEFAULT 0,
		created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_first_aid_topics_slug ON first_aid_topics(slug)`)

	// ── Playdates v0.13.0 ───────────────────────────────────────────
	// Visibility + per-user invites for private playdates.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`)
	// v0.13.5 — share_token unlocks private playdates for users who open a
	// WhatsApp/SMS share link. See migrations/0009_playdate_share_tokens.sql.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS share_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_playdates_share_token ON playdates(share_token)`)

	// v0.13.7 — per-venue photo management.
	// venue_admin_photos: admin-curated photos (in addition to cover). These
	// always show up on /venues/{id}/photos.
	// venue_post_photo_hides: lets an admin hide a specific user-post photo
	// from a venue's gallery without deleting the post itself — useful when
	// a post is fine on the author's feed but doesn't belong on the venue
	// page (duplicates, low quality, off-topic, etc.).
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS venue_admin_photos (
		id            TEXT PRIMARY KEY,
		venue_id      TEXT NOT NULL,
		url           TEXT NOT NULL,
		display_order INT  NOT NULL DEFAULT 0,
		created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_venue_admin_photos_venue ON venue_admin_photos(venue_id, display_order, created_at)`)
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS venue_post_photo_hides (
		venue_id   TEXT NOT NULL,
		post_id    TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (venue_id, post_id)
	)`)
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS playdate_invites (
		id               TEXT PRIMARY KEY,
		playdate_id      TEXT NOT NULL,
		host_user_id     TEXT NOT NULL,
		invited_user_id  TEXT NOT NULL,
		status           TEXT NOT NULL DEFAULT 'pending',
		created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		responded_at     TIMESTAMPTZ
	)`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_playdate_invites_unique ON playdate_invites(playdate_id, invited_user_id)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_playdate_invites_user ON playdate_invites(invited_user_id, status)`)

	// ── Playdates v0.12.0 ───────────────────────────────────────────
	// Pet-level attendance: each pet occupies one slot. These tables are the
	// source of truth; the legacy `attendees` column becomes a derived cache
	// of distinct user ids with seats in the pet-attendance table.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS playdate_pet_attendees (
		playdate_id TEXT NOT NULL,
		pet_id      TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (playdate_id, pet_id)
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_playdate_pet_attendees_user ON playdate_pet_attendees(playdate_id, user_id)`)
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS playdate_pet_waitlist (
		playdate_id TEXT NOT NULL,
		pet_id      TEXT NOT NULL,
		user_id     TEXT NOT NULL,
		joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (playdate_id, pet_id)
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_playdate_pet_waitlist_order ON playdate_pet_waitlist(playdate_id, joined_at)`)

	// Backfill pet-level rows from existing attendee arrays. For each user in
	// `attendees`, we pick their first visible pet as the "joined" pet. If they
	// have no pets we insert a legacy sentinel so the slot count stays correct.
	legacyBackfill, _ := pool.Query(ctx,
		`SELECT p.id, p.attendees FROM playdates p
		 WHERE array_length(p.attendees, 1) IS NOT NULL
		   AND NOT EXISTS (
		     SELECT 1 FROM playdate_pet_attendees ppa WHERE ppa.playdate_id = p.id
		   )`)
	if legacyBackfill != nil {
		type legacyRow struct {
			id        string
			attendees []string
		}
		var pending []legacyRow
		for legacyBackfill.Next() {
			var row legacyRow
			if err := legacyBackfill.Scan(&row.id, &row.attendees); err == nil {
				pending = append(pending, row)
			}
		}
		legacyBackfill.Close()
		for _, row := range pending {
			for _, uid := range row.attendees {
				var petID string
				_ = pool.QueryRow(ctx,
					`SELECT id FROM pets WHERE owner_id = $1 AND is_hidden = false
					 ORDER BY created_at LIMIT 1`, uid).Scan(&petID)
				if petID == "" {
					petID = "legacy-" + uid
				}
				pool.Exec(ctx,
					`INSERT INTO playdate_pet_attendees (playdate_id, pet_id, user_id, joined_at)
					 VALUES ($1, $2, $3, NOW())
					 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
					row.id, petID, uid)
			}
		}
	}

	// Backfill conversation_id for existing playdates: create a conversation
	// seeded with the organizer + all attendees, then link it back.
	pdBackfillRows, _ := pool.Query(ctx,
		`SELECT id, organizer_id, title, attendees FROM playdates WHERE conversation_id = ''`)
	if pdBackfillRows != nil {
		type pdBf struct {
			id, organizerID, title string
			attendees              []string
		}
		var pending []pdBf
		for pdBackfillRows.Next() {
			var row pdBf
			if err := pdBackfillRows.Scan(&row.id, &row.organizerID, &row.title, &row.attendees); err == nil {
				pending = append(pending, row)
			}
		}
		pdBackfillRows.Close()
		for _, row := range pending {
			convID := newID("conversation")
			now := time.Now().UTC()
			userIDs := []string{row.organizerID}
			for _, uid := range row.attendees {
				if uid != row.organizerID {
					userIDs = append(userIDs, uid)
				}
			}
			subtitle := "Playdate chat"
			title := row.title
			if title == "" {
				title = "Playdate"
			}
			_, err := pool.Exec(ctx,
				`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				convID, "", title, subtitle, now, userIDs)
			if err == nil {
				pool.Exec(ctx, `UPDATE playdates SET conversation_id = $1 WHERE id = $2`, convID, row.id)
			}
		}
	}

	// Backfill owner_user_id from first user of each group's conversation (one-shot).
	pool.Exec(ctx, `
		UPDATE community_groups g
		SET owner_user_id = c.user_ids[1]
		FROM conversations c
		WHERE g.conversation_id = c.id
		  AND (g.owner_user_id IS NULL OR g.owner_user_id = '')
		  AND array_length(c.user_ids, 1) >= 1
	`)

	// Backfill invite codes for groups missing one. We can't do this in pure
	// SQL because we want Go-side code generation for collision safety.
	backfillRows, _ := pool.Query(ctx,
		`SELECT id FROM community_groups WHERE code IS NULL OR code = ''`)
	if backfillRows != nil {
		var pendingIDs []string
		for backfillRows.Next() {
			var id string
			if err := backfillRows.Scan(&id); err == nil {
				pendingIDs = append(pendingIDs, id)
			}
		}
		backfillRows.Close()
		for _, id := range pendingIDs {
			pool.Exec(ctx, `UPDATE community_groups SET code = $2 WHERE id = $1`, id, generateGroupCode())
		}
	}

	// ── v0.17.0: Admin panel rebuild ─────────────────────────────────
	// user_bans: ban workflow with reason, duration, audit trail.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS user_bans (
		id          TEXT PRIMARY KEY,
		user_id     TEXT NOT NULL,
		admin_id    TEXT NOT NULL,
		reason      TEXT NOT NULL,
		notes       TEXT,
		starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		ends_at     TIMESTAMPTZ,
		revoked_at  TIMESTAMPTZ,
		revoked_by  TEXT,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans (user_id, created_at DESC)`)

	// feature_flags: runtime toggles + JSON payloads for mobile.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS feature_flags (
		key         TEXT PRIMARY KEY,
		enabled     BOOLEAN NOT NULL DEFAULT FALSE,
		description TEXT,
		payload     JSONB,
		updated_by  TEXT,
		updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)

	// admin_announcements: banners shown in the mobile app.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS admin_announcements (
		id             TEXT PRIMARY KEY,
		title          TEXT NOT NULL,
		body           TEXT NOT NULL,
		severity       TEXT NOT NULL DEFAULT 'info',
		starts_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		ends_at        TIMESTAMPTZ,
		target_segment JSONB,
		created_by     TEXT,
		created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)

	// admin_users RBAC columns.
	pool.Exec(ctx, `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'superadmin'`)
	pool.Exec(ctx, `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`)
	pool.Exec(ctx, `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`)
	pool.Exec(ctx, `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`)

	// Search / pagination indexes for admin list endpoints.
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_app_users_created ON app_users (created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports (status, created_at DESC)`)

	// audit_logs: persisted admin action trail consumed by /admin/audit-logs.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS audit_logs (
		id             TEXT PRIMARY KEY,
		actor_admin_id TEXT NOT NULL,
		action         TEXT NOT NULL,
		entity_type    TEXT NOT NULL,
		entity_id      TEXT,
		payload        JSONB,
		created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_audit_logs_admin   ON audit_logs (actor_admin_id, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity  ON audit_logs (entity_type, entity_id)`)

	// badge_catalog: admin-managed badge definitions (the existing `badges`
	// table is per-user awards; the catalog lists the templates).
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS badge_catalog (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		description TEXT,
		icon_url    TEXT,
		criteria    TEXT,
		active      BOOLEAN NOT NULL DEFAULT TRUE,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)

	// user_presence: real-time online status + last known coordinates.
	// Mobile app posts a heartbeat every ~20s while the app is in the
	// foreground; when the app goes to the background/terminates the
	// client POSTs to /v1/presence/offline. The admin dashboard reads
	// `is_online=true AND last_seen_at > NOW()-60s` for the live user
	// count, and the user detail map reads `lat/lng` for live location.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS user_presence (
		user_id       TEXT PRIMARY KEY,
		is_online     BOOLEAN NOT NULL DEFAULT FALSE,
		app_state     TEXT NOT NULL DEFAULT 'foreground',
		latitude      DOUBLE PRECISION,
		longitude     DOUBLE PRECISION,
		accuracy      DOUBLE PRECISION,
		platform      TEXT,
		last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_user_presence_online ON user_presence (is_online, last_seen_at DESC)`)

	// ── Shelters v0.13 ─────────────────────────────────────────────
	// Separate account type for animal shelters. Admin-created only.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelters (
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
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelters_city ON shelters(city_label)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelters_status ON shelters(status)`)

	// Shelter-owned adoptable pets (distinct from user-owned `pets`).
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelter_pets (
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
		status TEXT NOT NULL DEFAULT 'available',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_pets_shelter ON shelter_pets(shelter_id, status)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_pets_public ON shelter_pets(status, created_at DESC) WHERE status IN ('available','reserved')`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_pets_species ON shelter_pets(species) WHERE status = 'available'`)

	// Adoption applications: user → shelter pet, gated by the shelter.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS adoption_applications (
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
		status TEXT NOT NULL DEFAULT 'pending',
		rejection_reason TEXT NOT NULL DEFAULT '',
		conversation_id TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		UNIQUE(pet_id, user_id)
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_adoption_apps_shelter ON adoption_applications(shelter_id, status, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_adoption_apps_user ON adoption_applications(user_id, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_adoption_apps_pet ON adoption_applications(pet_id, status)`)

	// Conversations bridge — shelter↔applicant chats carry their
	// originating adoption_application_id so either side can list them.
	pool.Exec(ctx, `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS adoption_application_id TEXT`)
	pool.Exec(ctx, `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shelter_id TEXT`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_conversations_app ON conversations(adoption_application_id) WHERE adoption_application_id IS NOT NULL`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_conversations_shelter ON conversations(shelter_id) WHERE shelter_id IS NOT NULL`)

	// Legacy adoption cleanup — old user-created listings replaced entirely.
	pool.Exec(ctx, `DROP TABLE IF EXISTS adoption_listings CASCADE`)

	// ── Shelter onboarding applications v0.14 ──────────────────────
	// Public wizard → admin review queue. Mirrors
	// apps/api/migrations/0005_shelter_applications.sql — kept here too
	// so a fresh deploy auto-applies without a separate psql step.
	pool.Exec(ctx, `ALTER TABLE shelters ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`)
	// Back-fill existing rows as verified from the moment they were
	// created — they were admin-vetted under the old flow.
	pool.Exec(ctx, `UPDATE shelters SET verified_at = created_at WHERE verified_at IS NULL`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelters_verified_at ON shelters(verified_at)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelter_applications (
		id TEXT PRIMARY KEY,
		status TEXT NOT NULL DEFAULT 'submitted'
			CHECK (status IN ('submitted','under_review','approved','rejected')),
		submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		reviewed_at TIMESTAMPTZ,
		reviewed_by TEXT,
		sla_deadline TIMESTAMPTZ NOT NULL,
		entity_type TEXT NOT NULL,
		country TEXT NOT NULL,
		registration_number TEXT NOT NULL,
		registration_certificate_url TEXT NOT NULL,
		org_name TEXT NOT NULL,
		org_address TEXT NOT NULL DEFAULT '',
		operating_region_country TEXT NOT NULL,
		operating_region_city TEXT NOT NULL,
		species_focus TEXT[] NOT NULL DEFAULT '{}',
		donation_url TEXT NOT NULL DEFAULT '',
		primary_contact_name TEXT NOT NULL,
		primary_contact_email CITEXT NOT NULL,
		primary_contact_phone TEXT NOT NULL DEFAULT '',
		rejection_reason_code TEXT NOT NULL DEFAULT '',
		rejection_reason_note TEXT NOT NULL DEFAULT ''
			CHECK (length(rejection_reason_note) <= 500),
		created_shelter_id TEXT REFERENCES shelters(id) ON DELETE SET NULL,
		access_token TEXT UNIQUE NOT NULL
	)`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_apps_email_active
		ON shelter_applications(lower(primary_contact_email))
		WHERE status IN ('submitted','under_review')`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_apps_status_sla
		ON shelter_applications(status, sla_deadline)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_apps_submitted
		ON shelter_applications(submitted_at DESC)`)

	// ── Shelter team accounts & audit log v0.15 ───────────────────
	// Mirrors apps/api/migrations/0006_shelter_teams.sql — same DDL
	// runs here so fresh deploys auto-apply without a psql step.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelter_members (
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
	)`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_members_email
		ON shelter_members(shelter_id, lower(email::text))`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_members_shelter
		ON shelter_members(shelter_id, status)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelter_member_invites (
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
	)`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelter_invites_active
		ON shelter_member_invites(shelter_id, lower(email::text))
		WHERE accepted_at IS NULL AND revoked_at IS NULL`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_invites_shelter
		ON shelter_member_invites(shelter_id, created_at DESC)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shelter_audit_logs (
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
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_audit_shelter
		ON shelter_audit_logs(shelter_id, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_audit_action
		ON shelter_audit_logs(shelter_id, action)`)

	// ── DSA listing moderation (v0.17) ───────────────────────────
	// 7-state listing lifecycle + notice-and-action queue + statement
	// of reasons. All idempotent — safe to re-run on every boot. See
	// apps/api/migrations/0007_listing_moderation.sql for the same
	// SQL as a standalone source of truth.
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS listing_state TEXT NOT NULL DEFAULT 'published'`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS last_rejection_code TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS last_rejection_note TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS auto_flag_reasons TEXT[] NOT NULL DEFAULT '{}'`)
	// Soft-delete (v0.20): listings hidden from all views for a 30-day
	// recovery window before the sweeper hard-deletes them. deleted_at
	// nullable = live; non-null = pending purge.
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS adopter_name TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS adoption_date TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS adoption_notes TEXT NOT NULL DEFAULT ''`)
	// View tracking (v0.22) — a single atomic counter. We don't need
	// per-event granularity for the analytics the UI renders; saves
	// us a fat `listing_views` table.
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0`)
	// Urgent flag (v0.23) — shelter-set badge for animals needing
	// quick rehoming (medical, behavioural, etc.).
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_pets_soft_delete
		ON shelter_pets(deleted_at) WHERE deleted_at IS NOT NULL`)

	// Public shelter profile (v0.21).
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS slug TEXT`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelters_slug
		ON shelters(slug) WHERE slug IS NOT NULL`)
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS adoption_process TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS donation_url TEXT NOT NULL DEFAULT ''`)
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS show_recently_adopted BOOLEAN NOT NULL DEFAULT FALSE`)
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS operating_country TEXT NOT NULL DEFAULT ''`)
	// Featured discovery rail (v0.24). Admin flips this manually via
	// the admin panel; public feed reads it to surface a rail on the
	// fetcht discovery home. Partial index so lookup is O(featured).
	pool.Exec(ctx, `ALTER TABLE shelters
		ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelters_featured
		ON shelters(is_featured) WHERE is_featured = TRUE`)
	// Boot-time backfill: generate slugs for verified shelters that
	// existed before this column landed. Naïve kebab-case from name;
	// duplicates silently fail the unique index and stay NULL for admin
	// cleanup. New approvals go through AssignShelterSlug which retries.
	pool.Exec(ctx, `UPDATE shelters
		SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(name), ''), id), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
		WHERE slug IS NULL AND verified_at IS NOT NULL`)
	// Backfill: existing rows get mapped from availability `status` to
	// the new listing_state. Only touches rows that still hold the
	// default so re-runs don't clobber subsequent moderation moves.
	pool.Exec(ctx, `UPDATE shelter_pets SET listing_state='adopted'
		WHERE status='adopted' AND listing_state='published'`)
	pool.Exec(ctx, `UPDATE shelter_pets SET listing_state='paused'
		WHERE status='hidden' AND listing_state='published'`)
	// Enforce the 7-value enum. Drop any legacy CHECK then add the
	// canonical one. The DO block lets us ignore "constraint does not
	// exist" errors cleanly.
	pool.Exec(ctx, `DO $$ BEGIN
		ALTER TABLE shelter_pets DROP CONSTRAINT IF EXISTS shelter_pets_listing_state_check;
	EXCEPTION WHEN others THEN NULL; END $$`)
	pool.Exec(ctx, `ALTER TABLE shelter_pets
		ADD CONSTRAINT shelter_pets_listing_state_check
		CHECK (listing_state IN ('draft','pending_review','published','paused','adopted','archived','rejected'))`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_shelter_pets_listing_state
		ON shelter_pets(listing_state, created_at DESC)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS listing_state_transitions (
		id TEXT PRIMARY KEY,
		listing_id TEXT NOT NULL REFERENCES shelter_pets(id) ON DELETE CASCADE,
		shelter_id TEXT NOT NULL,
		actor_id TEXT NOT NULL DEFAULT '',
		actor_name TEXT NOT NULL DEFAULT '',
		actor_role TEXT NOT NULL,
		prev_state TEXT NOT NULL,
		new_state TEXT NOT NULL,
		reason_code TEXT NOT NULL DEFAULT '',
		note TEXT NOT NULL DEFAULT '',
		metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_listing_transitions_listing
		ON listing_state_transitions(listing_id, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_listing_transitions_shelter_rejected
		ON listing_state_transitions(shelter_id, new_state, created_at DESC)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS listing_reports (
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
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_listing_reports_status
		ON listing_reports(status, trusted_flagger DESC, created_at DESC)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_listing_reports_listing
		ON listing_reports(listing_id, created_at DESC)`)

	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS listing_statements_of_reasons (
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
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_listing_sor_listing
		ON listing_statements_of_reasons(listing_id, issued_at DESC)`)

	// Back-fill owner member for any shelter that doesn't have one yet.
	// Idempotent — only touches rows with no existing members.
	pool.Exec(ctx, `INSERT INTO shelter_members (
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
	)`)

	// ── Adoption favorites (v0.11.21) ──────────────────────────────
	// Separate from the social-match `favorites` table because targets
	// are shelter_pets (adoptable listings), not owner pets. Trying to
	// reuse the `favorites` table caused AddFavorite to reject shelter
	// pet IDs (FK-less existence check against `pets` only), which in
	// turn made the adopter UI optimistic-like flash then revert.
	pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS adoption_favorites (
		user_id        TEXT NOT NULL,
		shelter_pet_id TEXT NOT NULL,
		created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		PRIMARY KEY (user_id, shelter_pet_id)
	)`)
	pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_adoption_favorites_user ON adoption_favorites(user_id)`)

	// ── Match pair uniqueness (v0.13.4) ────────────────────────────
	// Before this, CreateSwipe could insert a second `matches` row on
	// every re-like of an already-matched pair (the unique constraint
	// sits on `swipes` but the mutual-like branch still ran). We add
	// both a code-level dedup AND canonical unique indexes as a safety
	// net against future races.
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair_unique
	 ON matches (LEAST(pet_a_id, pet_b_id), GREATEST(pet_a_id, pet_b_id))`)
	pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_match_pet_pairs_unique
	 ON match_pet_pairs (conversation_id, my_pet_id, matched_pet_id)`)

	return &PostgresStore{pool: pool}, nil
}

// Pool exposes the underlying connection pool so server-level admin handlers
// can run ad-hoc read queries without inflating the Store interface.
func (s *PostgresStore) Pool() *pgxpool.Pool { return s.pool }

// Close shuts down the connection pool.
func (s *PostgresStore) Close() error {
	s.pool.Close()
	return nil
}

// ctx returns a background context with a 30-second timeout for queries.
func (s *PostgresStore) ctx() context.Context {
	ctx, _ := context.WithTimeout(context.Background(), 30*time.Second)
	return ctx
}

// ============================================================
// AUTH & USERS
// ============================================================

func (s *PostgresStore) Register(email string, password string) (*domain.AppUser, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	id := newID("user")
	now := time.Now().UTC()

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return nil, "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO app_users (id, email, password_hash, verified, status, created_at)
		 VALUES ($1, $2, $3, TRUE, 'active', $4)`,
		id, email, passwordHash, now)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, "", fmt.Errorf("email already in use")
		}
		return nil, "", fmt.Errorf("insert app_users: %w", err)
	}

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO user_profiles (user_id, created_at)
		 VALUES ($1, $2)`,
		id, now)
	if err != nil {
		return nil, "", fmt.Errorf("insert user_profiles: %w", err)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return nil, "", fmt.Errorf("commit: %w", err)
	}

	user := &domain.AppUser{
		ID:           id,
		Email:        email,
		PasswordHash: passwordHash,
		Verified:     true,
		Status:       "active",
		Profile: domain.UserProfile{
			ID:        id,
			Email:     email,
			Status:    "active",
			CreatedAt: now.Format(time.RFC3339),
		},
	}

	return user, "", nil
}

func (s *PostgresStore) Login(email string, password string) (*domain.AppUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user domain.AppUser
	var createdAt time.Time
	var avatarURL, bio *string
	var isVisibleOnMap bool

	err := s.pool.QueryRow(s.ctx(),
		`SELECT u.id, u.email, u.password_hash, u.verified, u.status,
		        p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, p.created_at
		 FROM app_users u
		 JOIN user_profiles p ON p.user_id = u.id
		 WHERE u.email = $1`, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Verified, &user.Status,
		&user.Profile.FirstName, &user.Profile.LastName, &user.Profile.BirthDate,
		&user.Profile.Gender, &user.Profile.CityID, &user.Profile.CityLabel,
		&avatarURL, &bio, &isVisibleOnMap, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if !auth.VerifyPassword(password, user.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}
	if !user.Verified {
		return nil, fmt.Errorf("email not verified")
	}
	if user.Status == "suspended" {
		return nil, fmt.Errorf("account suspended")
	}

	user.Profile.ID = user.ID
	user.Profile.Email = user.Email
	user.Profile.AvatarURL = avatarURL
	user.Profile.Bio = bio
	user.Profile.IsVisibleOnMap = isVisibleOnMap
	user.Profile.Status = user.Status
	user.Profile.CreatedAt = createdAt.Format(time.RFC3339)

	return &user, nil
}

func (s *PostgresStore) ResetPassword(_ string, _ string) error {
	return nil
}

func (s *PostgresStore) GetUser(userID string) (*domain.AppUser, error) {
	var user domain.AppUser
	var createdAt time.Time
	var avatarURL, bio *string
	var isVisibleOnMap bool

	err := s.pool.QueryRow(s.ctx(),
		`SELECT u.id, u.email, u.password_hash, u.verified, u.status,
		        p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, p.created_at
		 FROM app_users u
		 JOIN user_profiles p ON p.user_id = u.id
		 WHERE u.id = $1`, userID).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Verified, &user.Status,
		&user.Profile.FirstName, &user.Profile.LastName, &user.Profile.BirthDate,
		&user.Profile.Gender, &user.Profile.CityID, &user.Profile.CityLabel,
		&avatarURL, &bio, &isVisibleOnMap, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	user.Profile.ID = user.ID
	user.Profile.Email = user.Email
	user.Profile.AvatarURL = avatarURL
	user.Profile.Bio = bio
	user.Profile.IsVisibleOnMap = isVisibleOnMap
	user.Profile.Status = user.Status
	user.Profile.CreatedAt = createdAt.Format(time.RFC3339)

	return &user, nil
}

func (s *PostgresStore) UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error) {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE user_profiles
		 SET first_name = $2, last_name = $3, birth_date = $4, gender = $5,
		     city_id = $6, city_label = $7, avatar_url = $8, bio = $9,
		     is_visible_on_map = COALESCE($10, is_visible_on_map)
		 WHERE user_id = $1`,
		userID, input.FirstName, input.LastName, input.BirthDate, input.Gender,
		input.CityID, input.CityLabel, input.AvatarURL, input.Bio, input.IsVisibleOnMap)
	if err != nil {
		return domain.UserProfile{}, fmt.Errorf("update profile: %w", err)
	}

	user, err := s.GetUser(userID)
	if err != nil {
		return domain.UserProfile{}, err
	}
	return user.Profile, nil
}

func (s *PostgresStore) AdminLogin(email string, password string) (*domain.AdminUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var admin domain.AdminUser
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, email, name, password_hash FROM admin_users WHERE email = $1`, email).
		Scan(&admin.ID, &admin.Email, &admin.Name, &admin.PasswordHash)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if !auth.VerifyPassword(password, admin.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}

	return &admin, nil
}

func (s *PostgresStore) ListUsers() []domain.UserProfile {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.user_id, u.email, p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio, p.is_visible_on_map,
		        u.status, p.created_at
		 FROM user_profiles p
		 JOIN app_users u ON u.id = p.user_id
		 ORDER BY p.created_at DESC`)
	if err != nil {
		return []domain.UserProfile{}
	}
	defer rows.Close()

	profiles := make([]domain.UserProfile, 0)
	for rows.Next() {
		var p domain.UserProfile
		var createdAt time.Time
		if err := rows.Scan(
			&p.ID, &p.Email, &p.FirstName, &p.LastName, &p.BirthDate, &p.Gender,
			&p.CityID, &p.CityLabel, &p.AvatarURL, &p.Bio, &p.IsVisibleOnMap,
			&p.Status, &createdAt,
		); err != nil {
			continue
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		profiles = append(profiles, p)
	}
	return profiles
}

func (s *PostgresStore) UserDetail(userID string) (domain.AdminUserDetail, error) {
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.AdminUserDetail{}, err
	}

	pets := s.ListPets(userID)
	matches := s.ListMatches(userID)
	conversations := s.ListConversations(userID)
	posts := s.userPosts(userID)

	totalLikes := 0
	for _, post := range posts {
		totalLikes += post.LikeCount
	}

	return domain.AdminUserDetail{
		User:               user.Profile,
		Pets:               pets,
		Matches:            matches,
		Conversations:      conversations,
		Posts:              posts,
		TotalLikesReceived: totalLikes,
	}, nil
}

// userPosts returns all posts authored by the given user.
func (s *PostgresStore) userPosts(userID string) []domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.author_user_id = $1
		 ORDER BY po.created_at DESC`, userID)
	if err != nil {
		return []domain.HomePost{}
	}
	defer rows.Close()

	return s.scanPosts(rows, userID)
}

func (s *PostgresStore) SuspendUser(userID string, status string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE app_users SET status = $2 WHERE id = $1`, userID, status)
	if err != nil {
		return fmt.Errorf("suspend user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *PostgresStore) DeleteUser(userID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM app_users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *PostgresStore) BlockUser(userID string, targetUserID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, userID, targetUserID)
	if err != nil {
		return fmt.Errorf("block user: %w", err)
	}

	// Also mark matches between these users as blocked
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE matches SET status = 'blocked'
		 WHERE id IN (
		   SELECT m.id FROM matches m
		   JOIN pets pa ON pa.id = m.pet_a_id
		   JOIN pets pb ON pb.id = m.pet_b_id
		   WHERE (pa.owner_id = $1 AND pb.owner_id = $2)
		      OR (pa.owner_id = $2 AND pb.owner_id = $1)
		 )`, userID, targetUserID)

	return nil
}

func (s *PostgresStore) Dashboard() domain.DashboardSnapshot {
	now := time.Now().UTC()
	currentWeekStart := startOfDay(now.AddDate(0, 0, -6))
	previousWeekStart := currentWeekStart.AddDate(0, 0, -7)
	previousWeekEnd := currentWeekStart

	totalUsers := s.countRows("app_users", "")
	totalPets := s.countRowsWhere("pets", "is_hidden = false")
	totalMatches := s.countRows("matches", "")
	openReports := s.countRowsWhere("reports", "status != 'resolved'")
	totalPosts := s.countRows("posts", "")
	totalVenues := s.countRows("venues", "")
	totalEvents := s.countRows("events", "")

	usersThisWeek := s.countRowsBetween("app_users", "created_at", currentWeekStart, now.Add(24*time.Hour))
	usersLastWeek := s.countRowsBetween("app_users", "created_at", previousWeekStart, previousWeekEnd)
	petsThisWeek := s.countRowsBetween("pets", "created_at", currentWeekStart, now.Add(24*time.Hour))
	petsLastWeek := s.countRowsBetween("pets", "created_at", previousWeekStart, previousWeekEnd)
	matchesThisWeek := s.countRowsBetween("matches", "created_at", currentWeekStart, now.Add(24*time.Hour))
	matchesLastWeek := s.countRowsBetween("matches", "created_at", previousWeekStart, previousWeekEnd)
	reportsThisWeek := s.countRowsBetweenWhere("reports", "created_at", currentWeekStart, now.Add(24*time.Hour), "status IN ('open','in_review')")
	reportsLastWeek := s.countRowsBetweenWhere("reports", "created_at", previousWeekStart, previousWeekEnd, "status IN ('open','in_review')")
	postsThisWeek := s.countRowsBetween("posts", "created_at", currentWeekStart, now.Add(24*time.Hour))
	postsLastWeek := s.countRowsBetween("posts", "created_at", previousWeekStart, previousWeekEnd)
	eventsThisWeek := s.countRowsBetween("events", "created_at", currentWeekStart, now.Add(24*time.Hour))
	eventsLastWeek := s.countRowsBetween("events", "created_at", previousWeekStart, previousWeekEnd)

	metrics := []domain.DashboardMetric{
		{ID: "users", Label: "Total users", Value: fmt.Sprintf("%d", totalUsers), Delta: formatDelta(usersThisWeek, usersLastWeek)},
		{ID: "pets", Label: "Active pets", Value: fmt.Sprintf("%d", totalPets), Delta: formatDelta(petsThisWeek, petsLastWeek)},
		{ID: "matches", Label: "Weekly matches", Value: fmt.Sprintf("%d", totalMatches), Delta: formatDelta(matchesThisWeek, matchesLastWeek)},
		{ID: "reports", Label: "Open reports", Value: fmt.Sprintf("%d", openReports), Delta: formatDelta(reportsThisWeek, reportsLastWeek)},
		{ID: "posts", Label: "Community posts", Value: fmt.Sprintf("%d", totalPosts), Delta: formatDelta(postsThisWeek, postsLastWeek)},
		{ID: "venues", Label: "Pet-friendly spots", Value: fmt.Sprintf("%d", totalVenues), Delta: "admin curated"},
		{ID: "events", Label: "Upcoming events", Value: fmt.Sprintf("%d", totalEvents), Delta: formatDelta(eventsThisWeek, eventsLastWeek)},
	}

	growth := make([]domain.DashboardPoint, 0, 7)
	for offset := 6; offset >= 0; offset-- {
		dayStart := startOfDay(now.AddDate(0, 0, -offset))
		dayEnd := dayStart.Add(24 * time.Hour)
		growth = append(growth, domain.DashboardPoint{
			Label:   dayStart.Format("Mon"),
			Users:   s.countRowsBetween("app_users", "created_at", dayStart, dayEnd),
			Pets:    s.countRowsBetween("pets", "created_at", dayStart, dayEnd),
			Matches: s.countRowsBetween("matches", "created_at", dayStart, dayEnd),
		})
	}

	// Recent reports
	recentReports := make([]domain.ReportSummary, 0)
	rRows, err := s.pool.Query(s.ctx(),
		`SELECT id, reporter_id, reporter_name, reason, target_type, target_id, target_label,
		        status, COALESCE(notes,''), resolved_at, created_at
		 FROM reports ORDER BY created_at DESC LIMIT 8`)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			r := s.scanReportRow(rRows)
			recentReports = append(recentReports, r)
		}
	}

	// Top posts
	topPosts := s.ListHomeFeed("")
	sort.Slice(topPosts, func(i, j int) bool {
		if topPosts[i].LikeCount == topPosts[j].LikeCount {
			return topPosts[i].CreatedAt > topPosts[j].CreatedAt
		}
		return topPosts[i].LikeCount > topPosts[j].LikeCount
	})
	if len(topPosts) > 5 {
		topPosts = topPosts[:5]
	}

	return domain.DashboardSnapshot{
		Metrics:       metrics,
		Growth:        growth,
		RecentReports: recentReports,
		TopPosts:      topPosts,
	}
}

// ============================================================
// PETS
// ============================================================

func (s *PostgresStore) ListPets(userID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE owner_id = $1
		 ORDER BY created_at`, userID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

func (s *PostgresStore) UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error) {
	if len(input.Photos) < 1 || len(input.Photos) > 6 {
		return domain.Pet{}, fmt.Errorf("pet must have between 1 and 6 photos")
	}

	isNew := petID == ""
	if isNew {
		petID = newID("pet")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return domain.Pet{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	if isNew {
		_, err = tx.Exec(s.ctx(),
			`INSERT INTO pets (id, owner_id, name, age_years, gender, birth_date,
			     species_id, species_label, breed_id, breed_label,
			     activity_level, hobbies, good_with, characters,
			     is_neutered, bio, city_label, theme_color)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
			petID, userID, input.Name, input.AgeYears, input.Gender, input.BirthDate,
			input.SpeciesID, input.SpeciesLabel, input.BreedID, input.BreedLabel,
			input.ActivityLevel, input.Hobbies, input.GoodWith, input.Characters,
			input.IsNeutered, input.Bio, input.CityLabel, input.ThemeColor)
	} else {
		_, err = tx.Exec(s.ctx(),
			`UPDATE pets SET name=$2, age_years=$3, gender=$4, birth_date=$5,
			     species_id=$6, species_label=$7, breed_id=$8, breed_label=$9,
			     activity_level=$10, hobbies=$11, good_with=$12, characters=$13,
			     is_neutered=$14, bio=$15, city_label=$16, theme_color=$17
			 WHERE id=$1 AND owner_id=$18`,
			petID, input.Name, input.AgeYears, input.Gender, input.BirthDate,
			input.SpeciesID, input.SpeciesLabel, input.BreedID, input.BreedLabel,
			input.ActivityLevel, input.Hobbies, input.GoodWith, input.Characters,
			input.IsNeutered, input.Bio, input.CityLabel, input.ThemeColor, userID)
	}
	if err != nil {
		return domain.Pet{}, fmt.Errorf("upsert pet: %w", err)
	}

	// Replace photos
	_, _ = tx.Exec(s.ctx(), `DELETE FROM pet_photos WHERE pet_id = $1`, petID)
	for i, photo := range input.Photos {
		photoID := photo.ID
		if photoID == "" {
			photoID = newID("photo")
		}
		_, err = tx.Exec(s.ctx(),
			`INSERT INTO pet_photos (id, pet_id, url, is_primary, display_order)
			 VALUES ($1, $2, $3, $4, $5)`,
			photoID, petID, photo.URL, photo.IsPrimary, i)
		if err != nil {
			return domain.Pet{}, fmt.Errorf("insert photo: %w", err)
		}
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return domain.Pet{}, fmt.Errorf("commit: %w", err)
	}

	pet := domain.Pet{
		ID:            petID,
		OwnerID:       userID,
		Name:          input.Name,
		AgeYears:      input.AgeYears,
		Gender:        input.Gender,
		BirthDate:     input.BirthDate,
		SpeciesID:     input.SpeciesID,
		SpeciesLabel:  input.SpeciesLabel,
		BreedID:       input.BreedID,
		BreedLabel:    input.BreedLabel,
		ActivityLevel: input.ActivityLevel,
		Hobbies:       input.Hobbies,
		GoodWith:      input.GoodWith,
		Characters:    input.Characters,
		IsNeutered:    input.IsNeutered,
		Bio:           input.Bio,
		Photos:        input.Photos,
		CityLabel:     input.CityLabel,
		ThemeColor:    input.ThemeColor,
	}
	// Make sure photo IDs are set
	for i := range pet.Photos {
		if pet.Photos[i].ID == "" {
			pet.Photos[i].ID = newID("photo")
		}
	}
	return pet, nil
}

func (s *PostgresStore) ListAllPets() []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets ORDER BY created_at DESC`)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

// GetPet returns a single pet by ID, including photos. Used by the chat
// pet-share card tap → detail modal flow.
func (s *PostgresStore) GetPet(petID string) (*domain.Pet, error) {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE id = $1`, petID)
	if err != nil {
		return nil, fmt.Errorf("pet not found")
	}
	defer rows.Close()
	pets := s.scanPetRows(rows)
	if len(pets) == 0 {
		return nil, fmt.Errorf("pet not found")
	}
	s.attachPhotos(pets)
	pet := pets[0]
	return &pet, nil
}

func (s *PostgresStore) PetDetail(petID string) (domain.AdminPetDetail, error) {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE id = $1`, petID)
	if err != nil {
		return domain.AdminPetDetail{}, fmt.Errorf("pet not found")
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	if len(pets) == 0 {
		return domain.AdminPetDetail{}, fmt.Errorf("pet not found")
	}
	s.attachPhotos(pets)
	pet := pets[0]

	owner, err := s.GetUser(pet.OwnerID)
	if err != nil {
		return domain.AdminPetDetail{}, fmt.Errorf("owner not found")
	}

	// Matches for this pet
	matches := s.matchesForPet(petID)

	return domain.AdminPetDetail{
		Pet:     pet,
		Owner:   owner.Profile,
		Matches: matches,
	}, nil
}

func (s *PostgresStore) SetPetVisibility(petID string, hidden bool) error {
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE pets SET is_hidden = $2 WHERE id = $1`, petID, hidden)
	if err != nil {
		return fmt.Errorf("set pet visibility: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("pet not found")
	}
	return nil
}

func (s *PostgresStore) ListTaxonomy(kind string, lang string) []domain.TaxonomyItem {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, label, slug, species_id, is_active, COALESCE(icon,''), COALESCE(color,''), COALESCE(translations, '{}')
		 FROM taxonomies WHERE kind = $1 ORDER BY label`, kind)
	if err != nil {
		return []domain.TaxonomyItem{}
	}
	defer rows.Close()

	items := make([]domain.TaxonomyItem, 0)
	for rows.Next() {
		var item domain.TaxonomyItem
		var translationsJSON []byte
		if err := rows.Scan(&item.ID, &item.Label, &item.Slug, &item.SpeciesID,
			&item.IsActive, &item.Icon, &item.Color, &translationsJSON); err != nil {
			continue
		}
		_ = json.Unmarshal(translationsJSON, &item.Translations)
		// Apply translation if requested
		if lang != "" && lang != "en" {
			if translated, ok := item.Translations[lang]; ok && translated != "" {
				item.Label = translated
			}
		}
		items = append(items, item)
	}
	return items
}

func (s *PostgresStore) UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem {
	if item.ID == "" {
		item.ID = newID(kind)
	}
	if item.Translations == nil {
		item.Translations = map[string]string{}
	}
	translationsJSON, _ := json.Marshal(item.Translations)

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO taxonomies (id, kind, label, slug, species_id, icon, color, is_active, translations)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (id) DO UPDATE SET
		   label = EXCLUDED.label, slug = EXCLUDED.slug, species_id = EXCLUDED.species_id,
		   icon = EXCLUDED.icon, color = EXCLUDED.color, is_active = EXCLUDED.is_active,
		   translations = EXCLUDED.translations`,
		item.ID, kind, item.Label, item.Slug, item.SpeciesID, item.Icon, item.Color, item.IsActive, translationsJSON)
	if err != nil {
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE taxonomies SET label=$3, species_id=$4, icon=$5, color=$6, is_active=$7, translations=$8
			 WHERE id=$1 AND kind=$2`,
			item.ID, kind, item.Label, item.SpeciesID, item.Icon, item.Color, item.IsActive, translationsJSON)
	}
	return item
}

func (s *PostgresStore) DeleteTaxonomy(kind string, itemID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM taxonomies WHERE id = $1 AND kind = $2`, itemID, kind)
	if err != nil {
		return fmt.Errorf("delete taxonomy: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("taxonomy item not found")
	}
	// If deleting a species, also delete its breeds
	if kind == "species" {
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM taxonomies WHERE kind = 'breeds' AND species_id = $1`, itemID)
	}
	return nil
}

func (s *PostgresStore) AddFavorite(userID string, petID string) error {
	// Verify pet exists
	var exists bool
	_ = s.pool.QueryRow(s.ctx(), `SELECT EXISTS(SELECT 1 FROM pets WHERE id = $1)`, petID).Scan(&exists)
	if !exists {
		return fmt.Errorf("pet not found")
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO favorites (user_id, pet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, petID)
	if err != nil {
		return fmt.Errorf("add favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) RemoveFavorite(userID string, petID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM favorites WHERE user_id = $1 AND pet_id = $2`, userID, petID)
	if err != nil {
		return fmt.Errorf("remove favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListFavorites(userID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
		        p.species_id, p.species_label, p.breed_id, p.breed_label,
		        p.activity_level, p.hobbies, p.good_with, p.characters,
		        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color
		 FROM pets p
		 JOIN favorites f ON f.pet_id = p.id
		 WHERE f.user_id = $1
		 ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

// ── Adoption favorites ──────────────────────────────────────────────

func (s *PostgresStore) AddAdoptionFavorite(userID string, shelterPetID string) error {
	var exists bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(SELECT 1 FROM shelter_pets WHERE id = $1 AND deleted_at IS NULL)`,
		shelterPetID).Scan(&exists)
	if !exists {
		return fmt.Errorf("shelter pet not found")
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO adoption_favorites (user_id, shelter_pet_id)
		 VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, shelterPetID)
	if err != nil {
		return fmt.Errorf("add adoption favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) RemoveAdoptionFavorite(userID string, shelterPetID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM adoption_favorites WHERE user_id = $1 AND shelter_pet_id = $2`,
		userID, shelterPetID)
	if err != nil {
		return fmt.Errorf("remove adoption favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListAdoptionFavorites(userID string) []domain.ShelterPet {
	// Subquery (not JOIN) to avoid ambiguous `created_at` between
	// shelter_pets and adoption_favorites — scanShelterPet expects the
	// shelter_pets column order from shelterPetCols unaliased.
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterPetCols+` FROM shelter_pets
		 WHERE id = ANY(SELECT shelter_pet_id FROM adoption_favorites WHERE user_id = $1)
		   AND deleted_at IS NULL
		 ORDER BY (
		   SELECT created_at FROM adoption_favorites af
		   WHERE af.user_id = $1 AND af.shelter_pet_id = shelter_pets.id
		 ) DESC NULLS LAST`, userID)
	if err != nil {
		log.Printf("[adoption-favorites] list query failed: %v", err)
		return []domain.ShelterPet{}
	}
	defer rows.Close()
	out := []domain.ShelterPet{}
	for rows.Next() {
		p, err := scanShelterPet(rows)
		if err != nil {
			continue
		}
		out = append(out, p)
	}
	return out
}

// ============================================================
// MATCHING
// ============================================================

func (s *PostgresStore) DiscoveryFeed(userID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, "")
}

func (s *PostgresStore) DiscoveryFeedForPet(userID string, actorPetID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, actorPetID)
}

func (s *PostgresStore) discoveryFeed(userID string, actorPetID string) []domain.DiscoveryCard {
	// Get all pet IDs owned by the user (for actor pet swipe exclusion)
	userPetIDs := s.getUserPetIDs(userID)
	if len(userPetIDs) == 0 {
		userPetIDs = []string{"__none__"}
	}

	var rows pgx.Rows
	var err error

	if actorPetID != "" {
		rows, err = s.pool.Query(s.ctx(),
			`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
			        p.species_id, p.species_label, p.breed_id, p.breed_label,
			        p.activity_level, p.hobbies, p.good_with, p.characters,
			        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color,
			        up.first_name, up.gender
			 FROM pets p
			 JOIN user_profiles up ON p.owner_id = up.user_id
			 WHERE p.owner_id != $1 AND p.is_hidden = false
			   AND p.species_id = (SELECT species_id FROM pets WHERE id = $2)
			   AND p.id NOT IN (SELECT target_pet_id FROM swipes WHERE actor_pet_id = $2)
			 ORDER BY random() LIMIT 20`, userID, actorPetID)
	} else {
		rows, err = s.pool.Query(s.ctx(),
			`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
			        p.species_id, p.species_label, p.breed_id, p.breed_label,
			        p.activity_level, p.hobbies, p.good_with, p.characters,
			        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color,
			        up.first_name, up.gender
			 FROM pets p
			 JOIN user_profiles up ON p.owner_id = up.user_id
			 WHERE p.owner_id != $1 AND p.is_hidden = false
			   AND p.species_id IN (SELECT species_id FROM pets WHERE owner_id = $1 AND is_hidden = false)
			   AND p.id NOT IN (SELECT target_pet_id FROM swipes WHERE actor_pet_id = ANY($2))
			 ORDER BY random() LIMIT 20`, userID, userPetIDs)
	}
	if err != nil {
		return []domain.DiscoveryCard{}
	}
	defer rows.Close()

	cards := make([]domain.DiscoveryCard, 0)
	petIDs := make([]string, 0)
	for rows.Next() {
		var pet domain.Pet
		var ownerFirstName, ownerGender string
		var themeColor *string
		if err := rows.Scan(
			&pet.ID, &pet.OwnerID, &pet.Name, &pet.AgeYears, &pet.Gender, &pet.BirthDate,
			&pet.SpeciesID, &pet.SpeciesLabel, &pet.BreedID, &pet.BreedLabel,
			&pet.ActivityLevel, &pet.Hobbies, &pet.GoodWith, &pet.Characters,
			&pet.IsNeutered, &pet.Bio, &pet.CityLabel, &pet.IsHidden, &themeColor,
			&ownerFirstName, &ownerGender,
		); err != nil {
			continue
		}
		if themeColor != nil {
			pet.ThemeColor = *themeColor
		}
		if pet.Hobbies == nil {
			pet.Hobbies = []string{}
		}
		if pet.GoodWith == nil {
			pet.GoodWith = []string{}
		}
		if pet.Characters == nil {
			pet.Characters = []string{}
		}

		petIDs = append(petIDs, pet.ID)
		cards = append(cards, domain.DiscoveryCard{
			Pet:           pet,
			Owner:         domain.OwnerBrief{FirstName: ownerFirstName, Gender: ownerGender},
			DistanceLabel: "Nearby",
			Prompt:        fmt.Sprintf("%s is open to friendly pets with balanced energy.", pet.Name),
		})
	}

	// Attach photos in batch
	if len(petIDs) > 0 {
		photoMap := s.fetchPhotosForPets(petIDs)
		for i := range cards {
			if photos, ok := photoMap[cards[i].Pet.ID]; ok {
				cards[i].Pet.Photos = photos
			} else {
				cards[i].Pet.Photos = []domain.PetPhoto{}
			}
		}
	}

	return cards
}

func (s *PostgresStore) GetConversationUserIDs(conversationID string) []string {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT unnest(user_ids) FROM conversations WHERE id = $1`, conversationID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	return ids
}

func (s *PostgresStore) GetPetOwnerID(petID string) string {
	var ownerID string
	_ = s.pool.QueryRow(s.ctx(), `SELECT owner_id FROM pets WHERE id = $1`, petID).Scan(&ownerID)
	return ownerID
}

func (s *PostgresStore) CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error) {
	// Validate actor pet belongs to user
	var actorOwnerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT owner_id FROM pets WHERE id = $1`, actorPetID).Scan(&actorOwnerID)
	if err != nil || actorOwnerID != userID {
		return nil, fmt.Errorf("invalid actor pet")
	}

	// Validate target pet exists
	var targetOwnerID string
	err = s.pool.QueryRow(s.ctx(),
		`SELECT owner_id FROM pets WHERE id = $1`, targetPetID).Scan(&targetOwnerID)
	if err != nil {
		return nil, fmt.Errorf("target pet not found")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	// Insert swipe
	swipeID := newID("swipe")
	_, err = tx.Exec(s.ctx(),
		`INSERT INTO swipes (id, actor_pet_id, target_pet_id, direction)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (actor_pet_id, target_pet_id) DO UPDATE SET direction = $4`,
		swipeID, actorPetID, targetPetID, direction)
	if err != nil {
		return nil, fmt.Errorf("insert swipe: %w", err)
	}

	// Check for mutual like: does the target pet have a like on the actor pet?
	var reverseDirection string
	err = tx.QueryRow(s.ctx(),
		`SELECT direction FROM swipes WHERE actor_pet_id = $1 AND target_pet_id = $2`,
		targetPetID, actorPetID).Scan(&reverseDirection)
	if err != nil || !service.IsMutualLike(reverseDirection, direction) {
		if commitErr := tx.Commit(s.ctx()); commitErr != nil {
			return nil, fmt.Errorf("commit: %w", commitErr)
		}
		return nil, nil
	}

	// Idempotency guard: if a match between this pair (either
	// direction) already exists, do NOT create a new one. Without this
	// check, the INSERT-ON-CONFLICT above keeps the swipe row unique
	// but the mutual-like branch still ran on every re-swipe, producing
	// multiple match rows + match_pet_pairs entries for the same pair.
	// Observed in prod: some pairs had 3 match rows.
	var existingMatchID string
	_ = tx.QueryRow(s.ctx(),
		`SELECT id FROM matches
		 WHERE (pet_a_id = $1 AND pet_b_id = $2)
		    OR (pet_a_id = $2 AND pet_b_id = $1)
		 LIMIT 1`,
		actorPetID, targetPetID).Scan(&existingMatchID)
	if existingMatchID != "" {
		if commitErr := tx.Commit(s.ctx()); commitErr != nil {
			return nil, fmt.Errorf("commit: %w", commitErr)
		}
		return nil, nil
	}

	// Mutual like! Create match
	matchID := newID("match")
	now := time.Now().UTC()

	// Get pet details for the match
	actorPet := s.getPetByID(actorPetID)
	targetPet := s.getPetByID(targetPetID)
	if actorPet == nil || targetPet == nil {
		if commitErr := tx.Commit(s.ctx()); commitErr != nil {
			return nil, fmt.Errorf("commit: %w", commitErr)
		}
		return nil, nil
	}

	// Get matched owner name
	matchedOwnerName := ""
	var matchedOwnerAvatar *string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name, avatar_url FROM user_profiles WHERE user_id = $1`,
		targetOwnerID).Scan(&matchedOwnerName, &matchedOwnerAvatar)

	matchedAvatarStr := ""
	if matchedOwnerAvatar != nil {
		matchedAvatarStr = *matchedOwnerAvatar
	}

	// Check for existing conversation between these users
	existingConvID := s.findConvIDByUsers(targetOwnerID, actorOwnerID)

	var conversationID string
	if existingConvID != "" {
		conversationID = existingConvID
		// Add the pet pair to existing conversation
		actorPhotoURL := ""
		if len(actorPet.Photos) > 0 {
			actorPhotoURL = actorPet.Photos[0].URL
		}
		targetPhotoURL := ""
		if len(targetPet.Photos) > 0 {
			targetPhotoURL = targetPet.Photos[0].URL
		}
		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO match_pet_pairs (conversation_id, my_pet_id, my_pet_name, my_pet_photo_url,
			     matched_pet_id, matched_pet_name, matched_pet_photo_url)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)
			 ON CONFLICT (conversation_id, my_pet_id, matched_pet_id) DO NOTHING`,
			conversationID, actorPet.ID, actorPet.Name, actorPhotoURL,
			targetPet.ID, targetPet.Name, targetPhotoURL)
		// Update conversation title with all pet names
		_, _ = tx.Exec(s.ctx(),
			`UPDATE conversations SET match_id = $2 WHERE id = $1`, conversationID, matchID)
	} else {
		conversationID = newID("conversation")
		actorPhotoURL := ""
		if len(actorPet.Photos) > 0 {
			actorPhotoURL = actorPet.Photos[0].URL
		}
		targetPhotoURL := ""
		if len(targetPet.Photos) > 0 {
			targetPhotoURL = targetPet.Photos[0].URL
		}

		title := fmt.Sprintf("%s, %s", actorPet.Name, targetPet.Name)
		subtitle := fmt.Sprintf("Chat with %s", matchedOwnerName)

		_, err = tx.Exec(s.ctx(),
			`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			conversationID, matchID, title, subtitle, now, []string{actorOwnerID, targetOwnerID})
		if err != nil {
			return nil, fmt.Errorf("insert conversation: %w", err)
		}

		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO match_pet_pairs (conversation_id, my_pet_id, my_pet_name, my_pet_photo_url,
			     matched_pet_id, matched_pet_name, matched_pet_photo_url)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)
			 ON CONFLICT (conversation_id, my_pet_id, matched_pet_id) DO NOTHING`,
			conversationID, actorPet.ID, actorPet.Name, actorPhotoURL,
			targetPet.ID, targetPet.Name, targetPhotoURL)
	}

	// Insert match
	_, err = tx.Exec(s.ctx(),
		`INSERT INTO matches (id, pet_a_id, pet_b_id, matched_owner_name, matched_owner_avatar_url,
		     last_message_preview, status, conversation_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		matchID, actorPetID, targetPetID, matchedOwnerName, matchedAvatarStr,
		"It's a match. Say hello!", "active", conversationID, now)
	if err != nil {
		return nil, fmt.Errorf("insert match: %w", err)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	match := &domain.MatchPreview{
		ID:                    matchID,
		Pet:                   *actorPet,
		MatchedPet:            *targetPet,
		MatchedOwnerName:      matchedOwnerName,
		MatchedOwnerAvatarURL: matchedAvatarStr,
		LastMessagePreview:    "It's a match. Say hello!",
		UnreadCount:           0,
		CreatedAt:             now.Format(time.RFC3339),
		Status:                "active",
		ConversationID:        conversationID,
	}
	return match, nil
}

func (s *PostgresStore) ListMatches(userID string) []domain.MatchPreview {
	userPetIDs := s.getUserPetIDs(userID)
	if len(userPetIDs) == 0 {
		return []domain.MatchPreview{}
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT m.id, m.pet_a_id, m.pet_b_id, m.matched_owner_name,
		        COALESCE(m.matched_owner_avatar_url,''), m.last_message_preview,
		        m.unread_count, m.status, m.conversation_id, m.created_at
		 FROM matches m
		 WHERE m.pet_a_id = ANY($1) OR m.pet_b_id = ANY($1)
		 ORDER BY m.created_at DESC`, userPetIDs)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)

		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}

		// Swap so that Pet = current user's pet, MatchedPet = other user's pet.
		// v0.11.8 — always refresh the owner info from user_profiles so stale
		// match rows (created before the avatar field existed) get a live value.
		if containsStr(userPetIDs, petAID) {
			m.Pet = *petA
			m.MatchedPet = *petB
			if petB.OwnerID != "" {
				ownerName, ownerAvatar := s.getOwnerInfo(petB.OwnerID)
				if ownerName != "" {
					m.MatchedOwnerName = ownerName
				}
				if ownerAvatar != "" {
					m.MatchedOwnerAvatarURL = ownerAvatar
				}
			}
		} else {
			m.Pet = *petB
			m.MatchedPet = *petA
			if petA.OwnerID != "" {
				ownerName, ownerAvatar := s.getOwnerInfo(petA.OwnerID)
				if ownerName != "" {
					m.MatchedOwnerName = ownerName
				}
				if ownerAvatar != "" {
					m.MatchedOwnerAvatarURL = ownerAvatar
				}
			}
		}

		// v0.11.8 — compute unread count + last message preview dynamically.
		if m.ConversationID != "" {
			var unread int
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT COUNT(*) FROM messages
				 WHERE conversation_id = $1 AND sender_profile_id != $2 AND read_at IS NULL AND deleted_at IS NULL`,
				m.ConversationID, userID).Scan(&unread)
			m.UnreadCount = unread

			var lastBody, lastType string
			var lastAt *time.Time
			if err := s.pool.QueryRow(s.ctx(),
				`SELECT COALESCE(body,''), COALESCE(message_type,'text'), created_at FROM messages
				 WHERE conversation_id = $1 AND deleted_at IS NULL
				 ORDER BY created_at DESC LIMIT 1`, m.ConversationID).Scan(&lastBody, &lastType, &lastAt); err == nil {
				preview := lastBody
				if preview == "" {
					switch lastType {
					case "image":
						preview = "📷 Photo"
					case "pet_share":
						preview = "🐾 Pet shared"
					}
				}
				if preview != "" {
					m.LastMessagePreview = preview
				}
				if lastAt != nil {
					m.LastMessageAt = lastAt.UTC().Format(time.RFC3339)
				}
			}
		}

		matches = append(matches, m)
	}

	// Sort by last message time (newest first). Matches with no messages
	// sort after those with messages, ordered by match creation time.
	sort.SliceStable(matches, func(i, j int) bool {
		ai := matches[i].LastMessageAt
		aj := matches[j].LastMessageAt
		if ai == "" && aj == "" {
			return matches[i].CreatedAt > matches[j].CreatedAt
		}
		if ai == "" {
			return false
		}
		if aj == "" {
			return true
		}
		return ai > aj
	})

	return matches
}

func (s *PostgresStore) ListMatchesByPet(userID string, petID string) []domain.MatchPreview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT m.id, m.pet_a_id, m.pet_b_id, m.matched_owner_name,
		        COALESCE(m.matched_owner_avatar_url,''), m.last_message_preview,
		        m.unread_count, m.status, m.conversation_id, m.created_at
		 FROM matches m
		 WHERE m.pet_a_id = $1 OR m.pet_b_id = $1
		 ORDER BY m.created_at DESC`, petID)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)

		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}

		// Swap so that Pet = requested pet, MatchedPet = other pet
		if petAID == petID {
			m.Pet = *petA
			m.MatchedPet = *petB
		} else {
			m.Pet = *petB
			m.MatchedPet = *petA
			ownerName, ownerAvatar := s.getOwnerInfo(petA.OwnerID)
			m.MatchedOwnerName = ownerName
			m.MatchedOwnerAvatarURL = ownerAvatar
		}
		matches = append(matches, m)
	}
	return matches
}

func (s *PostgresStore) FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation {
	convID := s.findConvIDByUsers(user1ID, user2ID)
	if convID == "" {
		return nil
	}
	conv := s.getConversation(convID, "")
	return conv
}

func (s *PostgresStore) CreateOrFindDirectConversation(userID string, targetUserID string) (*domain.Conversation, error) {
	if userID == targetUserID {
		return nil, fmt.Errorf("cannot message yourself")
	}

	// Check if conversation already exists
	if convID := s.findConvIDByUsers(userID, targetUserID); convID != "" {
		conv := s.getConversation(convID, "")
		if conv != nil {
			return conv, nil
		}
	}

	// Get target user's name for conversation title
	var targetName string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT first_name FROM user_profiles WHERE user_id = $1`, targetUserID).Scan(&targetName)
	if err != nil {
		return nil, fmt.Errorf("target user not found")
	}

	conversationID := newID("conversation")
	now := time.Now().UTC()
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		conversationID, "", targetName, "Adoption inquiry", now, []string{userID, targetUserID})
	if err != nil {
		return nil, fmt.Errorf("insert conversation: %w", err)
	}

	conv := s.getConversation(conversationID, "")
	if conv == nil {
		return nil, fmt.Errorf("failed to read created conversation")
	}
	return conv, nil
}

// ============================================================
// MESSAGING
// ============================================================

func (s *PostgresStore) ListConversations(userID string) []domain.Conversation {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, match_id, title, subtitle, unread_count, last_message_at, user_ids
		 FROM conversations
		 WHERE $1 = ANY(user_ids)
		 ORDER BY last_message_at DESC`, userID)
	if err != nil {
		return []domain.Conversation{}
	}
	defer rows.Close()

	conversations := make([]domain.Conversation, 0)
	for rows.Next() {
		var c domain.Conversation
		var lastMsgAt time.Time
		if err := rows.Scan(&c.ID, &c.MatchID, &c.Title, &c.Subtitle,
			&c.UnreadCount, &lastMsgAt, &c.UserIDs); err != nil {
			continue
		}
		c.LastMessageAt = lastMsgAt.Format(time.RFC3339)
		c.Messages = []domain.Message{}
		c.MatchPetPairs = s.getMatchPetPairs(c.ID)

		// Check if this conversation belongs to a group
		var groupName string
		groupErr := s.pool.QueryRow(s.ctx(),
			`SELECT name FROM community_groups WHERE conversation_id = $1`, c.ID).Scan(&groupName)
		if groupErr == nil && groupName != "" {
			c.Title = groupName
		} else {
			// Normal 1:1 — set title to the OTHER user's name + avatar.
			for _, uid := range c.UserIDs {
				if uid != userID {
					otherName, otherAvatar := s.getOwnerInfo(uid)
					if otherName != "" {
						c.Title = otherName
					} else if len(c.MatchPetPairs) > 0 {
						// Fallback: use pet pair names so the title is never empty.
						names := make([]string, 0, len(c.MatchPetPairs))
						for _, pp := range c.MatchPetPairs {
							names = append(names, pp.MatchedPetName)
						}
						c.Title = strings.Join(names, ", ")
					}
					c.MatchedOwnerAvatarURL = otherAvatar
					break
				}
			}
		}

		// v0.11.8 — compute unread count + last message preview dynamically
		// instead of relying on the stale denormalized columns.
		var unread int
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT COUNT(*) FROM messages
			 WHERE conversation_id = $1 AND sender_profile_id != $2 AND read_at IS NULL AND deleted_at IS NULL`,
			c.ID, userID).Scan(&unread)
		c.UnreadCount = unread

		var lastBody, lastType string
		err := s.pool.QueryRow(s.ctx(),
			`SELECT COALESCE(body,''), COALESCE(message_type,'text') FROM messages
			 WHERE conversation_id = $1 AND deleted_at IS NULL
			 ORDER BY created_at DESC LIMIT 1`, c.ID).Scan(&lastBody, &lastType)
		if err == nil {
			preview := lastBody
			if preview == "" {
				switch lastType {
				case "image":
					preview = "📷 Photo"
				case "pet_share":
					preview = "🐾 Pet shared"
				}
			}
			c.Messages = []domain.Message{{Body: preview}}
		}

		conversations = append(conversations, c)
	}
	return conversations
}

func (s *PostgresStore) ListMessages(userID string, conversationID string, limit int, before string) ([]domain.Message, error) {
	// Verify user is in conversation
	var userIDs []string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)
	if err != nil {
		return nil, fmt.Errorf("conversation not found")
	}
	found := false
	for _, uid := range userIDs {
		if uid == userID {
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("conversation not found")
	}

	if limit <= 0 || limit > 200 {
		limit = 50
	}

	// v0.11.4 — cursor-based pagination. Returns the most recent `limit`
	// messages (ordered oldest-first for the client's FlatList). If `before`
	// is set, returns `limit` messages older than that message's created_at.
	// This means the initial load is the newest 50, and scrolling up fetches
	// the previous 50, etc.
	var query string
	var args []any
	if before != "" {
		query = `WITH cursor AS (
			SELECT created_at FROM messages WHERE id = $3 AND conversation_id = $1
		)
		SELECT m.id, m.conversation_id, m.sender_profile_id, m.sender_name, m.body, m.read_at, m.created_at,
		       COALESCE(m.message_type, 'text'),
		       COALESCE(m.image_url, ''),
		       COALESCE(m.metadata::text, '{}'),
		       COALESCE(m.sender_avatar_url, ''),
		       m.deleted_at, COALESCE(m.deleted_by, ''),
		       m.pinned_at,  COALESCE(m.pinned_by, '')
		FROM messages m, cursor c
		WHERE m.conversation_id = $1 AND m.created_at < c.created_at
		ORDER BY m.created_at DESC
		LIMIT $2`
		args = []any{conversationID, limit, before}
	} else {
		query = `SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at,
		        COALESCE(message_type, 'text'),
		        COALESCE(image_url, ''),
		        COALESCE(metadata::text, '{}'),
		        COALESCE(sender_avatar_url, ''),
		        deleted_at, COALESCE(deleted_by, ''),
		        pinned_at,  COALESCE(pinned_by, '')
		 FROM messages
		 WHERE conversation_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`
		args = []any{conversationID, limit}
	}

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	messages := make([]domain.Message, 0, limit)
	for rows.Next() {
		m, ok := scanMessageRow(rows, userID)
		if !ok {
			continue
		}
		messages = append(messages, m)
	}
	// Reverse so the result is oldest-first (the client FlatList expects
	// chronological order and scrolls to end on load).
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

// scanMessageRow reads a row produced by the enriched SELECT in ListMessages /
// ListGroupMessagesFor / GetGroupChatPreview / ListGroupPinnedMessages.
func scanMessageRow(rows pgx.Rows, viewerUserID string) (domain.Message, bool) {
	var m domain.Message
	var createdAt time.Time
	var readAt, deletedAt, pinnedAt *time.Time
	var metadataJSON string
	if err := rows.Scan(
		&m.ID, &m.ConversationID, &m.SenderProfileID, &m.SenderName, &m.Body, &readAt, &createdAt,
		&m.Type, &m.ImageURL, &metadataJSON, &m.SenderAvatarURL,
		&deletedAt, &m.DeletedBy, &pinnedAt, &m.PinnedBy,
	); err != nil {
		return domain.Message{}, false
	}
	m.CreatedAt = createdAt.Format(time.RFC3339)
	if readAt != nil {
		t := readAt.Format(time.RFC3339)
		m.ReadAt = &t
	}
	if deletedAt != nil {
		t := deletedAt.Format(time.RFC3339)
		m.DeletedAt = &t
	}
	if pinnedAt != nil {
		t := pinnedAt.Format(time.RFC3339)
		m.PinnedAt = &t
	}
	if metadataJSON != "" && metadataJSON != "{}" {
		var meta map[string]any
		if err := json.Unmarshal([]byte(metadataJSON), &meta); err == nil && len(meta) > 0 {
			m.Metadata = meta
		}
	}
	if m.Type == "" {
		m.Type = "text"
	}
	m.IsMine = m.SenderProfileID == viewerUserID
	return m, true
}

func (s *PostgresStore) SendMessage(userID string, conversationID string, body string) (domain.Message, error) {
	// Verify user is in conversation
	var userIDs []string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)
	if err != nil {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}
	found := false
	for _, uid := range userIDs {
		if uid == userID {
			found = true
			break
		}
	}
	if !found {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}

	// Get sender name & avatar. Try user_profiles first; if that row does
	// not exist the sender might be a shelter (shelters participate in
	// adoption chats via the same user_ids[] column).
	var senderName, senderAvatar string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(first_name, ''), COALESCE(avatar_url, '') FROM user_profiles WHERE user_id = $1`, userID).Scan(&senderName, &senderAvatar)
	if senderName == "" {
		var shelterName string
		var shelterLogo sql.NullString
		if err := s.pool.QueryRow(s.ctx(),
			`SELECT name, logo_url FROM shelters WHERE id = $1`, userID).
			Scan(&shelterName, &shelterLogo); err == nil {
			senderName = shelterName
			if shelterLogo.Valid {
				senderAvatar = shelterLogo.String
			}
		}
	}

	msgID := newID("message")
	now := time.Now().UTC()
	body = strings.TrimSpace(body)

	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, sender_avatar_url, message_type, body, created_at)
		 VALUES ($1, $2, $3, $4, $5, 'text', $6, $7)`,
		msgID, conversationID, userID, senderName, senderAvatar, body, now)
	if err != nil {
		return domain.Message{}, fmt.Errorf("send message: %w", err)
	}

	// Update conversation last_message_at
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, conversationID, now)

	// Update match last_message_preview
	var matchID string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT match_id FROM conversations WHERE id = $1`, conversationID).Scan(&matchID)
	if matchID != "" {
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE matches SET last_message_preview = $2 WHERE id = $1`, matchID, body)
	}

	return domain.Message{
		ID:              msgID,
		ConversationID:  conversationID,
		SenderProfileID: userID,
		SenderName:      senderName,
		SenderAvatarURL: senderAvatar,
		Type:            "text",
		Body:            body,
		CreatedAt:       now.Format(time.RFC3339),
		IsMine:          true,
	}, nil
}

func (s *PostgresStore) MarkMessagesRead(userID string, conversationID string) {
	now := time.Now().UTC()
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE messages SET read_at = $3
		 WHERE conversation_id = $1 AND sender_profile_id != $2 AND read_at IS NULL`,
		conversationID, userID, now)
}

// ListGroupMessages is a legacy signature kept for the existing Store interface.
// It lists *all* non-deleted messages for a group without attributing "isMine".
func (s *PostgresStore) ListGroupMessages(groupID string) ([]domain.Message, error) {
	return s.ListGroupMessagesFor("", groupID)
}

// ListGroupMessagesFor returns messages in a group's conversation, filtering
// out deleted rows and enriching with avatar/type/metadata. If viewerUserID is
// non-empty the message's IsMine flag is set accordingly.
func (s *PostgresStore) ListGroupMessagesFor(viewerUserID string, groupID string) ([]domain.Message, error) {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil {
		return nil, fmt.Errorf("group not found")
	}
	if convID == "" {
		return []domain.Message{}, nil
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at,
		        COALESCE(message_type, 'text'),
		        COALESCE(image_url, ''),
		        COALESCE(metadata::text, '{}'),
		        COALESCE(sender_avatar_url, ''),
		        deleted_at, COALESCE(deleted_by, ''),
		        pinned_at,  COALESCE(pinned_by, '')
		 FROM messages
		 WHERE conversation_id = $1 AND deleted_at IS NULL
		 ORDER BY created_at
		 LIMIT 500`, convID)
	if err != nil {
		return []domain.Message{}, nil
	}
	defer rows.Close()

	messages := make([]domain.Message, 0)
	for rows.Next() {
		if m, ok := scanMessageRow(rows, viewerUserID); ok {
			messages = append(messages, m)
		}
	}
	return messages, nil
}

// GetGroupChatPreview returns the last N non-deleted messages of a group
// without requiring the caller to be a member. Used by the non-member
// preview on the group detail screen.
func (s *PostgresStore) GetGroupChatPreview(groupID string, limit int) ([]domain.Message, error) {
	if limit <= 0 {
		limit = 3
	}
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil || convID == "" {
		return []domain.Message{}, nil
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at,
		        COALESCE(message_type, 'text'),
		        COALESCE(image_url, ''),
		        COALESCE(metadata::text, '{}'),
		        COALESCE(sender_avatar_url, ''),
		        deleted_at, COALESCE(deleted_by, ''),
		        pinned_at,  COALESCE(pinned_by, '')
		 FROM messages
		 WHERE conversation_id = $1 AND deleted_at IS NULL AND message_type <> 'system'
		 ORDER BY created_at DESC
		 LIMIT $2`, convID, limit)
	if err != nil {
		return []domain.Message{}, nil
	}
	defer rows.Close()
	out := make([]domain.Message, 0, limit)
	for rows.Next() {
		if m, ok := scanMessageRow(rows, ""); ok {
			out = append(out, m)
		}
	}
	// Reverse so the newest is last (chronological preview order)
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// ListGroupPinnedMessages returns all messages currently pinned in a group.
func (s *PostgresStore) ListGroupPinnedMessages(groupID string) ([]domain.Message, error) {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil || convID == "" {
		return []domain.Message{}, nil
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at,
		        COALESCE(message_type, 'text'),
		        COALESCE(image_url, ''),
		        COALESCE(metadata::text, '{}'),
		        COALESCE(sender_avatar_url, ''),
		        deleted_at, COALESCE(deleted_by, ''),
		        pinned_at,  COALESCE(pinned_by, '')
		 FROM messages
		 WHERE conversation_id = $1 AND deleted_at IS NULL AND pinned_at IS NOT NULL
		 ORDER BY pinned_at DESC`, convID)
	if err != nil {
		return []domain.Message{}, nil
	}
	defer rows.Close()
	out := make([]domain.Message, 0)
	for rows.Next() {
		if m, ok := scanMessageRow(rows, ""); ok {
			out = append(out, m)
		}
	}
	return out, nil
}

// SendGroupMessage is kept for the legacy interface and now forwards to SendGroupMessageEx as text.
func (s *PostgresStore) SendGroupMessage(userID string, groupID string, body string) (domain.Message, error) {
	return s.SendGroupMessageEx(userID, groupID, SendGroupMessageInput{Type: "text", Body: body})
}

// SendGroupMessageEx is the enriched group message send: validates membership,
// checks active mutes, supports text/image/pet_share payloads, and persists the
// author's cached avatar for zero-join reads.
func (s *PostgresStore) SendGroupMessageEx(userID string, groupID string, in SendGroupMessageInput) (domain.Message, error) {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil {
		return domain.Message{}, fmt.Errorf("group not found")
	}
	if convID == "" {
		return domain.Message{}, fmt.Errorf("group has no conversation")
	}

	isMember, _ := s.IsGroupMember(userID, groupID)
	if !isMember {
		return domain.Message{}, fmt.Errorf("not a group member")
	}

	// Active mute check
	if muted, _ := s.GetGroupMute(userID, groupID); muted {
		return domain.Message{}, fmt.Errorf("you are muted in this group")
	}

	msgType := strings.TrimSpace(in.Type)
	if msgType == "" {
		msgType = "text"
	}
	body := strings.TrimSpace(in.Body)
	imageURL := strings.TrimSpace(in.ImageURL)
	switch msgType {
	case "text":
		if body == "" {
			return domain.Message{}, fmt.Errorf("body required")
		}
	case "image":
		if imageURL == "" {
			return domain.Message{}, fmt.Errorf("imageUrl required")
		}
	case "pet_share":
		if in.Metadata == nil {
			return domain.Message{}, fmt.Errorf("metadata required")
		}
		if petID, _ := in.Metadata["petId"].(string); petID == "" {
			return domain.Message{}, fmt.Errorf("metadata.petId required")
		}
	default:
		return domain.Message{}, fmt.Errorf("invalid message type")
	}

	metaJSON := []byte("{}")
	if len(in.Metadata) > 0 {
		if b, err := json.Marshal(in.Metadata); err == nil {
			metaJSON = b
		}
	}

	var senderName, senderAvatar string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(first_name, ''), COALESCE(avatar_url, '') FROM user_profiles WHERE user_id = $1`, userID).
		Scan(&senderName, &senderAvatar)

	msgID := newID("message")
	now := time.Now().UTC()

	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, sender_avatar_url,
		                        message_type, body, image_url, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
		msgID, convID, userID, senderName, senderAvatar, msgType, body, nullableText(imageURL), string(metaJSON), now)
	if err != nil {
		return domain.Message{}, fmt.Errorf("send group message: %w", err)
	}

	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, convID, now)

	out := domain.Message{
		ID:              msgID,
		ConversationID:  convID,
		SenderProfileID: userID,
		SenderName:      senderName,
		SenderAvatarURL: senderAvatar,
		Type:            msgType,
		Body:            body,
		ImageURL:        imageURL,
		Metadata:        in.Metadata,
		CreatedAt:       now.Format(time.RFC3339),
		IsMine:          true,
	}
	return out, nil
}

// ── Playdate chat (v0.14.0) ──────────────────────────────────────────
//
// Playdate conversations are regular rows in the `conversations` table, but
// sends need their own enriched path so we can: support pet_share/image types,
// enforce the per-playdate host mute, rate-limit spam, and cap message length.
// These helpers mirror the group chat flow but gate off the playdate's
// `conversation_id` and the `playdate_chat_mutes` table instead of the group
// membership + mute tables.

// GetPlaydateByConversation resolves the playdate whose dedicated chat thread
// is the given conversation ID. Returns nil when no match (e.g. DMs, group
// chats).
func (s *PostgresStore) GetPlaydateByConversation(conversationID string) *domain.Playdate {
	var id string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id FROM playdates WHERE conversation_id = $1`, conversationID).Scan(&id)
	if err != nil {
		return nil
	}
	p, err := s.getPlaydateRow(id)
	if err != nil {
		return nil
	}
	return p
}

// PlaydateReminderTarget is one delivery the scheduler still owes — an
// attendee or the host of a playdate that starts within the 1-hour window.
type PlaydateReminderTarget struct {
	PlaydateID    string
	PlaydateTitle string
	PlaydateDate  string
	CityLabel     string
	UserID        string
}

// ListDuePlaydateReminders scans active playdates starting between `fromISO`
// and `toISO`, returning one target per (playdate, user) that hasn't already
// been notified with `kind`. Caller is the background scheduler in the server.
func (s *PostgresStore) ListDuePlaydateReminders(fromISO, toISO string, kind string) []PlaydateReminderTarget {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.title, p.date, COALESCE(p.city_label, ''), p.organizer_id, p.attendees
		 FROM playdates p
		 WHERE COALESCE(p.status, 'active') = 'active'
		   AND p.date >= $1 AND p.date < $2`,
		fromISO, toISO)
	if err != nil {
		return nil
	}
	defer rows.Close()
	type row struct {
		id, title, date, city, organizerID string
		attendees                          []string
	}
	var pending []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.title, &r.date, &r.city, &r.organizerID, &r.attendees); err == nil {
			pending = append(pending, r)
		}
	}

	out := []PlaydateReminderTarget{}
	for _, r := range pending {
		userSet := map[string]struct{}{r.organizerID: {}}
		for _, uid := range r.attendees {
			if uid != "" {
				userSet[uid] = struct{}{}
			}
		}
		for uid := range userSet {
			if uid == "" {
				continue
			}
			var one int
			err := s.pool.QueryRow(s.ctx(),
				`SELECT 1 FROM playdate_reminders_sent WHERE playdate_id=$1 AND user_id=$2 AND kind=$3`,
				r.id, uid, kind).Scan(&one)
			if err == nil {
				continue // already sent
			}
			out = append(out, PlaydateReminderTarget{
				PlaydateID:    r.id,
				PlaydateTitle: r.title,
				PlaydateDate:  r.date,
				CityLabel:     r.city,
				UserID:        uid,
			})
		}
	}
	return out
}

// MarkPlaydateReminderSent idempotently records that we've delivered `kind`
// to this (playdate, user) pair. Called after a successful push.
func (s *PostgresStore) MarkPlaydateReminderSent(playdateID string, userID string, kind string) {
	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO playdate_reminders_sent (playdate_id, user_id, kind)
		 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		playdateID, userID, kind)
}

// ListMyPlaydatesParams drives the /v1/me/playdates endpoint.
type ListMyPlaydatesParams struct {
	UserID string
	When   string // "upcoming" | "past"
	Role   string // "all" | "hosted"
}

// ListMyPlaydates returns every playdate the caller is hosting or attending,
// filtered by past/upcoming and optionally narrowed to hosted-only. Each row
// is fully enriched so the My Playdates cards can render role badges, attendee
// previews, and quick-action state without a second round trip.
func (s *PostgresStore) ListMyPlaydates(params ListMyPlaydatesParams) []domain.Playdate {
	if params.UserID == "" {
		return []domain.Playdate{}
	}
	nowISO := time.Now().UTC().Format(time.RFC3339)

	// Base filter: user is the organizer, a current attendee, or has a
	// pending invite (so invited users see the invited playdate in their
	// upcoming list even before accepting).
	query := `SELECT id FROM playdates WHERE 1=1`
	args := []any{params.UserID}
	idx := 2

	if params.Role == "hosted" {
		query += ` AND organizer_id = $1`
	} else {
		query += ` AND (
			organizer_id = $1
			OR $1 = ANY(attendees)
			OR EXISTS (SELECT 1 FROM playdate_invites WHERE playdate_id = playdates.id AND invited_user_id = $1 AND status = 'pending')
		)`
	}

	// Time-window filter. Playdates that have been cancelled still appear in
	// the user's list so they get closure (and they can read the chat).
	switch params.When {
	case "upcoming":
		query += fmt.Sprintf(` AND date >= $%d`, idx)
		args = append(args, nowISO)
		idx++
		query += ` ORDER BY date ASC`
	case "past":
		query += fmt.Sprintf(` AND date < $%d`, idx)
		args = append(args, nowISO)
		idx++
		query += ` ORDER BY date DESC`
	default:
		query += ` ORDER BY date ASC`
	}

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.Playdate{}
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	out := make([]domain.Playdate, 0, len(ids))
	for _, id := range ids {
		enriched, err := s.GetPlaydateForUser(id, params.UserID)
		if err != nil || enriched == nil {
			continue
		}
		out = append(out, *enriched)
	}
	return out
}

// GetPlaydateChatMute returns whether the user is currently host-muted in the
// playdate's chat and the expiry timestamp (nil for indefinite). Expired rows
// are lazily deleted — same pattern as GetGroupMute.
func (s *PostgresStore) GetPlaydateChatMute(userID string, playdateID string) (bool, *time.Time) {
	var until *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT muted_until FROM playdate_chat_mutes WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID).Scan(&until)
	if err != nil {
		return false, nil
	}
	if until != nil && until.Before(time.Now().UTC()) {
		// Expired — drop the row and report as unmuted.
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM playdate_chat_mutes WHERE playdate_id=$1 AND user_id=$2`,
			playdateID, userID)
		return false, nil
	}
	return true, until
}

// SetPlaydateChatMute upserts a moderation mute. Organizer-only. An `until` of
// nil represents an indefinite mute. Also posts a `member_muted` system message
// into the playdate conversation so the chat history reflects the action.
func (s *PostgresStore) SetPlaydateChatMute(hostID string, playdateID string, targetUserID string, until *time.Time) error {
	if hostID == targetUserID {
		return fmt.Errorf("you can't mute yourself")
	}
	var organizerID, convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id, COALESCE(conversation_id, '') FROM playdates WHERE id = $1`,
		playdateID).Scan(&organizerID, &convID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if organizerID != hostID {
		return fmt.Errorf("only the organizer can mute members")
	}
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO playdate_chat_mutes (playdate_id, user_id, muted_by, muted_until)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (playdate_id, user_id) DO UPDATE SET muted_by = EXCLUDED.muted_by, muted_until = EXCLUDED.muted_until`,
		playdateID, targetUserID, hostID, until)
	if err != nil {
		return err
	}
	if convID != "" {
		var firstName string
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT COALESCE(first_name, '') FROM user_profiles WHERE user_id = $1`,
			targetUserID).Scan(&firstName)
		s.insertSystemMessage(convID, "member_muted", map[string]any{
			"kind":      "member_muted",
			"userId":    targetUserID,
			"firstName": firstName,
		})
	}
	return nil
}

// UnsetPlaydateChatMute removes a moderation mute. Organizer-only. Posts no
// system message — the unmute is quiet on purpose.
func (s *PostgresStore) UnsetPlaydateChatMute(hostID string, playdateID string, targetUserID string) error {
	var organizerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id FROM playdates WHERE id = $1`, playdateID).Scan(&organizerID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if organizerID != hostID {
		return fmt.Errorf("only the organizer can unmute members")
	}
	_, err = s.pool.Exec(s.ctx(),
		`DELETE FROM playdate_chat_mutes WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, targetUserID)
	return err
}

// ListPlaydateChatMutedUsers returns the set of currently-muted user ids for a
// playdate. Used to surface `chatMutedUserIds` on the detail response for the
// host. Expired mutes are filtered out but not deleted — GetPlaydateChatMute
// handles the lazy cleanup.
func (s *PostgresStore) ListPlaydateChatMutedUsers(playdateID string) []string {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT user_id, muted_until FROM playdate_chat_mutes WHERE playdate_id=$1`,
		playdateID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	now := time.Now().UTC()
	out := []string{}
	for rows.Next() {
		var uid string
		var until *time.Time
		if err := rows.Scan(&uid, &until); err != nil {
			continue
		}
		if until != nil && until.Before(now) {
			continue
		}
		out = append(out, uid)
	}
	return out
}

// SendPlaydateMessageEx is the enriched playdate send path: validates
// conversation membership, blocks host-muted senders, rate-limits, enforces
// the 1000-char max length, and supports text/image/pet_share types.
func (s *PostgresStore) SendPlaydateMessageEx(userID string, playdateID string, in SendGroupMessageInput) (domain.Message, error) {
	var convID, organizerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,''), organizer_id FROM playdates WHERE id = $1`,
		playdateID).Scan(&convID, &organizerID)
	if err != nil {
		return domain.Message{}, fmt.Errorf("playdate not found")
	}
	if convID == "" {
		return domain.Message{}, fmt.Errorf("playdate has no conversation")
	}

	// Membership: caller must be in conversations.user_ids. (Organizer is added
	// on create; attendees are added on join.)
	var userIDs []string
	if err := s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, convID).Scan(&userIDs); err != nil {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}
	member := false
	for _, uid := range userIDs {
		if uid == userID {
			member = true
			break
		}
	}
	if !member {
		return domain.Message{}, fmt.Errorf("not a playdate member")
	}

	// Host mute check
	if muted, _ := s.GetPlaydateChatMute(userID, playdateID); muted {
		return domain.Message{}, fmt.Errorf("you are muted by the host")
	}

	// Rate limit
	if !CheckChatRateLimit(userID) {
		return domain.Message{}, fmt.Errorf("sending too fast, please slow down")
	}

	msgType := strings.TrimSpace(in.Type)
	if msgType == "" {
		msgType = "text"
	}
	body := strings.TrimSpace(in.Body)
	imageURL := strings.TrimSpace(in.ImageURL)

	// Max length — applies to every type's body field. 1000 chars is enough
	// for a paragraph without encouraging long-form monologues in a chat.
	const maxChatMessageLength = 1000
	if len(body) > maxChatMessageLength {
		return domain.Message{}, fmt.Errorf("message too long (max %d characters)", maxChatMessageLength)
	}

	switch msgType {
	case "text":
		if body == "" {
			return domain.Message{}, fmt.Errorf("body required")
		}
	case "image":
		if imageURL == "" {
			return domain.Message{}, fmt.Errorf("imageUrl required")
		}
	case "pet_share":
		if in.Metadata == nil {
			return domain.Message{}, fmt.Errorf("metadata required")
		}
		if petID, _ := in.Metadata["petId"].(string); petID == "" {
			return domain.Message{}, fmt.Errorf("metadata.petId required")
		}
	default:
		return domain.Message{}, fmt.Errorf("invalid message type")
	}

	metaJSON := []byte("{}")
	if len(in.Metadata) > 0 {
		if b, err := json.Marshal(in.Metadata); err == nil {
			metaJSON = b
		}
	}

	var senderName, senderAvatar string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(first_name, ''), COALESCE(avatar_url, '') FROM user_profiles WHERE user_id = $1`, userID).
		Scan(&senderName, &senderAvatar)

	msgID := newID("message")
	now := time.Now().UTC()

	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, sender_avatar_url,
		                        message_type, body, image_url, metadata, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
		msgID, convID, userID, senderName, senderAvatar, msgType, body,
		nullableText(imageURL), string(metaJSON), now)
	if err != nil {
		return domain.Message{}, fmt.Errorf("send playdate message: %w", err)
	}

	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, convID, now)

	_ = organizerID // kept for future moderation audit hooks
	return domain.Message{
		ID:              msgID,
		ConversationID:  convID,
		SenderProfileID: userID,
		SenderName:      senderName,
		SenderAvatarURL: senderAvatar,
		Type:            msgType,
		Body:            body,
		ImageURL:        imageURL,
		Metadata:        in.Metadata,
		CreatedAt:       now.Format(time.RFC3339),
		IsMine:          true,
	}, nil
}

// DeleteConversationMessage soft-deletes a message in any conversation. The
// actor must be the message author, the playdate organizer, or — for group
// chat conversations — a group admin/owner. Used by the unified
// /v1/conversations/{id}/messages/{msgId}/delete endpoint; the legacy
// /v1/groups/{gid}/messages/{mid} handler still wraps DeleteGroupMessage.
func (s *PostgresStore) DeleteConversationMessage(actorUserID string, conversationID string, messageID string) error {
	// Load the message so we can check ownership + conversation association.
	var senderID, storedConvID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(sender_profile_id,''), conversation_id FROM messages WHERE id = $1`,
		messageID).Scan(&senderID, &storedConvID)
	if err != nil {
		return fmt.Errorf("message not found")
	}
	if storedConvID != conversationID {
		return fmt.Errorf("message not found")
	}

	// Self-delete is always allowed.
	authorised := senderID == actorUserID

	if !authorised {
		// Playdate organizer?
		if pd := s.GetPlaydateByConversation(conversationID); pd != nil && pd.OrganizerID == actorUserID {
			authorised = true
		}
	}
	if !authorised {
		// Group admin? (reuse the existing group-admin check)
		if group := s.GetGroupByConversation(conversationID); group != nil {
			if isAdmin, _ := s.IsGroupAdmin(actorUserID, group.ID); isAdmin {
				authorised = true
			}
		}
	}
	if !authorised {
		return fmt.Errorf("not authorised to delete this message")
	}

	_, err = s.pool.Exec(s.ctx(),
		`UPDATE messages SET deleted_at = NOW(), deleted_by = $1, body = '' WHERE id = $2`,
		actorUserID, messageID)
	return err
}

// MuteConversation silences OS push for this (user, conversation) pair.
// `until` is optional: nil = muted forever, non-nil = muted until that time.
// v0.11.5 — timed mute support.
func (s *PostgresStore) MuteConversation(userID string, conversationID string, until *time.Time) error {
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO conversation_mutes (conversation_id, user_id, muted_until)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (conversation_id, user_id)
		 DO UPDATE SET muted_until = EXCLUDED.muted_until, muted_at = NOW()`,
		conversationID, userID, until)
	return err
}

// UnmuteConversation removes the per-user notification mute.
func (s *PostgresStore) UnmuteConversation(userID string, conversationID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM conversation_mutes WHERE conversation_id=$1 AND user_id=$2`,
		conversationID, userID)
	return err
}

// IsConversationMuted reports whether this user has silenced push for this
// conversation. Lazy expiry: if muted_until has passed, the row is deleted
// and the function returns false — no cron needed.
func (s *PostgresStore) IsConversationMuted(userID string, conversationID string) bool {
	var mutedUntil *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT muted_until FROM conversation_mutes WHERE conversation_id=$1 AND user_id=$2`,
		conversationID, userID).Scan(&mutedUntil)
	if err != nil {
		return false // no row = not muted
	}
	// NULL muted_until = muted forever.
	if mutedUntil == nil {
		return true
	}
	// Timed mute: check if expired. If so, auto-unmute (lazy cleanup).
	if mutedUntil.Before(time.Now().UTC()) {
		s.pool.Exec(s.ctx(),
			`DELETE FROM conversation_mutes WHERE conversation_id=$1 AND user_id=$2`,
			conversationID, userID)
		return false
	}
	return true
}

// GetConversationMuteUntil returns the muted_until timestamp for the caller.
// Returns nil if not muted or muted forever (boolean distinction done via
// IsConversationMuted). Used to populate MyConvMutedUntil in domain types.
func (s *PostgresStore) GetConversationMuteUntil(userID string, conversationID string) *time.Time {
	var mutedUntil *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT muted_until FROM conversation_mutes WHERE conversation_id=$1 AND user_id=$2`,
		conversationID, userID).Scan(&mutedUntil)
	if err != nil {
		return nil
	}
	if mutedUntil != nil && mutedUntil.Before(time.Now().UTC()) {
		// Expired — lazy cleanup.
		s.pool.Exec(s.ctx(),
			`DELETE FROM conversation_mutes WHERE conversation_id=$1 AND user_id=$2`,
			conversationID, userID)
		return nil
	}
	return mutedUntil
}

// insertSystemMessage drops a system message into a group's conversation. Used
// for member_joined / member_kicked / member_muted / admin_promoted events.
func (s *PostgresStore) insertSystemMessage(conversationID string, body string, metadata map[string]any) {
	if conversationID == "" {
		return
	}
	metaJSON := []byte("{}")
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil {
			metaJSON = b
		}
	}
	now := time.Now().UTC()
	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, message_type, body, metadata, created_at)
		 VALUES ($1, $2, '', '', 'system', $3, $4::jsonb, $5)`,
		newID("message"), conversationID, body, string(metaJSON), now)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, conversationID, now)
}

// DeleteGroupMessage soft-deletes a message. The actor must either be the
// author or a group admin / owner.
func (s *PostgresStore) DeleteGroupMessage(actorUserID string, groupID string, messageID string) error {
	var convID string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if convID == "" {
		return fmt.Errorf("group not found")
	}
	var sender string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT sender_profile_id FROM messages WHERE id = $1 AND conversation_id = $2`, messageID, convID).Scan(&sender)
	if err != nil {
		return fmt.Errorf("message not found")
	}
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin && sender != actorUserID {
		return fmt.Errorf("forbidden")
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE messages SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1`, messageID, actorUserID)
	return err
}

// SetGroupMessagePinned pins/unpins a message. Admin only.
func (s *PostgresStore) SetGroupMessagePinned(actorUserID string, groupID string, messageID string, pinned bool) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	var convID string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if convID == "" {
		return fmt.Errorf("group not found")
	}
	if pinned {
		_, err := s.pool.Exec(s.ctx(),
			`UPDATE messages SET pinned_at = NOW(), pinned_by = $3
			 WHERE id = $1 AND conversation_id = $2`, messageID, convID, actorUserID)
		return err
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE messages SET pinned_at = NULL, pinned_by = NULL
		 WHERE id = $1 AND conversation_id = $2`, messageID, convID)
	return err
}

// MuteGroupMember inserts or updates a mute row. Admin only.
func (s *PostgresStore) MuteGroupMember(actorUserID string, groupID string, targetUserID string, until *time.Time) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	if actorUserID == targetUserID {
		return fmt.Errorf("cannot mute yourself")
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO community_group_mutes (group_id, user_id, muted_until, muted_by)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (group_id, user_id) DO UPDATE SET muted_until = EXCLUDED.muted_until, muted_by = EXCLUDED.muted_by, created_at = NOW()`,
		groupID, targetUserID, until, actorUserID)
	if err != nil {
		return err
	}
	// System message
	var convID, name string
	_ = s.pool.QueryRow(s.ctx(), `SELECT conversation_id FROM community_groups WHERE id=$1`, groupID).Scan(&convID)
	_ = s.pool.QueryRow(s.ctx(), `SELECT COALESCE(first_name,'') FROM user_profiles WHERE user_id=$1`, targetUserID).Scan(&name)
	s.insertSystemMessage(convID, "member_muted", map[string]any{"kind": "member_muted", "userId": targetUserID, "firstName": name})

	// Push notification to the muted user.
	groupName := s.fetchGroupName(groupID)
	var durationLabel, mutedUntilStr string
	if until == nil {
		durationLabel = "indefinitely"
	} else {
		mutedUntilStr = until.Format(time.RFC3339)
		diff := time.Until(*until)
		if diff <= 75*time.Minute {
			durationLabel = "for 1 hour"
		} else if diff <= 26*time.Hour {
			durationLabel = "for 24 hours"
		} else {
			durationLabel = fmt.Sprintf("until %s", until.Format("Jan 2, 15:04"))
		}
	}
	s.sendModPush(
		targetUserID,
		"You were muted 🔇",
		fmt.Sprintf("You were muted in %s %s.", groupName, durationLabel),
		map[string]string{
			"type":       "mod",
			"action":     "muted",
			"groupId":    groupID,
			"groupName":  groupName,
			"mutedUntil": mutedUntilStr,
		},
	)
	return nil
}

// UnmuteGroupMember removes a mute row. Admin only.
func (s *PostgresStore) UnmuteGroupMember(actorUserID string, groupID string, targetUserID string) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM community_group_mutes WHERE group_id = $1 AND user_id = $2`, groupID, targetUserID)
	if err != nil {
		return err
	}
	groupName := s.fetchGroupName(groupID)
	s.sendModPush(
		targetUserID,
		"Unmuted 🔊",
		fmt.Sprintf("You can chat in %s again.", groupName),
		map[string]string{
			"type":      "mod",
			"action":    "unmuted",
			"groupId":   groupID,
			"groupName": groupName,
		},
	)
	return nil
}

// KickGroupMember removes a user from the group's conversation.user_ids array
// and drops any admin row. Admin only; cannot kick the owner.
func (s *PostgresStore) KickGroupMember(actorUserID string, groupID string, targetUserID string) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	var convID, ownerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT conversation_id, COALESCE(owner_user_id,'') FROM community_groups WHERE id=$1`, groupID).Scan(&convID, &ownerID)
	if err != nil || convID == "" {
		return fmt.Errorf("group not found")
	}
	if targetUserID == ownerID {
		return fmt.Errorf("cannot kick owner")
	}
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET user_ids = array_remove(user_ids, $1) WHERE id = $2`, targetUserID, convID)
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM community_group_admins WHERE group_id = $1 AND user_id = $2`, groupID, targetUserID)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE community_groups SET member_count = (SELECT COALESCE(array_length(user_ids,1),0) FROM conversations WHERE id = $2) WHERE id = $1`, groupID, convID)
	var name string
	_ = s.pool.QueryRow(s.ctx(), `SELECT COALESCE(first_name,'') FROM user_profiles WHERE user_id=$1`, targetUserID).Scan(&name)
	s.insertSystemMessage(convID, "member_kicked", map[string]any{"kind": "member_kicked", "userId": targetUserID, "firstName": name})

	groupName := s.fetchGroupName(groupID)
	s.sendModPush(
		targetUserID,
		"Removed from group",
		fmt.Sprintf("You were removed from %s.", groupName),
		map[string]string{
			"type":      "mod",
			"action":    "kicked",
			"groupId":   groupID,
			"groupName": groupName,
		},
	)
	return nil
}

// PromoteGroupAdmin grants admin rights. Any admin may promote another
// member — per the spec, multiple admins share full control.
func (s *PostgresStore) PromoteGroupAdmin(actorUserID string, groupID string, targetUserID string) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	isMember, _ := s.IsGroupMember(targetUserID, groupID)
	if !isMember {
		return fmt.Errorf("target not a member")
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO community_group_admins (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		groupID, targetUserID)
	if err != nil {
		return err
	}
	groupName := s.fetchGroupName(groupID)
	s.sendModPush(
		targetUserID,
		"You're now an admin 🛡️",
		fmt.Sprintf("You were promoted to admin of %s.", groupName),
		map[string]string{
			"type":      "mod",
			"action":    "promoted",
			"groupId":   groupID,
			"groupName": groupName,
		},
	)
	return nil
}

// DemoteGroupAdmin revokes admin rights. Any admin may demote another
// admin, but the owner is protected — to lose ownership the owner must
// leave, which transfers ownership to the next admin (see LeaveGroup).
func (s *PostgresStore) DemoteGroupAdmin(actorUserID string, groupID string, targetUserID string) error {
	isAdmin, _ := s.IsGroupAdmin(actorUserID, groupID)
	if !isAdmin {
		return fmt.Errorf("forbidden")
	}
	var owner string
	_ = s.pool.QueryRow(s.ctx(), `SELECT COALESCE(owner_user_id,'') FROM community_groups WHERE id=$1`, groupID).Scan(&owner)
	if owner != "" && owner == targetUserID {
		return fmt.Errorf("cannot demote owner")
	}
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM community_group_admins WHERE group_id = $1 AND user_id = $2`, groupID, targetUserID)
	if err != nil {
		return err
	}
	groupName := s.fetchGroupName(groupID)
	s.sendModPush(
		targetUserID,
		"Admin role removed",
		fmt.Sprintf("You are no longer an admin of %s.", groupName),
		map[string]string{
			"type":      "mod",
			"action":    "demoted",
			"groupId":   groupID,
			"groupName": groupName,
		},
	)
	return nil
}

// LeaveGroup removes the caller from a group. If the caller is the last
// admin, the group and all its data are deleted. Otherwise, if the caller
// was the owner, ownership is transferred to the oldest remaining admin.
// Returns deletedGroup=true when the "last admin" branch fires.
func (s *PostgresStore) LeaveGroup(userID string, groupID string) (bool, error) {
	var convID, ownerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,''), COALESCE(owner_user_id,'') FROM community_groups WHERE id=$1`,
		groupID).Scan(&convID, &ownerID)
	if err != nil || convID == "" {
		return false, fmt.Errorf("group not found")
	}

	isMember, _ := s.IsGroupMember(userID, groupID)
	if !isMember {
		return false, fmt.Errorf("not a member")
	}

	// Count admins: owner + community_group_admins rows (deduped).
	var adminRowCount int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM community_group_admins WHERE group_id = $1 AND user_id <> $2`,
		groupID, ownerID).Scan(&adminRowCount)
	isOwner := ownerID == userID
	isCallerAdmin, _ := s.IsGroupAdmin(userID, groupID)
	adminCount := adminRowCount
	if ownerID != "" {
		adminCount++
	}

	// Last admin leaving → delete the whole group.
	if isCallerAdmin && adminCount <= 1 {
		if err := s.DeleteGroup(groupID); err != nil {
			return false, err
		}
		return true, nil
	}

	// Remove caller from conversation membership + any admin/mute rows.
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET user_ids = array_remove(user_ids, $1) WHERE id = $2`,
		userID, convID)
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM community_group_admins WHERE group_id = $1 AND user_id = $2`,
		groupID, userID)
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM community_group_mutes WHERE group_id = $1 AND user_id = $2`,
		groupID, userID)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE community_groups SET member_count = (
			SELECT COALESCE(array_length(user_ids,1),0) FROM conversations WHERE id = $2
		) WHERE id = $1`,
		groupID, convID)

	// If the owner is leaving, transfer ownership to the oldest remaining admin.
	if isOwner {
		var nextOwner string
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT user_id FROM community_group_admins
			 WHERE group_id = $1
			 ORDER BY granted_at ASC
			 LIMIT 1`, groupID).Scan(&nextOwner)
		if nextOwner != "" {
			_, _ = s.pool.Exec(s.ctx(),
				`UPDATE community_groups SET owner_user_id = $2 WHERE id = $1`, groupID, nextOwner)
			// The new owner is implicitly an admin — drop the explicit row.
			_, _ = s.pool.Exec(s.ctx(),
				`DELETE FROM community_group_admins WHERE group_id = $1 AND user_id = $2`,
				groupID, nextOwner)
		}
	}

	// System message: {firstName} left the group
	var firstName string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(first_name,'') FROM user_profiles WHERE user_id=$1`,
		userID).Scan(&firstName)
	s.insertSystemMessage(convID, "member_left", map[string]any{
		"kind":      "member_left",
		"userId":    userID,
		"firstName": firstName,
	})

	return false, nil
}

// DeleteGroup removes every row tied to a community group. Called from
// LeaveGroup when the last admin leaves; can be invoked directly by an
// admin-only handler later if needed.
func (s *PostgresStore) DeleteGroup(groupID string) error {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id=$1`, groupID).Scan(&convID)
	if err != nil {
		return fmt.Errorf("group not found")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	// Order matters due to FKs: messages → conversations, so messages first.
	if convID != "" {
		if _, err := tx.Exec(s.ctx(), `DELETE FROM messages WHERE conversation_id = $1`, convID); err != nil {
			return fmt.Errorf("delete messages: %w", err)
		}
	}
	if _, err := tx.Exec(s.ctx(), `DELETE FROM community_group_admins WHERE group_id = $1`, groupID); err != nil {
		return fmt.Errorf("delete admins: %w", err)
	}
	if _, err := tx.Exec(s.ctx(), `DELETE FROM community_group_mutes WHERE group_id = $1`, groupID); err != nil {
		return fmt.Errorf("delete mutes: %w", err)
	}
	if _, err := tx.Exec(s.ctx(), `DELETE FROM community_groups WHERE id = $1`, groupID); err != nil {
		return fmt.Errorf("delete group: %w", err)
	}
	if convID != "" {
		if _, err := tx.Exec(s.ctx(), `DELETE FROM conversations WHERE id = $1`, convID); err != nil {
			return fmt.Errorf("delete conversation: %w", err)
		}
	}

	return tx.Commit(s.ctx())
}

// IsGroupMember checks whether a user is part of a group's conversation.
func (s *PostgresStore) IsGroupMember(userID string, groupID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(
			SELECT 1 FROM community_groups g
			JOIN conversations c ON c.id = g.conversation_id
			WHERE g.id = $1 AND $2 = ANY(c.user_ids)
		)`, groupID, userID).Scan(&ok)
	return ok, err
}

// IsGroupAdmin returns true if userID is the group owner or listed in community_group_admins.
func (s *PostgresStore) IsGroupAdmin(userID string, groupID string) (bool, error) {
	var owner string
	_ = s.pool.QueryRow(s.ctx(), `SELECT COALESCE(owner_user_id,'') FROM community_groups WHERE id=$1`, groupID).Scan(&owner)
	if owner != "" && owner == userID {
		return true, nil
	}
	var ok bool
	err := s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(SELECT 1 FROM community_group_admins WHERE group_id = $1 AND user_id = $2)`,
		groupID, userID).Scan(&ok)
	return ok, err
}

// GetGroupMute returns whether a user currently has an active mute on a group.
func (s *PostgresStore) GetGroupMute(userID string, groupID string) (bool, *time.Time) {
	var until *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT muted_until FROM community_group_mutes
		 WHERE group_id = $1 AND user_id = $2
		 LIMIT 1`, groupID, userID).Scan(&until)
	if err != nil {
		return false, nil
	}
	if until != nil && time.Now().UTC().After(*until) {
		// Expired — lazily clean it up.
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM community_group_mutes WHERE group_id = $1 AND user_id = $2`, groupID, userID)
		return false, nil
	}
	return true, until
}

func nullableText(v string) any {
	if v == "" {
		return nil
	}
	return v
}

// sendModPush fires an Expo push to a single user about a moderation
// action. Fire-and-forget — failures are swallowed so they never block
// the originating mutation.
func (s *PostgresStore) sendModPush(targetUserID string, title string, body string, data map[string]string) {
	if targetUserID == "" {
		return
	}
	// v0.11.0 — moderation actions live in the Groups category so users who
	// opt out of group activity stop getting kicked/promoted/muted pushes.
	if !s.ShouldSendPush(targetUserID, "groups") {
		return
	}
	userTokens := s.GetUserPushTokens(targetUserID)
	if len(userTokens) == 0 {
		return
	}
	tokens := make([]string, 0, len(userTokens))
	for _, t := range userTokens {
		if t.Token != "" {
			tokens = append(tokens, t.Token)
		}
	}
	if len(tokens) == 0 {
		return
	}
	go func() {
		_ = service.SendExpoPush(tokens, title, body, data)
	}()
}

// fetchGroupName is a cheap lookup used to enrich moderation push bodies.
func (s *PostgresStore) fetchGroupName(groupID string) string {
	var name string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(name, '') FROM community_groups WHERE id = $1`, groupID).Scan(&name)
	if name == "" {
		return "the group"
	}
	return name
}

// ============================================================
// FEED & POSTS
// ============================================================

func (s *PostgresStore) ListHomeFeed(userID string) []domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 ORDER BY po.created_at DESC`)
	if err != nil {
		return []domain.HomePost{}
	}
	defer rows.Close()

	return s.scanPosts(rows, userID)
}

func (s *PostgresStore) ListUserPosts(targetUserID string, viewerUserID string) []domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.author_user_id = $1
		 ORDER BY po.created_at DESC`, targetUserID)
	if err != nil {
		return []domain.HomePost{}
	}
	defer rows.Close()

	return s.scanPosts(rows, viewerUserID)
}

func (s *PostgresStore) CreatePost(userID string, input PostInput) (domain.HomePost, error) {
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("user not found")
	}

	body := strings.TrimSpace(input.Body)
	if body == "" && input.ImageURL == nil {
		return domain.HomePost{}, fmt.Errorf("add some text or a photo before posting")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	postID := newID("post")
	now := time.Now().UTC()

	// Lookup venue name if venueId provided but name missing
	venueName := input.VenueName
	if input.VenueID != nil && *input.VenueID != "" && (venueName == nil || *venueName == "") {
		var name string
		nameErr := s.pool.QueryRow(s.ctx(),
			`SELECT name FROM venues WHERE id = $1`, *input.VenueID).Scan(&name)
		if nameErr == nil {
			venueName = &name
		}
	}

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO posts (id, author_user_id, body, image_url, venue_id, venue_name,
		     event_id, event_name, like_count, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9)`,
		postID, userID, body, input.ImageURL, input.VenueID, venueName,
		input.EventID, input.EventName, now)
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("insert post: %w", err)
	}

	// Tag pets
	taggedPets := make([]domain.Pet, 0, len(input.TaggedPetIDs))
	for _, petID := range input.TaggedPetIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO post_tagged_pets (post_id, pet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			postID, petID)
		taggedPets = append(taggedPets, *pet)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return domain.HomePost{}, fmt.Errorf("commit: %w", err)
	}

	return domain.HomePost{
		ID:         postID,
		Author:     user.Profile,
		Body:       body,
		ImageURL:   input.ImageURL,
		TaggedPets: taggedPets,
		LikeCount:  0,
		LikedByMe:  false,
		CreatedAt:  now.Format(time.RFC3339),
		VenueID:    input.VenueID,
		VenueName:  venueName,
		EventID:    input.EventID,
		EventName:  input.EventName,
	}, nil
}

func (s *PostgresStore) TogglePostLike(userID string, postID string) (domain.HomePost, error) {
	// Check if already liked
	var exists bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2)`,
		postID, userID).Scan(&exists)

	if exists {
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, postID, userID)
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, postID)
	} else {
		_, _ = s.pool.Exec(s.ctx(),
			`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			postID, userID)
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, postID)
	}

	// Return updated post
	post := s.getPostByID(postID, userID)
	if post == nil {
		return domain.HomePost{}, fmt.Errorf("post not found")
	}
	return *post, nil
}

func (s *PostgresStore) ListPostsAdmin() []domain.HomePost {
	return s.ListHomeFeed("")
}

func (s *PostgresStore) DeletePost(postID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM posts WHERE id = $1`, postID)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("post not found")
	}
	return nil
}

// ============================================================
// EXPLORE: Venues & Events
// ============================================================

func (s *PostgresStore) ListVenues() []domain.ExploreVenue {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, name, category, description, city_label, address,
		        latitude, longitude, image_url, COALESCE(hours,'')
		 FROM venues ORDER BY name`)
	if err != nil {
		return []domain.ExploreVenue{}
	}
	defer rows.Close()

	venues := make([]domain.ExploreVenue, 0)
	for rows.Next() {
		var v domain.ExploreVenue
		if err := rows.Scan(&v.ID, &v.Name, &v.Category, &v.Description,
			&v.CityLabel, &v.Address, &v.Latitude, &v.Longitude,
			&v.ImageURL, &v.Hours); err != nil {
			continue
		}
		v.CurrentCheckIns = s.getVenueCheckIns(v.ID)
		venues = append(venues, v)
	}
	return venues
}

func (s *PostgresStore) GetVenue(venueID string) (*domain.ExploreVenue, error) {
	var v domain.ExploreVenue
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, name, category, description, city_label, address,
		        latitude, longitude, image_url, COALESCE(hours,'')
		 FROM venues WHERE id = $1`, venueID).
		Scan(&v.ID, &v.Name, &v.Category, &v.Description,
			&v.CityLabel, &v.Address, &v.Latitude, &v.Longitude,
			&v.ImageURL, &v.Hours)
	if err != nil {
		return nil, fmt.Errorf("venue not found")
	}
	v.CurrentCheckIns = s.getVenueCheckIns(v.ID)
	return &v, nil
}

func (s *PostgresStore) UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue {
	if venueID == "" {
		venueID = newID("venue")
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO venues (id, name, category, description, city_label, address,
		     latitude, longitude, image_url, hours)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   name=EXCLUDED.name, category=EXCLUDED.category, description=EXCLUDED.description,
		   city_label=EXCLUDED.city_label, address=EXCLUDED.address,
		   latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
		   image_url=EXCLUDED.image_url, hours=EXCLUDED.hours`,
		venueID, input.Name, input.Category, input.Description,
		input.CityLabel, input.Address, input.Latitude, input.Longitude,
		input.ImageURL, input.Hours)
	if err != nil {
		// Return with whatever we can
		return domain.ExploreVenue{ID: venueID, Name: input.Name}
	}

	venue := domain.ExploreVenue{
		ID:              venueID,
		Name:            input.Name,
		Category:        input.Category,
		Description:     input.Description,
		CityLabel:       input.CityLabel,
		Address:         input.Address,
		Latitude:        input.Latitude,
		Longitude:       input.Longitude,
		ImageURL:        input.ImageURL,
		Hours:           input.Hours,
		CurrentCheckIns: s.getVenueCheckIns(venueID),
	}
	return venue
}

func (s *PostgresStore) DeleteVenue(venueID string) error {
	// Also delete events at this venue
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM events WHERE venue_id = $1`, venueID)

	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM venues WHERE id = $1`, venueID)
	if err != nil {
		return fmt.Errorf("delete venue: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("venue not found")
	}
	// Cascade cleanup — keep admin photo tables in sync so a re-created venue
	// with the same id doesn't inherit stale rows.
	_, _ = s.pool.Exec(s.ctx(), `DELETE FROM venue_admin_photos WHERE venue_id = $1`, venueID)
	_, _ = s.pool.Exec(s.ctx(), `DELETE FROM venue_post_photo_hides WHERE venue_id = $1`, venueID)
	return nil
}

// ── Venue photo management (v0.13.7) ─────────────────────────────────
// Three sources of venue-page photos:
//   1. The venue's own cover image (`venues.image_url`).
//   2. Admin-curated additions (venue_admin_photos).
//   3. Photos from home-feed posts tagged with this venue.
// Admins can add/remove (2), and mark individual post photos as hidden via
// venue_post_photo_hides so (3) can be pruned without touching the post.

// VenuePhotoEntry is the detailed view used by the admin manager. For the
// public gallery we only need urls.
type VenuePhotoEntry struct {
	URL    string `json:"url"`
	Kind   string `json:"kind"`             // "cover" | "admin" | "post"
	ID     string `json:"id,omitempty"`     // admin photo id, when Kind="admin"
	PostID string `json:"postId,omitempty"` // home-feed post id, when Kind="post"
	Hidden bool   `json:"hidden,omitempty"` // true when a post photo is hidden
}

// ListVenuePhotoUrls returns the *public* gallery served by
// /v1/venues/{id}/photos. Only home-feed post photos that have this venue
// tagged make it in — the cover image is intentionally excluded because
// mobile already renders it as the card hero (would double up otherwise),
// and admin-curated photos are admin-only management surface (visible via
// ListVenuePhotosManage). Posts marked hidden via venue_post_photo_hides
// are filtered out so admins can prune off-topic submissions without
// touching the post itself.
func (s *PostgresStore) ListVenuePhotoUrls(venueID string) []string {
	urls := make([]string, 0, 8)
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.image_url
		 FROM posts p
		 WHERE p.venue_id = $1
		   AND p.image_url IS NOT NULL
		   AND p.image_url <> ''
		   AND NOT EXISTS (
		     SELECT 1 FROM venue_post_photo_hides h
		     WHERE h.venue_id = p.venue_id AND h.post_id = p.id
		   )
		 ORDER BY p.created_at DESC`,
		venueID)
	if err != nil {
		return urls
	}
	defer rows.Close()
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err == nil && u != "" {
			urls = append(urls, u)
		}
	}
	return urls
}

// ListVenuePhotosManage returns the full detail set for the admin manager
// UI, including hidden post photos (so admins can un-hide them).
func (s *PostgresStore) ListVenuePhotosManage(venueID string) []VenuePhotoEntry {
	out := make([]VenuePhotoEntry, 0, 8)
	if v, err := s.GetVenue(venueID); err == nil && v.ImageURL != nil && *v.ImageURL != "" {
		out = append(out, VenuePhotoEntry{URL: *v.ImageURL, Kind: "cover"})
	}
	if rows, err := s.pool.Query(s.ctx(),
		`SELECT id, url FROM venue_admin_photos WHERE venue_id = $1 ORDER BY display_order, created_at`,
		venueID); err == nil {
		for rows.Next() {
			var id, url string
			if err := rows.Scan(&id, &url); err == nil {
				out = append(out, VenuePhotoEntry{URL: url, Kind: "admin", ID: id})
			}
		}
		rows.Close()
	}
	if rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.image_url,
		        EXISTS (
		          SELECT 1 FROM venue_post_photo_hides h
		          WHERE h.venue_id = p.venue_id AND h.post_id = p.id
		        ) AS hidden
		 FROM posts p
		 WHERE p.venue_id = $1
		   AND p.image_url IS NOT NULL
		   AND p.image_url <> ''
		 ORDER BY p.created_at DESC`,
		venueID); err == nil {
		for rows.Next() {
			var id, url string
			var hidden bool
			if err := rows.Scan(&id, &url, &hidden); err == nil {
				out = append(out, VenuePhotoEntry{
					URL:    url,
					Kind:   "post",
					PostID: id,
					Hidden: hidden,
				})
			}
		}
		rows.Close()
	}
	return out
}

// AddVenueAdminPhoto curates a new photo onto the venue. Returns the created
// entry so the admin UI can render it without a full refetch.
func (s *PostgresStore) AddVenueAdminPhoto(venueID string, url string) (VenuePhotoEntry, error) {
	if venueID == "" || url == "" {
		return VenuePhotoEntry{}, fmt.Errorf("venueId and url required")
	}
	id := newID("vph")
	// display_order defaults to (max+1) so new photos append at the bottom —
	// admins can re-order later via a dedicated endpoint if that's needed.
	var nextOrder int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(MAX(display_order),0)+1 FROM venue_admin_photos WHERE venue_id=$1`,
		venueID).Scan(&nextOrder)
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO venue_admin_photos (id, venue_id, url, display_order)
		 VALUES ($1,$2,$3,$4)`,
		id, venueID, url, nextOrder)
	if err != nil {
		return VenuePhotoEntry{}, fmt.Errorf("add venue photo: %w", err)
	}
	return VenuePhotoEntry{ID: id, URL: url, Kind: "admin"}, nil
}

// DeleteVenueAdminPhoto removes a curated photo. Silently no-ops if the
// photo id doesn't exist (or belongs to a different venue) — the admin UI
// would refresh anyway.
func (s *PostgresStore) DeleteVenueAdminPhoto(venueID string, photoID string) error {
	if venueID == "" || photoID == "" {
		return fmt.Errorf("venueId and photoId required")
	}
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM venue_admin_photos WHERE venue_id=$1 AND id=$2`,
		venueID, photoID)
	return err
}

// SetVenuePostPhotoHidden toggles the per-venue hide flag for a post photo.
// Idempotent: setting hidden=true twice leaves one row; false always clears.
func (s *PostgresStore) SetVenuePostPhotoHidden(venueID string, postID string, hidden bool) error {
	if venueID == "" || postID == "" {
		return fmt.Errorf("venueId and postId required")
	}
	if hidden {
		_, err := s.pool.Exec(s.ctx(),
			`INSERT INTO venue_post_photo_hides (venue_id, post_id)
			 VALUES ($1,$2)
			 ON CONFLICT (venue_id, post_id) DO NOTHING`,
			venueID, postID)
		return err
	}
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM venue_post_photo_hides WHERE venue_id=$1 AND post_id=$2`,
		venueID, postID)
	return err
}

func (s *PostgresStore) CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error) {
	// Verify venue exists
	venue, err := s.GetVenue(input.VenueID)
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("venue not found")
	}

	// Get user profile
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("user not found")
	}

	// Validate pet IDs
	petNames := make([]string, 0, len(input.PetIDs))
	validPetIDs := make([]string, 0, len(input.PetIDs))
	for _, petID := range input.PetIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreVenue{}, fmt.Errorf("select at least one of your pets")
	}

	// Delete old check-in for this user at this venue
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM venue_check_ins WHERE venue_id = $1 AND user_id = $2`,
		input.VenueID, userID)

	// Insert new check-in
	userName := strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName)
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO venue_check_ins (venue_id, user_id, user_name, avatar_url, pet_ids, pet_names, pet_count)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		input.VenueID, userID, userName, user.Profile.AvatarURL,
		validPetIDs, petNames, len(validPetIDs))
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("check in: %w", err)
	}

	// Return updated venue
	venue.CurrentCheckIns = s.getVenueCheckIns(input.VenueID)
	return *venue, nil
}

func (s *PostgresStore) ListEvents() []domain.ExploreEvent {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, title, description, city_label, venue_id, venue_name,
		        starts_at, COALESCE(ends_at, starts_at), audience, pet_focus,
		        attendee_count
		 FROM events ORDER BY starts_at`)
	if err != nil {
		return []domain.ExploreEvent{}
	}
	defer rows.Close()

	events := make([]domain.ExploreEvent, 0)
	for rows.Next() {
		var e domain.ExploreEvent
		var startsAt, endsAt time.Time
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.CityLabel,
			&e.VenueID, &e.VenueName, &startsAt, &endsAt,
			&e.Audience, &e.PetFocus, &e.AttendeeCount); err != nil {
			continue
		}
		e.StartsAt = startsAt.Format(time.RFC3339)
		e.EndsAt = endsAt.Format(time.RFC3339)
		e.Attendees = s.getEventAttendees(e.ID)
		events = append(events, e)
	}
	return events
}

func (s *PostgresStore) UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error) {
	if eventID == "" {
		eventID = newID("event")
	}

	var venueName *string
	if input.VenueID != nil {
		var name string
		nameErr := s.pool.QueryRow(s.ctx(),
			`SELECT name FROM venues WHERE id = $1`, *input.VenueID).Scan(&name)
		if nameErr == nil {
			venueName = &name
		}
	}

	startsAt := time.Now().UTC()
	if input.StartsAt != "" {
		if t, err := time.Parse(time.RFC3339, input.StartsAt); err == nil {
			startsAt = t
		}
	}

	var endsAt *time.Time
	if input.EndsAt != "" {
		if t, err := time.Parse(time.RFC3339, input.EndsAt); err == nil {
			endsAt = &t
		}
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO events (id, title, description, city_label, venue_id, venue_name,
		     starts_at, ends_at, audience, pet_focus)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   title=EXCLUDED.title, description=EXCLUDED.description, city_label=EXCLUDED.city_label,
		   venue_id=EXCLUDED.venue_id, venue_name=EXCLUDED.venue_name,
		   starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
		   audience=EXCLUDED.audience, pet_focus=EXCLUDED.pet_focus`,
		eventID, input.Title, input.Description, input.CityLabel,
		input.VenueID, venueName, startsAt, endsAt, input.Audience, input.PetFocus)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("upsert event: %w", err)
	}

	event := domain.ExploreEvent{
		ID:          eventID,
		Title:       input.Title,
		Description: input.Description,
		CityLabel:   input.CityLabel,
		VenueID:     input.VenueID,
		VenueName:   venueName,
		StartsAt:    startsAt.Format(time.RFC3339),
		Audience:    input.Audience,
		PetFocus:    input.PetFocus,
		Attendees:   s.getEventAttendees(eventID),
	}
	if endsAt != nil {
		event.EndsAt = endsAt.Format(time.RFC3339)
	}
	event.AttendeeCount = len(event.Attendees)
	return event, nil
}

func (s *PostgresStore) DeleteEvent(eventID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM events WHERE id = $1`, eventID)
	if err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("event not found")
	}
	return nil
}

func (s *PostgresStore) RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error) {
	// Get event
	var e domain.ExploreEvent
	var startsAt time.Time
	var endsAt *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, title, description, city_label, venue_id, venue_name,
		        starts_at, ends_at, audience, pet_focus, attendee_count
		 FROM events WHERE id = $1`, eventID).
		Scan(&e.ID, &e.Title, &e.Description, &e.CityLabel,
			&e.VenueID, &e.VenueName, &startsAt, &endsAt,
			&e.Audience, &e.PetFocus, &e.AttendeeCount)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("event not found")
	}
	e.StartsAt = startsAt.Format(time.RFC3339)
	if endsAt != nil {
		e.EndsAt = endsAt.Format(time.RFC3339)
	}

	user, err := s.GetUser(userID)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("user not found")
	}
	if e.Audience == "women-only" && user.Profile.Gender != "woman" {
		return domain.ExploreEvent{}, fmt.Errorf("this event is reserved for women")
	}

	// Validate pets
	petNames := make([]string, 0, len(petIDs))
	validPetIDs := make([]string, 0, len(petIDs))
	for _, petID := range petIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		if e.PetFocus == "dogs-only" && pet.SpeciesLabel != "Dog" {
			continue
		}
		if e.PetFocus == "cats-only" && pet.SpeciesLabel != "Cat" {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreEvent{}, fmt.Errorf("select pets that match this event")
	}

	// Remove existing RSVP and add new one
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, eventID, userID)

	userName := strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName)
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO event_rsvps (event_id, user_id, user_name, avatar_url, pet_ids, pet_names)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		eventID, userID, userName, user.Profile.AvatarURL, validPetIDs, petNames)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("rsvp event: %w", err)
	}

	// Update attendee count
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM event_rsvps WHERE event_id = $1`, eventID).Scan(&count)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE events SET attendee_count = $2 WHERE id = $1`, eventID, count)

	e.Attendees = s.getEventAttendees(eventID)
	e.AttendeeCount = len(e.Attendees)
	return e, nil
}

func (s *PostgresStore) ListVenueReviews(venueID string) []domain.VenueReview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, venue_id, user_id, user_name, rating, comment, created_at
		 FROM venue_reviews WHERE venue_id = $1 ORDER BY created_at DESC`, venueID)
	if err != nil {
		return []domain.VenueReview{}
	}
	defer rows.Close()

	reviews := make([]domain.VenueReview, 0)
	for rows.Next() {
		var r domain.VenueReview
		var createdAt time.Time
		if err := rows.Scan(&r.ID, &r.VenueID, &r.UserID, &r.UserName,
			&r.Rating, &r.Comment, &createdAt); err != nil {
			continue
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		reviews = append(reviews, r)
	}
	return reviews
}

func (s *PostgresStore) CreateVenueReview(review domain.VenueReview) domain.VenueReview {
	review.ID = newID("review")
	review.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO venue_reviews (id, venue_id, user_id, user_name, rating, comment, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		review.ID, review.VenueID, review.UserID, review.UserName,
		review.Rating, review.Comment, time.Now().UTC())
	return review
}

// GetVenueStats returns aggregate metrics for a venue used in the detail page
// and card rating summary. Active window = last 1 hour (agreed product spec).
func (s *PostgresStore) GetVenueStats(venueID string) domain.VenueStats {
	var stats domain.VenueStats

	// Check-in aggregates.
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT
		   COUNT(*)::int AS total,
		   COUNT(DISTINCT user_id)::int AS uniq,
		   COUNT(*) FILTER (WHERE checked_in_at > NOW() - INTERVAL '1 hour')::int AS active
		 FROM venue_check_ins WHERE venue_id = $1`, venueID).
		Scan(&stats.CheckInCount, &stats.UniqueVisitorCount, &stats.ActiveCheckInCount)

	// Rating aggregates + distribution in a single scan.
	var avg sql.NullFloat64
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT
		   COALESCE(AVG(rating), 0),
		   COUNT(*)::int,
		   COUNT(*) FILTER (WHERE rating = 1)::int,
		   COUNT(*) FILTER (WHERE rating = 2)::int,
		   COUNT(*) FILTER (WHERE rating = 3)::int,
		   COUNT(*) FILTER (WHERE rating = 4)::int,
		   COUNT(*) FILTER (WHERE rating = 5)::int
		 FROM venue_reviews WHERE venue_id = $1`, venueID).
		Scan(&avg, &stats.ReviewCount,
			&stats.RatingDistribution.One, &stats.RatingDistribution.Two,
			&stats.RatingDistribution.Three, &stats.RatingDistribution.Four,
			&stats.RatingDistribution.Five)
	if avg.Valid {
		stats.AvgRating = avg.Float64
	}

	return stats
}

// ListVenueCheckInsScoped returns check-ins for a venue filtered by mode:
//   - "active":  last 1 hour
//   - "history": latest row per user (distinct users, most recent visit each)
//   - "all":     every row, newest first
func (s *PostgresStore) ListVenueCheckInsScoped(venueID string, mode string, limit int) []domain.VenueCheckIn {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var query string
	switch mode {
	case "active":
		query = `SELECT user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		         FROM venue_check_ins
		         WHERE venue_id = $1 AND checked_in_at > NOW() - INTERVAL '1 hour'
		         ORDER BY checked_in_at DESC
		         LIMIT $2`
	case "history":
		query = `SELECT user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		         FROM (
		           SELECT DISTINCT ON (user_id)
		             user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		           FROM venue_check_ins
		           WHERE venue_id = $1
		           ORDER BY user_id, checked_in_at DESC
		         ) t
		         ORDER BY checked_in_at DESC
		         LIMIT $2`
	default: // "all"
		query = `SELECT user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		         FROM venue_check_ins
		         WHERE venue_id = $1
		         ORDER BY checked_in_at DESC
		         LIMIT $2`
	}

	rows, err := s.pool.Query(s.ctx(), query, venueID, limit)
	if err != nil {
		return []domain.VenueCheckIn{}
	}
	defer rows.Close()

	list := make([]domain.VenueCheckIn, 0)
	for rows.Next() {
		var ci domain.VenueCheckIn
		var checkedInAt time.Time
		if err := rows.Scan(&ci.UserID, &ci.UserName, &ci.AvatarURL,
			&ci.PetIDs, &ci.PetNames, &ci.PetCount, &checkedInAt); err != nil {
			continue
		}
		ci.CheckedInAt = checkedInAt.Format(time.RFC3339)
		if ci.PetIDs == nil {
			ci.PetIDs = []string{}
		}
		if ci.PetNames == nil {
			ci.PetNames = []string{}
		}
		list = append(list, ci)
	}
	return list
}

// ListVenuePostsWithPhotos returns post-derived photos tagged to a venue.
func (s *PostgresStore) ListVenuePostsWithPhotos(venueID string, limit int) []domain.VenuePhotoFeedItem {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.image_url, p.author_user_id,
		        COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), '') AS author_name,
		        p.created_at
		 FROM posts p
		 LEFT JOIN user_profiles u ON u.user_id = p.author_user_id
		 WHERE p.venue_id = $1 AND p.image_url IS NOT NULL AND p.image_url <> ''
		 ORDER BY p.created_at DESC
		 LIMIT $2`, venueID, limit)
	if err != nil {
		return []domain.VenuePhotoFeedItem{}
	}
	defer rows.Close()

	out := make([]domain.VenuePhotoFeedItem, 0)
	for rows.Next() {
		var item domain.VenuePhotoFeedItem
		var imageURL sql.NullString
		var createdAt time.Time
		if err := rows.Scan(&item.PostID, &imageURL, &item.AuthorUserID,
			&item.AuthorName, &createdAt); err != nil {
			continue
		}
		if !imageURL.Valid || imageURL.String == "" {
			continue
		}
		item.ImageURL = imageURL.String
		item.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, item)
	}
	return out
}

// UserHasCheckedIn gates review creation: only visitors can review.
func (s *PostgresStore) UserHasCheckedIn(venueID string, userID string) bool {
	var exists bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS (SELECT 1 FROM venue_check_ins WHERE venue_id = $1 AND user_id = $2)`,
		venueID, userID).Scan(&exists)
	return exists
}

// UserHasReviewed prevents duplicate reviews from the same user on the same venue.
func (s *PostgresStore) UserHasReviewed(venueID string, userID string) bool {
	var exists bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS (SELECT 1 FROM venue_reviews WHERE venue_id = $1 AND user_id = $2)`,
		venueID, userID).Scan(&exists)
	return exists
}

func (s *PostgresStore) CreateReport(reporterID string, reporterName string, reason string, targetType string, targetID string, targetLabel string) (domain.ReportSummary, error) {
	// Check for existing report by same reporter on same target within 2 hours
	var existingID string
	var existingCreatedAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, created_at FROM reports
		 WHERE reporter_id = $1 AND target_id = $2 AND target_type = $3
		 AND created_at > NOW() - INTERVAL '2 hours'
		 ORDER BY created_at DESC LIMIT 1`,
		reporterID, targetID, targetType).Scan(&existingID, &existingCreatedAt)

	if err == nil {
		// Report exists within cooldown — update the reason instead of creating new
		_, _ = s.pool.Exec(s.ctx(), `UPDATE reports SET reason = $1 WHERE id = $2`, reason, existingID)
		return domain.ReportSummary{
			ID:           existingID,
			Reason:       reason,
			ReporterID:   reporterID,
			ReporterName: reporterName,
			TargetType:   targetType,
			TargetID:     targetID,
			TargetLabel:  targetLabel,
			Status:       "open",
			CreatedAt:    existingCreatedAt.Format(time.RFC3339),
			Updated:      true,
		}, nil
	}

	// No recent report — create new one
	report := domain.ReportSummary{
		ID:           newID("report"),
		Reason:       reason,
		ReporterID:   reporterID,
		ReporterName: reporterName,
		TargetType:   targetType,
		TargetID:     targetID,
		TargetLabel:  targetLabel,
		Status:       "open",
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO reports (id, reporter_id, reporter_name, reason, target_type, target_id, target_label, status, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		report.ID, reporterID, reporterName, reason, targetType, targetID, targetLabel, "open", time.Now().UTC())

	return report, nil
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

// scanPetRows scans pet rows and returns a slice (without photos).
func (s *PostgresStore) scanPetRows(rows pgx.Rows) []domain.Pet {
	pets := make([]domain.Pet, 0)
	for rows.Next() {
		var p domain.Pet
		var themeColor *string
		if err := rows.Scan(
			&p.ID, &p.OwnerID, &p.Name, &p.AgeYears, &p.Gender, &p.BirthDate,
			&p.SpeciesID, &p.SpeciesLabel, &p.BreedID, &p.BreedLabel,
			&p.ActivityLevel, &p.Hobbies, &p.GoodWith, &p.Characters,
			&p.IsNeutered, &p.Bio, &p.CityLabel, &p.IsHidden, &themeColor,
		); err != nil {
			continue
		}
		if themeColor != nil {
			p.ThemeColor = *themeColor
		}
		if p.Hobbies == nil {
			p.Hobbies = []string{}
		}
		if p.GoodWith == nil {
			p.GoodWith = []string{}
		}
		if p.Characters == nil {
			p.Characters = []string{}
		}
		p.Photos = []domain.PetPhoto{}
		pets = append(pets, p)
	}
	return pets
}

// attachPhotos fetches and attaches photos to a slice of pets.
func (s *PostgresStore) attachPhotos(pets []domain.Pet) {
	if len(pets) == 0 {
		return
	}
	ids := make([]string, len(pets))
	for i, p := range pets {
		ids[i] = p.ID
	}
	photoMap := s.fetchPhotosForPets(ids)
	for i := range pets {
		if photos, ok := photoMap[pets[i].ID]; ok {
			pets[i].Photos = photos
		}
	}
}

// fetchPhotosForPets returns a map of petID -> photos for the given pet IDs.
func (s *PostgresStore) fetchPhotosForPets(petIDs []string) map[string][]domain.PetPhoto {
	result := make(map[string][]domain.PetPhoto)
	if len(petIDs) == 0 {
		return result
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, pet_id, url, is_primary
		 FROM pet_photos
		 WHERE pet_id = ANY($1)
		 ORDER BY display_order`, petIDs)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var photo domain.PetPhoto
		var petID string
		if err := rows.Scan(&photo.ID, &petID, &photo.URL, &photo.IsPrimary); err != nil {
			continue
		}
		result[petID] = append(result[petID], photo)
	}
	return result
}

// getPetByID returns a single pet with photos, or nil.
func (s *PostgresStore) getPetByID(petID string) *domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE id = $1`, petID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	if len(pets) == 0 {
		return nil
	}
	s.attachPhotos(pets)
	return &pets[0]
}

// getUserPetIDs returns all pet IDs owned by the given user.
func (s *PostgresStore) getUserPetIDs(userID string) []string {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id FROM pets WHERE owner_id = $1`, userID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids
}

// containsStr checks if a string slice contains a given string.
func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

// getOwnerInfo returns the first_name and avatar_url for a given user.
func (s *PostgresStore) getOwnerInfo(userID string) (string, string) {
	var name string
	var avatar *string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name, avatar_url FROM user_profiles WHERE user_id = $1`, userID).Scan(&name, &avatar)
	avatarStr := ""
	if avatar != nil {
		avatarStr = *avatar
	}
	// Fall back to the shelters table for adoption chats — the counterpart
	// might be a shelter account, which has a name + logo_url but no
	// row in user_profiles.
	if name == "" {
		var shelterName string
		var logo sql.NullString
		if err := s.pool.QueryRow(s.ctx(),
			`SELECT name, logo_url FROM shelters WHERE id = $1`, userID).
			Scan(&shelterName, &logo); err == nil {
			name = shelterName
			if logo.Valid && avatarStr == "" {
				avatarStr = logo.String
			}
		}
	}
	return name, avatarStr
}

// findConvIDByUsers finds an existing 1-on-1 **match** conversation between
// the two users.
//
// Filters:
//   - `array_length = 2` excludes multi-user group chats (earlier bug:
//     a 3-person "Test Group" would get attached to a new match).
//   - `COALESCE(match_id,'') <> ''` excludes playdate group conversations
//     that happen to have exactly two attendees (host + one guest).
//     Playdate conversations are created with match_id='' — pgstore.go:302.
//     Match conversations always carry the matchID — pgstore.go:1855-1858.
//     Without this filter, two users who did a 1-on-1 playdate together and
//     then later matched would have their brand-new match DM wired to the
//     OLD playdate chat, so tapping the match opened a stale playdate thread.
func (s *PostgresStore) findConvIDByUsers(user1ID string, user2ID string) string {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id FROM conversations
		 WHERE user_ids @> $1::text[] AND user_ids @> $2::text[]
		   AND array_length(user_ids, 1) = 2
		   AND COALESCE(match_id, '') <> ''
		 LIMIT 1`,
		[]string{user1ID}, []string{user2ID}).Scan(&convID)
	if err != nil {
		return ""
	}
	return convID
}

// getConversation returns a full conversation with messages and pet pairs.
func (s *PostgresStore) getConversation(convID string, viewerUserID string) *domain.Conversation {
	var c domain.Conversation
	var lastMsgAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, match_id, title, subtitle, unread_count, last_message_at, user_ids
		 FROM conversations WHERE id = $1`, convID).
		Scan(&c.ID, &c.MatchID, &c.Title, &c.Subtitle, &c.UnreadCount, &lastMsgAt, &c.UserIDs)
	if err != nil {
		return nil
	}
	c.LastMessageAt = lastMsgAt.Format(time.RFC3339)
	c.MatchPetPairs = s.getMatchPetPairs(convID)
	c.Messages = []domain.Message{}
	return &c
}

// getMatchPetPairs returns pet pairs for a conversation.
func (s *PostgresStore) getMatchPetPairs(conversationID string) []domain.MatchPetPair {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT my_pet_id, COALESCE(my_pet_name,''), COALESCE(my_pet_photo_url,''),
		        matched_pet_id, COALESCE(matched_pet_name,''), COALESCE(matched_pet_photo_url,'')
		 FROM match_pet_pairs WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return []domain.MatchPetPair{}
	}
	defer rows.Close()

	pairs := make([]domain.MatchPetPair, 0)
	for rows.Next() {
		var p domain.MatchPetPair
		if err := rows.Scan(&p.MyPetID, &p.MyPetName, &p.MyPetPhotoURL,
			&p.MatchedPetID, &p.MatchedPetName, &p.MatchedPetPhotoURL); err != nil {
			continue
		}
		pairs = append(pairs, p)
	}
	return pairs
}

// matchesForPet returns matches involving a given pet.
func (s *PostgresStore) matchesForPet(petID string) []domain.MatchPreview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, pet_a_id, pet_b_id, matched_owner_name,
		        COALESCE(matched_owner_avatar_url,''), last_message_preview,
		        unread_count, status, conversation_id, created_at
		 FROM matches
		 WHERE pet_a_id = $1 OR pet_b_id = $1
		 ORDER BY created_at DESC`, petID)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}
		m.Pet = *petA
		m.MatchedPet = *petB
		matches = append(matches, m)
	}
	return matches
}

// getVenueCheckIns returns current check-ins for a venue.
func (s *PostgresStore) getVenueCheckIns(venueID string) []domain.VenueCheckIn {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		 FROM venue_check_ins WHERE venue_id = $1
		 ORDER BY checked_in_at DESC`, venueID)
	if err != nil {
		return []domain.VenueCheckIn{}
	}
	defer rows.Close()

	checkIns := make([]domain.VenueCheckIn, 0)
	for rows.Next() {
		var ci domain.VenueCheckIn
		var checkedInAt time.Time
		if err := rows.Scan(&ci.UserID, &ci.UserName, &ci.AvatarURL,
			&ci.PetIDs, &ci.PetNames, &ci.PetCount, &checkedInAt); err != nil {
			continue
		}
		ci.CheckedInAt = checkedInAt.Format(time.RFC3339)
		if ci.PetIDs == nil {
			ci.PetIDs = []string{}
		}
		if ci.PetNames == nil {
			ci.PetNames = []string{}
		}
		checkIns = append(checkIns, ci)
	}
	return checkIns
}

// getEventAttendees returns attendees for an event.
func (s *PostgresStore) getEventAttendees(eventID string) []domain.VenueCheckIn {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT user_id, user_name, avatar_url, pet_ids, pet_names, rsvp_at
		 FROM event_rsvps WHERE event_id = $1
		 ORDER BY rsvp_at`, eventID)
	if err != nil {
		return []domain.VenueCheckIn{}
	}
	defer rows.Close()

	attendees := make([]domain.VenueCheckIn, 0)
	for rows.Next() {
		var a domain.VenueCheckIn
		var rsvpAt time.Time
		if err := rows.Scan(&a.UserID, &a.UserName, &a.AvatarURL,
			&a.PetIDs, &a.PetNames, &rsvpAt); err != nil {
			continue
		}
		a.PetCount = len(a.PetIDs)
		a.CheckedInAt = rsvpAt.Format(time.RFC3339)
		if a.PetIDs == nil {
			a.PetIDs = []string{}
		}
		if a.PetNames == nil {
			a.PetNames = []string{}
		}
		attendees = append(attendees, a)
	}
	return attendees
}

// scanPosts scans a set of post rows and enriches them with tagged pets and like state.
func (s *PostgresStore) scanPosts(rows pgx.Rows, viewerUserID string) []domain.HomePost {
	posts := make([]domain.HomePost, 0)
	for rows.Next() {
		var post domain.HomePost
		var profileCreatedAt, postCreatedAt time.Time
		if err := rows.Scan(
			&post.ID, &post.Body, &post.ImageURL, &post.VenueID, &post.VenueName,
			&post.EventID, &post.EventName, &post.LikeCount, &postCreatedAt,
			&post.Author.ID, &post.Author.Email, &post.Author.FirstName,
			&post.Author.LastName, &post.Author.BirthDate, &post.Author.Gender,
			&post.Author.CityID, &post.Author.CityLabel, &post.Author.AvatarURL,
			&post.Author.Bio, &post.Author.IsVisibleOnMap, &post.Author.Status,
			&profileCreatedAt,
		); err != nil {
			continue
		}
		post.CreatedAt = postCreatedAt.Format(time.RFC3339)
		post.Author.CreatedAt = profileCreatedAt.Format(time.RFC3339)
		post.TaggedPets = s.getTaggedPets(post.ID)
		if viewerUserID != "" {
			var liked bool
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2)`,
				post.ID, viewerUserID).Scan(&liked)
			post.LikedByMe = liked
		}
		posts = append(posts, post)
	}
	return posts
}

// getTaggedPets returns pets tagged in a post.
func (s *PostgresStore) getTaggedPets(postID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
		        p.species_id, p.species_label, p.breed_id, p.breed_label,
		        p.activity_level, p.hobbies, p.good_with, p.characters,
		        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color
		 FROM pets p
		 JOIN post_tagged_pets t ON t.pet_id = p.id
		 WHERE t.post_id = $1`, postID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

// getPostByID fetches a single post with full enrichment.
func (s *PostgresStore) getPostByID(postID string, viewerUserID string) *domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.id = $1`, postID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	posts := s.scanPosts(rows, viewerUserID)
	if len(posts) == 0 {
		return nil
	}
	return &posts[0]
}

// scanReportRow scans a single report row from the given Rows iterator.
func (s *PostgresStore) scanReportRow(rows pgx.Rows) domain.ReportSummary {
	var r domain.ReportSummary
	var resolvedAt *time.Time
	var createdAt time.Time
	var notes *string
	_ = rows.Scan(&r.ID, &r.ReporterID, &r.ReporterName, &r.Reason,
		&r.TargetType, &r.TargetID, &r.TargetLabel,
		&r.Status, &notes, &resolvedAt, &createdAt)
	r.CreatedAt = createdAt.Format(time.RFC3339)
	if notes != nil {
		r.Notes = *notes
	}
	if resolvedAt != nil {
		r.ResolvedAt = resolvedAt.Format(time.RFC3339)
	}
	return r
}

// countRows returns count of all rows in a table.
func (s *PostgresStore) countRows(table string, _ string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s`, table)).Scan(&count)
	return count
}

// countRowsWhere returns count of rows matching a condition.
func (s *PostgresStore) countRowsWhere(table string, where string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s`, table, where)).Scan(&count)
	return count
}

// countRowsBetween returns count of rows with col between start and end.
func (s *PostgresStore) countRowsBetween(table string, col string, start, end time.Time) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s >= $1 AND %s < $2`, table, col, col),
		start, end).Scan(&count)
	return count
}

// countRowsBetweenWhere returns count of rows with col between start and end with extra where.
func (s *PostgresStore) countRowsBetweenWhere(table string, col string, start, end time.Time, extraWhere string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s >= $1 AND %s < $2 AND %s`, table, col, col, extraWhere),
		start, end).Scan(&count)
	return count
}

// ================================================================
// Health & Wellness
// ================================================================

func (s *PostgresStore) ListHealthRecords(petID string) []domain.HealthRecord {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, type, title, date, notes, next_due_date, created_at FROM health_records WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.HealthRecord
	for rows.Next() {
		var r domain.HealthRecord
		var ndd *string
		rows.Scan(&r.ID, &r.PetID, &r.Type, &r.Title, &r.Date, &r.Notes, &ndd, &r.CreatedAt)
		if ndd != nil { r.NextDueDate = *ndd }
		out = append(out, r)
	}
	if out == nil { return []domain.HealthRecord{} }
	return out
}

func (s *PostgresStore) CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord {
	record.ID = newID("hr")
	record.PetID = petID
	if record.CreatedAt == "" { record.CreatedAt = time.Now().UTC().Format(time.RFC3339) }
	s.pool.Exec(s.ctx(), `INSERT INTO health_records(id,pet_id,type,title,date,notes,next_due_date,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		record.ID, record.PetID, record.Type, record.Title, record.Date, record.Notes, nilIfEmpty(record.NextDueDate), record.CreatedAt)
	return record
}

func (s *PostgresStore) DeleteHealthRecord(petID string, recordID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM health_records WHERE id=$1 AND pet_id=$2`, recordID, petID)
	return err
}

// ── Health Profile (allergies / dietary restrictions / emergency notes) ──
// Single row per pet. Created lazily on first PUT — no row means "empty".

func (s *PostgresStore) GetHealthProfile(petID string) domain.PetHealthProfile {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT pet_id, allergies, dietary_restrictions, emergency_notes, to_char((updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM pet_health_profiles WHERE pet_id=$1`, petID)
	var p domain.PetHealthProfile
	if err := row.Scan(&p.PetID, &p.Allergies, &p.DietaryRestrictions, &p.EmergencyNotes, &p.UpdatedAt); err != nil {
		// No row yet — return an empty profile so the client can render the
		// "add your first allergy" empty state without a 404 dance.
		return domain.PetHealthProfile{
			PetID:               petID,
			Allergies:           []string{},
			DietaryRestrictions: []string{},
		}
	}
	if p.Allergies == nil {
		p.Allergies = []string{}
	}
	if p.DietaryRestrictions == nil {
		p.DietaryRestrictions = []string{}
	}
	return p
}

func (s *PostgresStore) UpsertHealthProfile(petID string, profile domain.PetHealthProfile) domain.PetHealthProfile {
	profile.PetID = petID
	if profile.Allergies == nil {
		profile.Allergies = []string{}
	}
	if profile.DietaryRestrictions == nil {
		profile.DietaryRestrictions = []string{}
	}
	profile.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(),
		`INSERT INTO pet_health_profiles(pet_id, allergies, dietary_restrictions, emergency_notes, updated_at)
		 VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT (pet_id) DO UPDATE SET
		   allergies = EXCLUDED.allergies,
		   dietary_restrictions = EXCLUDED.dietary_restrictions,
		   emergency_notes = EXCLUDED.emergency_notes,
		   updated_at = EXCLUDED.updated_at`,
		profile.PetID, profile.Allergies, profile.DietaryRestrictions, profile.EmergencyNotes, profile.UpdatedAt)
	return profile
}

// ── Symptom Logs ────────────────────────────────────────────────────

func (s *PostgresStore) ListSymptomLogs(petID string) []domain.SymptomLog {
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT id, pet_id, categories, severity, duration_hours, notes, photo_url,
		        to_char((occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM pet_symptom_logs WHERE pet_id=$1 ORDER BY occurred_at DESC`, petID)
	defer rows.Close()
	var out []domain.SymptomLog
	for rows.Next() {
		var l domain.SymptomLog
		var photo *string
		rows.Scan(&l.ID, &l.PetID, &l.Categories, &l.Severity, &l.DurationHours, &l.Notes, &photo, &l.OccurredAt, &l.CreatedAt)
		if photo != nil {
			l.PhotoURL = *photo
		}
		if l.Categories == nil {
			l.Categories = []string{}
		}
		out = append(out, l)
	}
	if out == nil {
		return []domain.SymptomLog{}
	}
	return out
}

func (s *PostgresStore) CreateSymptomLog(petID string, log domain.SymptomLog) domain.SymptomLog {
	log.ID = newID("sym")
	log.PetID = petID
	if log.Categories == nil {
		log.Categories = []string{}
	}
	if log.OccurredAt == "" {
		log.OccurredAt = time.Now().UTC().Format(time.RFC3339)
	}
	log.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(),
		`INSERT INTO pet_symptom_logs(id, pet_id, categories, severity, duration_hours, notes, photo_url, occurred_at, created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		log.ID, log.PetID, log.Categories, log.Severity, log.DurationHours, log.Notes,
		nilIfEmpty(log.PhotoURL), log.OccurredAt, log.CreatedAt)
	return log
}

func (s *PostgresStore) DeleteSymptomLog(petID string, logID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM pet_symptom_logs WHERE id=$1 AND pet_id=$2`, logID, petID)
	return err
}

// ── Medications ─────────────────────────────────────────────────────

func (s *PostgresStore) ListMedications(petID string) []domain.PetMedication {
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT id, pet_id, name, dosage, notes, time_of_day, days_of_week,
		        timezone, start_date, end_date, last_given_at, active, to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM pet_medications WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.PetMedication
	for rows.Next() {
		var m domain.PetMedication
		var lastGiven *time.Time
		var dow16 []int16
		if err := rows.Scan(&m.ID, &m.PetID, &m.Name, &m.Dosage, &m.Notes,
			&m.TimeOfDay, &dow16, &m.Timezone, &m.StartDate, &m.EndDate,
			&lastGiven, &m.Active, &m.CreatedAt); err != nil {
			continue
		}
		if lastGiven != nil {
			m.LastGivenAt = lastGiven.UTC().Format(time.RFC3339)
		}
		m.DaysOfWeek = make([]int, len(dow16))
		for i, v := range dow16 {
			m.DaysOfWeek[i] = int(v)
		}
		out = append(out, m)
	}
	if out == nil {
		return []domain.PetMedication{}
	}
	return out
}

func (s *PostgresStore) CreateMedication(petID string, med domain.PetMedication) domain.PetMedication {
	med.ID = newID("med")
	med.PetID = petID
	med.Active = true
	if med.DaysOfWeek == nil {
		med.DaysOfWeek = []int{}
	}
	if med.Timezone == "" {
		med.Timezone = "UTC"
	}
	med.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	dow16 := make([]int16, len(med.DaysOfWeek))
	for i, v := range med.DaysOfWeek {
		dow16[i] = int16(v)
	}
	s.pool.Exec(s.ctx(),
		`INSERT INTO pet_medications(id, pet_id, name, dosage, notes, time_of_day,
		   days_of_week, timezone, start_date, end_date, active, created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		med.ID, med.PetID, med.Name, med.Dosage, med.Notes, med.TimeOfDay,
		dow16, med.Timezone, med.StartDate, med.EndDate, med.Active, med.CreatedAt)
	return med
}

func (s *PostgresStore) UpdateMedication(petID string, medID string, patch domain.PetMedication) (domain.PetMedication, error) {
	if patch.DaysOfWeek == nil {
		patch.DaysOfWeek = []int{}
	}
	dow16 := make([]int16, len(patch.DaysOfWeek))
	for i, v := range patch.DaysOfWeek {
		dow16[i] = int16(v)
	}
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE pet_medications SET
		   name = COALESCE(NULLIF($3,''), name),
		   dosage = $4,
		   notes = $5,
		   time_of_day = COALESCE(NULLIF($6,''), time_of_day),
		   days_of_week = $7,
		   timezone = COALESCE(NULLIF($8,''), timezone),
		   start_date = COALESCE(NULLIF($9,''), start_date),
		   end_date = $10,
		   active = $11
		 WHERE id=$1 AND pet_id=$2`,
		medID, petID, patch.Name, patch.Dosage, patch.Notes, patch.TimeOfDay,
		dow16, patch.Timezone, patch.StartDate, patch.EndDate, patch.Active)
	if err != nil || tag.RowsAffected() == 0 {
		return domain.PetMedication{}, fmt.Errorf("medication not found")
	}
	// Return the fresh row.
	for _, m := range s.ListMedications(petID) {
		if m.ID == medID {
			return m, nil
		}
	}
	return domain.PetMedication{}, fmt.Errorf("medication not found after update")
}

func (s *PostgresStore) DeleteMedication(petID string, medID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM pet_medications WHERE id=$1 AND pet_id=$2`, medID, petID)
	return err
}

func (s *PostgresStore) MarkMedicationGiven(petID string, medID string) (domain.PetMedication, error) {
	now := time.Now().UTC()
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE pet_medications SET last_given_at=$3 WHERE id=$1 AND pet_id=$2`,
		medID, petID, now)
	if err != nil || tag.RowsAffected() == 0 {
		return domain.PetMedication{}, fmt.Errorf("medication not found")
	}
	for _, m := range s.ListMedications(petID) {
		if m.ID == medID {
			return m, nil
		}
	}
	return domain.PetMedication{}, fmt.Errorf("medication not found after mark-given")
}

func (s *PostgresStore) ListActiveMedicationsForSweeper() []MedicationSweeperRow {
	rows, _ := s.pool.Query(s.ctx(), `
		SELECT m.id, m.pet_id, p.owner_id, p.name AS pet_name,
		       m.name, m.dosage, m.time_of_day, m.days_of_week,
		       m.timezone, m.start_date, m.end_date, m.last_push_date
		FROM pet_medications m
		JOIN pets p ON p.id = m.pet_id
		WHERE m.active = TRUE
		  AND m.timezone <> ''
		  AND m.time_of_day <> ''`)
	defer rows.Close()
	out := make([]MedicationSweeperRow, 0)
	for rows.Next() {
		var r MedicationSweeperRow
		var dow16 []int16
		if err := rows.Scan(&r.MedID, &r.PetID, &r.OwnerID, &r.PetName,
			&r.Name, &r.Dosage, &r.TimeOfDay, &dow16,
			&r.Timezone, &r.StartDate, &r.EndDate, &r.LastPushDate); err != nil {
			continue
		}
		r.DaysOfWeek = make([]int, len(dow16))
		for i, v := range dow16 {
			r.DaysOfWeek[i] = int(v)
		}
		out = append(out, r)
	}
	return out
}

func (s *PostgresStore) MarkMedicationPushed(medID string, scheduledDateInTZ string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE pet_medications SET last_push_date=$2 WHERE id=$1`,
		medID, scheduledDateInTZ)
	return err
}

// ── Breed Care Guides ───────────────────────────────────────────────

func (s *PostgresStore) GetBreedCareGuide(speciesID string, breedID string) (*domain.BreedCareGuide, error) {
	// pgx v5 won't scan TIMESTAMPTZ into a Go string — cast to TEXT in
	// the SELECT so the existing string-typed domain fields keep working.
	row := s.pool.QueryRow(s.ctx(),
		`SELECT id, species_id, species_label, breed_id, breed_label, title, summary, body, hero_image_url,
		        to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM breed_care_guides
		 WHERE (breed_id = $1 AND breed_id <> '')
		    OR (breed_id = '' AND species_id = $2)
		 ORDER BY (CASE WHEN breed_id <> '' THEN 0 ELSE 1 END)
		 LIMIT 1`, breedID, speciesID)
	var g domain.BreedCareGuide
	if err := row.Scan(&g.ID, &g.SpeciesID, &g.SpeciesLabel, &g.BreedID, &g.BreedLabel,
		&g.Title, &g.Summary, &g.Body, &g.HeroImageURL, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *PostgresStore) ListBreedCareGuides() []domain.BreedCareGuide {
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT id, species_id, species_label, breed_id, breed_label, title, summary, body, hero_image_url,
		        to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM breed_care_guides ORDER BY species_label, breed_label, title`)
	defer rows.Close()
	out := make([]domain.BreedCareGuide, 0)
	for rows.Next() {
		var g domain.BreedCareGuide
		if err := rows.Scan(&g.ID, &g.SpeciesID, &g.SpeciesLabel, &g.BreedID, &g.BreedLabel,
			&g.Title, &g.Summary, &g.Body, &g.HeroImageURL, &g.CreatedAt, &g.UpdatedAt); err != nil {
			log.Printf("[BREED-CARE] scan error: %v", err)
			continue
		}
		out = append(out, g)
	}
	return out
}

func (s *PostgresStore) UpsertBreedCareGuide(g domain.BreedCareGuide) (domain.BreedCareGuide, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	g.UpdatedAt = now
	if g.ID == "" {
		g.ID = newID("bcg")
		g.CreatedAt = now
		// Use INSERT … ON CONFLICT to upsert by (species_id, breed_id) so the
		// admin can't accidentally create a duplicate row for the same pair.
		_, err := s.pool.Exec(s.ctx(),
			`INSERT INTO breed_care_guides
			   (id, species_id, species_label, breed_id, breed_label, title, summary, body, hero_image_url, created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			 ON CONFLICT (species_id, breed_id) DO UPDATE SET
			   species_label = EXCLUDED.species_label,
			   breed_label   = EXCLUDED.breed_label,
			   title         = EXCLUDED.title,
			   summary       = EXCLUDED.summary,
			   body          = EXCLUDED.body,
			   hero_image_url= EXCLUDED.hero_image_url,
			   updated_at    = EXCLUDED.updated_at
			 RETURNING id`,
			g.ID, g.SpeciesID, g.SpeciesLabel, g.BreedID, g.BreedLabel,
			g.Title, g.Summary, g.Body, g.HeroImageURL, g.CreatedAt, g.UpdatedAt)
		if err != nil {
			return domain.BreedCareGuide{}, err
		}
		// Re-read because ON CONFLICT may have surfaced an existing id.
		row := s.pool.QueryRow(s.ctx(),
			`SELECT id, created_at FROM breed_care_guides WHERE species_id=$1 AND breed_id=$2`,
			g.SpeciesID, g.BreedID)
		_ = row.Scan(&g.ID, &g.CreatedAt)
		return g, nil
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE breed_care_guides SET
		   species_id=$2, species_label=$3, breed_id=$4, breed_label=$5,
		   title=$6, summary=$7, body=$8, hero_image_url=$9, updated_at=$10
		 WHERE id=$1`,
		g.ID, g.SpeciesID, g.SpeciesLabel, g.BreedID, g.BreedLabel,
		g.Title, g.Summary, g.Body, g.HeroImageURL, g.UpdatedAt)
	if err != nil {
		return domain.BreedCareGuide{}, err
	}
	return g, nil
}

func (s *PostgresStore) DeleteBreedCareGuide(id string) error {
	tag, err := s.pool.Exec(s.ctx(), `DELETE FROM breed_care_guides WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("breed care guide not found")
	}
	return nil
}

// ── First-Aid Topics ────────────────────────────────────────────────

func (s *PostgresStore) ListFirstAidTopics() []domain.FirstAidTopic {
	// pgx v5 can't Scan TIMESTAMPTZ into Go string, and Postgres' plain
	// ::TEXT cast emits "2026-04-25 14:09:35+00" which JS new Date()
	// parses inconsistently. to_char with explicit RFC3339 formatting
	// produces "2026-04-25T14:09:35Z" so the mobile + admin clients can
	// `new Date(value)` it without thinking.
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT id, slug, title, severity, summary, body, display_order,
		        to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM first_aid_topics ORDER BY display_order ASC, title ASC`)
	defer rows.Close()
	out := make([]domain.FirstAidTopic, 0)
	for rows.Next() {
		var t domain.FirstAidTopic
		if err := rows.Scan(&t.ID, &t.Slug, &t.Title, &t.Severity, &t.Summary, &t.Body, &t.DisplayOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
			log.Printf("[FIRST-AID] scan error: %v", err)
			continue
		}
		out = append(out, t)
	}
	return out
}

func (s *PostgresStore) GetFirstAidTopic(id string) (*domain.FirstAidTopic, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT id, slug, title, severity, summary, body, display_order,
		        to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM first_aid_topics WHERE id=$1`, id)
	var t domain.FirstAidTopic
	if err := row.Scan(&t.ID, &t.Slug, &t.Title, &t.Severity, &t.Summary, &t.Body, &t.DisplayOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *PostgresStore) UpsertFirstAidTopic(t domain.FirstAidTopic) (domain.FirstAidTopic, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	t.UpdatedAt = now
	if t.Slug == "" {
		t.Slug = slugify(t.Title)
		if t.Slug == "" {
			t.Slug = newID("topic")
		}
	}
	if t.Severity == "" {
		t.Severity = "info"
	}
	if t.ID == "" {
		t.ID = newID("fa")
		t.CreatedAt = now
		_, err := s.pool.Exec(s.ctx(),
			`INSERT INTO first_aid_topics(id, slug, title, severity, summary, body, display_order, created_at, updated_at)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
			 ON CONFLICT (slug) DO UPDATE SET
			   title         = EXCLUDED.title,
			   severity      = EXCLUDED.severity,
			   summary       = EXCLUDED.summary,
			   body          = EXCLUDED.body,
			   display_order = EXCLUDED.display_order,
			   updated_at    = EXCLUDED.updated_at`,
			t.ID, t.Slug, t.Title, t.Severity, t.Summary, t.Body, t.DisplayOrder, t.CreatedAt, t.UpdatedAt)
		if err != nil {
			return domain.FirstAidTopic{}, err
		}
		row := s.pool.QueryRow(s.ctx(), `SELECT id, created_at FROM first_aid_topics WHERE slug=$1`, t.Slug)
		_ = row.Scan(&t.ID, &t.CreatedAt)
		return t, nil
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE first_aid_topics SET
		   slug=$2, title=$3, severity=$4, summary=$5, body=$6, display_order=$7, updated_at=$8
		 WHERE id=$1`,
		t.ID, t.Slug, t.Title, t.Severity, t.Summary, t.Body, t.DisplayOrder, t.UpdatedAt)
	if err != nil {
		return domain.FirstAidTopic{}, err
	}
	return t, nil
}

func (s *PostgresStore) DeleteFirstAidTopic(id string) error {
	tag, err := s.pool.Exec(s.ctx(), `DELETE FROM first_aid_topics WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("first aid topic not found")
	}
	return nil
}

// ── Pet Documents ───────────────────────────────────────────────────

func (s *PostgresStore) ListPetDocuments(petID string) []domain.PetDocument {
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT id, pet_id, kind, title, file_url, file_kind, expires_at, notes, to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM pet_documents WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	out := make([]domain.PetDocument, 0)
	for rows.Next() {
		var d domain.PetDocument
		if err := rows.Scan(&d.ID, &d.PetID, &d.Kind, &d.Title, &d.FileURL, &d.FileKind, &d.ExpiresAt, &d.Notes, &d.CreatedAt); err != nil {
			continue
		}
		out = append(out, d)
	}
	return out
}

func (s *PostgresStore) CreatePetDocument(petID string, doc domain.PetDocument) domain.PetDocument {
	doc.ID = newID("doc")
	doc.PetID = petID
	if doc.Kind == "" {
		doc.Kind = "other"
	}
	if doc.FileKind == "" {
		doc.FileKind = "image"
	}
	doc.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(),
		`INSERT INTO pet_documents(id, pet_id, kind, title, file_url, file_kind, expires_at, notes, created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		doc.ID, doc.PetID, doc.Kind, doc.Title, doc.FileURL, doc.FileKind, doc.ExpiresAt, doc.Notes, doc.CreatedAt)
	return doc
}

func (s *PostgresStore) DeletePetDocument(petID string, docID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM pet_documents WHERE id=$1 AND pet_id=$2`, docID, petID)
	return err
}

// ── Food Items + Meal Logs ──────────────────────────────────────────

func (s *PostgresStore) ListFoodItems(userID string, search string, species string, limit int) []domain.FoodItem {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []any{userID}
	conditions := []string{"(is_public = TRUE OR created_by_user = $1)"}
	if species != "" {
		args = append(args, species)
		conditions = append(conditions, fmt.Sprintf("(species_label = '' OR LOWER(species_label) = LOWER($%d))", len(args)))
	}
	if search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		conditions = append(conditions, fmt.Sprintf("(LOWER(name) LIKE $%d OR LOWER(brand) LIKE $%d)", len(args), len(args)))
	}
	args = append(args, limit)
	q := fmt.Sprintf(`
		SELECT id, name, brand, kind, species_label, kcal_per_100g, is_public, created_by_user, to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM food_items
		WHERE %s
		ORDER BY is_public DESC, name ASC
		LIMIT $%d`, strings.Join(conditions, " AND "), len(args))
	rows, _ := s.pool.Query(s.ctx(), q, args...)
	defer rows.Close()
	out := make([]domain.FoodItem, 0)
	for rows.Next() {
		var f domain.FoodItem
		if err := rows.Scan(&f.ID, &f.Name, &f.Brand, &f.Kind, &f.SpeciesLabel, &f.KcalPer100g, &f.IsPublic, &f.CreatedByUser, &f.CreatedAt); err != nil {
			continue
		}
		out = append(out, f)
	}
	return out
}

func (s *PostgresStore) GetFoodItem(itemID string) (*domain.FoodItem, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT id, name, brand, kind, species_label, kcal_per_100g, is_public, created_by_user, to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM food_items WHERE id=$1`, itemID)
	var f domain.FoodItem
	if err := row.Scan(&f.ID, &f.Name, &f.Brand, &f.Kind, &f.SpeciesLabel, &f.KcalPer100g, &f.IsPublic, &f.CreatedByUser, &f.CreatedAt); err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *PostgresStore) CreateFoodItem(userID string, item domain.FoodItem) domain.FoodItem {
	item.ID = newID("food")
	item.CreatedByUser = userID
	if item.Kind == "" {
		item.Kind = "dry"
	}
	item.IsPublic = false // user-created items stay private; only admins seed public ones
	item.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(),
		`INSERT INTO food_items(id, name, brand, kind, species_label, kcal_per_100g, is_public, created_by_user, created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		item.ID, item.Name, item.Brand, item.Kind, item.SpeciesLabel, item.KcalPer100g, item.IsPublic, item.CreatedByUser, item.CreatedAt)
	return item
}

// AdminListFoodItems returns every food row (public + private) so admins
// can curate the database. The user-facing ListFoodItems still filters by
// (is_public OR own).
func (s *PostgresStore) AdminListFoodItems(search string, species string, limit int) []domain.FoodItem {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	args := []any{}
	conditions := []string{"1=1"}
	if species != "" {
		args = append(args, species)
		conditions = append(conditions, fmt.Sprintf("(species_label = '' OR LOWER(species_label) = LOWER($%d))", len(args)))
	}
	if search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		conditions = append(conditions, fmt.Sprintf("(LOWER(name) LIKE $%d OR LOWER(brand) LIKE $%d)", len(args), len(args)))
	}
	args = append(args, limit)
	q := fmt.Sprintf(`
		SELECT id, name, brand, kind, species_label, kcal_per_100g, is_public, created_by_user, to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM food_items
		WHERE %s
		ORDER BY is_public DESC, name ASC
		LIMIT $%d`, strings.Join(conditions, " AND "), len(args))
	rows, _ := s.pool.Query(s.ctx(), q, args...)
	defer rows.Close()
	out := make([]domain.FoodItem, 0)
	for rows.Next() {
		var f domain.FoodItem
		if err := rows.Scan(&f.ID, &f.Name, &f.Brand, &f.Kind, &f.SpeciesLabel, &f.KcalPer100g, &f.IsPublic, &f.CreatedByUser, &f.CreatedAt); err != nil {
			continue
		}
		out = append(out, f)
	}
	return out
}

// AdminUpsertFoodItem honours the is_public flag (unlike CreateFoodItem).
// New rows: ID generated; existing rows: CreatedAt + CreatedByUser preserved.
func (s *PostgresStore) AdminUpsertFoodItem(item domain.FoodItem) (domain.FoodItem, error) {
	if item.Kind == "" {
		item.Kind = "dry"
	}
	if item.ID == "" {
		item.ID = newID("food")
		item.CreatedAt = time.Now().UTC().Format(time.RFC3339)
		_, err := s.pool.Exec(s.ctx(),
			`INSERT INTO food_items(id, name, brand, kind, species_label, kcal_per_100g, is_public, created_by_user, created_at)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			item.ID, item.Name, item.Brand, item.Kind, item.SpeciesLabel, item.KcalPer100g, item.IsPublic, item.CreatedByUser, item.CreatedAt)
		if err != nil {
			return domain.FoodItem{}, err
		}
		return item, nil
	}
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE food_items SET
		   name=$2, brand=$3, kind=$4, species_label=$5, kcal_per_100g=$6, is_public=$7
		 WHERE id=$1`,
		item.ID, item.Name, item.Brand, item.Kind, item.SpeciesLabel, item.KcalPer100g, item.IsPublic)
	if err != nil {
		return domain.FoodItem{}, err
	}
	if tag.RowsAffected() == 0 {
		return domain.FoodItem{}, fmt.Errorf("food item not found")
	}
	// Re-read to surface the unchanged created_at + created_by_user.
	got, err := s.GetFoodItem(item.ID)
	if err != nil || got == nil {
		return item, nil
	}
	return *got, nil
}

func (s *PostgresStore) AdminDeleteFoodItem(itemID string) error {
	tag, err := s.pool.Exec(s.ctx(), `DELETE FROM food_items WHERE id=$1`, itemID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("food item not found")
	}
	return nil
}

func (s *PostgresStore) ListMealLogs(petID string, fromDate string, toDate string) []domain.MealLog {
	args := []any{petID}
	conditions := []string{"pet_id = $1"}
	if fromDate != "" {
		args = append(args, fromDate)
		conditions = append(conditions, fmt.Sprintf("eaten_at >= $%d::timestamptz", len(args)))
	}
	if toDate != "" {
		args = append(args, toDate)
		conditions = append(conditions, fmt.Sprintf("eaten_at < $%d::timestamptz", len(args)))
	}
	q := fmt.Sprintf(`SELECT id, pet_id, food_item_id, custom_name, grams, kcal, notes, to_char((eaten_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM pet_meal_logs WHERE %s ORDER BY eaten_at DESC`, strings.Join(conditions, " AND "))
	rows, _ := s.pool.Query(s.ctx(), q, args...)
	defer rows.Close()
	out := make([]domain.MealLog, 0)
	for rows.Next() {
		var m domain.MealLog
		if err := rows.Scan(&m.ID, &m.PetID, &m.FoodItemID, &m.CustomName, &m.Grams, &m.Kcal, &m.Notes, &m.EatenAt, &m.CreatedAt); err != nil {
			continue
		}
		out = append(out, m)
	}
	return out
}

func (s *PostgresStore) CreateMealLog(petID string, log domain.MealLog) domain.MealLog {
	log.ID = newID("meal")
	log.PetID = petID
	if log.EatenAt == "" {
		log.EatenAt = time.Now().UTC().Format(time.RFC3339)
	}
	log.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(),
		`INSERT INTO pet_meal_logs(id, pet_id, food_item_id, custom_name, grams, kcal, notes, eaten_at, created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		log.ID, log.PetID, log.FoodItemID, log.CustomName, log.Grams, log.Kcal, log.Notes, log.EatenAt, log.CreatedAt)
	return log
}

func (s *PostgresStore) DeleteMealLog(petID string, logID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM pet_meal_logs WHERE id=$1 AND pet_id=$2`, logID, petID)
	return err
}

func (s *PostgresStore) GetDailyMealSummary(petID string, dateISO string) domain.DailyMealSummary {
	sum := domain.DailyMealSummary{Date: dateISO}
	row := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(SUM(kcal),0), COALESCE(SUM(grams),0), COUNT(*)
		 FROM pet_meal_logs
		 WHERE pet_id=$1 AND eaten_at >= $2::timestamptz AND eaten_at < ($2::timestamptz + INTERVAL '1 day')`,
		petID, dateISO)
	_ = row.Scan(&sum.TotalKcal, &sum.TotalGrams, &sum.MealCount)
	return sum
}

// ── Weekly Health Summary ───────────────────────────────────────────

func (s *PostgresStore) GetWeeklyHealthSummaryForUser(userID string, weekStartUTC string, weekEndUTC string) domain.WeeklyHealthSummary {
	sum := domain.WeeklyHealthSummary{WeekStart: weekStartUTC}
	// Single roundtrip: aggregate via UNION ALL count by category. Each
	// query is pet-id scoped to this user's pets.
	row := s.pool.QueryRow(s.ctx(), `
		WITH pets_owned AS (
			SELECT id FROM pets WHERE owner_id = $1
		)
		SELECT
		  (SELECT COUNT(*) FROM weight_entries we WHERE we.pet_id IN (SELECT id FROM pets_owned)
		     AND we.date >= $2 AND we.date < $3),
		  (SELECT COUNT(*) FROM health_records hr WHERE hr.pet_id IN (SELECT id FROM pets_owned)
		     AND hr.created_at >= $2 AND hr.created_at < $3),
		  (SELECT COUNT(*) FROM pet_symptom_logs sl WHERE sl.pet_id IN (SELECT id FROM pets_owned)
		     AND sl.occurred_at >= $2::timestamptz AND sl.occurred_at < $3::timestamptz),
		  (SELECT COUNT(*) FROM diary_entries de WHERE de.pet_id IN (SELECT id FROM pets_owned)
		     AND de.created_at >= $2 AND de.created_at < $3),
		  (SELECT COUNT(*) FROM pet_medications m WHERE m.pet_id IN (SELECT id FROM pets_owned)
		     AND m.last_given_at >= $2::timestamptz AND m.last_given_at < $3::timestamptz)
	`, userID, weekStartUTC, weekEndUTC)
	_ = row.Scan(&sum.WeightEntries, &sum.HealthRecords, &sum.SymptomLogs, &sum.DiaryEntries, &sum.MedicationsGiven)
	sum.HasActivity = sum.WeightEntries+sum.HealthRecords+sum.SymptomLogs+sum.DiaryEntries+sum.MedicationsGiven > 0
	return sum
}

func (s *PostgresStore) ListUsersForWeeklySummary(weekStartUTC string) []string {
	rows, _ := s.pool.Query(s.ctx(), `
		SELECT DISTINCT u.id FROM users u
		JOIN push_tokens pt ON pt.user_id = u.id
		LEFT JOIN user_weekly_summary_log w
		  ON w.user_id = u.id AND w.week_start = $1
		WHERE w.user_id IS NULL`, weekStartUTC)
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out
}

func (s *PostgresStore) RecordWeeklySummarySent(userID string, weekStartUTC string) {
	s.pool.Exec(s.ctx(),
		`INSERT INTO user_weekly_summary_log(user_id, week_start) VALUES($1,$2)
		 ON CONFLICT (user_id, week_start) DO NOTHING`,
		userID, weekStartUTC)
}

func (s *PostgresStore) ListWeightEntries(petID string) []domain.WeightEntry {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, weight, unit, date FROM weight_entries WHERE pet_id=$1 ORDER BY date DESC`, petID)
	defer rows.Close()
	var out []domain.WeightEntry
	for rows.Next() {
		var w domain.WeightEntry
		rows.Scan(&w.ID, &w.PetID, &w.Weight, &w.Unit, &w.Date)
		out = append(out, w)
	}
	if out == nil { return []domain.WeightEntry{} }
	return out
}

func (s *PostgresStore) CreateWeightEntry(petID string, entry domain.WeightEntry) domain.WeightEntry {
	entry.ID = newID("we")
	entry.PetID = petID
	s.pool.Exec(s.ctx(), `INSERT INTO weight_entries(id,pet_id,weight,unit,date) VALUES($1,$2,$3,$4,$5)`,
		entry.ID, entry.PetID, entry.Weight, entry.Unit, entry.Date)
	return entry
}

func (s *PostgresStore) ListVetContacts(userID string) []domain.VetContact {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, name, phone, address, is_emergency FROM vet_contacts WHERE user_id=$1`, userID)
	defer rows.Close()
	var out []domain.VetContact
	for rows.Next() {
		var v domain.VetContact
		rows.Scan(&v.ID, &v.UserID, &v.Name, &v.Phone, &v.Address, &v.IsEmergency)
		out = append(out, v)
	}
	if out == nil { return []domain.VetContact{} }
	return out
}

func (s *PostgresStore) CreateVetContact(userID string, contact domain.VetContact) domain.VetContact {
	contact.ID = newID("vc")
	contact.UserID = userID
	s.pool.Exec(s.ctx(), `INSERT INTO vet_contacts(id,user_id,name,phone,address,is_emergency) VALUES($1,$2,$3,$4,$5,$6)`,
		contact.ID, contact.UserID, contact.Name, contact.Phone, contact.Address, contact.IsEmergency)
	return contact
}

func (s *PostgresStore) DeleteVetContact(userID string, contactID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM vet_contacts WHERE id=$1 AND user_id=$2`, contactID, userID)
	return err
}

func (s *PostgresStore) ListFeedingSchedules(petID string) []domain.FeedingSchedule {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, meal_name, time, food_type, amount, notes FROM feeding_schedules WHERE pet_id=$1`, petID)
	defer rows.Close()
	var out []domain.FeedingSchedule
	for rows.Next() {
		var f domain.FeedingSchedule
		rows.Scan(&f.ID, &f.PetID, &f.MealName, &f.Time, &f.FoodType, &f.Amount, &f.Notes)
		out = append(out, f)
	}
	if out == nil { return []domain.FeedingSchedule{} }
	return out
}

func (s *PostgresStore) CreateFeedingSchedule(petID string, schedule domain.FeedingSchedule) domain.FeedingSchedule {
	schedule.ID = newID("fs")
	schedule.PetID = petID
	schedule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO feeding_schedules(id,pet_id,meal_name,time,food_type,amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,
		schedule.ID, schedule.PetID, schedule.MealName, schedule.Time, schedule.FoodType, schedule.Amount, schedule.Notes)
	return schedule
}

func (s *PostgresStore) DeleteFeedingSchedule(petID string, scheduleID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM feeding_schedules WHERE id=$1 AND pet_id=$2`, scheduleID, petID)
	return err
}

// ================================================================
// Diary
// ================================================================

func (s *PostgresStore) ListDiary(petID string) []domain.DiaryEntry {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, user_id, body, image_url, mood, created_at FROM diary_entries WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.DiaryEntry
	for rows.Next() {
		var d domain.DiaryEntry
		var img *string
		var createdAt time.Time
		rows.Scan(&d.ID, &d.PetID, &d.UserID, &d.Body, &img, &d.Mood, &createdAt)
		d.ImageURL = img
		d.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, d)
	}
	if out == nil { return []domain.DiaryEntry{} }
	return out
}

func (s *PostgresStore) CreateDiaryEntry(userID string, petID string, body string, imageURL *string, mood string) domain.DiaryEntry {
	entry := domain.DiaryEntry{ID: newID("diary"), PetID: petID, UserID: userID, Body: body, ImageURL: imageURL, Mood: mood, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	s.pool.Exec(s.ctx(), `INSERT INTO diary_entries(id,pet_id,user_id,body,image_url,mood,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
		entry.ID, entry.PetID, entry.UserID, entry.Body, entry.ImageURL, entry.Mood, entry.CreatedAt)
	return entry
}

// ================================================================
// Playdates & Groups
// ================================================================

// ErrPlaydateWaitlisted is returned when a join lands on the waitlist instead of attendees.
var ErrPlaydateWaitlisted = fmt.Errorf("playdate full, added to waitlist")

func (s *PostgresStore) ListPlaydates(params ListPlaydatesParams) []domain.Playdate {
	query := `SELECT id, organizer_id, title, description, date, location, max_pets, attendees, created_at,
	                  COALESCE(latitude, 0), COALESCE(longitude, 0),
	                  COALESCE(city_label, ''), COALESCE(cover_image_url, ''),
	                  COALESCE(rules, '{}'), COALESCE(status, 'active'),
	                  COALESCE(conversation_id, ''), COALESCE(waitlist, '{}'),
	                  COALESCE(visibility, 'public'), COALESCE(locked, FALSE),
	                  COALESCE(venue_id, '')
	           FROM playdates WHERE 1=1`
	args := []any{}
	idx := 1

	// Hide cancelled playdates from anyone not already in them. Also hide
	// private playdates unless the caller is the organizer, a current attendee,
	// or has been explicitly invited. And hide already-ended playdates from
	// discovery — v0.15.1 moves "events I missed" into My Playdates → Past and
	// keeps the discovery feed forward-looking only. Callers who already have
	// a relationship to the playdate still see it via `GetPlaydateForUser`.
	nowISO := time.Now().UTC().Format(time.RFC3339)
	if params.UserID != "" {
		query += fmt.Sprintf(` AND (status = 'active' OR $%d = ANY(attendees) OR organizer_id = $%d)`, idx, idx)
		query += fmt.Sprintf(` AND (
			visibility = 'public'
			OR organizer_id = $%d
			OR $%d = ANY(attendees)
			OR EXISTS (SELECT 1 FROM playdate_invites WHERE playdate_id = playdates.id AND invited_user_id = $%d)
		)`, idx, idx, idx)
		args = append(args, params.UserID)
		idx++
	} else {
		query += " AND status = 'active' AND visibility = 'public'"
	}
	query += fmt.Sprintf(` AND date >= $%d`, idx)
	args = append(args, nowISO)
	idx++

	if params.Search != "" {
		query += fmt.Sprintf(" AND (title ILIKE '%%' || $%d || '%%' OR description ILIKE '%%' || $%d || '%%')", idx, idx)
		args = append(args, params.Search)
		idx++
	}
	if params.From != "" {
		query += fmt.Sprintf(" AND date >= $%d", idx)
		args = append(args, params.From)
		idx++
	}
	if params.To != "" {
		query += fmt.Sprintf(" AND date < $%d", idx)
		args = append(args, params.To)
		idx++
	}
	query += " ORDER BY date"

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.Playdate{}
	}
	defer rows.Close()

	out := make([]domain.Playdate, 0)
	hasCaller := params.Lat != 0 && params.Lng != 0
	for rows.Next() {
		var p domain.Playdate
		var img *string
		// created_at is TIMESTAMPTZ — pgx can't scan it directly into a
		// string, so take it through time.Time and format downstream.
		var createdAt time.Time
		if err := rows.Scan(&p.ID, &p.OrganizerID, &p.Title, &p.Description, &p.Date,
			&p.Location, &p.MaxPets, &p.Attendees, &createdAt,
			&p.Latitude, &p.Longitude, &p.CityLabel, &img,
			&p.Rules, &p.Status, &p.ConversationID, &p.Waitlist,
			&p.Visibility, &p.Locked, &p.VenueID); err != nil {
			log.Printf("[PLAYDATES-SCAN-ERR] %v", err)
			continue
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		if p.Attendees == nil {
			p.Attendees = []string{}
		}
		if p.Rules == nil {
			p.Rules = []string{}
		}
		if p.Waitlist == nil {
			p.Waitlist = []string{}
		}
		if img != nil {
			p.CoverImageURL = *img
		}
		if params.UserID != "" {
			for _, uid := range p.Attendees {
				if uid == params.UserID {
					p.IsAttending = true
					break
				}
			}
			for _, uid := range p.Waitlist {
				if uid == params.UserID {
					p.IsWaitlisted = true
					break
				}
			}
			p.IsOrganizer = p.OrganizerID == params.UserID
		}
		if hasCaller && p.Latitude != 0 && p.Longitude != 0 {
			p.Distance = service.Haversine(params.Lat, params.Lng, p.Latitude, p.Longitude)
		}
		// Never leak conversation id through the list view.
		p.ConversationID = ""
		out = append(out, p)
	}

	// ── v0.11.0: populate pet-level slot count in the list view ──────
	// Before this, ListPlaydates left SlotsUsed at 0, so a freshly-created
	// playdate showed "0 / 10" on the card even though the host had already
	// been auto-joined. We batch a single GROUP BY query for all rows we
	// just scanned and patch the SlotsUsed field per playdate.
	if len(out) > 0 {
		ids := make([]string, 0, len(out))
		for i := range out {
			ids = append(ids, out[i].ID)
		}
		countRows, cerr := s.pool.Query(s.ctx(),
			`SELECT playdate_id, COUNT(*) FROM playdate_pet_attendees
			 WHERE playdate_id = ANY($1) GROUP BY playdate_id`, ids)
		if cerr == nil {
			counts := make(map[string]int, len(out))
			for countRows.Next() {
				var pid string
				var c int
				if err := countRows.Scan(&pid, &c); err == nil {
					counts[pid] = c
				}
			}
			countRows.Close()
			for i := range out {
				if c, ok := counts[out[i].ID]; ok {
					out[i].SlotsUsed = c
				}
			}
		}
	}

	// Sort: distance first (with no-location rows pushed to the end) or
	// time first. Both treat time as the secondary key.
	sortBy := params.Sort
	if sortBy == "" {
		sortBy = "distance"
	}
	sort.SliceStable(out, func(i, j int) bool {
		a := out[i]
		b := out[j]
		if sortBy == "distance" {
			aHas := a.Latitude != 0 && a.Longitude != 0 && hasCaller
			bHas := b.Latitude != 0 && b.Longitude != 0 && hasCaller
			if aHas != bHas {
				return aHas
			}
			if aHas && a.Distance != b.Distance {
				return a.Distance < b.Distance
			}
		}
		return a.Date < b.Date
	})

	return out
}

// getPlaydateRow reads a single playdate row without enrichment.
func (s *PostgresStore) getPlaydateRow(playdateID string) (*domain.Playdate, error) {
	var p domain.Playdate
	var img *string
	var cancelledAt *time.Time
	// created_at is TIMESTAMPTZ — scan into time.Time and format below.
	var createdAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, organizer_id, title, description, date, location, max_pets, attendees, created_at,
		        COALESCE(latitude, 0), COALESCE(longitude, 0),
		        COALESCE(city_label, ''), COALESCE(cover_image_url, ''),
		        COALESCE(rules, '{}'), COALESCE(status, 'active'),
		        cancelled_at, COALESCE(conversation_id, ''), COALESCE(waitlist, '{}'),
		        COALESCE(visibility, 'public'), COALESCE(locked, FALSE),
		        COALESCE(venue_id, ''), COALESCE(share_token, '')
		 FROM playdates WHERE id = $1`, playdateID).
		Scan(&p.ID, &p.OrganizerID, &p.Title, &p.Description, &p.Date, &p.Location,
			&p.MaxPets, &p.Attendees, &createdAt,
			&p.Latitude, &p.Longitude, &p.CityLabel, &img,
			&p.Rules, &p.Status, &cancelledAt, &p.ConversationID, &p.Waitlist,
			&p.Visibility, &p.Locked, &p.VenueID, &p.ShareToken)
	if err != nil {
		return nil, fmt.Errorf("playdate not found")
	}
	p.CreatedAt = createdAt.Format(time.RFC3339)
	if p.Attendees == nil {
		p.Attendees = []string{}
	}
	if p.Rules == nil {
		p.Rules = []string{}
	}
	if p.Waitlist == nil {
		p.Waitlist = []string{}
	}
	if img != nil {
		p.CoverImageURL = *img
	}
	if cancelledAt != nil {
		p.CancelledAt = cancelledAt.Format(time.RFC3339)
	}
	return &p, nil
}

// GetPlaydate returns a fully-enriched playdate view for the given caller.
// The caller's UserID drives per-user computed fields (isAttending, isWaitlisted,
// isOrganizer) and chat gating (conversationId is blanked unless the caller has
// access).
func (s *PostgresStore) GetPlaydate(playdateID string) (*domain.Playdate, error) {
	return s.GetPlaydateForUser(playdateID, "")
}

func (s *PostgresStore) GetPlaydateForUser(playdateID string, userID string) (*domain.Playdate, error) {
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return nil, err
	}

	// Host enrichment (user_profiles + app_users.verified)
	var host domain.PlaydateHost
	host.UserID = p.OrganizerID
	var firstName, avatarURL string
	var verified bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(up.first_name, ''), COALESCE(up.avatar_url, ''), COALESCE(au.verified, false)
		 FROM user_profiles up
		 LEFT JOIN app_users au ON au.id = up.user_id
		 WHERE up.user_id = $1`, p.OrganizerID).Scan(&firstName, &avatarURL, &verified)
	host.FirstName = firstName
	host.AvatarURL = avatarURL
	host.IsVerified = verified
	p.HostInfo = &host

	// ── Pet-level attendance (v0.12.0 source of truth) ─────────────────
	// Load every (user_id, pet_id, joined_at) row for this playdate, ordered
	// by join time so the UI can show chronological attendance.
	// v0.11.0 — LATERAL join instead of a correlated subquery so pg's planner
	// can use the new idx_pet_photos_pet_id_order index and not run one scan
	// per attendee. This is the hot-path fix for the "detail sayfa çok yavaş"
	// report — measured ~5-10x improvement on playdates with 8+ attendees.
	attRows, _ := s.pool.Query(s.ctx(),
		`SELECT ppa.user_id, ppa.pet_id, ppa.joined_at,
		        COALESCE(up.first_name, ''), COALESCE(up.avatar_url, ''),
		        COALESCE(p.name, ''), COALESCE(p.breed_label, ''),
		        COALESCE(ph.url, '')
		 FROM playdate_pet_attendees ppa
		 LEFT JOIN user_profiles up ON up.user_id = ppa.user_id
		 LEFT JOIN pets p ON p.id = ppa.pet_id
		 LEFT JOIN LATERAL (
		     SELECT url FROM pet_photos WHERE pet_id = p.id
		     ORDER BY display_order LIMIT 1
		 ) ph ON TRUE
		 WHERE ppa.playdate_id = $1
		 ORDER BY ppa.joined_at ASC`, playdateID)
	type attKey = string
	attByUser := map[attKey]*domain.PlaydateAttendee{}
	orderedUsers := []string{}
	slotsUsed := 0
	myPetIds := []string{}
	distinctAttendees := []string{}
	if attRows != nil {
		for attRows.Next() {
			var uid, petID, petName, breedLabel, petPhoto, fName, avatar string
			var joinedAt time.Time
			if err := attRows.Scan(&uid, &petID, &joinedAt, &fName, &avatar, &petName, &breedLabel, &petPhoto); err != nil {
				continue
			}
			slotsUsed++
			if _, ok := attByUser[uid]; !ok {
				attByUser[uid] = &domain.PlaydateAttendee{
					UserID:    uid,
					FirstName: fName,
					AvatarURL: avatar,
					Pets:      []domain.MemberPet{},
				}
				orderedUsers = append(orderedUsers, uid)
				distinctAttendees = append(distinctAttendees, uid)
			}
			// A legacy sentinel (pet not joined via new flow) has no matching row in `pets`.
			if petName != "" {
				attByUser[uid].Pets = append(attByUser[uid].Pets, domain.MemberPet{
					ID:       petID,
					Name:     petName,
					PhotoURL: petPhoto,
				})
			}
			if uid == userID && petName != "" {
				myPetIds = append(myPetIds, petID)
			}
			_ = breedLabel
		}
		attRows.Close()
	}

	p.AttendeesInfo = make([]domain.PlaydateAttendee, 0, len(orderedUsers))
	for _, uid := range orderedUsers {
		p.AttendeesInfo = append(p.AttendeesInfo, *attByUser[uid])
	}
	// Keep the legacy Attendees slice in sync with the new source of truth so
	// older clients still get a list of distinct user ids.
	p.Attendees = distinctAttendees
	p.SlotsUsed = slotsUsed

	// Waitlist (pet-level). Distinct user ids here too, ordered by joined_at.
	p.Waitlist = []string{}
	myWaitlist := []string{}
	wlRows, _ := s.pool.Query(s.ctx(),
		`SELECT user_id, pet_id FROM playdate_pet_waitlist
		 WHERE playdate_id = $1 ORDER BY joined_at ASC`, playdateID)
	if wlRows != nil {
		seen := map[string]struct{}{}
		for wlRows.Next() {
			var uid, petID string
			if err := wlRows.Scan(&uid, &petID); err != nil {
				continue
			}
			if _, ok := seen[uid]; !ok {
				seen[uid] = struct{}{}
				p.Waitlist = append(p.Waitlist, uid)
			}
			if uid == userID {
				myWaitlist = append(myWaitlist, petID)
			}
		}
		wlRows.Close()
	}

	// Per-user computed fields
	if userID != "" {
		p.IsOrganizer = p.OrganizerID == userID
		p.IsAttending = len(myPetIds) > 0
		p.IsWaitlisted = len(myWaitlist) > 0
		p.MyPetIds = myPetIds
		p.MyWaitlistPets = myWaitlist

		// Look up this caller's invite status (if any) for visibility gating.
		var inviteID, inviteStatus string
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT id, status FROM playdate_invites WHERE playdate_id=$1 AND invited_user_id=$2`,
			playdateID, userID).Scan(&inviteID, &inviteStatus)
		p.MyInviteID = inviteID
		p.MyInviteStatus = inviteStatus
	}

	// Pending invite count — only meaningful for the host.
	if p.IsOrganizer {
		var pending int
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT COUNT(*) FROM playdate_invites WHERE playdate_id=$1 AND status='pending'`,
			playdateID).Scan(&pending)
		p.PendingInvites = pending
		// Host sees the full list of currently-muted attendees.
		p.ChatMutedUserIDs = s.ListPlaydateChatMutedUsers(playdateID)
	}

	// Caller's chat state: moderation mute + notification mute toggle.
	if userID != "" {
		if muted, _ := s.GetPlaydateChatMute(userID, playdateID); muted {
			p.MyChatMuted = true
		}
		if p.ConversationID != "" {
			p.MyConvMuted = s.IsConversationMuted(userID, p.ConversationID)
			if p.MyConvMuted {
				if u := s.GetConversationMuteUntil(userID, p.ConversationID); u != nil {
					t := u.UTC().Format(time.RFC3339)
					p.MyConvMutedUntil = &t
				}
			}
		}
	}

	// Visibility gating for private playdates: everyone except the host, current
	// attendees, waitlisted users, and invitees get a "not found" error.
	if p.Visibility == "private" && userID != "" && !p.IsOrganizer &&
		!p.IsAttending && !p.IsWaitlisted && p.MyInviteStatus == "" {
		return nil, fmt.Errorf("playdate not found")
	}

	// share_token is host-only data. Leaking it on the non-host detail response
	// would let attendees forward the link beyond the host's intent.
	if !p.IsOrganizer {
		p.ShareToken = ""
	}

	// Attendee visibility: pending invitees of a private playdate can see the
	// detail page but not the attendee list until they accept.
	if p.Visibility == "private" && p.MyInviteStatus == "pending" &&
		!p.IsOrganizer && !p.IsAttending {
		p.AttendeesInfo = []domain.PlaydateAttendee{}
		p.Attendees = []string{}
		p.SlotsUsed = 0
	}

	// Chat gating: only organizer, current attendees, or waitlisted users see the
	// conversation id. Everyone else can read all other details.
	if !(p.IsOrganizer || p.IsAttending || p.IsWaitlisted) {
		p.ConversationID = ""
	}

	return p, nil
}

func (s *PostgresStore) CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate {
	playdate.ID = newID("pd")
	playdate.OrganizerID = userID
	playdate.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	if playdate.Attendees == nil {
		playdate.Attendees = []string{}
	}
	if playdate.Rules == nil {
		playdate.Rules = []string{}
	}
	if playdate.Waitlist == nil {
		playdate.Waitlist = []string{}
	}
	if playdate.Status == "" {
		playdate.Status = "active"
	}
	if playdate.MaxPets <= 0 {
		playdate.MaxPets = 5
	}
	if playdate.Visibility != "private" {
		playdate.Visibility = "public"
	}

	// Create the dedicated conversation thread for this playdate, seeded with the
	// organizer. Attendees get added to conversations.user_ids on join.
	convID := newID("conversation")
	convTitle := playdate.Title
	if convTitle == "" {
		convTitle = "Playdate"
	}
	_, convErr := s.pool.Exec(s.ctx(),
		`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		convID, "", convTitle, "Playdate chat", time.Now().UTC(), []string{userID})
	if convErr == nil {
		playdate.ConversationID = convID
	}

	s.pool.Exec(s.ctx(),
		`INSERT INTO playdates(id,organizer_id,title,description,date,location,max_pets,attendees,created_at,latitude,longitude,city_label,cover_image_url,rules,status,conversation_id,waitlist,visibility,venue_id)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		playdate.ID, playdate.OrganizerID, playdate.Title, playdate.Description,
		playdate.Date, playdate.Location, playdate.MaxPets, playdate.Attendees, playdate.CreatedAt,
		playdate.Latitude, playdate.Longitude, playdate.CityLabel, nilIfEmpty(playdate.CoverImageURL),
		playdate.Rules, playdate.Status, playdate.ConversationID, playdate.Waitlist,
		playdate.Visibility, nilIfEmpty(playdate.VenueID))

	// Auto-join the host with their selected pets so the creator immediately
	// occupies their own playdate. We ignore waitlist logic here — the creator
	// decides the maxPets, so capacity is guaranteed at create time.
	if len(playdate.CreatorPetIds) > 0 {
		if err := s.validatePetOwnership(userID, playdate.CreatorPetIds); err == nil {
			for _, pid := range playdate.CreatorPetIds {
				s.pool.Exec(s.ctx(),
					`INSERT INTO playdate_pet_attendees (playdate_id, pet_id, user_id)
					 VALUES ($1, $2, $3)
					 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
					playdate.ID, pid, userID)
			}
			s.pool.Exec(s.ctx(),
				`UPDATE playdates SET attendees = array_append(attendees, $1)
				 WHERE id=$2 AND NOT ($1 = ANY(attendees))`, userID, playdate.ID)
		}
	}

	playdate.IsOrganizer = true
	return playdate
}

// validatePetOwnership checks that every pet in petIds belongs to userID and is visible.
// Returns an error if any pet is missing, hidden, or owned by someone else.
func (s *PostgresStore) validatePetOwnership(userID string, petIds []string) error {
	if len(petIds) == 0 {
		return fmt.Errorf("select at least one pet")
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id FROM pets WHERE id = ANY($1) AND owner_id = $2 AND is_hidden = false`,
		petIds, userID)
	if err != nil {
		return fmt.Errorf("validate pets: %w", err)
	}
	defer rows.Close()
	found := map[string]struct{}{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			found[id] = struct{}{}
		}
	}
	for _, pid := range petIds {
		if _, ok := found[pid]; !ok {
			return fmt.Errorf("pet %s is not owned by this user", pid)
		}
	}
	return nil
}

// slotsUsed returns the current pet-level attendance count for a playdate.
func (s *PostgresStore) playdateSlotsUsed(playdateID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM playdate_pet_attendees WHERE playdate_id = $1`,
		playdateID).Scan(&n)
	return n
}

// JoinPlaydateWithPets atomically joins a user with one or more pets. Each pet
// consumes one slot. If capacity is insufficient for the whole request, every
// pet is placed on the FIFO waitlist instead and ErrPlaydateWaitlisted is
// returned. An optional note is posted as a user message into the playdate
// conversation on success.
func (s *PostgresStore) JoinPlaydateWithPets(userID string, playdateID string, petIds []string, note string) error {
	if err := s.validatePetOwnership(userID, petIds); err != nil {
		return err
	}
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return err
	}
	if p.Status == "cancelled" {
		return fmt.Errorf("playdate cancelled")
	}
	// Reject joins on past events — the v0.15.1 state vocabulary treats
	// "ended" as terminal, and the mobile UI already hides the Join CTA for
	// past playdates. Guarding here prevents direct API abuse.
	if when, perr := time.Parse(time.RFC3339, p.Date); perr == nil && when.Before(time.Now().UTC()) {
		return fmt.Errorf("playdate already ended")
	}
	// Lock is a "soft close" — the state is never surfaced as a user badge
	// per spec, so we return the same "full" message the mobile UI already
	// handles gracefully from the shared state helper.
	if p.Locked {
		return fmt.Errorf("playdate is no longer accepting new attendees")
	}

	// Filter out pets the user already has in attendees or waitlist.
	existingAttPets := map[string]struct{}{}
	existingWlPets := map[string]struct{}{}
	attRows, _ := s.pool.Query(s.ctx(),
		`SELECT pet_id FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID)
	if attRows != nil {
		for attRows.Next() {
			var pid string
			if err := attRows.Scan(&pid); err == nil {
				existingAttPets[pid] = struct{}{}
			}
		}
		attRows.Close()
	}
	wlRows, _ := s.pool.Query(s.ctx(),
		`SELECT pet_id FROM playdate_pet_waitlist WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID)
	if wlRows != nil {
		for wlRows.Next() {
			var pid string
			if err := wlRows.Scan(&pid); err == nil {
				existingWlPets[pid] = struct{}{}
			}
		}
		wlRows.Close()
	}

	fresh := make([]string, 0, len(petIds))
	for _, pid := range petIds {
		if _, ok := existingAttPets[pid]; ok {
			continue
		}
		if _, ok := existingWlPets[pid]; ok {
			continue
		}
		fresh = append(fresh, pid)
	}
	if len(fresh) == 0 {
		// Already joined with all requested pets — no-op success.
		return nil
	}

	slotsUsed := s.playdateSlotsUsed(playdateID)
	capacityAvailable := p.MaxPets - slotsUsed
	goToWaitlist := p.MaxPets > 0 && len(fresh) > capacityAvailable

	if goToWaitlist {
		for _, pid := range fresh {
			s.pool.Exec(s.ctx(),
				`INSERT INTO playdate_pet_waitlist (playdate_id, pet_id, user_id)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
				playdateID, pid, userID)
		}
		return ErrPlaydateWaitlisted
	}

	// Was the user already an attendee? Determines whether to post the
	// "member_joined" system message below (only on first-time join).
	wasAttendee := false
	for _, uid := range p.Attendees {
		if uid == userID {
			wasAttendee = true
			break
		}
	}

	// Space available for all: insert attendee rows and sync conversation membership.
	for _, pid := range fresh {
		s.pool.Exec(s.ctx(),
			`INSERT INTO playdate_pet_attendees (playdate_id, pet_id, user_id)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
			playdateID, pid, userID)
	}
	// Mirror into the legacy attendees array so older listeners still see the user.
	s.pool.Exec(s.ctx(),
		`UPDATE playdates SET attendees = array_append(attendees, $1)
		 WHERE id=$2 AND NOT ($1 = ANY(attendees))`, userID, playdateID)
	if p.ConversationID != "" {
		s.pool.Exec(s.ctx(),
			`UPDATE conversations SET user_ids = array_append(user_ids, $1)
			 WHERE id = $2 AND NOT ($1 = ANY(user_ids))`, userID, p.ConversationID)

		// Fire a "member_joined" system message the first time a user comes in.
		// If they're adding more pets to an existing join we stay quiet.
		if !wasAttendee {
			var firstName string
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT COALESCE(first_name, '') FROM user_profiles WHERE user_id = $1`,
				userID).Scan(&firstName)
			s.insertSystemMessage(p.ConversationID, "member_joined", map[string]any{
				"kind":      "member_joined",
				"userId":    userID,
				"firstName": firstName,
			})
		}

		// Optional first-message note. Insert it via the conversation path so
		// it shows up as a normal user message from the joiner.
		if trimmed := strings.TrimSpace(note); trimmed != "" {
			var senderName, senderAvatar string
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT COALESCE(first_name, ''), COALESCE(avatar_url, '') FROM user_profiles WHERE user_id = $1`,
				userID).Scan(&senderName, &senderAvatar)
			msgID := newID("message")
			now := time.Now().UTC()
			s.pool.Exec(s.ctx(),
				`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, sender_avatar_url, message_type, body, created_at)
				 VALUES ($1, $2, $3, $4, $5, 'text', $6, $7)`,
				msgID, p.ConversationID, userID, senderName, senderAvatar, trimmed, now)
			s.pool.Exec(s.ctx(),
				`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, p.ConversationID, now)
		}
	}
	return nil
}

// JoinPlaydate is the legacy user-level join — kept for interface compatibility.
// It now joins using the user's first visible pet so existing callers still work.
func (s *PostgresStore) JoinPlaydate(userID string, playdateID string) error {
	var petID string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT id FROM pets WHERE owner_id = $1 AND is_hidden = false
		 ORDER BY created_at LIMIT 1`, userID).Scan(&petID)
	if petID == "" {
		return fmt.Errorf("add a pet before joining a playdate")
	}
	return s.JoinPlaydateWithPets(userID, playdateID, []string{petID}, "")
}

// promoteFromWaitlist pops up to `slots` pets from the head of the waitlist
// and inserts them into attendees. Returns the list of user ids that had at
// least one pet promoted.
func (s *PostgresStore) promoteFromWaitlist(playdateID string, slots int, conversationID string) []string {
	if slots <= 0 {
		return nil
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT pet_id, user_id FROM playdate_pet_waitlist
		 WHERE playdate_id = $1 ORDER BY joined_at ASC LIMIT $2`,
		playdateID, slots)
	if err != nil {
		return nil
	}
	type head struct{ petID, userID string }
	var heads []head
	for rows.Next() {
		var h head
		if err := rows.Scan(&h.petID, &h.userID); err == nil {
			heads = append(heads, h)
		}
	}
	rows.Close()

	promoted := []string{}
	seen := map[string]struct{}{}
	for _, h := range heads {
		// move from waitlist to attendees
		s.pool.Exec(s.ctx(),
			`INSERT INTO playdate_pet_attendees (playdate_id, pet_id, user_id)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
			playdateID, h.petID, h.userID)
		s.pool.Exec(s.ctx(),
			`DELETE FROM playdate_pet_waitlist WHERE playdate_id=$1 AND pet_id=$2`,
			playdateID, h.petID)
		s.pool.Exec(s.ctx(),
			`UPDATE playdates SET attendees = array_append(attendees, $1)
			 WHERE id=$2 AND NOT ($1 = ANY(attendees))`, h.userID, playdateID)
		if conversationID != "" {
			s.pool.Exec(s.ctx(),
				`UPDATE conversations SET user_ids = array_append(user_ids, $1)
				 WHERE id = $2 AND NOT ($1 = ANY(user_ids))`, h.userID, conversationID)
		}
		if _, ok := seen[h.userID]; !ok {
			seen[h.userID] = struct{}{}
			promoted = append(promoted, h.userID)
		}
	}
	return promoted
}

// LeavePlaydateWithPets leaves specific pets (or all of them if petIds is
// empty) from either the attendee roster or the waitlist. Returns any user
// ids promoted from the waitlist as freed seats open up.
func (s *PostgresStore) LeavePlaydateWithPets(userID string, playdateID string, petIds []string) ([]string, error) {
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return nil, err
	}
	if p.OrganizerID == userID {
		return nil, fmt.Errorf("organizer cannot leave; cancel instead")
	}

	// Determine which pets the user currently has in attendees vs waitlist.
	userAttPets := []string{}
	userWlPets := []string{}
	attRows, _ := s.pool.Query(s.ctx(),
		`SELECT pet_id FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID)
	if attRows != nil {
		for attRows.Next() {
			var pid string
			if err := attRows.Scan(&pid); err == nil {
				userAttPets = append(userAttPets, pid)
			}
		}
		attRows.Close()
	}
	wlRows, _ := s.pool.Query(s.ctx(),
		`SELECT pet_id FROM playdate_pet_waitlist WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID)
	if wlRows != nil {
		for wlRows.Next() {
			var pid string
			if err := wlRows.Scan(&pid); err == nil {
				userWlPets = append(userWlPets, pid)
			}
		}
		wlRows.Close()
	}

	if len(userAttPets) == 0 && len(userWlPets) == 0 {
		return nil, fmt.Errorf("user is not part of this playdate")
	}

	// Build target set. Empty input means "leave everything".
	targetAll := len(petIds) == 0
	targetSet := map[string]struct{}{}
	for _, pid := range petIds {
		targetSet[pid] = struct{}{}
	}

	freedAttSlots := 0
	for _, pid := range userAttPets {
		if targetAll {
			s.pool.Exec(s.ctx(),
				`DELETE FROM playdate_pet_attendees WHERE playdate_id=$1 AND pet_id=$2 AND user_id=$3`,
				playdateID, pid, userID)
			freedAttSlots++
			continue
		}
		if _, ok := targetSet[pid]; ok {
			s.pool.Exec(s.ctx(),
				`DELETE FROM playdate_pet_attendees WHERE playdate_id=$1 AND pet_id=$2 AND user_id=$3`,
				playdateID, pid, userID)
			freedAttSlots++
		}
	}
	for _, pid := range userWlPets {
		if targetAll {
			s.pool.Exec(s.ctx(),
				`DELETE FROM playdate_pet_waitlist WHERE playdate_id=$1 AND pet_id=$2 AND user_id=$3`,
				playdateID, pid, userID)
			continue
		}
		if _, ok := targetSet[pid]; ok {
			s.pool.Exec(s.ctx(),
				`DELETE FROM playdate_pet_waitlist WHERE playdate_id=$1 AND pet_id=$2 AND user_id=$3`,
				playdateID, pid, userID)
		}
	}

	// If the user has no more attendee rows, remove them from the legacy
	// cache and the conversation — and post a "member_left" system message so
	// the chat history reflects the departure.
	var remaining int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID).Scan(&remaining)
	if remaining == 0 {
		s.pool.Exec(s.ctx(),
			`UPDATE playdates SET attendees = array_remove(attendees, $1) WHERE id=$2`,
			userID, playdateID)
		if p.ConversationID != "" {
			// Announce the departure BEFORE removing the user from user_ids
			// so the hub still pushes this last message to them.
			var firstName string
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT COALESCE(first_name, '') FROM user_profiles WHERE user_id = $1`,
				userID).Scan(&firstName)
			s.insertSystemMessage(p.ConversationID, "member_left", map[string]any{
				"kind":      "member_left",
				"userId":    userID,
				"firstName": firstName,
			})
			s.pool.Exec(s.ctx(),
				`UPDATE conversations SET user_ids = array_remove(user_ids, $1) WHERE id=$2`,
				userID, p.ConversationID)
		}
	}

	promoted := s.promoteFromWaitlist(playdateID, freedAttSlots, p.ConversationID)
	return promoted, nil
}

// LeavePlaydate is the legacy user-level leave — removes all of the caller's
// pets from this playdate. The signature is kept for interface compatibility;
// the returned string is the first promoted user (or "") rather than a single
// id, which matches the old semantics as closely as possible.
func (s *PostgresStore) LeavePlaydate(userID string, playdateID string) (string, error) {
	promoted, err := s.LeavePlaydateWithPets(userID, playdateID, nil)
	if err != nil {
		return "", err
	}
	if len(promoted) > 0 {
		return promoted[0], nil
	}
	return "", nil
}

// UpdateAttendeePets replaces the caller's pet set on an active playdate.
// Pets being added must fit in the remaining capacity; otherwise the call
// returns an error without mutating state. Pets removed free their slots and
// trigger waitlist promotion.
func (s *PostgresStore) UpdateAttendeePets(userID string, playdateID string, petIds []string) error {
	if err := s.validatePetOwnership(userID, petIds); err != nil {
		return err
	}
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return err
	}
	if p.Status == "cancelled" {
		return fmt.Errorf("playdate cancelled")
	}
	if p.OrganizerID == userID {
		return fmt.Errorf("organizer cannot edit their own pet list this way")
	}

	currentRows, err := s.pool.Query(s.ctx(),
		`SELECT pet_id FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, userID)
	if err != nil {
		return err
	}
	currentSet := map[string]struct{}{}
	for currentRows.Next() {
		var pid string
		if err := currentRows.Scan(&pid); err == nil {
			currentSet[pid] = struct{}{}
		}
	}
	currentRows.Close()

	if len(currentSet) == 0 {
		return fmt.Errorf("join the playdate first")
	}

	desiredSet := map[string]struct{}{}
	for _, pid := range petIds {
		desiredSet[pid] = struct{}{}
	}

	additions := []string{}
	for pid := range desiredSet {
		if _, ok := currentSet[pid]; !ok {
			additions = append(additions, pid)
		}
	}
	removals := []string{}
	for pid := range currentSet {
		if _, ok := desiredSet[pid]; !ok {
			removals = append(removals, pid)
		}
	}

	if len(desiredSet) == 0 {
		return fmt.Errorf("keep at least one pet or leave the playdate instead")
	}

	// Capacity check: treat the mutation as atomic — removals free first, then
	// additions fill. Slots available after the churn = maxPets - (used - removals).
	slotsUsed := s.playdateSlotsUsed(playdateID)
	available := p.MaxPets - (slotsUsed - len(removals))
	if p.MaxPets > 0 && len(additions) > available {
		return fmt.Errorf("not enough space for the added pets")
	}

	for _, pid := range removals {
		s.pool.Exec(s.ctx(),
			`DELETE FROM playdate_pet_attendees WHERE playdate_id=$1 AND pet_id=$2 AND user_id=$3`,
			playdateID, pid, userID)
	}
	for _, pid := range additions {
		s.pool.Exec(s.ctx(),
			`INSERT INTO playdate_pet_attendees (playdate_id, pet_id, user_id)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (playdate_id, pet_id) DO NOTHING`,
			playdateID, pid, userID)
	}
	// After churn, promote from waitlist for any slots still free.
	s.promoteFromWaitlist(playdateID, len(removals)-len(additions), p.ConversationID)
	return nil
}

// CancelPlaydate soft-cancels a playdate. Organizer-only.
func (s *PostgresStore) CancelPlaydate(userID string, playdateID string) error {
	var organizerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id FROM playdates WHERE id = $1`, playdateID).Scan(&organizerID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if organizerID != userID {
		return fmt.Errorf("only the organizer can cancel this playdate")
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE playdates SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
		playdateID)
	return err
}

// UpdatePlaydate patches mutable fields. Organizer-only.
func (s *PostgresStore) UpdatePlaydate(userID string, playdateID string, patch domain.Playdate) (*domain.Playdate, error) {
	// Load the current state so we can enforce "no edits after the event
	// starts" and keep downstream notifications fact-checked.
	current, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return nil, fmt.Errorf("playdate not found")
	}
	if current.OrganizerID != userID {
		return nil, fmt.Errorf("only the organizer can edit this playdate")
	}
	if current.Status == "cancelled" {
		return nil, fmt.Errorf("cannot edit a cancelled playdate")
	}
	if when, perr := time.Parse(time.RFC3339, current.Date); perr == nil && when.Before(time.Now().UTC()) {
		return nil, fmt.Errorf("cannot edit a playdate that has already started")
	}
	if patch.Rules == nil {
		patch.Rules = []string{}
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE playdates SET
		   title = $1,
		   description = $2,
		   date = $3,
		   location = $4,
		   max_pets = $5,
		   latitude = $6,
		   longitude = $7,
		   city_label = $8,
		   cover_image_url = $9,
		   rules = $10,
		   venue_id = $12
		 WHERE id = $11`,
		patch.Title, patch.Description, patch.Date, patch.Location, patch.MaxPets,
		patch.Latitude, patch.Longitude, patch.CityLabel,
		nilIfEmpty(patch.CoverImageURL), patch.Rules, playdateID, nilIfEmpty(patch.VenueID))
	if err != nil {
		return nil, err
	}
	// Keep conversation title in sync with playdate title.
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET title = $1
		 WHERE id = (SELECT conversation_id FROM playdates WHERE id = $2)`,
		patch.Title, playdateID)
	return s.GetPlaydateForUser(playdateID, userID)
}

// SetPlaydateLock flips the soft-close flag on a playdate. Organizer-only.
// Spec: "Lock state not visible to users (no badge)" — the store simply sets
// the flag, and `JoinPlaydateWithPets` rejects new joins with the generic
// "no longer accepting new attendees" error. Existing attendees + chat are
// unaffected.
func (s *PostgresStore) SetPlaydateLock(hostID string, playdateID string, locked bool) error {
	var organizerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id FROM playdates WHERE id = $1`, playdateID).Scan(&organizerID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if organizerID != hostID {
		return fmt.Errorf("only the organizer can lock this playdate")
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE playdates SET locked = $1 WHERE id = $2`, locked, playdateID)
	return err
}

// KickPlaydateAttendee silently removes every pet belonging to `targetUserID`
// from the playdate, then pops the waitlist FIFO-style to backfill the freed
// seats. Unlike `LeavePlaydateWithPets` this path posts NO system message and
// triggers NO chat-visible event per spec ("silent removal"). Organizer-only.
// Returns promoted user ids so the handler can send them the "You're in!"
// push.
func (s *PostgresStore) KickPlaydateAttendee(hostID string, playdateID string, targetUserID string) ([]string, error) {
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return nil, fmt.Errorf("playdate not found")
	}
	if p.OrganizerID != hostID {
		return nil, fmt.Errorf("only the organizer can remove attendees")
	}
	if targetUserID == hostID {
		return nil, fmt.Errorf("you can't remove yourself — cancel the playdate instead")
	}

	// Count the pets we'll free up so the waitlist-promotion call knows how
	// many slots to pop.
	var freed int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, targetUserID).Scan(&freed)

	// Hard remove from attendees + waitlist in one shot. No system message —
	// this is a silent kick per spec.
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM playdate_pet_attendees WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, targetUserID)
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM playdate_pet_waitlist WHERE playdate_id=$1 AND user_id=$2`,
		playdateID, targetUserID)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE playdates SET attendees = array_remove(attendees, $1) WHERE id=$2`,
		targetUserID, playdateID)
	if p.ConversationID != "" {
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE conversations SET user_ids = array_remove(user_ids, $1) WHERE id=$2`,
			targetUserID, p.ConversationID)
	}

	promoted := s.promoteFromWaitlist(playdateID, freed, p.ConversationID)
	return promoted, nil
}

// TransferPlaydateOwnership hands the host role to another user who is
// already an attendee. Organizer-only. Posts a `host_changed` system message
// into the chat so everyone sees the transition in their timeline.
func (s *PostgresStore) TransferPlaydateOwnership(currentHostID string, playdateID string, newOwnerID string) error {
	p, err := s.getPlaydateRow(playdateID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if p.OrganizerID != currentHostID {
		return fmt.Errorf("only the current organizer can transfer ownership")
	}
	if newOwnerID == "" || newOwnerID == currentHostID {
		return fmt.Errorf("pick a different attendee")
	}
	// The new owner must already be an attendee.
	isAttendee := false
	for _, uid := range p.Attendees {
		if uid == newOwnerID {
			isAttendee = true
			break
		}
	}
	if !isAttendee {
		return fmt.Errorf("new owner must be an attendee first")
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE playdates SET organizer_id = $1 WHERE id = $2`, newOwnerID, playdateID)
	if err != nil {
		return err
	}
	if p.ConversationID != "" {
		var newName string
		_ = s.pool.QueryRow(s.ctx(),
			`SELECT COALESCE(first_name, '') FROM user_profiles WHERE user_id = $1`,
			newOwnerID).Scan(&newName)
		s.insertSystemMessage(p.ConversationID, "host_changed", map[string]any{
			"kind":      "host_changed",
			"userId":    newOwnerID,
			"firstName": newName,
		})
	}
	return nil
}

// PinConversationMessage is a generalised pin toggle that authorises the
// actor as either a group admin (for group conversations) or a playdate
// organizer (for playdate conversations). This is the v0.16.0 equivalent of
// the group-only `SetGroupMessagePinned`, used by the unified
// /v1/conversations/{id}/messages/{msgId}/pin endpoint.
func (s *PostgresStore) PinConversationMessage(actorUserID string, conversationID string, messageID string, pinned bool) error {
	// Confirm the message belongs to this conversation.
	var storedConvID string
	if err := s.pool.QueryRow(s.ctx(),
		`SELECT conversation_id FROM messages WHERE id = $1`, messageID).Scan(&storedConvID); err != nil {
		return fmt.Errorf("message not found")
	}
	if storedConvID != conversationID {
		return fmt.Errorf("message not found")
	}

	// Authorise: group admin OR playdate organizer.
	authorised := false
	if group := s.GetGroupByConversation(conversationID); group != nil {
		if isAdmin, _ := s.IsGroupAdmin(actorUserID, group.ID); isAdmin {
			authorised = true
		}
	}
	if !authorised {
		if pd := s.GetPlaydateByConversation(conversationID); pd != nil && pd.OrganizerID == actorUserID {
			authorised = true
		}
	}
	if !authorised {
		return fmt.Errorf("not authorised to pin messages here")
	}

	if pinned {
		_, err := s.pool.Exec(s.ctx(),
			`UPDATE messages SET pinned_at = NOW(), pinned_by = $1 WHERE id = $2`,
			actorUserID, messageID)
		return err
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = $1`, messageID)
	return err
}

// ListConversationPinnedMessages returns every non-deleted pinned message in
// a conversation, newest pin first. Used by the unified /pinned endpoint.
func (s *PostgresStore) ListConversationPinnedMessages(conversationID string) ([]domain.Message, error) {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, COALESCE(sender_profile_id,''),
		        COALESCE(sender_name,''), COALESCE(sender_avatar_url,''),
		        COALESCE(message_type,'text'), COALESCE(body,''),
		        image_url, COALESCE(metadata::text,'{}'),
		        created_at, deleted_at, COALESCE(deleted_by,''),
		        pinned_at, COALESCE(pinned_by, '')
		 FROM messages
		 WHERE conversation_id = $1 AND deleted_at IS NULL AND pinned_at IS NOT NULL
		 ORDER BY pinned_at DESC`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Message{}
	for rows.Next() {
		var m domain.Message
		var img, metaRaw *string
		var createdAt time.Time
		var deletedAt, pinnedAt *time.Time
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderProfileID,
			&m.SenderName, &m.SenderAvatarURL,
			&m.Type, &m.Body, &img, &metaRaw, &createdAt,
			&deletedAt, &m.DeletedBy, &pinnedAt, &m.PinnedBy); err != nil {
			continue
		}
		if img != nil {
			m.ImageURL = *img
		}
		if metaRaw != nil && *metaRaw != "" {
			var meta map[string]any
			if err := json.Unmarshal([]byte(*metaRaw), &meta); err == nil {
				m.Metadata = meta
			}
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		if pinnedAt != nil {
			s := pinnedAt.Format(time.RFC3339)
			m.PinnedAt = &s
		}
		if deletedAt != nil {
			s := deletedAt.Format(time.RFC3339)
			m.DeletedAt = &s
		}
		out = append(out, m)
	}
	return out, nil
}

// PostPlaydateAnnouncement posts a host announcement into the playdate's
// dedicated conversation as a system message. Organizer-only.
func (s *PostgresStore) PostPlaydateAnnouncement(userID string, playdateID string, body string) error {
	body = strings.TrimSpace(body)
	if body == "" {
		return fmt.Errorf("announcement body required")
	}
	var organizerID, convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id, COALESCE(conversation_id, '') FROM playdates WHERE id = $1`,
		playdateID).Scan(&organizerID, &convID)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if organizerID != userID {
		return fmt.Errorf("only the organizer can post announcements")
	}
	if convID == "" {
		return fmt.Errorf("playdate has no conversation")
	}
	// Insert the announcement as a system message AND pin it so it surfaces
	// in the chat's pinned banner until the host dismisses it. We can't
	// reuse `insertSystemMessage` directly because it doesn't return the new
	// id — inline the insert here instead.
	meta := map[string]any{"type": "playdate_announcement", "kind": "playdate_announcement"}
	metaJSON, _ := json.Marshal(meta)
	msgID := newID("message")
	now := time.Now().UTC()
	if _, err := s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name,
		                        message_type, body, metadata, created_at, pinned_at, pinned_by)
		 VALUES ($1, $2, '', '', 'system', $3, $4::jsonb, $5, $5, $6)`,
		msgID, convID, body, string(metaJSON), now, userID); err != nil {
		return fmt.Errorf("post announcement: %w", err)
	}
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, convID, now)
	return nil
}

// ── Playdate invites (v0.13.0) ───────────────────────────────────────

// CreatePlaydateInvites inserts one pending invite per target user. Host-only.
// Returns the list of invites actually created (skipping duplicates, the host
// themselves, and users already attending).
func (s *PostgresStore) CreatePlaydateInvites(hostID string, playdateID string, invitedUserIds []string) ([]domain.PlaydateInvite, error) {
	var organizerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id FROM playdates WHERE id = $1`, playdateID).Scan(&organizerID)
	if err != nil {
		return nil, fmt.Errorf("playdate not found")
	}
	if organizerID != hostID {
		return nil, fmt.Errorf("only the organizer can invite")
	}

	created := []domain.PlaydateInvite{}
	for _, uid := range invitedUserIds {
		if uid == "" || uid == hostID {
			continue
		}
		inviteID := newID("pdinv")
		tag, err := s.pool.Exec(s.ctx(),
			`INSERT INTO playdate_invites (id, playdate_id, host_user_id, invited_user_id, status)
			 VALUES ($1, $2, $3, $4, 'pending')
			 ON CONFLICT (playdate_id, invited_user_id) DO NOTHING`,
			inviteID, playdateID, hostID, uid)
		if err != nil {
			log.Printf("[PLAYDATE-INVITE-ERR] %v", err)
			continue
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		created = append(created, domain.PlaydateInvite{
			ID:            inviteID,
			PlaydateID:    playdateID,
			HostUserID:    hostID,
			InvitedUserID: uid,
			Status:        "pending",
			CreatedAt:     time.Now().UTC().Format(time.RFC3339),
		})
	}
	return created, nil
}

// ListInvitableUsers returns only users the host has a live match with —
// v0.11.0 tightens the definition after the product team said group
// acquaintances and DMs should not surface as inviteable, only reciprocal
// matches. Users already invited or attending are excluded.
//
// The query resolves match peers via pets.owner_id: for every match row
// involving one of the host's pets, the peer pet's owner is the candidate.
func (s *PostgresStore) ListInvitableUsers(hostID string, playdateID string) ([]domain.InvitableUser, error) {
	hostPetIDs := s.getUserPetIDs(hostID)
	if len(hostPetIDs) == 0 {
		return []domain.InvitableUser{}, nil
	}
	rows, err := s.pool.Query(s.ctx(),
		`WITH peer_pets AS (
			SELECT CASE WHEN m.pet_a_id = ANY($3) THEN m.pet_b_id ELSE m.pet_a_id END AS peer_pet_id
			FROM matches m
			WHERE (m.pet_a_id = ANY($3) OR m.pet_b_id = ANY($3))
			  AND m.status = 'active'
		),
		peer_users AS (
			SELECT DISTINCT p.owner_id AS uid
			FROM peer_pets pp
			JOIN pets p ON p.id = pp.peer_pet_id
			WHERE p.owner_id IS NOT NULL AND p.owner_id != $1
		)
		SELECT up.user_id,
		       COALESCE(up.first_name, ''),
		       COALESCE(up.avatar_url, '')
		FROM peer_users c
		JOIN user_profiles up ON up.user_id = c.uid
		WHERE c.uid NOT IN (
		    SELECT invited_user_id FROM playdate_invites WHERE playdate_id = $2
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM playdate_pet_attendees ppa
		    WHERE ppa.playdate_id = $2 AND ppa.user_id = c.uid
		  )
		ORDER BY up.first_name`, hostID, playdateID, hostPetIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.InvitableUser{}
	for rows.Next() {
		var u domain.InvitableUser
		if err := rows.Scan(&u.UserID, &u.FirstName, &u.AvatarURL); err == nil {
			out = append(out, u)
		}
	}
	return out, nil
}

// ListMyPendingPlaydateInvites returns every pending invite the caller has.
// Used by the invitee inbox / notifications screen.
func (s *PostgresStore) ListMyPendingPlaydateInvites(userID string) []domain.PlaydateInvite {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT pi.id, pi.playdate_id, pi.host_user_id, pi.invited_user_id, pi.status, pi.created_at,
		        COALESCE(p.title,''), COALESCE(p.date,''), COALESCE(p.city_label,''),
		        COALESCE(up.first_name,''), COALESCE(up.avatar_url,'')
		 FROM playdate_invites pi
		 JOIN playdates p ON p.id = pi.playdate_id
		 LEFT JOIN user_profiles up ON up.user_id = pi.host_user_id
		 WHERE pi.invited_user_id = $1 AND pi.status = 'pending' AND p.status = 'active'
		 ORDER BY pi.created_at DESC`, userID)
	if err != nil {
		return []domain.PlaydateInvite{}
	}
	defer rows.Close()
	out := []domain.PlaydateInvite{}
	for rows.Next() {
		var inv domain.PlaydateInvite
		var createdAt time.Time
		if err := rows.Scan(&inv.ID, &inv.PlaydateID, &inv.HostUserID, &inv.InvitedUserID, &inv.Status, &createdAt,
			&inv.PlaydateTitle, &inv.PlaydateDate, &inv.PlaydateCity,
			&inv.HostFirstName, &inv.HostAvatarURL); err != nil {
			continue
		}
		inv.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, inv)
	}
	return out
}

// RespondToPlaydateInvite marks an invite as accepted or declined. The caller
// must be the invitee. On accept we do NOT auto-join — the mobile flow then
// calls the existing pet-level JoinPlaydateWithPets so the invitee picks which
// pets to bring.
func (s *PostgresStore) RespondToPlaydateInvite(userID string, inviteID string, accept bool) (playdateID string, err error) {
	var invitedUserID string
	err = s.pool.QueryRow(s.ctx(),
		`SELECT playdate_id, invited_user_id FROM playdate_invites WHERE id = $1`,
		inviteID).Scan(&playdateID, &invitedUserID)
	if err != nil {
		return "", fmt.Errorf("invite not found")
	}
	if invitedUserID != userID {
		return "", fmt.Errorf("this invite is not yours")
	}
	status := "declined"
	if accept {
		status = "accepted"
	}
	_, err = s.pool.Exec(s.ctx(),
		`UPDATE playdate_invites SET status = $1, responded_at = NOW() WHERE id = $2`,
		status, inviteID)
	return playdateID, err
}

// ClaimPlaydateShareToken validates that `token` matches the playdate's
// share_token, and if so upserts a pending row in playdate_invites for the
// caller. This is the bridge between an externally-shared WhatsApp link and
// the GetPlaydateForUser visibility gate, which only admits hosts, attendees,
// waitlisters, and users with an invite row.
//
// Idempotent: calling twice is a no-op thanks to the unique index on
// (playdate_id, invited_user_id). The caller's existing status (accepted /
// declined) is preserved so a re-opened link doesn't resurrect a declined
// invite.
func (s *PostgresStore) ClaimPlaydateShareToken(userID string, playdateID string, token string) error {
	if userID == "" || playdateID == "" || token == "" {
		return fmt.Errorf("invalid share token")
	}
	var (
		organizerID string
		stored      string
	)
	err := s.pool.QueryRow(s.ctx(),
		`SELECT organizer_id, COALESCE(share_token, '') FROM playdates WHERE id = $1`,
		playdateID).Scan(&organizerID, &stored)
	if err != nil {
		return fmt.Errorf("playdate not found")
	}
	if stored == "" || stored != token {
		return fmt.Errorf("invalid share token")
	}
	// Host shouldn't be invited to their own playdate — just succeed silently
	// so the mobile flow doesn't special-case this.
	if organizerID == userID {
		return nil
	}
	inviteID := newID("inv")
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO playdate_invites (id, playdate_id, host_user_id, invited_user_id, status)
		 VALUES ($1, $2, $3, $4, 'pending')
		 ON CONFLICT (playdate_id, invited_user_id) DO NOTHING`,
		inviteID, playdateID, organizerID, userID)
	return err
}

func (s *PostgresStore) ListGroups(params ListGroupsParams) []domain.CommunityGroup {
	// Build dynamic query
	query := `SELECT g.id, g.name, g.description, g.pet_type, g.member_count,
	                  g.image_url, g.conversation_id, g.created_at,
	                  g.latitude, g.longitude, g.city_label, COALESCE(g.code,''), g.is_private,
	                  COALESCE(g.category, ''), COALESCE(g.hashtags, '{}'), COALESCE(g.rules, '{}'),
	                  EXISTS(SELECT 1 FROM conversations c WHERE c.id = g.conversation_id AND $1 = ANY(c.user_ids))
	           FROM community_groups g
	           WHERE (g.is_private = FALSE OR EXISTS(SELECT 1 FROM conversations c2 WHERE c2.id = g.conversation_id AND $1 = ANY(c2.user_ids)))`
	args := []any{params.UserID}
	argIdx := 2

	if params.Search != "" {
		query += fmt.Sprintf(` AND (g.name ILIKE '%%' || $%d || '%%' OR g.description ILIKE '%%' || $%d || '%%')`, argIdx, argIdx)
		args = append(args, params.Search)
		argIdx++
	}
	if params.PetType != "" && params.PetType != "all" {
		query += fmt.Sprintf(` AND g.pet_type = $%d`, argIdx)
		args = append(args, params.PetType)
		argIdx++
	}
	query += ` ORDER BY g.created_at DESC`

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.CommunityGroup{}
	}
	defer rows.Close()

	var out []domain.CommunityGroup
	for rows.Next() {
		var g domain.CommunityGroup
		var img, convID *string
		var createdAt time.Time
		if err := rows.Scan(&g.ID, &g.Name, &g.Description, &g.PetType, &g.MemberCount,
			&img, &convID, &createdAt,
			&g.Latitude, &g.Longitude, &g.CityLabel, &g.Code, &g.IsPrivate,
			&g.Category, &g.Hashtags, &g.Rules,
			&g.IsMember); err != nil {
			continue
		}
		if g.Hashtags == nil {
			g.Hashtags = []string{}
		}
		if g.Rules == nil {
			g.Rules = []string{}
		}
		g.CreatedAt = createdAt.Format(time.RFC3339)
		if img != nil {
			g.ImageURL = *img
		}
		if convID != nil {
			g.ConversationID = *convID
		}

		// Compute distance if user location provided
		if params.Lat != 0 && params.Lng != 0 && g.Latitude != 0 && g.Longitude != 0 {
			g.Distance = service.Haversine(params.Lat, params.Lng, g.Latitude, g.Longitude)
		}

		// Fetch member profiles via unnest
		g.Members = []domain.GroupMember{}
		if g.ConversationID != "" {
			memberRows, err := s.pool.Query(s.ctx(),
				`SELECT up.user_id, up.first_name, COALESCE(up.avatar_url,'')
				 FROM user_profiles up
				 WHERE up.user_id IN (
				     SELECT unnest(c.user_ids) FROM conversations c WHERE c.id = $1
				 )`, g.ConversationID)
			if err == nil {
				for memberRows.Next() {
					var m domain.GroupMember
					memberRows.Scan(&m.UserID, &m.FirstName, &m.AvatarURL)
					m.Pets = []domain.MemberPet{}
					g.Members = append(g.Members, m)
				}
				memberRows.Close()
			}
		}

		// Strip private code for non-members
		if !g.IsMember {
			g.Code = ""
		}

		out = append(out, g)
	}

	// Sort by distance if location provided
	if params.Lat != 0 && params.Lng != 0 {
		sort.Slice(out, func(i, j int) bool {
			return out[i].Distance < out[j].Distance
		})
	}

	if out == nil {
		return []domain.CommunityGroup{}
	}
	return out
}

func (s *PostgresStore) GetGroupByConversation(conversationID string) *domain.CommunityGroup {
	var g domain.CommunityGroup
	var img, convID *string
	var createdAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, name, description, pet_type, member_count, image_url, conversation_id, created_at,
		        latitude, longitude, city_label, COALESCE(code,''), is_private,
		        COALESCE(category, ''), COALESCE(hashtags, '{}'), COALESCE(rules, '{}'),
		        COALESCE(owner_user_id, '')
		 FROM community_groups WHERE conversation_id = $1`, conversationID).Scan(
		&g.ID, &g.Name, &g.Description, &g.PetType, &g.MemberCount, &img, &convID, &createdAt,
		&g.Latitude, &g.Longitude, &g.CityLabel, &g.Code, &g.IsPrivate,
		&g.Category, &g.Hashtags, &g.Rules, &g.OwnerUserID)
	if err != nil {
		return nil
	}
	g.CreatedAt = createdAt.Format(time.RFC3339)
	if img != nil {
		g.ImageURL = *img
	}
	if convID != nil {
		g.ConversationID = *convID
	}
	if g.Hashtags == nil {
		g.Hashtags = []string{}
	}
	if g.Rules == nil {
		g.Rules = []string{}
	}

	// Get conversation user_ids for members
	var userIDs []string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)

	g.Members = []domain.GroupMember{}
	if len(userIDs) > 0 {
		// Fetch member profiles + per-member mute state in a single query.
		// LEFT JOIN community_group_mutes so non-muted users still appear.
		memberRows, err := s.pool.Query(s.ctx(),
			`SELECT up.user_id, up.first_name, COALESCE(up.avatar_url,''),
			        cgm.user_id IS NOT NULL AS is_muted_row,
			        cgm.muted_until
			 FROM user_profiles up
			 LEFT JOIN community_group_mutes cgm
			   ON cgm.group_id = $2 AND cgm.user_id = up.user_id
			 WHERE up.user_id = ANY($1)`, userIDs, g.ID)
		if err == nil {
			nowUTC := time.Now().UTC()
			for memberRows.Next() {
				var m domain.GroupMember
				var hasMuteRow bool
				var mutedUntil *time.Time
				if err := memberRows.Scan(&m.UserID, &m.FirstName, &m.AvatarURL, &hasMuteRow, &mutedUntil); err != nil {
					continue
				}
				m.Pets = []domain.MemberPet{}
				// Treat expired rows as unmuted — GetGroupMute cleans them lazily.
				if hasMuteRow && (mutedUntil == nil || mutedUntil.After(nowUTC)) {
					m.IsMuted = true
					if mutedUntil != nil {
						s := mutedUntil.Format(time.RFC3339)
						m.MutedUntil = &s
					}
				}
				g.Members = append(g.Members, m)
			}
			memberRows.Close()
		}

		// Fetch pets for each member, filtered by group petType
		for i, member := range g.Members {
			var petQuery string
			var petArgs []any
			if g.PetType != "" && g.PetType != "all" {
				petQuery = `SELECT p.id, p.name, COALESCE((SELECT url FROM pet_photos WHERE pet_id = p.id ORDER BY display_order LIMIT 1),'')
					FROM pets p WHERE p.owner_id = $1 AND p.is_hidden = false AND LOWER(p.species_label) = LOWER($2)`
				petArgs = []any{member.UserID, g.PetType}
			} else {
				petQuery = `SELECT p.id, p.name, COALESCE((SELECT url FROM pet_photos WHERE pet_id = p.id ORDER BY display_order LIMIT 1),'')
					FROM pets p WHERE p.owner_id = $1 AND p.is_hidden = false`
				petArgs = []any{member.UserID}
			}
			petRows, err := s.pool.Query(s.ctx(), petQuery, petArgs...)
			if err == nil {
				for petRows.Next() {
					var pet domain.MemberPet
					petRows.Scan(&pet.ID, &pet.Name, &pet.PhotoURL)
					g.Members[i].Pets = append(g.Members[i].Pets, pet)
				}
				petRows.Close()
			}
		}
	}

	// Load extra admin IDs for this group.
	adminRows, err := s.pool.Query(s.ctx(),
		`SELECT user_id FROM community_group_admins WHERE group_id = $1`, g.ID)
	if err == nil {
		g.AdminUserIDs = []string{}
		for adminRows.Next() {
			var uid string
			if err := adminRows.Scan(&uid); err == nil {
				g.AdminUserIDs = append(g.AdminUserIDs, uid)
			}
		}
		adminRows.Close()
	}

	return &g
}

func (s *PostgresStore) CreateGroup(creatorUserID string, group domain.CommunityGroup) domain.CommunityGroup {
	group.ID = newID("grp")
	group.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	convID := newID("conv")
	group.ConversationID = convID

	// Auto-generate 6-char invite code for EVERY group. Members share this
	// code to invite others; public groups use it for convenience too.
	if group.Code == "" {
		group.Code = generateGroupCode()
	}

	if group.Hashtags == nil {
		group.Hashtags = []string{}
	}
	if group.Rules == nil {
		group.Rules = []string{}
	}

	// Conversation user_ids starts with creator (if provided)
	convUserIDs := []string{}
	if creatorUserID != "" {
		convUserIDs = []string{creatorUserID}
		group.MemberCount = 1
	}

	s.pool.Exec(s.ctx(), `INSERT INTO conversations(id,match_id,title,subtitle,user_ids,last_message_at) VALUES($1,'',$2,'',$3,NOW())`, convID, group.Name, convUserIDs)
	s.pool.Exec(s.ctx(),
		`INSERT INTO community_groups(id,name,description,pet_type,category,member_count,image_url,conversation_id,latitude,longitude,city_label,code,is_private,hashtags,rules,owner_user_id,created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		group.ID, group.Name, group.Description, group.PetType, group.Category, group.MemberCount, nilIfEmpty(group.ImageURL), group.ConversationID,
		group.Latitude, group.Longitude, group.CityLabel, nilIfEmpty(group.Code), group.IsPrivate, group.Hashtags, group.Rules, creatorUserID, group.CreatedAt)

	// Mark creator as member + owner in returned struct
	if creatorUserID != "" {
		group.IsMember = true
		group.OwnerUserID = creatorUserID
		group.IsOwner = true
		group.IsAdmin = true
	}
	return group
}

// generateGroupCode produces a 6-character random code (A-Z + 0-9, no ambiguous chars)
func generateGroupCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	for i := range b {
		buf := make([]byte, 1)
		_, _ = cryptorand.Read(buf)
		b[i] = charset[int(buf[0])%len(charset)]
	}
	return string(b)
}

func (s *PostgresStore) JoinGroup(userID string, groupID string) error {
	var convID string
	err := s.pool.QueryRow(s.ctx(), `SELECT conversation_id FROM community_groups WHERE id=$1`, groupID).Scan(&convID)
	if err != nil || convID == "" {
		return fmt.Errorf("group not found")
	}

	// Check if user is already a member (SQL EXISTS — no array scan)
	var alreadyMember bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1 AND $2 = ANY(user_ids))`,
		convID, userID).Scan(&alreadyMember)
	if alreadyMember {
		return nil
	}

	// Add user to conversation
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET user_ids = array_append(user_ids, $1) WHERE id=$2 AND NOT ($1 = ANY(user_ids))`,
		userID, convID)

	// Sync member count from actual array length
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE community_groups SET member_count = (
			SELECT COALESCE(array_length(user_ids, 1), 0) FROM conversations WHERE id = $2
		) WHERE id = $1`, groupID, convID)

	// System message: {firstName} joined the group
	var firstName string
	_ = s.pool.QueryRow(s.ctx(), `SELECT COALESCE(first_name,'') FROM user_profiles WHERE user_id=$1`, userID).Scan(&firstName)
	s.insertSystemMessage(convID, "member_joined", map[string]any{
		"kind":      "member_joined",
		"userId":    userID,
		"firstName": firstName,
	})
	return nil
}

func (s *PostgresStore) JoinGroupByCode(userID string, code string) (*domain.CommunityGroup, error) {
	var groupID, convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, conversation_id FROM community_groups WHERE code = $1 AND code != ''`, code).Scan(&groupID, &convID)
	if err != nil {
		return nil, fmt.Errorf("invalid group code")
	}

	// Reuse JoinGroup logic
	if err := s.JoinGroup(userID, groupID); err != nil {
		return nil, err
	}

	// Return the group
	var g domain.CommunityGroup
	var img *string
	var createdAt time.Time
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT id, name, description, pet_type, member_count, image_url, conversation_id, created_at
		 FROM community_groups WHERE id = $1`, groupID).Scan(
		&g.ID, &g.Name, &g.Description, &g.PetType, &g.MemberCount, &img, &convID, &createdAt)
	g.CreatedAt = createdAt.Format(time.RFC3339)
	g.ConversationID = convID
	g.IsMember = true
	if img != nil {
		g.ImageURL = *img
	}
	return &g, nil
}

// ================================================================
// Lost Pets
// ================================================================

func (s *PostgresStore) ListLostPets() []domain.LostPetAlert {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, user_id, description, last_seen_location, last_seen_date, status, contact_phone, image_url, created_at FROM lost_pet_alerts ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.LostPetAlert
	for rows.Next() {
		var a domain.LostPetAlert
		var img *string
		rows.Scan(&a.ID, &a.PetID, &a.UserID, &a.Description, &a.LastSeenLocation, &a.LastSeenDate, &a.Status, &a.ContactPhone, &img, &a.CreatedAt)
		a.ImageURL = img
		out = append(out, a)
	}
	if out == nil { return []domain.LostPetAlert{} }
	return out
}

func (s *PostgresStore) CreateLostPetAlert(alert domain.LostPetAlert) domain.LostPetAlert {
	alert.ID = newID("lost")
	alert.Status = "active"
	alert.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO lost_pet_alerts(id,pet_id,user_id,description,last_seen_location,last_seen_date,status,contact_phone,image_url,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		alert.ID, alert.PetID, alert.UserID, alert.Description, alert.LastSeenLocation, alert.LastSeenDate, alert.Status, alert.ContactPhone, alert.ImageURL, alert.CreatedAt)
	return alert
}

func (s *PostgresStore) UpdateLostPetStatus(alertID string, status string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE lost_pet_alerts SET status=$1 WHERE id=$2`, status, alertID)
	return err
}

// ================================================================
// Badges
// ================================================================

func (s *PostgresStore) ListBadges(userID string) []domain.Badge {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, type, title, description, earned_at FROM badges WHERE user_id=$1 ORDER BY earned_at DESC`, userID)
	defer rows.Close()
	var out []domain.Badge
	for rows.Next() {
		var b domain.Badge
		rows.Scan(&b.ID, &b.UserID, &b.Type, &b.Title, &b.Description, &b.EarnedAt)
		out = append(out, b)
	}
	if out == nil { return []domain.Badge{} }
	return out
}

func (s *PostgresStore) AwardBadge(userID string, badgeType string, title string, description string) {
	s.pool.Exec(s.ctx(), `INSERT INTO badges(id,user_id,type,title,description,earned_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id,type) DO NOTHING`,
		newID("badge"), userID, badgeType, title, description)
}

// ================================================================
// Training Tips
// ================================================================

func (s *PostgresStore) ListTrainingTips(petType string) []domain.TrainingTip {
	var rows pgx.Rows
	if petType != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips WHERE pet_type=$1 OR pet_type='all' ORDER BY title`, petType)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips ORDER BY title`)
	}
	defer rows.Close()
	var out []domain.TrainingTip
	for rows.Next() {
		var t domain.TrainingTip
		var vu *string
		rows.Scan(&t.ID, &t.Title, &t.Summary, &t.Body, &t.Category, &t.PetType, &t.Difficulty, &vu)
		if vu != nil { t.VideoURL = *vu }
		t.Steps = s.fetchTipSteps(t.ID)
		out = append(out, t)
	}
	if out == nil { return []domain.TrainingTip{} }
	return out
}

func (s *PostgresStore) fetchTipSteps(tipID string) []domain.TrainingTipStep {
	rows, _ := s.pool.Query(s.ctx(), `SELECT step_order, title, description, video_url FROM training_tip_steps WHERE tip_id=$1 ORDER BY step_order`, tipID)
	defer rows.Close()
	var out []domain.TrainingTipStep
	for rows.Next() {
		var st domain.TrainingTipStep
		var vu *string
		rows.Scan(&st.Order, &st.Title, &st.Description, &vu)
		if vu != nil { st.VideoURL = *vu }
		out = append(out, st)
	}
	if out == nil { return []domain.TrainingTipStep{} }
	return out
}

func (s *PostgresStore) CreateTrainingTip(tip domain.TrainingTip) domain.TrainingTip {
	tip.ID = newID("tip")
	s.pool.Exec(s.ctx(), `INSERT INTO training_tips(id,title,summary,body,category,pet_type,difficulty,video_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		tip.ID, tip.Title, tip.Summary, tip.Body, tip.Category, tip.PetType, tip.Difficulty, nilIfEmpty(tip.VideoURL))
	for i, step := range tip.Steps {
		s.pool.Exec(s.ctx(), `INSERT INTO training_tip_steps(id,tip_id,step_order,title,description,video_url) VALUES($1,$2,$3,$4,$5,$6)`,
			newID("step"), tip.ID, i+1, step.Title, step.Description, nilIfEmpty(step.VideoURL))
	}
	return tip
}

func (s *PostgresStore) GetTrainingTip(tipID string) (*domain.TrainingTip, error) {
	var t domain.TrainingTip
	var vu *string
	err := s.pool.QueryRow(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips WHERE id=$1`, tipID).
		Scan(&t.ID, &t.Title, &t.Summary, &t.Body, &t.Category, &t.PetType, &t.Difficulty, &vu)
	if err != nil { return nil, fmt.Errorf("tip not found") }
	if vu != nil { t.VideoURL = *vu }
	t.Steps = s.fetchTipSteps(tipID)
	return &t, nil
}

func (s *PostgresStore) UpdateTrainingTip(tip domain.TrainingTip) (domain.TrainingTip, error) {
	s.pool.Exec(s.ctx(), `UPDATE training_tips SET title=$1,summary=$2,body=$3,category=$4,pet_type=$5,difficulty=$6,video_url=$7 WHERE id=$8`,
		tip.Title, tip.Summary, tip.Body, tip.Category, tip.PetType, tip.Difficulty, nilIfEmpty(tip.VideoURL), tip.ID)
	s.pool.Exec(s.ctx(), `DELETE FROM training_tip_steps WHERE tip_id=$1`, tip.ID)
	for i, step := range tip.Steps {
		s.pool.Exec(s.ctx(), `INSERT INTO training_tip_steps(id,tip_id,step_order,title,description,video_url) VALUES($1,$2,$3,$4,$5,$6)`,
			newID("step"), tip.ID, i+1, step.Title, step.Description, nilIfEmpty(step.VideoURL))
	}
	return tip, nil
}

func (s *PostgresStore) BookmarkTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `INSERT INTO user_tip_bookmarks(user_id,tip_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, tipID)
	return err
}

func (s *PostgresStore) UnbookmarkTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM user_tip_bookmarks WHERE user_id=$1 AND tip_id=$2`, userID, tipID)
	return err
}

func (s *PostgresStore) CompleteTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `INSERT INTO user_tip_completions(user_id,tip_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, tipID)
	return err
}

func (s *PostgresStore) GetTipUserState(userID string) (map[string]bool, map[string]bool) {
	bookmarks := make(map[string]bool)
	completed := make(map[string]bool)
	rows, _ := s.pool.Query(s.ctx(), `SELECT tip_id FROM user_tip_bookmarks WHERE user_id=$1`, userID)
	for rows.Next() { var id string; rows.Scan(&id); bookmarks[id] = true }
	rows.Close()
	rows2, _ := s.pool.Query(s.ctx(), `SELECT tip_id FROM user_tip_completions WHERE user_id=$1`, userID)
	for rows2.Next() { var id string; rows2.Scan(&id); completed[id] = true }
	rows2.Close()
	return bookmarks, completed
}

// ================================================================
// Vet Clinics
// ================================================================

func (s *PostgresStore) ListVetClinics() []domain.VetClinic {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, name, phone, address, latitude, longitude, city, is_emergency, website, hours FROM vet_clinics`)
	defer rows.Close()
	var out []domain.VetClinic
	for rows.Next() {
		var c domain.VetClinic
		var web, hrs *string
		rows.Scan(&c.ID, &c.Name, &c.Phone, &c.Address, &c.Latitude, &c.Longitude, &c.City, &c.IsEmergency, &web, &hrs)
		if web != nil { c.Website = *web }
		if hrs != nil { c.Hours = *hrs }
		out = append(out, c)
	}
	if out == nil { return []domain.VetClinic{} }
	return out
}

func (s *PostgresStore) CreateVetClinic(clinic domain.VetClinic) domain.VetClinic {
	clinic.ID = newID("vet")
	s.pool.Exec(s.ctx(), `INSERT INTO vet_clinics(id,name,phone,address,latitude,longitude,city,is_emergency,website,hours) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		clinic.ID, clinic.Name, clinic.Phone, clinic.Address, clinic.Latitude, clinic.Longitude, clinic.City, clinic.IsEmergency, nilIfEmpty(clinic.Website), nilIfEmpty(clinic.Hours))
	return clinic
}

func (s *PostgresStore) DeleteVetClinic(clinicID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM vet_clinics WHERE id=$1`, clinicID)
	return err
}

// ================================================================
// Pet Sitters
// ================================================================

func (s *PostgresStore) ListPetSitters(city string) []domain.PetSitter {
	var rows pgx.Rows
	if city != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude FROM pet_sitters WHERE city_label=$1`, city)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude FROM pet_sitters`)
	}
	defer rows.Close()
	var out []domain.PetSitter
	for rows.Next() {
		var p domain.PetSitter
		var av *string
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Bio, &p.HourlyRate, &p.Currency, &p.Phone, &p.Rating, &p.ReviewCount, &p.Services, &p.CityLabel, &av, &p.Latitude, &p.Longitude)
		p.AvatarURL = av
		if p.Services == nil { p.Services = []string{} }
		out = append(out, p)
	}
	if out == nil { return []domain.PetSitter{} }
	return out
}

func (s *PostgresStore) CreatePetSitter(sitter domain.PetSitter) domain.PetSitter {
	sitter.ID = newID("sitter")
	if sitter.Services == nil { sitter.Services = []string{} }
	s.pool.Exec(s.ctx(), `INSERT INTO pet_sitters(id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		sitter.ID, sitter.UserID, sitter.Name, sitter.Bio, sitter.HourlyRate, sitter.Currency, sitter.Phone, sitter.Rating, sitter.ReviewCount, sitter.Services, sitter.CityLabel, sitter.AvatarURL, sitter.Latitude, sitter.Longitude)
	return sitter
}

// ================================================================
// Push Notifications
// ================================================================

func (s *PostgresStore) SavePushToken(userID string, token string, platform string) {
	s.pool.Exec(s.ctx(), `INSERT INTO push_tokens(id,user_id,token,platform) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,token) DO NOTHING`,
		newID("pt"), userID, token, platform)
}

func (s *PostgresStore) ListAllPushTokens() []domain.PushToken {
	rows, _ := s.pool.Query(s.ctx(), `SELECT user_id, token, platform, created_at FROM push_tokens`)
	defer rows.Close()
	var out []domain.PushToken
	for rows.Next() {
		var t domain.PushToken
		rows.Scan(&t.UserID, &t.Token, &t.Platform, &t.CreatedAt)
		out = append(out, t)
	}
	if out == nil { return []domain.PushToken{} }
	return out
}

func (s *PostgresStore) GetUserPushTokens(userID string) []domain.PushToken {
	rows, _ := s.pool.Query(s.ctx(), `SELECT user_id, token, platform, created_at FROM push_tokens WHERE user_id=$1`, userID)
	defer rows.Close()
	var out []domain.PushToken
	for rows.Next() {
		var t domain.PushToken
		rows.Scan(&t.UserID, &t.Token, &t.Platform, &t.CreatedAt)
		out = append(out, t)
	}
	if out == nil { return []domain.PushToken{} }
	return out
}

func (s *PostgresStore) SaveNotification(notification domain.Notification) {
	if notification.ID == "" { notification.ID = newID("notif") }
	if notification.SentAt == "" { notification.SentAt = time.Now().UTC().Format(time.RFC3339) }
	s.pool.Exec(s.ctx(), `INSERT INTO notifications(id,title,body,target,sent_at,sent_by) VALUES($1,$2,$3,$4,$5,$6)`,
		notification.ID, notification.Title, notification.Body, notification.Target, notification.SentAt, notification.SentBy)
}

func (s *PostgresStore) ListNotifications() []domain.Notification {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, title, body, target, sent_at, sent_by FROM notifications ORDER BY sent_at DESC`)
	defer rows.Close()
	var out []domain.Notification
	for rows.Next() {
		var n domain.Notification
		var sentAt time.Time
		rows.Scan(&n.ID, &n.Title, &n.Body, &n.Target, &sentAt, &n.SentBy)
		n.SentAt = sentAt.Format(time.RFC3339)
		out = append(out, n)
	}
	if out == nil { return []domain.Notification{} }
	return out
}

// ================================================================
// Reports (remaining)
// ================================================================

func (s *PostgresStore) ListReports() []domain.ReportSummary {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, reason, reporter_id, reporter_name, target_type, target_id, target_label, status, notes, resolved_at, created_at FROM reports ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.ReportSummary
	for rows.Next() {
		var r domain.ReportSummary
		var notes, resolvedAt *string
		rows.Scan(&r.ID, &r.Reason, &r.ReporterID, &r.ReporterName, &r.TargetType, &r.TargetID, &r.TargetLabel, &r.Status, &notes, &resolvedAt, &r.CreatedAt)
		if notes != nil { r.Notes = *notes }
		if resolvedAt != nil { r.ResolvedAt = *resolvedAt }
		out = append(out, r)
	}
	if out == nil { return []domain.ReportSummary{} }
	return out
}

func (s *PostgresStore) ResolveReport(reportID string, notes string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE reports SET status='resolved', notes=$1, resolved_at=NOW() WHERE id=$2`, notes, reportID)
	return err
}

func (s *PostgresStore) GetReportDetail(reportID string) (*domain.ReportDetail, error) {
	var r domain.ReportSummary
	var notes sql.NullString
	var resolvedAt, createdAt sql.NullTime
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, reason, reporter_id, reporter_name, target_type, target_id, target_label, status, notes, resolved_at, created_at
		 FROM reports WHERE id=$1`, reportID).
		Scan(&r.ID, &r.Reason, &r.ReporterID, &r.ReporterName, &r.TargetType, &r.TargetID, &r.TargetLabel, &r.Status, &notes, &resolvedAt, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("report not found: %w", err)
	}
	if notes.Valid {
		r.Notes = notes.String
	}
	if resolvedAt.Valid {
		r.ResolvedAt = resolvedAt.Time.UTC().Format(time.RFC3339)
	}
	if createdAt.Valid {
		r.CreatedAt = createdAt.Time.UTC().Format(time.RFC3339)
	}
	detail := &domain.ReportDetail{ReportSummary: r}

	// Hydrate target-specific context for the admin detail page.
	switch r.TargetType {
	case "post":
		if post, err := s.getReportPostBrief(r.TargetID); err == nil {
			detail.Post = post
		}
	case "pet":
		if pet, err := s.getReportPetBrief(r.TargetID); err == nil {
			detail.Pet = pet
		}
	case "chat":
		detail.ChatMessages, detail.ChatUsers = s.getReportChatContext(r.TargetID)
	}
	return detail, nil
}

func (s *PostgresStore) getReportPostBrief(postID string) (*domain.ReportPostBrief, error) {
	var out domain.ReportPostBrief
	var imageURL sql.NullString
	var avatarURL sql.NullString
	var createdAt sql.NullTime
	err := s.pool.QueryRow(s.ctx(),
		`SELECT po.id, COALESCE(po.body,''), po.image_url, po.author_user_id,
		        COALESCE(p.first_name || ' ' || p.last_name, u.email, '') AS author_name,
		        p.avatar_url,
		        COALESCE(po.like_count, 0), po.created_at
		 FROM posts po
		 LEFT JOIN user_profiles p ON p.user_id = po.author_user_id
		 LEFT JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.id = $1`, postID).
		Scan(&out.ID, &out.Body, &imageURL, &out.AuthorID, &out.AuthorName, &avatarURL, &out.LikeCount, &createdAt)
	if err != nil {
		return nil, err
	}
	if imageURL.Valid {
		v := imageURL.String
		out.ImageURL = &v
	}
	if avatarURL.Valid {
		v := avatarURL.String
		out.AuthorAvatarURL = &v
	}
	if createdAt.Valid {
		out.CreatedAt = createdAt.Time.UTC().Format(time.RFC3339)
	}
	return &out, nil
}

func (s *PostgresStore) getReportPetBrief(petID string) (*domain.ReportPetBrief, error) {
	var out domain.ReportPetBrief
	var ownerAvatarURL sql.NullString
	err := s.pool.QueryRow(s.ctx(),
		`SELECT p.id, p.name, COALESCE(p.species_label,''), COALESCE(p.breed_label,''),
		        COALESCE(p.is_hidden, false), p.owner_id,
		        COALESCE(up.first_name || ' ' || up.last_name, u.email, '') AS owner_name,
		        up.avatar_url
		 FROM pets p
		 LEFT JOIN user_profiles up ON up.user_id = p.owner_id
		 LEFT JOIN app_users u ON u.id = p.owner_id
		 WHERE p.id = $1`, petID).
		Scan(&out.ID, &out.Name, &out.SpeciesLabel, &out.BreedLabel, &out.IsHidden, &out.OwnerID, &out.OwnerName, &ownerAvatarURL)
	if err != nil {
		return nil, err
	}
	if ownerAvatarURL.Valid {
		v := ownerAvatarURL.String
		out.OwnerAvatarURL = &v
	}
	photoRows, _ := s.pool.Query(s.ctx(),
		`SELECT id, url FROM pet_photos WHERE pet_id = $1 ORDER BY display_order LIMIT 12`, petID)
	if photoRows != nil {
		defer photoRows.Close()
		for photoRows.Next() {
			var p domain.PetPhoto
			if err := photoRows.Scan(&p.ID, &p.URL); err == nil {
				out.Photos = append(out.Photos, p)
			}
		}
	}
	if out.Photos == nil {
		out.Photos = []domain.PetPhoto{}
	}
	return &out, nil
}

func (s *PostgresStore) getReportChatContext(conversationID string) ([]domain.ReportMessage, []domain.ReportUserBrief) {
	var messages []domain.ReportMessage
	var users []domain.ReportUserBrief
	msgRows, _ := s.pool.Query(s.ctx(),
		`SELECT id, sender_profile_id, COALESCE(sender_name,''),
		        COALESCE(body,''), created_at
		 FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 500`, conversationID)
	if msgRows != nil {
		defer msgRows.Close()
		for msgRows.Next() {
			var m domain.ReportMessage
			var createdAt sql.NullTime
			if err := msgRows.Scan(&m.ID, &m.SenderProfileID, &m.SenderName, &m.Body, &createdAt); err == nil {
				if createdAt.Valid {
					m.CreatedAt = createdAt.Time.UTC().Format(time.RFC3339)
				}
				messages = append(messages, m)
			}
		}
	}
	var userIDs []string
	_ = s.pool.QueryRow(s.ctx(), `SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)
	if len(userIDs) > 0 {
		uRows, _ := s.pool.Query(s.ctx(),
			`SELECT u.id, COALESCE(p.first_name,''), COALESCE(p.last_name,''), p.avatar_url
			 FROM app_users u LEFT JOIN user_profiles p ON p.user_id = u.id
			 WHERE u.id = ANY($1)`, userIDs)
		if uRows != nil {
			defer uRows.Close()
			for uRows.Next() {
				var u domain.ReportUserBrief
				var avatarURL sql.NullString
				if err := uRows.Scan(&u.ID, &u.FirstName, &u.LastName, &avatarURL); err == nil {
					if avatarURL.Valid {
						v := avatarURL.String
						u.AvatarURL = &v
					}
					users = append(users, u)
				}
			}
		}
	}
	return messages, users
}

// ================================================================
// Walk Routes
// ================================================================

func (s *PostgresStore) ListWalkRoutes(city string) []domain.WalkRoute {
	var rows pgx.Rows
	if city != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, name, description, distance, estimated_time, difficulty, city_label, created_at FROM walk_routes WHERE city_label=$1 ORDER BY name`, city)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, name, description, distance, estimated_time, difficulty, city_label, created_at FROM walk_routes ORDER BY name`)
	}
	defer rows.Close()
	var out []domain.WalkRoute
	for rows.Next() {
		var w domain.WalkRoute
		rows.Scan(&w.ID, &w.Name, &w.Description, &w.Distance, &w.EstimatedTime, &w.Difficulty, &w.CityLabel, &w.CreatedAt)
		w.Coordinates = s.fetchRouteCoords(w.ID)
		out = append(out, w)
	}
	if out == nil { return []domain.WalkRoute{} }
	return out
}

func (s *PostgresStore) fetchRouteCoords(routeID string) []domain.WalkRouteCoord {
	rows, _ := s.pool.Query(s.ctx(), `SELECT latitude, longitude FROM walk_route_coords WHERE route_id=$1 ORDER BY display_order`, routeID)
	defer rows.Close()
	var out []domain.WalkRouteCoord
	for rows.Next() {
		var c domain.WalkRouteCoord
		rows.Scan(&c.Lat, &c.Lng)
		out = append(out, c)
	}
	if out == nil { return []domain.WalkRouteCoord{} }
	return out
}

func (s *PostgresStore) CreateWalkRoute(route domain.WalkRoute) domain.WalkRoute {
	route.ID = newID("route")
	route.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO walk_routes(id,name,description,distance,estimated_time,difficulty,city_label,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		route.ID, route.Name, route.Description, route.Distance, route.EstimatedTime, route.Difficulty, route.CityLabel, route.CreatedAt)
	for i, c := range route.Coordinates {
		s.pool.Exec(s.ctx(), `INSERT INTO walk_route_coords(id,route_id,latitude,longitude,display_order) VALUES($1,$2,$3,$4,$5)`,
			newID("wrc"), route.ID, c.Lat, c.Lng, i)
	}
	return route
}

func (s *PostgresStore) DeleteWalkRoute(routeID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM walk_routes WHERE id=$1`, routeID)
	return err
}

// ================================================================
// Shelters, Shelter Pets, Adoption Applications (v0.13)
// ================================================================

func scanShelter(row interface {
	Scan(dest ...any) error
}) (domain.Shelter, error) {
	var sh domain.Shelter
	var about, phone, website, address, cityLabel, hours, status sql.NullString
	var logoURL, heroURL sql.NullString
	var slug, adoptionProcess, donationURL, operatingCountry sql.NullString
	var isFeatured sql.NullBool
	var lat, lng sql.NullFloat64
	var lastLogin sql.NullTime
	var verifiedAt sql.NullTime
	var createdAt time.Time
	err := row.Scan(&sh.ID, &sh.Email, &sh.Name, &about, &phone, &website,
		&logoURL, &heroURL, &address, &cityLabel, &lat, &lng, &hours, &status,
		&sh.MustChangePassword, &createdAt, &lastLogin, &verifiedAt,
		&slug, &adoptionProcess, &donationURL, &sh.ShowRecentlyAdopted,
		&operatingCountry, &isFeatured)
	if err != nil {
		return sh, err
	}
	sh.About = about.String
	sh.Phone = phone.String
	sh.Website = website.String
	sh.Address = address.String
	sh.CityLabel = cityLabel.String
	sh.Hours = hours.String
	sh.Status = status.String
	sh.Latitude = lat.Float64
	sh.Longitude = lng.Float64
	sh.Slug = slug.String
	sh.AdoptionProcess = adoptionProcess.String
	sh.DonationURL = donationURL.String
	sh.OperatingCountry = operatingCountry.String
	sh.IsFeatured = isFeatured.Bool
	if logoURL.Valid {
		s := logoURL.String
		sh.LogoURL = &s
	}
	if heroURL.Valid {
		s := heroURL.String
		sh.HeroURL = &s
	}
	sh.CreatedAt = createdAt.Format(time.RFC3339)
	if lastLogin.Valid {
		sh.LastLoginAt = lastLogin.Time.Format(time.RFC3339)
	}
	if verifiedAt.Valid {
		sh.VerifiedAt = verifiedAt.Time.Format(time.RFC3339)
	}
	return sh, nil
}

const shelterCols = `id, email, name, about, phone, website, logo_url, hero_url,
	address, city_label, latitude, longitude, hours, status,
	must_change_password, created_at, last_login_at, verified_at,
	slug, adoption_process, donation_url, show_recently_adopted,
	COALESCE(operating_country, ''), COALESCE(is_featured, FALSE)`

func (s *PostgresStore) CreateShelter(shelter domain.Shelter, passwordHash string) (domain.Shelter, error) {
	if shelter.ID == "" {
		shelter.ID = newID("shelter")
	}
	if shelter.Status == "" {
		shelter.Status = "active"
	}
	shelter.MustChangePassword = true
	// Every shelter the store mints is verified at insert time — the
	// onboarding wizard only calls CreateShelter after admin approval,
	// and the admin-direct flow trusts the admin. Unverified rows can
	// only exist if written by a migration or manually.
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO shelters (id, email, password_hash, must_change_password, name,
			about, phone, website, logo_url, hero_url, address, city_label,
			latitude, longitude, hours, status, verified_at)
		 VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
		shelter.ID, shelter.Email, passwordHash, shelter.Name,
		shelter.About, shelter.Phone, shelter.Website, shelter.LogoURL, shelter.HeroURL,
		shelter.Address, shelter.CityLabel, shelter.Latitude, shelter.Longitude,
		shelter.Hours, shelter.Status)
	if err != nil {
		return shelter, err
	}
	full, err := s.GetShelter(shelter.ID)
	if err != nil {
		return shelter, err
	}
	return *full, nil
}

func (s *PostgresStore) ListShelters() []domain.Shelter {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterCols+` FROM shelters ORDER BY created_at DESC`)
	if err != nil {
		return []domain.Shelter{}
	}
	defer rows.Close()
	out := []domain.Shelter{}
	for rows.Next() {
		sh, err := scanShelter(rows)
		if err != nil {
			continue
		}
		out = append(out, sh)
	}
	return out
}

func (s *PostgresStore) GetShelter(shelterID string) (*domain.Shelter, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterCols+` FROM shelters WHERE id=$1`, shelterID)
	sh, err := scanShelter(row)
	if err != nil {
		return nil, fmt.Errorf("shelter not found")
	}
	return &sh, nil
}

func (s *PostgresStore) GetShelterByEmail(email string) (*domain.Shelter, string, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterCols+`, password_hash FROM shelters WHERE email=$1`, email)
	var sh domain.Shelter
	var about, phone, website, address, cityLabel, hours, status sql.NullString
	var logoURL, heroURL sql.NullString
	var lat, lng sql.NullFloat64
	var lastLogin sql.NullTime
	var verifiedAt sql.NullTime
	var createdAt time.Time
	var hash string
	err := row.Scan(&sh.ID, &sh.Email, &sh.Name, &about, &phone, &website,
		&logoURL, &heroURL, &address, &cityLabel, &lat, &lng, &hours, &status,
		&sh.MustChangePassword, &createdAt, &lastLogin, &verifiedAt, &hash)
	if err != nil {
		return nil, "", fmt.Errorf("shelter not found")
	}
	sh.About = about.String
	sh.Phone = phone.String
	sh.Website = website.String
	sh.Address = address.String
	sh.CityLabel = cityLabel.String
	sh.Hours = hours.String
	sh.Status = status.String
	sh.Latitude = lat.Float64
	sh.Longitude = lng.Float64
	if logoURL.Valid {
		v := logoURL.String
		sh.LogoURL = &v
	}
	if heroURL.Valid {
		v := heroURL.String
		sh.HeroURL = &v
	}
	sh.CreatedAt = createdAt.Format(time.RFC3339)
	if lastLogin.Valid {
		sh.LastLoginAt = lastLogin.Time.Format(time.RFC3339)
	}
	if verifiedAt.Valid {
		sh.VerifiedAt = verifiedAt.Time.Format(time.RFC3339)
	}
	return &sh, hash, nil
}

func (s *PostgresStore) UpdateShelter(shelterID string, patch domain.Shelter) (*domain.Shelter, error) {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelters SET
			name=$2, about=$3, phone=$4, website=$5, logo_url=$6, hero_url=$7,
			address=$8, city_label=$9, latitude=$10, longitude=$11, hours=$12,
			adoption_process=$13, donation_url=$14, show_recently_adopted=$15
		 WHERE id=$1`,
		shelterID, patch.Name, patch.About, patch.Phone, patch.Website,
		patch.LogoURL, patch.HeroURL, patch.Address, patch.CityLabel,
		patch.Latitude, patch.Longitude, patch.Hours,
		patch.AdoptionProcess, patch.DonationURL, patch.ShowRecentlyAdopted)
	if err != nil {
		return nil, err
	}
	return s.GetShelter(shelterID)
}

// GetShelterBySlug returns a verified shelter by its public slug, or
// nil if the slug doesn't resolve or the shelter isn't verified yet.
// Used by the /v1/public/shelters/{slug} route.
func (s *PostgresStore) GetShelterBySlug(slug string) (*domain.Shelter, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterCols+` FROM shelters WHERE slug=$1 AND verified_at IS NOT NULL`, slug)
	sh, err := scanShelter(row)
	if err != nil {
		return nil, err
	}
	return &sh, nil
}

// AssignShelterSlug atomically sets a slug, retrying with a numeric
// suffix until the unique index accepts it. Called from the approval
// path — slugs are permanent once set.
func (s *PostgresStore) AssignShelterSlug(shelterID, baseSlug string) (string, error) {
	base := slugify(baseSlug)
	if base == "" {
		base = "shelter"
	}
	candidate := base
	for i := 0; i < 50; i++ {
		if _, err := s.pool.Exec(s.ctx(),
			`UPDATE shelters SET slug=$1 WHERE id=$2 AND slug IS NULL`,
			candidate, shelterID); err == nil {
			var got sql.NullString
			_ = s.pool.QueryRow(s.ctx(), `SELECT slug FROM shelters WHERE id=$1`, shelterID).Scan(&got)
			if got.Valid && got.String != "" {
				return got.String, nil
			}
		}
		candidate = base + "-" + fmt.Sprintf("%d", i+2)
	}
	return "", fmt.Errorf("could not assign slug after retries")
}

// slugify reduces a name to a URL-safe, kebab-cased slug. Conservative
// set (a-z, 0-9, dash) so the result survives any frontend routing.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b []rune
	dashed := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b = append(b, r)
			dashed = false
		case r == ' ' || r == '-' || r == '_':
			if !dashed && len(b) > 0 {
				b = append(b, '-')
				dashed = true
			}
		}
	}
	out := string(b)
	out = strings.Trim(out, "-")
	if len(out) > 60 {
		out = out[:60]
	}
	return out
}

// ListFeaturedShelters returns admin-curated shelters for the fetcht
// discovery home's "Featured" rail. Verified-only + capped at 10 per
// spec — server enforces the cap so no caller can exceed it.
func (s *PostgresStore) ListFeaturedShelters(limit int) []domain.Shelter {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterCols+` FROM shelters
		 WHERE is_featured = TRUE AND verified_at IS NOT NULL AND status = 'active'
		 ORDER BY name ASC LIMIT $1`, limit)
	if err != nil {
		return []domain.Shelter{}
	}
	defer rows.Close()
	out := []domain.Shelter{}
	for rows.Next() {
		sh, err := scanShelter(rows)
		if err != nil {
			continue
		}
		out = append(out, sh)
	}
	return out
}

// SetShelterFeatured flips the curated-rail flag. Admin-only; the
// handler gates on admin auth.
func (s *PostgresStore) SetShelterFeatured(shelterID string, featured bool) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelters SET is_featured = $1 WHERE id = $2`,
		featured, shelterID)
	return err
}

// ListRecentlyAdopted returns the last N listings in `adopted` state
// for a shelter, newest first. Used by the public profile page's
// "Recently adopted" section.
func (s *PostgresStore) ListRecentlyAdopted(shelterID string, limit int) []domain.ShelterPet {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterPetCols+` FROM shelter_pets
		 WHERE shelter_id=$1 AND listing_state='adopted' AND deleted_at IS NULL
		 ORDER BY updated_at DESC LIMIT $2`, shelterID, limit)
	if err != nil {
		return []domain.ShelterPet{}
	}
	defer rows.Close()
	out := []domain.ShelterPet{}
	for rows.Next() {
		p, err := scanShelterPet(rows)
		if err != nil {
			continue
		}
		out = append(out, p)
	}
	return out
}

func (s *PostgresStore) UpdateShelterPassword(shelterID string, passwordHash string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelters SET password_hash=$1, must_change_password=FALSE,
			password_changed_at=NOW() WHERE id=$2`, passwordHash, shelterID)
	return err
}

func (s *PostgresStore) DeleteShelter(shelterID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM shelters WHERE id=$1`, shelterID)
	return err
}

func (s *PostgresStore) MarkShelterLoggedIn(shelterID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelters SET last_login_at=NOW() WHERE id=$1`, shelterID)
	return err
}

func (s *PostgresStore) GetShelterStats(shelterID string) domain.ShelterStats {
	var stats domain.ShelterStats
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE status='available')::int,
			COUNT(*) FILTER (WHERE status='reserved')::int,
			COUNT(*) FILTER (WHERE status='adopted')::int
		 FROM shelter_pets WHERE shelter_id=$1`, shelterID).
		Scan(&stats.TotalPets, &stats.AvailablePets, &stats.ReservedPets, &stats.AdoptedPets)

	_ = s.pool.QueryRow(s.ctx(),
		`SELECT
			COUNT(*) FILTER (WHERE status='pending')::int,
			COUNT(*) FILTER (WHERE status='chat_open')::int,
			COUNT(*)::int
		 FROM adoption_applications WHERE shelter_id=$1`, shelterID).
		Scan(&stats.PendingApps, &stats.ActiveChats, &stats.TotalApplications)

	return stats
}

func scanShelterPet(row interface {
	Scan(dest ...any) error
}) (domain.ShelterPet, error) {
	var p domain.ShelterPet
	var breed, sex, size, color, birthDate, description, microchip, specialNeeds, intakeDate sql.NullString
	var species, status sql.NullString
	var listingState, lastRejCode, lastRejNote sql.NullString
	var autoFlagReasons []string
	var adopterName, adoptionDate, adoptionNotes sql.NullString
	var deletedAt sql.NullTime
	var viewCount sql.NullInt32
	var isUrgent sql.NullBool
	var ageMonths sql.NullInt32
	var vaccinesJSON []byte
	var createdAt, updatedAt time.Time
	err := row.Scan(&p.ID, &p.ShelterID, &p.Name, &species, &breed, &sex, &size, &color,
		&birthDate, &ageMonths, &description, &p.Photos, &vaccinesJSON,
		&p.IsNeutered, &microchip, &specialNeeds, &p.CharacterTags, &intakeDate,
		&status, &listingState, &lastRejCode, &lastRejNote, &autoFlagReasons,
		&adopterName, &adoptionDate, &adoptionNotes, &deletedAt, &viewCount, &isUrgent,
		&createdAt, &updatedAt)
	if err != nil {
		return p, err
	}
	p.Species = species.String
	p.Breed = breed.String
	p.Sex = sex.String
	p.Size = size.String
	p.Color = color.String
	p.BirthDate = birthDate.String
	p.Description = description.String
	p.MicrochipID = microchip.String
	p.SpecialNeeds = specialNeeds.String
	p.IntakeDate = intakeDate.String
	p.Status = status.String
	p.ListingState = listingState.String
	if p.ListingState == "" {
		p.ListingState = domain.ListingStatePublished
	}
	p.LastRejectionCode = lastRejCode.String
	p.LastRejectionNote = lastRejNote.String
	if autoFlagReasons != nil {
		p.AutoFlagReasons = autoFlagReasons
	}
	p.AdopterName = adopterName.String
	p.AdoptionDate = adoptionDate.String
	p.AdoptionNotes = adoptionNotes.String
	if deletedAt.Valid {
		p.DeletedAt = deletedAt.Time.Format(time.RFC3339)
	}
	if viewCount.Valid {
		p.ViewCount = int(viewCount.Int32)
	}
	if isUrgent.Valid {
		p.IsUrgent = isUrgent.Bool
	}
	if ageMonths.Valid {
		v := int(ageMonths.Int32)
		p.AgeMonths = &v
	}
	if p.Photos == nil {
		p.Photos = []string{}
	}
	if p.CharacterTags == nil {
		p.CharacterTags = []string{}
	}
	p.Vaccines = []domain.VaccineRecord{}
	if len(vaccinesJSON) > 0 {
		_ = json.Unmarshal(vaccinesJSON, &p.Vaccines)
	}
	p.CreatedAt = createdAt.Format(time.RFC3339)
	p.UpdatedAt = updatedAt.Format(time.RFC3339)
	return p, nil
}

const shelterPetCols = `id, shelter_id, name, species, breed, sex, size, color,
	birth_date, age_months, description, photos, vaccines,
	is_neutered, microchip_id, special_needs, character_tags, intake_date,
	status, listing_state, last_rejection_code, last_rejection_note, auto_flag_reasons,
	adopter_name, adoption_date, adoption_notes, deleted_at, view_count, is_urgent,
	created_at, updated_at`

func (s *PostgresStore) ListShelterPets(shelterID string, statusFilter string) []domain.ShelterPet {
	query := `SELECT ` + shelterPetCols + ` FROM shelter_pets WHERE shelter_id=$1 AND deleted_at IS NULL`
	args := []any{shelterID}
	if statusFilter != "" && statusFilter != "all" {
		query += ` AND status=$2`
		args = append(args, statusFilter)
	}
	query += ` ORDER BY created_at DESC`
	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.ShelterPet{}
	}
	defer rows.Close()
	out := []domain.ShelterPet{}
	for rows.Next() {
		p, err := scanShelterPet(rows)
		if err != nil {
			continue
		}
		out = append(out, p)
	}
	return out
}

func (s *PostgresStore) ListPublicAdoptablePets(params ListAdoptablePetsParams) []domain.ShelterPet {
	limit := params.Limit
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	// Join shelter for name + city in the card. Columns are explicitly
	// prefixed with the `p.` alias — when both tables have an `id` column
	// the unqualified projection would be ambiguous and the query fails.
	const petCols = `p.id, p.shelter_id, p.name, p.species, p.breed, p.sex, p.size, p.color,
		p.birth_date, p.age_months, p.description, p.photos, p.vaccines,
		p.is_neutered, p.microchip_id, p.special_needs, p.character_tags, p.intake_date,
		p.status, p.listing_state, p.last_rejection_code, p.last_rejection_note, p.auto_flag_reasons,
		p.adopter_name, p.adoption_date, p.adoption_notes, p.deleted_at, p.view_count, p.is_urgent,
		p.created_at, p.updated_at`
	// Public feed only exposes published listings whose availability is
	// still `available` or `reserved`. draft / pending_review / paused /
	// rejected / archived and soft-deleted rows are never discoverable.
	query := `SELECT ` + petCols + `, sh.name, sh.city_label
		FROM shelter_pets p
		LEFT JOIN shelters sh ON sh.id = p.shelter_id
		WHERE p.listing_state = 'published' AND p.status IN ('available','reserved') AND p.deleted_at IS NULL`
	args := []any{}
	i := 1
	// Species supports multi-value (comma-separated) for the discovery
	// home's "Other" category, which expands to e.g. rabbit,ferret,
	// small_mammal. A single species stays a simple equality.
	if params.Species != "" {
		if strings.Contains(params.Species, ",") {
			parts := strings.Split(params.Species, ",")
			placeholders := make([]string, 0, len(parts))
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				placeholders = append(placeholders, fmt.Sprintf("$%d", i))
				args = append(args, p)
				i++
			}
			if len(placeholders) > 0 {
				query += fmt.Sprintf(" AND p.species IN (%s)", strings.Join(placeholders, ","))
			}
		} else {
			query += fmt.Sprintf(" AND p.species = $%d", i)
			args = append(args, params.Species)
			i++
		}
	}
	if params.Sex != "" {
		query += fmt.Sprintf(" AND p.sex = $%d", i)
		args = append(args, params.Sex)
		i++
	}
	if params.Size != "" {
		query += fmt.Sprintf(" AND p.size = $%d", i)
		args = append(args, params.Size)
		i++
	}
	if params.City != "" {
		query += fmt.Sprintf(" AND sh.city_label ILIKE $%d", i)
		args = append(args, "%"+params.City+"%")
		i++
	}
	if params.MinAge > 0 {
		query += fmt.Sprintf(" AND p.age_months >= $%d", i)
		args = append(args, params.MinAge)
		i++
	}
	if params.MaxAge > 0 {
		query += fmt.Sprintf(" AND (p.age_months IS NULL OR p.age_months <= $%d)", i)
		args = append(args, params.MaxAge)
		i++
	}
	if params.SpecialNeedsOnly {
		query += " AND p.special_needs <> ''"
	}
	if params.Search != "" {
		query += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.breed ILIKE $%d OR sh.name ILIKE $%d)", i, i, i)
		args = append(args, "%"+params.Search+"%")
		i++
	}
	query += fmt.Sprintf(" ORDER BY p.created_at DESC LIMIT $%d OFFSET $%d", i, i+1)
	args = append(args, limit, params.Offset)

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.ShelterPet{}
	}
	defer rows.Close()

	out := []domain.ShelterPet{}
	for rows.Next() {
		var p domain.ShelterPet
		var breed, sex, size, color, birthDate, description, microchip, specialNeeds, intakeDate sql.NullString
		var species, status sql.NullString
		var listingState, lastRejCode, lastRejNote sql.NullString
		var autoFlagReasons []string
		var adopterName, adoptionDate, adoptionNotes sql.NullString
		var deletedAt sql.NullTime
		var viewCount sql.NullInt32
		var isUrgent sql.NullBool
		var shelterName, shelterCity sql.NullString
		var ageMonths sql.NullInt32
		var vaccinesJSON []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&p.ID, &p.ShelterID, &p.Name, &species, &breed, &sex, &size, &color,
			&birthDate, &ageMonths, &description, &p.Photos, &vaccinesJSON,
			&p.IsNeutered, &microchip, &specialNeeds, &p.CharacterTags, &intakeDate,
			&status, &listingState, &lastRejCode, &lastRejNote, &autoFlagReasons,
			&adopterName, &adoptionDate, &adoptionNotes, &deletedAt, &viewCount, &isUrgent,
			&createdAt, &updatedAt, &shelterName, &shelterCity); err != nil {
			continue
		}
		if viewCount.Valid {
			p.ViewCount = int(viewCount.Int32)
		}
		if isUrgent.Valid {
			p.IsUrgent = isUrgent.Bool
		}
		p.ListingState = listingState.String
		p.LastRejectionCode = lastRejCode.String
		p.LastRejectionNote = lastRejNote.String
		if autoFlagReasons != nil {
			p.AutoFlagReasons = autoFlagReasons
		}
		p.AdopterName = adopterName.String
		p.AdoptionDate = adoptionDate.String
		p.AdoptionNotes = adoptionNotes.String
		if deletedAt.Valid {
			p.DeletedAt = deletedAt.Time.Format(time.RFC3339)
		}
		p.Species = species.String
		p.Breed = breed.String
		p.Sex = sex.String
		p.Size = size.String
		p.Color = color.String
		p.BirthDate = birthDate.String
		p.Description = description.String
		p.MicrochipID = microchip.String
		p.SpecialNeeds = specialNeeds.String
		p.IntakeDate = intakeDate.String
		p.Status = status.String
		p.ShelterName = shelterName.String
		p.ShelterCity = shelterCity.String
		if ageMonths.Valid {
			v := int(ageMonths.Int32)
			p.AgeMonths = &v
		}
		if p.Photos == nil {
			p.Photos = []string{}
		}
		if p.CharacterTags == nil {
			p.CharacterTags = []string{}
		}
		p.Vaccines = []domain.VaccineRecord{}
		if len(vaccinesJSON) > 0 {
			_ = json.Unmarshal(vaccinesJSON, &p.Vaccines)
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		p.UpdatedAt = updatedAt.Format(time.RFC3339)
		out = append(out, p)
	}
	return out
}

func (s *PostgresStore) GetShelterPet(petID string) (*domain.ShelterPet, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterPetCols+` FROM shelter_pets WHERE id=$1`, petID)
	p, err := scanShelterPet(row)
	if err != nil {
		return nil, fmt.Errorf("shelter pet not found")
	}
	if sh, shErr := s.GetShelter(p.ShelterID); shErr == nil && sh != nil {
		p.ShelterName = sh.Name
		p.ShelterCity = sh.CityLabel
	}
	return &p, nil
}

func (s *PostgresStore) UpsertShelterPet(shelterID string, pet domain.ShelterPet) (domain.ShelterPet, error) {
	if pet.ID == "" {
		pet.ID = newID("spet")
	}
	if pet.Status == "" {
		pet.Status = "available"
	}
	if pet.Photos == nil {
		pet.Photos = []string{}
	}
	if pet.CharacterTags == nil {
		pet.CharacterTags = []string{}
	}
	if pet.Vaccines == nil {
		pet.Vaccines = []domain.VaccineRecord{}
	}
	vaccinesJSON, _ := json.Marshal(pet.Vaccines)

	var ageMonths any
	if pet.AgeMonths != nil {
		ageMonths = *pet.AgeMonths
	} else {
		ageMonths = nil
	}

	// New listings default to `draft`. Existing listings keep their
	// current state (the UPDATE branch doesn't touch listing_state —
	// that only moves via TransitionListingState).
	listingState := pet.ListingState
	if listingState == "" {
		listingState = domain.ListingStateDraft
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO shelter_pets (id, shelter_id, name, species, breed, sex, size, color,
			birth_date, age_months, description, photos, vaccines,
			is_neutered, microchip_id, special_needs, character_tags, intake_date, status, listing_state, is_urgent)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		 ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name,
			species=EXCLUDED.species,
			breed=EXCLUDED.breed,
			sex=EXCLUDED.sex,
			size=EXCLUDED.size,
			color=EXCLUDED.color,
			birth_date=EXCLUDED.birth_date,
			age_months=EXCLUDED.age_months,
			description=EXCLUDED.description,
			photos=EXCLUDED.photos,
			vaccines=EXCLUDED.vaccines,
			is_neutered=EXCLUDED.is_neutered,
			microchip_id=EXCLUDED.microchip_id,
			special_needs=EXCLUDED.special_needs,
			character_tags=EXCLUDED.character_tags,
			intake_date=EXCLUDED.intake_date,
			status=EXCLUDED.status,
			is_urgent=EXCLUDED.is_urgent,
			updated_at=NOW()`,
		pet.ID, shelterID, pet.Name, pet.Species, pet.Breed, pet.Sex, pet.Size, pet.Color,
		pet.BirthDate, ageMonths, pet.Description, pet.Photos, vaccinesJSON,
		pet.IsNeutered, pet.MicrochipID, pet.SpecialNeeds, pet.CharacterTags, pet.IntakeDate,
		pet.Status, listingState, pet.IsUrgent)
	if err != nil {
		return pet, err
	}
	fresh, err := s.GetShelterPet(pet.ID)
	if err != nil {
		return pet, nil
	}
	return *fresh, nil
}

func (s *PostgresStore) UpdateShelterPetStatus(petID string, status string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET status=$1, updated_at=NOW() WHERE id=$2`, status, petID)
	return err
}

// DeleteShelterPet is a soft delete: sets deleted_at=NOW(). The nightly
// sweeper hard-deletes rows whose soft-delete is older than 30 days.
// Drafts are hard-deleted directly since there's nothing to recover for
// a listing that never existed publicly.
func (s *PostgresStore) DeleteShelterPet(petID string) error {
	var listingState string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(listing_state, 'published') FROM shelter_pets WHERE id=$1`, petID).
		Scan(&listingState)
	if listingState == domain.ListingStateDraft {
		_, err := s.pool.Exec(s.ctx(), `DELETE FROM shelter_pets WHERE id=$1`, petID)
		return err
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1`, petID)
	return err
}

// RestoreShelterPet undoes a soft delete inside the 30-day window.
// After the sweeper purges the row this becomes a no-op (GetShelterPet
// will return not-found).
func (s *PostgresStore) RestoreShelterPet(petID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET deleted_at=NULL, updated_at=NOW()
		 WHERE id=$1 AND deleted_at IS NOT NULL`, petID)
	return err
}

// SetAdoptionOutcome records optional metadata from the "Mark adopted"
// dialog — adopter name, adoption date, shelter-internal notes.
func (s *PostgresStore) SetAdoptionOutcome(petID, adopterName, adoptionDate, notes string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets
		 SET adopter_name=$1, adoption_date=$2, adoption_notes=$3, updated_at=NOW()
		 WHERE id=$4`, adopterName, adoptionDate, notes, petID)
	return err
}

// ── Listing moderation (DSA Art. 16/17/22/23) ───────────────────────

// TransitionListingState is the single chokepoint for every 7-state
// move. Validates (from, to, actor) against AllowedListingTransitions,
// updates the listing row, appends a transition log row, and keeps
// availability `status` in sync with terminal states (adopted) — all
// inside a transaction so partial failure leaves nothing dangling.
func (s *PostgresStore) TransitionListingState(listingID, newState, actorID, actorRole, reasonCode, note string, meta map[string]any) (domain.ShelterPet, error) {
	ctx := s.ctx()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.ShelterPet{}, err
	}
	defer tx.Rollback(ctx)

	var prev, shelterID string
	var petName, petBreed string
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(listing_state, 'published'), shelter_id, name, breed
		 FROM shelter_pets WHERE id=$1`, listingID).
		Scan(&prev, &shelterID, &petName, &petBreed); err != nil {
		return domain.ShelterPet{}, fmt.Errorf("listing not found")
	}
	if prev == "" {
		prev = domain.ListingStatePublished
	}
	if !domain.ListingTransitionAllowed(prev, newState, actorRole) {
		return domain.ShelterPet{}, fmt.Errorf("transition %s → %s is not allowed for %s", prev, newState, actorRole)
	}

	// Keep availability `status` consistent with terminal moderation
	// states so existing feed filters (`WHERE status=…`) line up.
	switch newState {
	case domain.ListingStateAdopted:
		if _, err := tx.Exec(ctx,
			`UPDATE shelter_pets SET listing_state=$1, status='adopted', updated_at=NOW() WHERE id=$2`,
			newState, listingID); err != nil {
			return domain.ShelterPet{}, err
		}
	case domain.ListingStateRejected:
		if _, err := tx.Exec(ctx,
			`UPDATE shelter_pets SET listing_state=$1, last_rejection_code=$2,
				last_rejection_note=$3, updated_at=NOW() WHERE id=$4`,
			newState, reasonCode, note, listingID); err != nil {
			return domain.ShelterPet{}, err
		}
	case domain.ListingStatePaused, domain.ListingStateArchived, domain.ListingStatePendingReview:
		if _, err := tx.Exec(ctx,
			`UPDATE shelter_pets SET listing_state=$1, updated_at=NOW() WHERE id=$2`,
			newState, listingID); err != nil {
			return domain.ShelterPet{}, err
		}
	case domain.ListingStateDraft:
		// Restart from rejected — clear rejection metadata so the
		// shelter gets a clean editor.
		if _, err := tx.Exec(ctx,
			`UPDATE shelter_pets SET listing_state=$1, last_rejection_code='',
				last_rejection_note='', auto_flag_reasons='{}', updated_at=NOW() WHERE id=$2`,
			newState, listingID); err != nil {
			return domain.ShelterPet{}, err
		}
	case domain.ListingStatePublished:
		if _, err := tx.Exec(ctx,
			`UPDATE shelter_pets SET listing_state=$1, auto_flag_reasons='{}',
				updated_at=NOW() WHERE id=$2`,
			newState, listingID); err != nil {
			return domain.ShelterPet{}, err
		}
	default:
		return domain.ShelterPet{}, fmt.Errorf("unknown state %s", newState)
	}

	metaJSON, _ := json.Marshal(meta)
	actorName := ""
	if actorID != "" {
		// Best-effort lookup of actor's display name for frozen audit.
		var name sql.NullString
		_ = tx.QueryRow(ctx, `SELECT name FROM shelter_members WHERE id=$1`, actorID).Scan(&name)
		if !name.Valid {
			_ = tx.QueryRow(ctx, `SELECT email FROM admin_users WHERE id=$1`, actorID).Scan(&name)
		}
		actorName = name.String
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO listing_state_transitions
			(id, listing_id, shelter_id, actor_id, actor_name, actor_role,
			 prev_state, new_state, reason_code, note, metadata)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		newID("ltr"), listingID, shelterID, actorID, actorName, actorRole,
		prev, newState, reasonCode, note, metaJSON); err != nil {
		return domain.ShelterPet{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.ShelterPet{}, err
	}
	fresh, err := s.GetShelterPet(listingID)
	if err != nil {
		return domain.ShelterPet{}, err
	}
	return *fresh, nil
}

func (s *PostgresStore) SetListingAutoFlagReasons(listingID string, reasons []string) error {
	if reasons == nil {
		reasons = []string{}
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET auto_flag_reasons=$1, updated_at=NOW() WHERE id=$2`,
		reasons, listingID)
	return err
}

func (s *PostgresStore) ListListingTransitions(listingID string) []domain.ListingStateTransition {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, listing_id, shelter_id, actor_id, actor_name, actor_role,
			prev_state, new_state, reason_code, note, metadata, created_at
		 FROM listing_state_transitions
		 WHERE listing_id=$1
		 ORDER BY created_at ASC`, listingID)
	if err != nil {
		return []domain.ListingStateTransition{}
	}
	defer rows.Close()
	out := []domain.ListingStateTransition{}
	for rows.Next() {
		var t domain.ListingStateTransition
		var metaJSON []byte
		var createdAt time.Time
		if err := rows.Scan(&t.ID, &t.ListingID, &t.ShelterID, &t.ActorID, &t.ActorName,
			&t.ActorRole, &t.PrevState, &t.NewState, &t.ReasonCode, &t.Note,
			&metaJSON, &createdAt); err != nil {
			continue
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &t.Metadata)
		}
		t.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, t)
	}
	return out
}

func (s *PostgresStore) ListListingsByState(state string, limit, offset int) ([]domain.ShelterPet, int) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT ` + shelterPetCols + ` FROM shelter_pets WHERE deleted_at IS NULL`
	countQuery := `SELECT COUNT(*) FROM shelter_pets WHERE deleted_at IS NULL`
	args := []any{}
	if state != "" && state != "all" {
		query += ` AND listing_state=$1`
		countQuery += ` AND listing_state=$1`
		args = append(args, state)
	}
	// Pending-review queue is oldest-first (SLA); everything else
	// newest-first.
	if state == domain.ListingStatePendingReview {
		query += ` ORDER BY created_at ASC`
	} else {
		query += ` ORDER BY created_at DESC`
	}
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.ShelterPet{}, 0
	}
	defer rows.Close()
	out := []domain.ShelterPet{}
	for rows.Next() {
		p, err := scanShelterPet(rows)
		if err != nil {
			continue
		}
		if sh, shErr := s.GetShelter(p.ShelterID); shErr == nil && sh != nil {
			p.ShelterName = sh.Name
			p.ShelterCity = sh.CityLabel
		}
		out = append(out, p)
	}

	total := 0
	countArgs := []any{}
	if state != "" && state != "all" {
		countArgs = append(countArgs, state)
	}
	_ = s.pool.QueryRow(s.ctx(), countQuery, countArgs...).Scan(&total)
	return out, total
}

func (s *PostgresStore) CreateListingReport(report domain.ListingReport) (domain.ListingReport, error) {
	if report.ID == "" {
		report.ID = newID("lreport")
	}
	if report.Status == "" {
		report.Status = "open"
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO listing_reports
			(id, listing_id, shelter_id, reporter_id, reporter_name, trusted_flagger,
			 reason, description, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		report.ID, report.ListingID, report.ShelterID, report.ReporterID,
		report.ReporterName, report.TrustedFlagger, report.Reason, report.Description,
		report.Status)
	if err != nil {
		return report, err
	}
	fresh, err := s.GetListingReport(report.ID)
	if err != nil {
		return report, nil
	}
	return *fresh, nil
}

func (s *PostgresStore) ListListingReports(status string, trustedOnly bool, limit, offset int) ([]domain.ListingReport, int) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	// Join shelter_pets + shelters for the denormalised preview fields
	// the admin queue renders without a second roundtrip.
	base := `FROM listing_reports r
		LEFT JOIN shelter_pets p ON p.id = r.listing_id
		LEFT JOIN shelters sh ON sh.id = r.shelter_id
		WHERE 1=1`
	args := []any{}
	if status != "" && status != "all" {
		args = append(args, status)
		base += fmt.Sprintf(" AND r.status=$%d", len(args))
	}
	if trustedOnly {
		base += " AND r.trusted_flagger=TRUE"
	}

	selectQuery := `SELECT r.id, r.listing_id, r.shelter_id, r.reporter_id, r.reporter_name,
			r.trusted_flagger, r.reason, r.description, r.status,
			r.resolution, r.resolution_note, r.resolved_by, r.resolved_at, r.created_at,
			COALESCE(p.name, ''), COALESCE(p.listing_state, ''),
			COALESCE((SELECT photos[1] FROM shelter_pets WHERE id=r.listing_id), ''),
			COALESCE(sh.name, '')
		` + base + `
		ORDER BY r.trusted_flagger DESC, r.created_at DESC
		` + fmt.Sprintf("LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	args2 := append([]any{}, args...)
	args2 = append(args2, limit, offset)

	rows, err := s.pool.Query(s.ctx(), selectQuery, args2...)
	if err != nil {
		return []domain.ListingReport{}, 0
	}
	defer rows.Close()
	out := []domain.ListingReport{}
	for rows.Next() {
		var r domain.ListingReport
		var resolvedAt sql.NullTime
		var createdAt time.Time
		var photoURL sql.NullString
		if err := rows.Scan(&r.ID, &r.ListingID, &r.ShelterID, &r.ReporterID, &r.ReporterName,
			&r.TrustedFlagger, &r.Reason, &r.Description, &r.Status,
			&r.Resolution, &r.ResolutionNote, &r.ResolvedBy, &resolvedAt, &createdAt,
			&r.ListingName, &r.ListingCurrentState, &photoURL, &r.ShelterName); err != nil {
			continue
		}
		if resolvedAt.Valid {
			r.ResolvedAt = resolvedAt.Time.Format(time.RFC3339)
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		r.ListingPhotoURL = photoURL.String
		out = append(out, r)
	}

	total := 0
	countQuery := `SELECT COUNT(*) ` + base
	_ = s.pool.QueryRow(s.ctx(), countQuery, args...).Scan(&total)
	return out, total
}

func (s *PostgresStore) GetListingReport(reportID string) (*domain.ListingReport, error) {
	var r domain.ListingReport
	var resolvedAt sql.NullTime
	var createdAt time.Time
	var photoURL, listingName, listingState, shelterName sql.NullString
	err := s.pool.QueryRow(s.ctx(),
		`SELECT r.id, r.listing_id, r.shelter_id, r.reporter_id, r.reporter_name,
			r.trusted_flagger, r.reason, r.description, r.status,
			r.resolution, r.resolution_note, r.resolved_by, r.resolved_at, r.created_at,
			p.name, p.listing_state,
			COALESCE((SELECT photos[1] FROM shelter_pets WHERE id=r.listing_id), ''),
			sh.name
		 FROM listing_reports r
		 LEFT JOIN shelter_pets p ON p.id=r.listing_id
		 LEFT JOIN shelters sh ON sh.id=r.shelter_id
		 WHERE r.id=$1`, reportID).
		Scan(&r.ID, &r.ListingID, &r.ShelterID, &r.ReporterID, &r.ReporterName,
			&r.TrustedFlagger, &r.Reason, &r.Description, &r.Status,
			&r.Resolution, &r.ResolutionNote, &r.ResolvedBy, &resolvedAt, &createdAt,
			&listingName, &listingState, &photoURL, &shelterName)
	if err != nil {
		return nil, fmt.Errorf("report not found")
	}
	if resolvedAt.Valid {
		r.ResolvedAt = resolvedAt.Time.Format(time.RFC3339)
	}
	r.CreatedAt = createdAt.Format(time.RFC3339)
	r.ListingPhotoURL = photoURL.String
	r.ListingName = listingName.String
	r.ListingCurrentState = listingState.String
	r.ShelterName = shelterName.String
	return &r, nil
}

func (s *PostgresStore) ResolveListingReport(reportID, resolution, note, actorID string) error {
	// Map the 4 resolution verbs onto report status values so the
	// queue filter tabs line up 1:1.
	status := ""
	switch resolution {
	case "dismiss":
		status = "dismissed"
	case "warn":
		status = "warned"
	case "remove":
		status = "removed"
	case "suspend":
		status = "suspended"
	default:
		return fmt.Errorf("unknown resolution %s", resolution)
	}
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE listing_reports
		 SET status=$1, resolution=$2, resolution_note=$3,
			 resolved_by=$4, resolved_at=NOW()
		 WHERE id=$5`,
		status, resolution, note, actorID, reportID)
	return err
}

func (s *PostgresStore) CreateStatementOfReasons(sor domain.ListingStatementOfReasons) (domain.ListingStatementOfReasons, error) {
	if sor.ID == "" {
		sor.ID = newID("sor")
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO listing_statements_of_reasons
			(id, listing_id, shelter_id, content_description, legal_ground,
			 facts_relied_on, scope, redress_options, issued_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		sor.ID, sor.ListingID, sor.ShelterID, sor.ContentDescription, sor.LegalGround,
		sor.FactsReliedOn, sor.Scope, sor.RedressOptions, sor.IssuedBy)
	if err != nil {
		return sor, err
	}
	return sor, nil
}

func (s *PostgresStore) ListStatementsOfReasons(listingID string) []domain.ListingStatementOfReasons {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, listing_id, shelter_id, content_description, legal_ground,
			facts_relied_on, scope, redress_options, issued_by, issued_at
		 FROM listing_statements_of_reasons
		 WHERE listing_id=$1 ORDER BY issued_at DESC`, listingID)
	if err != nil {
		return []domain.ListingStatementOfReasons{}
	}
	defer rows.Close()
	out := []domain.ListingStatementOfReasons{}
	for rows.Next() {
		var sor domain.ListingStatementOfReasons
		var issuedAt time.Time
		if err := rows.Scan(&sor.ID, &sor.ListingID, &sor.ShelterID, &sor.ContentDescription,
			&sor.LegalGround, &sor.FactsReliedOn, &sor.Scope, &sor.RedressOptions,
			&sor.IssuedBy, &issuedAt); err != nil {
			continue
		}
		sor.IssuedAt = issuedAt.Format(time.RFC3339)
		out = append(out, sor)
	}
	return out
}

func (s *PostgresStore) CountShelterRejectionsLast90Days(shelterID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM listing_state_transitions
		 WHERE shelter_id=$1 AND new_state='rejected'
		   AND created_at > NOW() - INTERVAL '90 days'`, shelterID).Scan(&n)
	return n
}

func (s *PostgresStore) ListShelterRejections(shelterID string, windowDays int) []domain.ListingStateTransition {
	if windowDays <= 0 {
		windowDays = 90
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, listing_id, shelter_id, actor_id, actor_name, actor_role,
			prev_state, new_state, reason_code, note, metadata, created_at
		 FROM listing_state_transitions
		 WHERE shelter_id=$1 AND new_state='rejected'
		   AND created_at > NOW() - make_interval(days => $2)
		 ORDER BY created_at DESC`, shelterID, windowDays)
	if err != nil {
		return []domain.ListingStateTransition{}
	}
	defer rows.Close()
	out := []domain.ListingStateTransition{}
	for rows.Next() {
		var t domain.ListingStateTransition
		var metaJSON []byte
		var createdAt time.Time
		if err := rows.Scan(&t.ID, &t.ListingID, &t.ShelterID, &t.ActorID, &t.ActorName,
			&t.ActorRole, &t.PrevState, &t.NewState, &t.ReasonCode, &t.Note,
			&metaJSON, &createdAt); err != nil {
			continue
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &t.Metadata)
		}
		t.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, t)
	}
	return out
}

func (s *PostgresStore) SuspendShelter(shelterID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelters SET status='suspended' WHERE id=$1`, shelterID)
	return err
}

// ── Shelter analytics (v0.22) ──────────────────────────────────────
//
// All queries below take a Postgres INTERVAL literal as a string
// (e.g. "30 days", "12 months"). Empty string disables the time
// filter — used for the "All time" range tab.

// intervalClause translates the caller-supplied literal into a SQL
// fragment + args. Keeps the query builders below readable.
func intervalClause(interval string, column string) (string, []any) {
	if interval == "" {
		return "", nil
	}
	// `interval` flows straight from the range-param allowlist in the
	// handler (30 days / 90 days / 12 months) — never user-typed.
	// Use make_interval-friendly casting to keep pgx happy.
	return fmt.Sprintf(" AND %s > NOW() - INTERVAL '%s'", column, interval), nil
}

func (s *PostgresStore) IncrementPetViewCount(petID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET view_count = view_count + 1 WHERE id=$1`, petID)
	return err
}

func (s *PostgresStore) CountPetFavorites(petID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM favorites WHERE pet_id=$1`, petID).Scan(&n)
	return n
}

func (s *PostgresStore) CountShelterAdoptionsInRange(shelterID, interval string) int {
	where, _ := intervalClause(interval, "created_at")
	query := `SELECT COUNT(*) FROM listing_state_transitions
		WHERE shelter_id=$1 AND new_state='adopted'` + where
	var n int
	_ = s.pool.QueryRow(s.ctx(), query, shelterID).Scan(&n)
	return n
}

func (s *PostgresStore) CountShelterAdoptionsThisMonth(shelterID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM listing_state_transitions
		 WHERE shelter_id=$1 AND new_state='adopted'
		   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
		shelterID).Scan(&n)
	return n
}

func (s *PostgresStore) CountShelterAdoptionsThisYear(shelterID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM listing_state_transitions
		 WHERE shelter_id=$1 AND new_state='adopted'
		   AND DATE_TRUNC('year', created_at) = DATE_TRUNC('year', NOW())`,
		shelterID).Scan(&n)
	return n
}

func (s *PostgresStore) CountShelterActiveListings(shelterID string) int {
	var n int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM shelter_pets
		 WHERE shelter_id=$1 AND listing_state='published' AND deleted_at IS NULL`,
		shelterID).Scan(&n)
	return n
}

// AvgDaysToAdoption averages the days between a listing's earliest
// `published` transition and its `adopted` transition. Single query
// using a CTE; ignores listings that never hit adoption.
func (s *PostgresStore) AvgDaysToAdoption(shelterID string) (float64, int) {
	row := s.pool.QueryRow(s.ctx(),
		`WITH pub AS (
			SELECT listing_id, MIN(created_at) AS published_at
			FROM listing_state_transitions
			WHERE shelter_id=$1 AND new_state='published'
			GROUP BY listing_id
		), ado AS (
			SELECT listing_id, MIN(created_at) AS adopted_at
			FROM listing_state_transitions
			WHERE shelter_id=$1 AND new_state='adopted'
			GROUP BY listing_id
		)
		SELECT
			COALESCE(AVG(EXTRACT(EPOCH FROM (ado.adopted_at - pub.published_at)) / 86400.0), 0)::FLOAT8,
			COUNT(*)
		FROM ado
		JOIN pub USING (listing_id)
		WHERE ado.adopted_at >= pub.published_at`,
		shelterID)
	var avg float64
	var n int
	_ = row.Scan(&avg, &n)
	return avg, n
}

// TopApplicationListing finds the shelter's listing with the most
// adoption_applications rows in the selected range. Returns (id, name,
// count); empty id means "no applications in range".
func (s *PostgresStore) TopApplicationListing(shelterID, interval string) (string, string, int) {
	where, _ := intervalClause(interval, "a.created_at")
	query := `SELECT p.id, p.name, COUNT(*) AS cnt
		FROM adoption_applications a
		JOIN shelter_pets p ON p.id = a.pet_id
		WHERE a.shelter_id=$1 AND p.deleted_at IS NULL` + where + `
		GROUP BY p.id, p.name
		ORDER BY cnt DESC
		LIMIT 1`
	row := s.pool.QueryRow(s.ctx(), query, shelterID)
	var id, name string
	var cnt int
	_ = row.Scan(&id, &name, &cnt)
	return id, name, cnt
}

// ListingPerformance returns one row per live (non-soft-deleted)
// listing with counters for the selected range. Applications are
// range-filtered; views / saves / adoptions are lifetime (spec treats
// them as totals on each row).
func (s *PostgresStore) ListingPerformance(shelterID, interval string) []domain.ListingPerformanceRow {
	appWhere, _ := intervalClause(interval, "a.created_at")
	query := `SELECT
		p.id,
		p.name,
		p.species,
		p.listing_state,
		COALESCE(p.view_count, 0) AS views,
		COALESCE((SELECT COUNT(*) FROM favorites f WHERE f.pet_id = p.id), 0) AS saves,
		COALESCE((SELECT COUNT(*) FROM adoption_applications a WHERE a.pet_id = p.id` + appWhere + `), 0) AS applications,
		CASE WHEN p.listing_state = 'adopted' THEN 1 ELSE 0 END AS adoptions,
		COALESCE(
			GREATEST(
				0,
				EXTRACT(
					DAY FROM (NOW() - (
						SELECT MIN(created_at) FROM listing_state_transitions t
						WHERE t.listing_id = p.id AND t.new_state = 'published'
					))
				)::INT
			),
			0
		) AS days_listed
	FROM shelter_pets p
	WHERE p.shelter_id=$1 AND p.deleted_at IS NULL
	ORDER BY p.created_at DESC`
	rows, err := s.pool.Query(s.ctx(), query, shelterID)
	if err != nil {
		return []domain.ListingPerformanceRow{}
	}
	defer rows.Close()
	out := []domain.ListingPerformanceRow{}
	for rows.Next() {
		var r domain.ListingPerformanceRow
		var species, state sql.NullString
		if err := rows.Scan(&r.ListingID, &r.Name, &species, &state,
			&r.Views, &r.Saves, &r.Applications, &r.Adoptions, &r.DaysListed); err != nil {
			continue
		}
		r.Species = species.String
		r.ListingState = state.String
		out = append(out, r)
	}
	return out
}

// ApplicationFunnel returns the four-stage funnel over the selected
// range. Each stage is a strict subset of the previous (matches the
// Funnel UX).
func (s *PostgresStore) ApplicationFunnel(shelterID, interval string) domain.ApplicationFunnel {
	where, _ := intervalClause(interval, "created_at")
	query := `SELECT
		COUNT(*) FILTER (WHERE 1=1),
		COUNT(*) FILTER (WHERE status='pending'),
		COUNT(*) FILTER (WHERE status IN ('approved','chat_open','adopted')),
		COUNT(*) FILTER (WHERE status='adopted')
		FROM adoption_applications
		WHERE shelter_id=$1` + where
	var out domain.ApplicationFunnel
	_ = s.pool.QueryRow(s.ctx(), query, shelterID).
		Scan(&out.Submitted, &out.UnderReview, &out.Approved, &out.Adopted)
	return out
}

func (s *PostgresStore) DeleteStaleDrafts(olderThanDays int) error {
	if olderThanDays <= 0 {
		olderThanDays = 30
	}
	// Two-phase cleanup:
	// 1. Stale drafts — never touched the moderation queue.
	// 2. Soft-deleted listings past their 30-day recovery window.
	if _, err := s.pool.Exec(s.ctx(),
		`DELETE FROM shelter_pets
		 WHERE listing_state='draft'
		   AND updated_at < NOW() - make_interval(days => $1)`, olderThanDays); err != nil {
		return err
	}
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM shelter_pets
		 WHERE deleted_at IS NOT NULL
		   AND deleted_at < NOW() - make_interval(days => $1)`, olderThanDays)
	return err
}

func scanApplication(row interface {
	Scan(dest ...any) error
}) (domain.AdoptionApplication, error) {
	var a domain.AdoptionApplication
	var avatar, convID, rejection sql.NullString
	var createdAt, updatedAt time.Time
	err := row.Scan(&a.ID, &a.PetID, &a.ShelterID, &a.UserID, &a.UserName, &avatar,
		&a.HousingType, &a.HasOtherPets, &a.OtherPetsDetail, &a.Experience, &a.Message,
		&a.Status, &rejection, &convID, &createdAt, &updatedAt)
	if err != nil {
		return a, err
	}
	if avatar.Valid {
		v := avatar.String
		a.UserAvatarURL = &v
	}
	if convID.Valid {
		v := convID.String
		a.ConversationID = &v
	}
	a.RejectionReason = rejection.String
	a.CreatedAt = createdAt.Format(time.RFC3339)
	a.UpdatedAt = updatedAt.Format(time.RFC3339)
	return a, nil
}

const appCols = `id, pet_id, shelter_id, user_id, user_name, user_avatar_url,
	housing_type, has_other_pets, other_pets_detail, experience, message,
	status, rejection_reason, conversation_id, created_at, updated_at`

func (s *PostgresStore) CreateAdoptionApplication(app domain.AdoptionApplication) (domain.AdoptionApplication, error) {
	if app.ID == "" {
		app.ID = newID("adopt-app")
	}
	if app.Status == "" {
		app.Status = "pending"
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO adoption_applications (id, pet_id, shelter_id, user_id, user_name,
			user_avatar_url, housing_type, has_other_pets, other_pets_detail,
			experience, message, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		app.ID, app.PetID, app.ShelterID, app.UserID, app.UserName,
		app.UserAvatarURL, app.HousingType, app.HasOtherPets, app.OtherPetsDetail,
		app.Experience, app.Message, app.Status)
	if err != nil {
		return app, err
	}
	fresh, err := s.GetApplication(app.ID)
	if err != nil {
		return app, err
	}
	return *fresh, nil
}

func (s *PostgresStore) enrichApp(a *domain.AdoptionApplication) {
	if a == nil {
		return
	}
	if pet, err := s.GetShelterPet(a.PetID); err == nil && pet != nil {
		a.PetName = pet.Name
		if len(pet.Photos) > 0 {
			a.PetPhoto = pet.Photos[0]
		}
		a.ShelterName = pet.ShelterName
	}
}

func (s *PostgresStore) ListShelterApplications(shelterID string, statusFilter string) []domain.AdoptionApplication {
	query := `SELECT ` + appCols + ` FROM adoption_applications WHERE shelter_id=$1`
	args := []any{shelterID}
	if statusFilter != "" && statusFilter != "all" {
		query += ` AND status=$2`
		args = append(args, statusFilter)
	}
	query += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.pool.Query(s.ctx(), query, args...)
	if err != nil {
		return []domain.AdoptionApplication{}
	}
	defer rows.Close()
	out := []domain.AdoptionApplication{}
	for rows.Next() {
		a, err := scanApplication(rows)
		if err != nil {
			continue
		}
		s.enrichApp(&a)
		out = append(out, a)
	}
	return out
}

func (s *PostgresStore) ListUserApplications(userID string) []domain.AdoptionApplication {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+appCols+` FROM adoption_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`, userID)
	if err != nil {
		return []domain.AdoptionApplication{}
	}
	defer rows.Close()
	out := []domain.AdoptionApplication{}
	for rows.Next() {
		a, err := scanApplication(rows)
		if err != nil {
			continue
		}
		s.enrichApp(&a)
		out = append(out, a)
	}
	return out
}

func (s *PostgresStore) GetApplication(appID string) (*domain.AdoptionApplication, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+appCols+` FROM adoption_applications WHERE id=$1`, appID)
	a, err := scanApplication(row)
	if err != nil {
		return nil, fmt.Errorf("application not found")
	}
	s.enrichApp(&a)
	return &a, nil
}

func (s *PostgresStore) ApproveApplication(appID string, conversationID string) error {
	app, err := s.GetApplication(appID)
	if err != nil {
		return err
	}
	// Move the app to chat_open and pet to reserved in a single shot.
	if _, err := s.pool.Exec(s.ctx(),
		`UPDATE adoption_applications SET status='chat_open', conversation_id=$1, updated_at=NOW()
		 WHERE id=$2`, conversationID, appID); err != nil {
		return err
	}
	if _, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET status='reserved', updated_at=NOW() WHERE id=$1`, app.PetID); err != nil {
		return err
	}
	return nil
}

func (s *PostgresStore) RejectApplication(appID string, reason string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE adoption_applications SET status='rejected', rejection_reason=$1, updated_at=NOW()
		 WHERE id=$2`, reason, appID)
	return err
}

func (s *PostgresStore) CompleteAdoption(appID string) error {
	app, err := s.GetApplication(appID)
	if err != nil {
		return err
	}
	if _, err := s.pool.Exec(s.ctx(),
		`UPDATE adoption_applications SET status='adopted', updated_at=NOW() WHERE id=$1`, appID); err != nil {
		return err
	}
	if _, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_pets SET status='adopted', updated_at=NOW() WHERE id=$1`, app.PetID); err != nil {
		return err
	}
	return nil
}

func (s *PostgresStore) WithdrawApplication(appID string, userID string) error {
	// Owner guard: ensure the caller owns the application.
	res, err := s.pool.Exec(s.ctx(),
		`UPDATE adoption_applications SET status='withdrawn', updated_at=NOW()
		 WHERE id=$1 AND user_id=$2 AND status IN ('pending','chat_open')`, appID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("cannot withdraw this application")
	}
	return nil
}

// ================================================================
// Pet Albums & Milestones
// ================================================================

func (s *PostgresStore) ListPetAlbums(petID string) []domain.PetAlbum {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, title, created_at FROM pet_albums WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.PetAlbum
	for rows.Next() {
		var a domain.PetAlbum
		rows.Scan(&a.ID, &a.PetID, &a.Title, &a.CreatedAt)
		a.Photos = s.fetchAlbumPhotos(a.ID)
		out = append(out, a)
	}
	if out == nil { return []domain.PetAlbum{} }
	return out
}

func (s *PostgresStore) fetchAlbumPhotos(albumID string) []domain.PetPhoto {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, url, is_primary FROM pet_album_photos WHERE album_id=$1 ORDER BY display_order`, albumID)
	defer rows.Close()
	var out []domain.PetPhoto
	for rows.Next() {
		var p domain.PetPhoto
		rows.Scan(&p.ID, &p.URL, &p.IsPrimary)
		out = append(out, p)
	}
	if out == nil { return []domain.PetPhoto{} }
	return out
}

func (s *PostgresStore) CreatePetAlbum(album domain.PetAlbum) domain.PetAlbum {
	album.ID = newID("album")
	album.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO pet_albums(id,pet_id,title,created_at) VALUES($1,$2,$3,$4)`, album.ID, album.PetID, album.Title, album.CreatedAt)
	for i, photo := range album.Photos {
		s.pool.Exec(s.ctx(), `INSERT INTO pet_album_photos(id,album_id,url,is_primary,display_order) VALUES($1,$2,$3,$4,$5)`,
			newID("ap"), album.ID, photo.URL, photo.IsPrimary, i)
	}
	if album.Photos == nil { album.Photos = []domain.PetPhoto{} }
	return album
}

func (s *PostgresStore) ListPetMilestones(petID string) []domain.PetMilestone {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, type, title, description, achieved_at FROM pet_milestones WHERE pet_id=$1 ORDER BY achieved_at DESC`, petID)
	defer rows.Close()
	var out []domain.PetMilestone
	for rows.Next() {
		var m domain.PetMilestone
		rows.Scan(&m.ID, &m.PetID, &m.Type, &m.Title, &m.Description, &m.AchievedAt)
		out = append(out, m)
	}
	if out == nil { return []domain.PetMilestone{} }
	return out
}

func (s *PostgresStore) AwardMilestone(petID string, milestoneType string, title string, description string) {
	s.pool.Exec(s.ctx(), `INSERT INTO pet_milestones(id,pet_id,type,title,description,achieved_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(pet_id,type) DO NOTHING`,
		newID("ms"), petID, milestoneType, title, description)
}

// helper
func nilIfEmpty(s string) *string {
	if s == "" { return nil }
	return &s
}

// ── v0.11.0: Notification preferences ─────────────────────────────────
// Defaults are "everything on" — a missing row means the user never opened
// the notification-settings page, which should not silence them.

func defaultPrefs() domain.NotificationPreferences {
	return domain.NotificationPreferences{
		Matches:   true,
		Messages:  true,
		Playdates: true,
		Groups:    true,
	}
}

func (s *PostgresStore) GetNotificationPrefs(userID string) domain.NotificationPreferences {
	prefs := defaultPrefs()
	if userID == "" {
		return prefs
	}
	err := s.pool.QueryRow(s.ctx(),
		`SELECT matches, messages, playdates, groups FROM notification_preferences WHERE user_id = $1`,
		userID).Scan(&prefs.Matches, &prefs.Messages, &prefs.Playdates, &prefs.Groups)
	if err != nil {
		// Row not found or other read error: fall back to defaults.
		return defaultPrefs()
	}
	return prefs
}

func (s *PostgresStore) UpsertNotificationPrefs(userID string, prefs domain.NotificationPreferences) error {
	if userID == "" {
		return fmt.Errorf("user id required")
	}
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO notification_preferences (user_id, matches, messages, playdates, groups, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		 SET matches = EXCLUDED.matches,
		     messages = EXCLUDED.messages,
		     playdates = EXCLUDED.playdates,
		     groups = EXCLUDED.groups,
		     updated_at = NOW()`,
		userID, prefs.Matches, prefs.Messages, prefs.Playdates, prefs.Groups)
	return err
}

// ShouldSendPush is called by every push fan-out call site before enqueuing
// an Expo push for `userID`. An unknown category returns true (fail-open) so
// a typo never silently drops production notifications.
func (s *PostgresStore) ShouldSendPush(userID string, category string) bool {
	if userID == "" {
		return true
	}
	prefs := s.GetNotificationPrefs(userID)
	switch category {
	case "matches":
		return prefs.Matches
	case "messages":
		return prefs.Messages
	case "playdates":
		return prefs.Playdates
	case "groups":
		return prefs.Groups
	default:
		return true
	}
}

// ── v0.11.0: Unified explore feed ─────────────────────────────────────
// Mobile Discover → Events calls this single endpoint instead of making two
// round-trips. Returning both slices keeps the API dumb; the mobile side
// merges + chips them.
func (s *PostgresStore) ListExploreFeed(params ListPlaydatesParams) ([]domain.ExploreEvent, []domain.Playdate) {
	return s.ListEvents(), s.ListPlaydates(params)
}

// ================================================================
// ── Shelter onboarding applications (v0.14) ─────────────────────
// ================================================================

const shelterAppCols = `id, status, submitted_at, reviewed_at, reviewed_by,
	sla_deadline, entity_type, country, registration_number,
	registration_certificate_url, org_name, org_address,
	operating_region_country, operating_region_city, species_focus,
	donation_url, primary_contact_name, primary_contact_email,
	primary_contact_phone, rejection_reason_code, rejection_reason_note,
	created_shelter_id, access_token`

func scanShelterApplication(row interface {
	Scan(dest ...any) error
}) (domain.ShelterApplication, error) {
	var a domain.ShelterApplication
	var submittedAt time.Time
	var reviewedAt, slaDeadline sql.NullTime
	var reviewedBy, orgAddress, donationURL, phone sql.NullString
	var rejCode, rejNote, createdShelterID sql.NullString
	var speciesFocus []string
	err := row.Scan(&a.ID, &a.Status, &submittedAt, &reviewedAt, &reviewedBy,
		&slaDeadline, &a.EntityType, &a.Country, &a.RegistrationNumber,
		&a.RegistrationCertificateURL, &a.OrgName, &orgAddress,
		&a.OperatingRegionCountry, &a.OperatingRegionCity, &speciesFocus,
		&donationURL, &a.PrimaryContactName, &a.PrimaryContactEmail,
		&phone, &rejCode, &rejNote, &createdShelterID, &a.AccessToken)
	if err != nil {
		return a, err
	}
	a.SubmittedAt = submittedAt.Format(time.RFC3339)
	if reviewedAt.Valid {
		a.ReviewedAt = reviewedAt.Time.Format(time.RFC3339)
	}
	a.ReviewedBy = reviewedBy.String
	if slaDeadline.Valid {
		a.SLADeadline = slaDeadline.Time.Format(time.RFC3339)
	}
	a.OrgAddress = orgAddress.String
	a.SpeciesFocus = speciesFocus
	if a.SpeciesFocus == nil {
		a.SpeciesFocus = []string{}
	}
	a.DonationURL = donationURL.String
	a.PrimaryContactPhone = phone.String
	a.RejectionReasonCode = rejCode.String
	a.RejectionReasonNote = rejNote.String
	a.CreatedShelterID = createdShelterID.String
	return a, nil
}

func (s *PostgresStore) CreateShelterOnboardingApplication(app domain.ShelterApplication) (domain.ShelterApplication, error) {
	app.ID = newID("shelter-app")
	app.Status = "submitted"
	// Opaque token — base32 of 24 random bytes gives ~38 chars, plenty
	// entropy and copy-safe. base32 is already used for temp passwords.
	var b [24]byte
	_, _ = cryptorand.Read(b[:])
	app.AccessToken = strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:]))
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO shelter_applications (
			id, status, submitted_at, sla_deadline,
			entity_type, country, registration_number, registration_certificate_url,
			org_name, org_address, operating_region_country, operating_region_city,
			species_focus, donation_url,
			primary_contact_name, primary_contact_email, primary_contact_phone,
			access_token
		) VALUES ($1,'submitted',NOW(), NOW() + INTERVAL '48 hours',
			$2,$3,$4,$5,
			$6,$7,$8,$9,
			$10,$11,
			$12,$13,$14,
			$15)`,
		app.ID,
		app.EntityType, app.Country, app.RegistrationNumber, app.RegistrationCertificateURL,
		app.OrgName, app.OrgAddress, strings.ToUpper(app.OperatingRegionCountry), app.OperatingRegionCity,
		app.SpeciesFocus, app.DonationURL,
		app.PrimaryContactName, strings.ToLower(strings.TrimSpace(app.PrimaryContactEmail)), app.PrimaryContactPhone,
		app.AccessToken)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "idx_shelter_apps_email_active") ||
			strings.Contains(msg, "unique") && strings.Contains(msg, "email") {
			return domain.ShelterApplication{}, ErrShelterApplicationDuplicateEmail
		}
		return domain.ShelterApplication{}, err
	}
	full, err := s.GetShelterOnboardingApplication(app.ID)
	if err != nil {
		return app, err
	}
	// Caller needs access_token back so it can echo to the applicant.
	full.AccessToken = app.AccessToken
	return *full, nil
}

func (s *PostgresStore) GetShelterOnboardingApplication(appID string) (*domain.ShelterApplication, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterAppCols+` FROM shelter_applications WHERE id=$1`, appID)
	a, err := scanShelterApplication(row)
	if err != nil {
		return nil, ErrShelterApplicationNotFound
	}
	return &a, nil
}

func (s *PostgresStore) GetShelterOnboardingApplicationByToken(accessToken string) (*domain.ShelterApplication, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterAppCols+` FROM shelter_applications WHERE access_token=$1`, accessToken)
	a, err := scanShelterApplication(row)
	if err != nil {
		return nil, ErrShelterApplicationNotFound
	}
	return &a, nil
}

func (s *PostgresStore) ListShelterOnboardingApplications(statusFilter string, limit int, offset int) []domain.ShelterApplication {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	args := []any{limit, offset}
	where := ""
	if statusFilter != "" {
		where = " WHERE status = $3"
		args = append(args, statusFilter)
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterAppCols+` FROM shelter_applications`+where+`
		 ORDER BY CASE WHEN status='submitted' THEN 0 ELSE 1 END, submitted_at DESC
		 LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return []domain.ShelterApplication{}
	}
	defer rows.Close()
	out := []domain.ShelterApplication{}
	for rows.Next() {
		a, err := scanShelterApplication(rows)
		if err != nil {
			continue
		}
		// Don't leak access token to admin list views — it's only for
		// the applicant's status page.
		a.AccessToken = ""
		out = append(out, a)
	}
	return out
}

func (s *PostgresStore) ApproveShelterOnboardingApplication(appID string, reviewerID string, passwordHash string) (domain.Shelter, domain.ShelterApplication, error) {
	ctx := s.ctx()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}
	defer tx.Rollback(ctx)

	// Load + lock the application row. Refuse if already decided.
	var status, orgName, phone, donationURL, address, opCountry, opCity, contactEmail string
	err = tx.QueryRow(ctx,
		`SELECT status, org_name, primary_contact_phone, donation_url,
			org_address, operating_region_country, operating_region_city,
			primary_contact_email
		 FROM shelter_applications WHERE id=$1 FOR UPDATE`, appID).
		Scan(&status, &orgName, &phone, &donationURL, &address, &opCountry, &opCity, &contactEmail)
	if err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, ErrShelterApplicationNotFound
	}
	if status == "approved" || status == "rejected" {
		return domain.Shelter{}, domain.ShelterApplication{}, fmt.Errorf("application already decided: %s", status)
	}

	// Mint the shelter (verified_at = NOW).
	shelterID := newID("shelter")
	email := strings.ToLower(strings.TrimSpace(contactEmail))
	_, err = tx.Exec(ctx,
		`INSERT INTO shelters (id, email, password_hash, must_change_password,
			name, about, phone, website, address, city_label, hours, status,
			created_at, verified_at)
		 VALUES ($1,$2,$3,TRUE,$4,'',$5,$6,$7,$8,'','active', NOW(), NOW())`,
		shelterID, email, passwordHash, orgName, phone, donationURL, address, opCity)
	if err != nil {
		// Most likely a duplicate email — that shouldn't happen in
		// practice (wizard validates unique email) but surface it.
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}

	// v0.15 — mint the owner member alongside the shelter so team
	// auth works immediately. Same hash lands in both columns;
	// shelters.password_hash is retained for back-compat but no longer
	// authoritative.
	memberID := "member-owner-" + shelterID
	_, err = tx.Exec(ctx,
		`INSERT INTO shelter_members (
			id, shelter_id, email, password_hash, name, role, status,
			must_change_password, joined_at
		) VALUES ($1,$2,$3,$4,$5,'admin','active', TRUE, NOW())`,
		memberID, shelterID, email, passwordHash, orgName)
	if err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}

	// Flip the application to approved + link.
	_, err = tx.Exec(ctx,
		`UPDATE shelter_applications
		 SET status='approved', reviewed_at=NOW(), reviewed_by=$2, created_shelter_id=$3
		 WHERE id=$1`, appID, reviewerID, shelterID)
	if err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}

	sh, err := s.GetShelter(shelterID)
	if err != nil {
		return domain.Shelter{}, domain.ShelterApplication{}, err
	}
	// OperatingCountry isn't a column on shelters; populate it
	// in-memory so compliance hooks downstream can use it without
	// a second query.
	sh.OperatingCountry = strings.ToUpper(opCountry)
	app, err := s.GetShelterOnboardingApplication(appID)
	if err != nil {
		return *sh, domain.ShelterApplication{}, err
	}
	return *sh, *app, nil
}

func (s *PostgresStore) RejectShelterOnboardingApplication(appID string, reviewerID string, reasonCode string, reasonNote string) (domain.ShelterApplication, error) {
	if len(reasonNote) > 500 {
		return domain.ShelterApplication{}, fmt.Errorf("rejection note must be at most 500 characters")
	}
	res, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_applications
		 SET status='rejected', reviewed_at=NOW(), reviewed_by=$2,
			 rejection_reason_code=$3, rejection_reason_note=$4
		 WHERE id=$1 AND status IN ('submitted','under_review')`,
		appID, reviewerID, reasonCode, reasonNote)
	if err != nil {
		return domain.ShelterApplication{}, err
	}
	if res.RowsAffected() == 0 {
		return domain.ShelterApplication{}, fmt.Errorf("application not found or already decided")
	}
	app, err := s.GetShelterOnboardingApplication(appID)
	if err != nil {
		return domain.ShelterApplication{}, err
	}
	return *app, nil
}

// ================================================================
// ── Shelter team accounts + audit log (v0.15) ────────────────────
// ================================================================

const shelterMemberCols = `id, shelter_id, email, password_hash, name, role, status,
	must_change_password, invited_by_member_id, invited_at, joined_at,
	last_login_at, password_changed_at`

func scanShelterMember(row interface {
	Scan(dest ...any) error
}) (domain.ShelterMember, string, error) {
	var m domain.ShelterMember
	var name, role, status sql.NullString
	var invitedBy sql.NullString
	var invitedAt, lastLogin, passwordChangedAt sql.NullTime
	var joinedAt time.Time
	var hash string
	err := row.Scan(&m.ID, &m.ShelterID, &m.Email, &hash, &name, &role, &status,
		&m.MustChangePassword, &invitedBy, &invitedAt, &joinedAt,
		&lastLogin, &passwordChangedAt)
	if err != nil {
		return m, "", err
	}
	m.Name = name.String
	m.Role = role.String
	m.Status = status.String
	m.InvitedByMemberID = invitedBy.String
	if invitedAt.Valid {
		m.InvitedAt = invitedAt.Time.Format(time.RFC3339)
	}
	m.JoinedAt = joinedAt.Format(time.RFC3339)
	if lastLogin.Valid {
		m.LastLoginAt = lastLogin.Time.Format(time.RFC3339)
	}
	// password_changed_at isn't currently surfaced on the domain type.
	_ = passwordChangedAt
	return m, hash, nil
}

func (s *PostgresStore) ListShelterMembers(shelterID string) []domain.ShelterMember {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterMemberCols+` FROM shelter_members
		 WHERE shelter_id=$1 ORDER BY joined_at ASC`, shelterID)
	if err != nil {
		return []domain.ShelterMember{}
	}
	defer rows.Close()
	out := []domain.ShelterMember{}
	for rows.Next() {
		m, _, err := scanShelterMember(rows)
		if err != nil {
			continue
		}
		out = append(out, m)
	}
	return out
}

func (s *PostgresStore) GetShelterMember(memberID string) (*domain.ShelterMember, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterMemberCols+` FROM shelter_members WHERE id=$1`, memberID)
	m, _, err := scanShelterMember(row)
	if err != nil {
		return nil, ErrShelterMemberNotFound
	}
	return &m, nil
}

func (s *PostgresStore) GetShelterMemberByEmailForLogin(email string) (*domain.ShelterMember, string, error) {
	// The partial unique index is per (shelter, email), not global, so
	// in theory one email can exist on multiple shelters. At login we
	// resolve to the first active hit — deferring the "which shelter?"
	// picker to a later iteration.
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterMemberCols+` FROM shelter_members
		 WHERE lower(email::text) = lower($1) AND status='active'
		 ORDER BY last_login_at DESC NULLS LAST, joined_at ASC LIMIT 1`, email)
	m, hash, err := scanShelterMember(row)
	if err != nil {
		return nil, "", ErrShelterMemberNotFound
	}
	return &m, hash, nil
}

func (s *PostgresStore) UpdateShelterMemberRole(memberID, newRole string) (*domain.ShelterMember, error) {
	ctx := s.ctx()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var shelterID, currentRole, status string
	if err := tx.QueryRow(ctx,
		`SELECT shelter_id, role, status FROM shelter_members WHERE id=$1 FOR UPDATE`,
		memberID).Scan(&shelterID, &currentRole, &status); err != nil {
		return nil, ErrShelterMemberNotFound
	}
	// Last-admin guard: if demoting or a sole active admin.
	if currentRole == "admin" && newRole != "admin" && status == "active" {
		var activeAdmins int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM shelter_members
			 WHERE shelter_id=$1 AND role='admin' AND status='active'`,
			shelterID).Scan(&activeAdmins); err != nil {
			return nil, err
		}
		if activeAdmins <= 1 {
			return nil, ErrShelterLastAdmin
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE shelter_members SET role=$2 WHERE id=$1`, memberID, newRole); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetShelterMember(memberID)
}

func (s *PostgresStore) UpdateShelterMemberPassword(memberID, passwordHash string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_members SET password_hash=$2,
			must_change_password=FALSE, password_changed_at=NOW()
		 WHERE id=$1`, memberID, passwordHash)
	return err
}

func (s *PostgresStore) UpdateShelterMemberName(memberID, name string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_members SET name=$2 WHERE id=$1`, memberID, name)
	return err
}

func (s *PostgresStore) RevokeShelterMember(memberID string) error {
	ctx := s.ctx()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var shelterID, role, status string
	if err := tx.QueryRow(ctx,
		`SELECT shelter_id, role, status FROM shelter_members WHERE id=$1 FOR UPDATE`,
		memberID).Scan(&shelterID, &role, &status); err != nil {
		return ErrShelterMemberNotFound
	}
	if role == "admin" && status == "active" {
		var activeAdmins int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM shelter_members
			 WHERE shelter_id=$1 AND role='admin' AND status='active'`,
			shelterID).Scan(&activeAdmins); err != nil {
			return err
		}
		if activeAdmins <= 1 {
			return ErrShelterLastAdmin
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE shelter_members SET status='revoked' WHERE id=$1`, memberID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) MarkShelterMemberLoggedIn(memberID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_members SET last_login_at=NOW() WHERE id=$1`, memberID)
	return err
}

func (s *PostgresStore) CountActiveShelterMembers(shelterID string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM shelter_members
		 WHERE shelter_id=$1 AND status='active'`, shelterID).Scan(&count)
	return count
}

func (s *PostgresStore) CountActiveShelterAdmins(shelterID string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM shelter_members
		 WHERE shelter_id=$1 AND role='admin' AND status='active'`, shelterID).Scan(&count)
	return count
}

// ── Invites ─────────────────────────────────────────────────────

const shelterInviteCols = `id, shelter_id, email, role, invited_by_member_id,
	token, created_at, expires_at, accepted_at, accepted_member_id, revoked_at`

func scanShelterInvite(row interface {
	Scan(dest ...any) error
}) (domain.ShelterMemberInvite, error) {
	var inv domain.ShelterMemberInvite
	var invitedBy, token sql.NullString
	var acceptedAt, revokedAt sql.NullTime
	var acceptedMember sql.NullString
	var createdAt, expiresAt time.Time
	err := row.Scan(&inv.ID, &inv.ShelterID, &inv.Email, &inv.Role, &invitedBy,
		&token, &createdAt, &expiresAt, &acceptedAt, &acceptedMember, &revokedAt)
	if err != nil {
		return inv, err
	}
	inv.InvitedByMemberID = invitedBy.String
	inv.Token = token.String
	inv.CreatedAt = createdAt.Format(time.RFC3339)
	inv.ExpiresAt = expiresAt.Format(time.RFC3339)
	if acceptedAt.Valid {
		inv.AcceptedAt = acceptedAt.Time.Format(time.RFC3339)
	}
	inv.AcceptedMemberID = acceptedMember.String
	if revokedAt.Valid {
		inv.RevokedAt = revokedAt.Time.Format(time.RFC3339)
	}
	return inv, nil
}

func newInviteToken() string {
	var b [24]byte
	_, _ = cryptorand.Read(b[:])
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:]))
}

func (s *PostgresStore) CreateShelterMemberInvite(invite domain.ShelterMemberInvite) (domain.ShelterMemberInvite, error) {
	// Cheap guards first to return friendly sentinel errors. A race
	// between this check and the INSERT is caught by the unique index
	// below and remapped back to the duplicate sentinel.
	if s.CountActiveShelterMembers(invite.ShelterID)+s.countActivePendingInvites(invite.ShelterID) >= 20 {
		return domain.ShelterMemberInvite{}, ErrShelterTeamFull
	}
	var existingMembers int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM shelter_members
		 WHERE shelter_id=$1 AND lower(email::text)=lower($2) AND status='active'`,
		invite.ShelterID, invite.Email).Scan(&existingMembers)
	if existingMembers > 0 {
		return domain.ShelterMemberInvite{}, ErrShelterMemberDuplicateEmail
	}
	if invite.ID == "" {
		invite.ID = newID("invite")
	}
	invite.Token = newInviteToken()
	invite.Email = strings.ToLower(strings.TrimSpace(invite.Email))
	// expires_at is derived server-side (created_at + 72h).
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO shelter_member_invites (
			id, shelter_id, email, role, invited_by_member_id,
			token, created_at, expires_at
		) VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW() + INTERVAL '72 hours')`,
		invite.ID, invite.ShelterID, invite.Email, invite.Role,
		nullIfEmpty(invite.InvitedByMemberID), invite.Token)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "idx_shelter_invites_active") ||
			(strings.Contains(msg, "unique") && strings.Contains(msg, "invite")) {
			return domain.ShelterMemberInvite{}, ErrShelterMemberInviteDuplicateEmail
		}
		return domain.ShelterMemberInvite{}, err
	}
	full, err := s.GetShelterMemberInviteByID(invite.ID)
	if err != nil {
		return invite, err
	}
	full.Token = invite.Token
	return *full, nil
}

func (s *PostgresStore) countActivePendingInvites(shelterID string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM shelter_member_invites
		 WHERE shelter_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,
		shelterID).Scan(&count)
	return count
}

func (s *PostgresStore) ListShelterMemberInvites(shelterID string) []domain.ShelterMemberInvite {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT `+shelterInviteCols+` FROM shelter_member_invites
		 WHERE shelter_id=$1 ORDER BY created_at DESC`, shelterID)
	if err != nil {
		return []domain.ShelterMemberInvite{}
	}
	defer rows.Close()
	out := []domain.ShelterMemberInvite{}
	for rows.Next() {
		inv, err := scanShelterInvite(rows)
		if err != nil {
			continue
		}
		// Scrub tokens from list results; admin UI calls resend to get
		// a fresh link back.
		inv.Token = ""
		out = append(out, inv)
	}
	return out
}

func (s *PostgresStore) GetShelterMemberInviteByID(inviteID string) (*domain.ShelterMemberInvite, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterInviteCols+` FROM shelter_member_invites WHERE id=$1`, inviteID)
	inv, err := scanShelterInvite(row)
	if err != nil {
		return nil, ErrShelterMemberInviteNotFound
	}
	return &inv, nil
}

func (s *PostgresStore) GetShelterMemberInviteByToken(token string) (*domain.ShelterMemberInvite, error) {
	row := s.pool.QueryRow(s.ctx(),
		`SELECT `+shelterInviteCols+` FROM shelter_member_invites WHERE token=$1`, token)
	inv, err := scanShelterInvite(row)
	if err != nil {
		return nil, ErrShelterMemberInviteNotFound
	}
	return &inv, nil
}

func (s *PostgresStore) RevokeShelterMemberInvite(inviteID string) error {
	res, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_member_invites SET revoked_at=NOW()
		 WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL`, inviteID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrShelterMemberInviteNotFound
	}
	return nil
}

func (s *PostgresStore) ResendShelterMemberInvite(inviteID string) (domain.ShelterMemberInvite, error) {
	token := newInviteToken()
	res, err := s.pool.Exec(s.ctx(),
		`UPDATE shelter_member_invites
		 SET token=$2, expires_at=NOW() + INTERVAL '72 hours'
		 WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,
		inviteID, token)
	if err != nil {
		return domain.ShelterMemberInvite{}, err
	}
	if res.RowsAffected() == 0 {
		return domain.ShelterMemberInvite{}, ErrShelterMemberInviteNotFound
	}
	full, err := s.GetShelterMemberInviteByID(inviteID)
	if err != nil {
		return domain.ShelterMemberInvite{}, err
	}
	// Re-attach the plaintext token so the caller can display it.
	full.Token = token
	return *full, nil
}

func (s *PostgresStore) AcceptShelterMemberInvite(token, passwordHash, name string) (domain.ShelterMember, domain.ShelterMemberInvite, error) {
	ctx := s.ctx()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}
	defer tx.Rollback(ctx)

	// Lock the invite row.
	var (
		inviteID, shelterID, email, role string
		invitedBy                        sql.NullString
		acceptedAt, revokedAt            sql.NullTime
		expiresAt                        time.Time
	)
	if err := tx.QueryRow(ctx,
		`SELECT id, shelter_id, email, role, invited_by_member_id,
			expires_at, accepted_at, revoked_at
		 FROM shelter_member_invites WHERE token=$1 FOR UPDATE`, token).
		Scan(&inviteID, &shelterID, &email, &role, &invitedBy,
			&expiresAt, &acceptedAt, &revokedAt); err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, ErrShelterMemberInviteNotFound
	}
	if acceptedAt.Valid {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, ErrShelterMemberInviteAlreadyUsed
	}
	if revokedAt.Valid {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, ErrShelterMemberInviteRevoked
	}
	if time.Now().After(expiresAt) {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, ErrShelterMemberInviteExpired
	}

	// Insert member atomically.
	memberID := newID("member")
	if _, err := tx.Exec(ctx,
		`INSERT INTO shelter_members (
			id, shelter_id, email, password_hash, name, role, status,
			must_change_password, invited_by_member_id, invited_at, joined_at
		) VALUES ($1,$2,$3,$4,$5,$6,'active', FALSE, $7, $8, NOW())`,
		memberID, shelterID, email, passwordHash, name, role,
		invitedBy, nil); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "idx_shelter_members_email") ||
			(strings.Contains(msg, "unique") && strings.Contains(msg, "member")) {
			return domain.ShelterMember{}, domain.ShelterMemberInvite{}, ErrShelterMemberDuplicateEmail
		}
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}

	if _, err := tx.Exec(ctx,
		`UPDATE shelter_member_invites
		 SET accepted_at=NOW(), accepted_member_id=$2
		 WHERE id=$1`, inviteID, memberID); err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}

	member, err := s.GetShelterMember(memberID)
	if err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}
	invite, err := s.GetShelterMemberInviteByID(inviteID)
	if err != nil {
		return domain.ShelterMember{}, domain.ShelterMemberInvite{}, err
	}
	invite.Token = "" // don't leak back
	return *member, *invite, nil
}

// ── Audit log ───────────────────────────────────────────────────

func (s *PostgresStore) RecordShelterAudit(entry domain.ShelterAuditEntry) error {
	if entry.ID == "" {
		entry.ID = newID("audit")
	}
	payload, err := json.Marshal(entry.Metadata)
	if err != nil || entry.Metadata == nil {
		payload = []byte("{}")
	}
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO shelter_audit_logs (
			id, shelter_id, actor_member_id, actor_name, actor_email,
			action, target_type, target_id, metadata
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
		entry.ID, entry.ShelterID, nullIfEmpty(entry.ActorMemberID),
		entry.ActorName, entry.ActorEmail,
		entry.Action, entry.TargetType, entry.TargetID, string(payload))
	return err
}

func (s *PostgresStore) ListShelterAuditLog(shelterID string, limit int, offset int) []domain.ShelterAuditEntry {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, shelter_id, actor_member_id, actor_name, actor_email,
			action, target_type, target_id, metadata, created_at
		 FROM shelter_audit_logs
		 WHERE shelter_id=$1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`, shelterID, limit, offset)
	if err != nil {
		return []domain.ShelterAuditEntry{}
	}
	defer rows.Close()
	out := []domain.ShelterAuditEntry{}
	for rows.Next() {
		var e domain.ShelterAuditEntry
		var actorMember sql.NullString
		var metadataRaw []byte
		var createdAt time.Time
		if err := rows.Scan(&e.ID, &e.ShelterID, &actorMember, &e.ActorName, &e.ActorEmail,
			&e.Action, &e.TargetType, &e.TargetID, &metadataRaw, &createdAt); err != nil {
			continue
		}
		e.ActorMemberID = actorMember.String
		e.CreatedAt = createdAt.Format(time.RFC3339)
		if len(metadataRaw) > 0 {
			_ = json.Unmarshal(metadataRaw, &e.Metadata)
		}
		out = append(out, e)
	}
	return out
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// Ensure unused imports compile
var (
	_ = rand.Intn
	_ = sort.Strings
)
