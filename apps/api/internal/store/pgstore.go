package store

import (
	"context"
	cryptorand "crypto/rand"
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

	// ── Playdates v0.13.0 ───────────────────────────────────────────
	// Visibility + per-user invites for private playdates.
	pool.Exec(ctx, `ALTER TABLE playdates ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'`)
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

	return &PostgresStore{pool: pool}, nil
}

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
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
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
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
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
		matches = append(matches, m)
	}

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

	// Get sender name & avatar
	var senderName, senderAvatar string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(first_name, ''), COALESCE(avatar_url, '') FROM user_profiles WHERE user_id = $1`, userID).Scan(&senderName, &senderAvatar)

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
	return nil
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
	return name, avatarStr
}

// findConvIDByUsers finds an existing conversation between two users.
func (s *PostgresStore) findConvIDByUsers(user1ID string, user2ID string) string {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id FROM conversations
		 WHERE user_ids @> $1::text[] AND user_ids @> $2::text[]
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
		        COALESCE(venue_id, '')
		 FROM playdates WHERE id = $1`, playdateID).
		Scan(&p.ID, &p.OrganizerID, &p.Title, &p.Description, &p.Date, &p.Location,
			&p.MaxPets, &p.Attendees, &createdAt,
			&p.Latitude, &p.Longitude, &p.CityLabel, &img,
			&p.Rules, &p.Status, &cancelledAt, &p.ConversationID, &p.Waitlist,
			&p.Visibility, &p.Locked, &p.VenueID)
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
	var notes, resolvedAt *string
	err := s.pool.QueryRow(s.ctx(), `SELECT id, reason, reporter_id, reporter_name, target_type, target_id, target_label, status, notes, resolved_at, created_at FROM reports WHERE id=$1`, reportID).
		Scan(&r.ID, &r.Reason, &r.ReporterID, &r.ReporterName, &r.TargetType, &r.TargetID, &r.TargetLabel, &r.Status, &notes, &resolvedAt, &r.CreatedAt)
	if err != nil { return nil, fmt.Errorf("report not found") }
	if notes != nil { r.Notes = *notes }
	if resolvedAt != nil { r.ResolvedAt = *resolvedAt }
	detail := &domain.ReportDetail{ReportSummary: r}
	return detail, nil
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
// Adoptions
// ================================================================

func (s *PostgresStore) ListAdoptions() []domain.AdoptionListing {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, pet_name, pet_age, pet_species, pet_breed, description, contact_phone, contact_email, location, image_url, status, created_at FROM adoption_listings ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.AdoptionListing
	for rows.Next() {
		var a domain.AdoptionListing
		var img *string
		rows.Scan(&a.ID, &a.UserID, &a.PetName, &a.PetAge, &a.PetSpecies, &a.PetBreed, &a.Description, &a.ContactPhone, &a.ContactEmail, &a.Location, &img, &a.Status, &a.CreatedAt)
		a.ImageURL = img
		out = append(out, a)
	}
	if out == nil { return []domain.AdoptionListing{} }
	return out
}

func (s *PostgresStore) CreateAdoption(listing domain.AdoptionListing) domain.AdoptionListing {
	listing.ID = newID("adopt")
	listing.Status = "active"
	listing.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO adoption_listings(id,user_id,pet_name,pet_age,pet_species,pet_breed,description,contact_phone,contact_email,location,image_url,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		listing.ID, listing.UserID, listing.PetName, listing.PetAge, listing.PetSpecies, listing.PetBreed, listing.Description, listing.ContactPhone, listing.ContactEmail, listing.Location, listing.ImageURL, listing.Status, listing.CreatedAt)
	return listing
}

func (s *PostgresStore) UpdateAdoptionStatus(listingID string, status string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE adoption_listings SET status=$1 WHERE id=$2`, status, listingID)
	return err
}

func (s *PostgresStore) DeleteAdoption(listingID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM adoption_listings WHERE id=$1`, listingID)
	return err
}

func (s *PostgresStore) GetAdoption(listingID string) (*domain.AdoptionListing, error) {
	var a domain.AdoptionListing
	var createdAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, user_id, pet_name, pet_age, pet_species, pet_breed, description,
		        contact_phone, contact_email, location, image_url, status, created_at
		 FROM adoption_listings WHERE id=$1`, listingID).
		Scan(&a.ID, &a.UserID, &a.PetName, &a.PetAge, &a.PetSpecies, &a.PetBreed,
			&a.Description, &a.ContactPhone, &a.ContactEmail, &a.Location, &a.ImageURL,
			&a.Status, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("adoption listing not found")
	}
	a.CreatedAt = createdAt.Format(time.RFC3339)
	return &a, nil
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

// Ensure unused imports compile
var (
	_ = rand.Intn
	_ = sort.Strings
)
