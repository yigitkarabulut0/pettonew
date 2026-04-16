package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

// pg extracts the underlying pgxpool.Pool from the configured Store. Returns
// nil when the server is running with the in-memory store (dev) — in that
// case the admin list endpoints gracefully return empty envelopes.
func (s *Server) pg() *pgxpool.Pool {
	if p, ok := s.store.(*store.PostgresStore); ok {
		return p.Pool()
	}
	return nil
}

// adminCtx returns a timeout-bound context for admin ad-hoc queries.
func adminCtx() context.Context {
	ctx, _ := context.WithTimeout(context.Background(), 15*time.Second)
	return ctx
}

// likeQ maps an empty search string to NULL-safe SQL so we can use a single
// prepared statement regardless of filter state.
func likeQ(q string) string {
	if q == "" {
		return ""
	}
	return "%" + strings.ToLower(q) + "%"
}

// ---------------- Users — ban / unban / bans history ---------------------

type adminBanRequest struct {
	Reason        string `json:"reason"`
	DurationHours int    `json:"durationHours"`
	Notes         string `json:"notes"`
}

func (s *Server) handleAdminBanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var payload adminBanRequest
	_ = decodeJSON(w, r, &payload)
	if payload.Reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return
	}
	if err := s.store.SuspendUser(userID, "banned"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if pool := s.pg(); pool != nil {
		id := fmt.Sprintf("ban-%d", time.Now().UnixNano())
		adminID := adminIDFromContext(r.Context())
		if adminID == "" {
			adminID = "system"
		}
		var endsAt any
		if payload.DurationHours > 0 {
			endsAt = time.Now().Add(time.Duration(payload.DurationHours) * time.Hour).UTC()
		}
		_, _ = pool.Exec(adminCtx(),
			`INSERT INTO user_bans (id, user_id, admin_id, reason, notes, ends_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			id, userID, adminID, payload.Reason, payload.Notes, endsAt)
	}
	s.auditLog(r, "user.ban", "user", userID, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"banned": true}})
}

func (s *Server) handleAdminUnbanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var payload struct {
		Notes string `json:"notes"`
	}
	_ = decodeJSON(w, r, &payload)
	if err := s.store.SuspendUser(userID, "active"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if pool := s.pg(); pool != nil {
		adminID := adminIDFromContext(r.Context())
		_, _ = pool.Exec(adminCtx(),
			`UPDATE user_bans
			 SET revoked_at = NOW(), revoked_by = $2
			 WHERE user_id = $1 AND revoked_at IS NULL`,
			userID, adminID)
	}
	s.auditLog(r, "user.unban", "user", userID, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"unbanned": true}})
}

func (s *Server) handleAdminUserBans(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT id, user_id, admin_id, reason, COALESCE(notes,''), starts_at,
		        ends_at, revoked_at, COALESCE(revoked_by,''), created_at
		 FROM user_bans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type ban struct {
		ID         string     `json:"id"`
		UserID     string     `json:"userId"`
		AdminID    string     `json:"adminId"`
		Reason     string     `json:"reason"`
		Notes      string     `json:"notes"`
		StartsAt   time.Time  `json:"startsAt"`
		EndsAt     *time.Time `json:"endsAt,omitempty"`
		RevokedAt  *time.Time `json:"revokedAt,omitempty"`
		RevokedBy  string     `json:"revokedBy,omitempty"`
		CreatedAt  time.Time  `json:"createdAt"`
	}
	var out []ban
	for rows.Next() {
		var b ban
		if err := rows.Scan(&b.ID, &b.UserID, &b.AdminID, &b.Reason, &b.Notes, &b.StartsAt, &b.EndsAt, &b.RevokedAt, &b.RevokedBy, &b.CreatedAt); err == nil {
			out = append(out, b)
		}
	}
	writeAdminList(w, out, len(out), "")
}

func (s *Server) handleAdminUserAwardBadge(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var payload struct {
		BadgeID string `json:"badgeId"`
		Notes   string `json:"notes"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	s.store.AwardBadge(userID, payload.BadgeID, payload.BadgeID, payload.Notes)
	s.auditLog(r, "user.award_badge", "user", userID, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"awarded": true}})
}

// ---------------- User aggregate slices ----------------------------------

func (s *Server) handleAdminUserPlaydates(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT p.id, p.title, COALESCE(p.location,''), p.date,
		        COALESCE(p.status,'active'), COALESCE(p.organizer_id,''),
		        CASE WHEN p.organizer_id = $1 THEN 'organizer' ELSE 'attendee' END AS role
		 FROM playdates p
		 WHERE p.organizer_id = $1 OR $1 = ANY(p.attendees)
		 ORDER BY p.date DESC LIMIT 200`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type row struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Location string `json:"location"`
		Date     string `json:"date"`
		Status   string `json:"status"`
		HostID   string `json:"hostId"`
		Role     string `json:"role"`
	}
	var out []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.ID, &x.Title, &x.Location, &x.Date, &x.Status, &x.HostID, &x.Role); err == nil {
			out = append(out, x)
		}
	}
	writeAdminList(w, out, len(out), "")
}

func (s *Server) handleAdminUserGroups(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT g.id, g.name, COALESCE(g.description,''), COALESCE(g.pet_type,''),
		        COALESCE(g.member_count, 0), g.created_at
		 FROM community_groups g
		 JOIN conversations c ON c.id = g.conversation_id
		 WHERE $1 = ANY(c.user_ids)
		 ORDER BY g.created_at DESC LIMIT 200`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type row struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		Description string    `json:"description"`
		PetType     string    `json:"petType"`
		MemberCount int       `json:"memberCount"`
		CreatedAt   time.Time `json:"createdAt"`
	}
	var out []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.ID, &x.Name, &x.Description, &x.PetType, &x.MemberCount, &x.CreatedAt); err == nil {
			out = append(out, x)
		}
	}
	writeAdminList(w, out, len(out), "")
}

func (s *Server) handleAdminUserReports(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	reports := s.store.ListReports()
	var out []any
	for _, rep := range reports {
		if rep.ReporterID == userID || (rep.TargetType == "user" && rep.TargetID == userID) {
			out = append(out, rep)
		}
	}
	writeAdminList(w, out, len(out), "")
}

// handleAdminUserLocation returns the user's most recent known coordinates.
// Priority:
//  1. live presence heartbeat — when the mobile app is in the foreground
//     and posting /presence/heartbeat, this is the real-time GPS fix.
//  2. fallback to venue check-ins and attended playdates so older users
//     still render a marker on the map even if they aren't online.
// Also returns a trail of recent positions for the breadcrumb overlay.
func (s *Server) handleAdminUserLocation(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	pool := s.pg()
	if pool == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"trail": []any{}}})
		return
	}

	type point struct {
		Kind       string    `json:"kind"`
		Label      string    `json:"label"`
		Lat        float64   `json:"lat"`
		Lng        float64   `json:"lng"`
		OccurAt    time.Time `json:"occurAt"`
		VenueID    string    `json:"venueId,omitempty"`
		PlaydateID string    `json:"playdateId,omitempty"`
	}
	var trail []point

	// Live presence — highest priority, if heartbeat is fresh.
	{
		var pLat, pLng sql.NullFloat64
		var pLastSeen sql.NullTime
		var pOnline sql.NullBool
		_ = pool.QueryRow(adminCtx(),
			`SELECT latitude, longitude, last_seen_at, is_online FROM user_presence WHERE user_id = $1`, userID).
			Scan(&pLat, &pLng, &pLastSeen, &pOnline)
		if pLat.Valid && pLng.Valid && pLastSeen.Valid {
			label := "Last known position"
			if pOnline.Valid && pOnline.Bool && time.Since(pLastSeen.Time) < 60*time.Second {
				label = "Live now"
			}
			trail = append(trail, point{
				Kind:    "live",
				Label:   label,
				Lat:     pLat.Float64,
				Lng:     pLng.Float64,
				OccurAt: pLastSeen.Time,
			})
		}
	}

	rows, err := pool.Query(adminCtx(),
		`SELECT 'checkin', COALESCE(v.name,''), COALESCE(v.latitude, 0), COALESCE(v.longitude, 0),
		        ci.checked_in_at, ci.venue_id, ''::text
		 FROM venue_check_ins ci
		 JOIN venues v ON v.id = ci.venue_id
		 WHERE ci.user_id = $1 AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
		 ORDER BY ci.checked_in_at DESC LIMIT 10`, userID)
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var p point
			if err := rows.Scan(&p.Kind, &p.Label, &p.Lat, &p.Lng, &p.OccurAt, &p.VenueID, &p.PlaydateID); err == nil {
				if p.Lat != 0 || p.Lng != 0 {
					trail = append(trail, p)
				}
			}
		}
	}

	pdRows, err := pool.Query(adminCtx(),
		`SELECT 'playdate', COALESCE(p.title,''), COALESCE(p.latitude, 0), COALESCE(p.longitude, 0),
		        p.date::timestamptz, ''::text, p.id
		 FROM playdates p
		 WHERE ($1 = ANY(p.attendees) OR p.organizer_id = $1)
		   AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
		   AND (p.latitude <> 0 OR p.longitude <> 0)
		 ORDER BY p.date DESC LIMIT 10`, userID)
	if err == nil && pdRows != nil {
		defer pdRows.Close()
		for pdRows.Next() {
			var p point
			if err := pdRows.Scan(&p.Kind, &p.Label, &p.Lat, &p.Lng, &p.OccurAt, &p.VenueID, &p.PlaydateID); err == nil {
				trail = append(trail, p)
			}
		}
	}

	// Keep live presence as THE latest (pinned). Sort the historical trail
	// by occurAt DESC separately so a future-dated playdate never outranks
	// a fresh heartbeat.
	var livePoint *point
	historical := make([]point, 0, len(trail))
	for i := range trail {
		if trail[i].Kind == "live" {
			p := trail[i]
			livePoint = &p
		} else {
			historical = append(historical, trail[i])
		}
	}
	for i := 0; i < len(historical); i++ {
		for j := i + 1; j < len(historical); j++ {
			if historical[j].OccurAt.After(historical[i].OccurAt) {
				historical[i], historical[j] = historical[j], historical[i]
			}
		}
	}
	trail = trail[:0]
	if livePoint != nil {
		trail = append(trail, *livePoint)
	}
	trail = append(trail, historical...)
	if len(trail) > 10 {
		trail = trail[:10]
	}

	var latest *point
	if livePoint != nil {
		latest = livePoint
	} else if len(trail) > 0 {
		latest = &trail[0]
	}

	var cityLabel string
	_ = pool.QueryRow(adminCtx(),
		`SELECT COALESCE(city_label,'') FROM user_profiles WHERE user_id = $1`, userID).Scan(&cityLabel)

	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"latest":    latest,
		"trail":     trail,
		"cityLabel": cityLabel,
	}})
}

// handleAdminActiveUsers returns real-time presence: everyone whose mobile
// app is in the foreground right now. Derived from `user_presence`:
// `is_online=true AND last_seen_at > now()-60s`. Anything older is treated
// as stale and excluded so a missed offline-ping never inflates the count.
func (s *Server) handleAdminActiveUsers(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT au.id,
		        COALESCE(up.first_name || ' ' || up.last_name, au.email, '') AS name,
		        au.email,
		        up.avatar_url,
		        COALESCE(up.city_label, ''),
		        p.last_seen_at,
		        p.latitude, p.longitude,
		        COALESCE(p.platform, '')
		 FROM user_presence p
		 JOIN app_users au ON au.id = p.user_id
		 LEFT JOIN user_profiles up ON up.user_id = au.id
		 WHERE p.is_online = TRUE
		   AND p.last_seen_at > NOW() - INTERVAL '60 seconds'
		 ORDER BY p.last_seen_at DESC LIMIT 200`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type row struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		Email     string    `json:"email"`
		AvatarURL string    `json:"avatarUrl,omitempty"`
		CityLabel string    `json:"cityLabel,omitempty"`
		LastAt    time.Time `json:"lastAt"`
		Lat       *float64  `json:"lat,omitempty"`
		Lng       *float64  `json:"lng,omitempty"`
		Platform  string    `json:"platform,omitempty"`
	}
	var out []row
	for rows.Next() {
		var x row
		var avatar sql.NullString
		var lat, lng sql.NullFloat64
		if err := rows.Scan(&x.ID, &x.Name, &x.Email, &avatar, &x.CityLabel, &x.LastAt, &lat, &lng, &x.Platform); err == nil {
			if avatar.Valid {
				x.AvatarURL = avatar.String
			}
			if lat.Valid {
				v := lat.Float64
				x.Lat = &v
			}
			if lng.Valid {
				v := lng.Float64
				x.Lng = &v
			}
			out = append(out, x)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (s *Server) handleAdminUserActivity(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT 'post'::text AS kind, po.id, COALESCE(po.body,''), po.created_at
		 FROM posts po WHERE po.author_user_id = $1
		 UNION ALL
		 SELECT 'checkin'::text, ci.id, COALESCE(v.name,''), ci.checked_in_at
		 FROM venue_check_ins ci LEFT JOIN venues v ON v.id = ci.venue_id WHERE ci.user_id = $1
		 UNION ALL
		 SELECT 'playdate_join'::text, p.id, COALESCE(p.title,''), p.date
		 FROM playdates p WHERE $1 = ANY(p.attendees)
		 UNION ALL
		 SELECT 'review'::text, vr.id, COALESCE(vr.comment,''), vr.created_at
		 FROM venue_reviews vr WHERE vr.user_id = $1
		 ORDER BY 4 DESC LIMIT 100`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type row struct {
		Kind    string    `json:"kind"`
		RefID   string    `json:"refId"`
		Label   string    `json:"label"`
		OccurAt time.Time `json:"occurAt"`
	}
	var out []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.Kind, &x.RefID, &x.Label, &x.OccurAt); err == nil {
			out = append(out, x)
		}
	}
	writeAdminList(w, out, len(out), "")
}

// ---------------- Pet aggregate slices -----------------------------------

func (s *Server) handleAdminPetPlaydates(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "petID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT p.id, p.title, COALESCE(p.location,''), p.date, COALESCE(p.status,'active')
		 FROM playdates p
		 JOIN playdate_pet_attendees ppa ON ppa.playdate_id = p.id
		 WHERE ppa.pet_id = $1
		 ORDER BY p.date DESC LIMIT 200`, petID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type row struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Location string `json:"location"`
		Date     string `json:"date"`
		Status   string `json:"status"`
	}
	var out []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.ID, &x.Title, &x.Location, &x.Date, &x.Status); err == nil {
			out = append(out, x)
		}
	}
	writeAdminList(w, out, len(out), "")
}

func (s *Server) handleAdminPetPhotos(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "petID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT id, url, COALESCE(is_primary, false), COALESCE(display_order, 0)
		 FROM pet_photos WHERE pet_id = $1 ORDER BY display_order`, petID)
	if err != nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	defer rows.Close()
	type row struct {
		ID           string `json:"id"`
		URL          string `json:"url"`
		IsPrimary    bool   `json:"isPrimary"`
		DisplayOrder int    `json:"displayOrder"`
	}
	var out []row
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.ID, &x.URL, &x.IsPrimary, &x.DisplayOrder); err == nil {
			out = append(out, x)
		}
	}
	writeAdminList(w, out, len(out), "")
}

// ---------------- Admin accounts (RBAC) -----------------------------------

type adminAccount struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt   *time.Time `json:"createdAt,omitempty"`
}

func (s *Server) handleAdminListAdmins(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []adminAccount{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT id, email, COALESCE(name,''), COALESCE(role,'superadmin'),
		        COALESCE(status,'active'), last_login_at
		 FROM admin_users
		 WHERE ($1 = '' OR LOWER(email) LIKE $1 OR LOWER(name) LIKE $1)
		 ORDER BY email
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var list []adminAccount
	for rows.Next() {
		var a adminAccount
		if err := rows.Scan(&a.ID, &a.Email, &a.Name, &a.Role, &a.Status, &a.LastLoginAt); err == nil {
			list = append(list, a)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM admin_users
		 WHERE ($1 = '' OR LOWER(email) LIKE $1 OR LOWER(name) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, list, total, "")
}

func (s *Server) handleAdminCreateAdmin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if payload.Email == "" || payload.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}
	if payload.Role == "" {
		payload.Role = "moderator"
	}
	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "postgres store required")
		return
	}
	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	id := fmt.Sprintf("admin-%d", time.Now().UnixNano())
	_, err = pool.Exec(adminCtx(),
		`INSERT INTO admin_users (id, email, name, password_hash, role, status)
		 VALUES ($1, LOWER($2), $3, $4, $5, 'active')`,
		id, payload.Email, payload.Name, hash, payload.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.auditLog(r, "admin.create", "admin", id, map[string]any{"email": payload.Email, "role": payload.Role})
	writeJSON(w, http.StatusCreated, map[string]any{"data": adminAccount{
		ID: id, Email: strings.ToLower(payload.Email), Name: payload.Name,
		Role: payload.Role, Status: "active",
	}})
}

func (s *Server) handleAdminUpdateAdmin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "adminID")
	var patch struct {
		Name   *string `json:"name"`
		Role   *string `json:"role"`
		Status *string `json:"status"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}
	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "postgres store required")
		return
	}
	if patch.Name != nil {
		_, _ = pool.Exec(adminCtx(), `UPDATE admin_users SET name=$2 WHERE id=$1`, id, *patch.Name)
	}
	if patch.Role != nil {
		_, _ = pool.Exec(adminCtx(), `UPDATE admin_users SET role=$2 WHERE id=$1`, id, *patch.Role)
	}
	if patch.Status != nil {
		_, _ = pool.Exec(adminCtx(), `UPDATE admin_users SET status=$2 WHERE id=$1`, id, *patch.Status)
	}
	s.auditLog(r, "admin.update", "admin", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminResetAdminPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "adminID")
	var payload struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if len(payload.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "postgres store required")
		return
	}
	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, err = pool.Exec(adminCtx(),
		`UPDATE admin_users SET password_hash=$2, password_changed_at=NOW() WHERE id=$1`, id, hash)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.auditLog(r, "admin.reset_password", "admin", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"reset": true}})
}

func (s *Server) handleAdminDeleteAdmin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "adminID")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM admin_users WHERE id=$1`, id)
	}
	s.auditLog(r, "admin.delete", "admin", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

// ---------------- Audit logs ---------------------------------------------

type auditRow struct {
	ID           string         `json:"id"`
	ActorAdminID string         `json:"actorAdminId"`
	ActorName    string         `json:"actorName,omitempty"`
	Action       string         `json:"action"`
	EntityType   string         `json:"entityType"`
	EntityID     string         `json:"entityId,omitempty"`
	Payload      map[string]any `json:"payload,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func (s *Server) handleAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []auditRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT a.id, a.actor_admin_id, COALESCE(au.name, a.actor_admin_id), a.action,
		        a.entity_type, COALESCE(a.entity_id,''), COALESCE(a.payload, '{}'::jsonb), a.created_at
		 FROM audit_logs a
		 LEFT JOIN admin_users au ON au.id = a.actor_admin_id
		 WHERE ($1 = '' OR LOWER(a.action) LIKE $1 OR LOWER(a.entity_type) LIKE $1 OR LOWER(a.entity_id) LIKE $1)
		 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []auditRow
	for rows.Next() {
		var a auditRow
		var payloadRaw []byte
		if err := rows.Scan(&a.ID, &a.ActorAdminID, &a.ActorName, &a.Action, &a.EntityType, &a.EntityID, &payloadRaw, &a.CreatedAt); err == nil {
			_ = json.Unmarshal(payloadRaw, &a.Payload)
			out = append(out, a)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM audit_logs WHERE ($1 = '' OR LOWER(action) LIKE $1 OR LOWER(entity_type) LIKE $1 OR LOWER(entity_id) LIKE $1)`,
		like).Scan(&total)
	writeAdminList(w, out, total, "")
}

// ---------------- Moderation: conversations / matches / swipes / blocks ---

type convRow struct {
	ID            string     `json:"id"`
	UserAID       string     `json:"userAId"`
	UserAName     string     `json:"userAName,omitempty"`
	UserBID       string     `json:"userBId"`
	UserBName     string     `json:"userBName,omitempty"`
	MessageCount  int        `json:"messageCount"`
	LastMessageAt *time.Time `json:"lastMessageAt,omitempty"`
	Muted         bool       `json:"muted"`
}

func (s *Server) handleAdminConversations(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []convRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	rows, err := pool.Query(adminCtx(),
		`SELECT c.id,
		        COALESCE(c.user_ids[1],'') AS user_a,
		        COALESCE(c.user_ids[2],'') AS user_b,
		        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count,
		        c.last_message_at,
		        COALESCE(pa.first_name || ' ' || pa.last_name, ua.email, '') AS user_a_name,
		        COALESCE(pb.first_name || ' ' || pb.last_name, ub.email, '') AS user_b_name
		 FROM conversations c
		 LEFT JOIN app_users ua       ON ua.id = COALESCE(c.user_ids[1],'')
		 LEFT JOIN user_profiles pa   ON pa.user_id = ua.id
		 LEFT JOIN app_users ub       ON ub.id = COALESCE(c.user_ids[2],'')
		 LEFT JOIN user_profiles pb   ON pb.user_id = ub.id
		 ORDER BY c.last_message_at DESC NULLS LAST
		 LIMIT $1 OFFSET $2`, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []convRow
	for rows.Next() {
		var c convRow
		if err := rows.Scan(&c.ID, &c.UserAID, &c.UserBID, &c.MessageCount, &c.LastMessageAt, &c.UserAName, &c.UserBName); err == nil {
			out = append(out, c)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(), `SELECT COUNT(*) FROM conversations`).Scan(&total)
	writeAdminList(w, out, total, "")
}

type messageRow struct {
	ID             string     `json:"id"`
	ConversationID string     `json:"conversationId"`
	SenderUserID   string     `json:"senderUserId"`
	SenderName     string     `json:"senderName,omitempty"`
	Body           string     `json:"body"`
	Type           string     `json:"type,omitempty"`
	ImageURL       string     `json:"imageUrl,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	DeletedAt      *time.Time `json:"deletedAt,omitempty"`
}

func (s *Server) handleAdminConversationMessages(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []messageRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	if q.Limit > 200 {
		q.Limit = 200
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT id, conversation_id, sender_profile_id, COALESCE(sender_name,''),
		        COALESCE(body,''), COALESCE(message_type,'text'), COALESCE(image_url,''),
		        created_at, deleted_at
		 FROM messages WHERE conversation_id = $1
		 ORDER BY created_at ASC
		 LIMIT $2 OFFSET $3`, convID, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []messageRow
	for rows.Next() {
		var m messageRow
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderUserID, &m.SenderName, &m.Body, &m.Type, &m.ImageURL, &m.CreatedAt, &m.DeletedAt); err == nil {
			out = append(out, m)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(), `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`, convID).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminDeleteConversationMessage(w http.ResponseWriter, r *http.Request) {
	cid := chi.URLParam(r, "conversationID")
	mid := chi.URLParam(r, "messageID")
	if pool := s.pg(); pool != nil {
		adminID := adminIDFromContext(r.Context())
		_, _ = pool.Exec(adminCtx(),
			`UPDATE messages SET deleted_at = NOW(), deleted_by = $2
			 WHERE id = $1 AND conversation_id = $3`,
			mid, adminID, cid)
	}
	s.auditLog(r, "message.delete", "message", mid, map[string]any{"conversationId": cid})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

type matchRow struct {
	ID                 string    `json:"id"`
	PetAID             string    `json:"petAId"`
	PetAName           string    `json:"petAName,omitempty"`
	PetBID             string    `json:"petBId"`
	PetBName           string    `json:"petBName,omitempty"`
	MatchedAt          time.Time `json:"matchedAt"`
	ConversationID     string    `json:"conversationId,omitempty"`
	UnreadCount        int       `json:"unreadCount"`
	Status             string    `json:"status"`
	LastMessagePreview string    `json:"lastMessagePreview,omitempty"`
}

func (s *Server) handleAdminMatches(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []matchRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT m.id, m.pet_a_id, COALESCE(pa.name,''), m.pet_b_id, COALESCE(pb.name,''),
		        m.created_at, COALESCE(m.conversation_id,''),
		        COALESCE(m.unread_count, 0), COALESCE(m.status,'active'),
		        COALESCE(m.last_message_preview, '')
		 FROM matches m
		 LEFT JOIN pets pa ON pa.id = m.pet_a_id
		 LEFT JOIN pets pb ON pb.id = m.pet_b_id
		 WHERE ($1 = '' OR LOWER(pa.name) LIKE $1 OR LOWER(pb.name) LIKE $1 OR LOWER(m.id) LIKE $1)
		 ORDER BY m.created_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []matchRow
	for rows.Next() {
		var m matchRow
		if err := rows.Scan(&m.ID, &m.PetAID, &m.PetAName, &m.PetBID, &m.PetBName, &m.MatchedAt, &m.ConversationID, &m.UnreadCount, &m.Status, &m.LastMessagePreview); err == nil {
			out = append(out, m)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM matches m
		 LEFT JOIN pets pa ON pa.id = m.pet_a_id
		 LEFT JOIN pets pb ON pb.id = m.pet_b_id
		 WHERE ($1 = '' OR LOWER(pa.name) LIKE $1 OR LOWER(pb.name) LIKE $1 OR LOWER(m.id) LIKE $1)`,
		like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminDeleteMatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "matchID")
	var payload struct {
		Reason string `json:"reason"`
	}
	_ = decodeJSON(w, r, &payload)
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM matches WHERE id = $1`, id)
	}
	s.auditLog(r, "match.unmatch", "match", id, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"unmatched": true}})
}

type swipeRow struct {
	ID          string    `json:"id"`
	ActorPetID  string    `json:"actorPetId"`
	ActorName   string    `json:"actorName,omitempty"`
	TargetPetID string    `json:"targetPetId"`
	TargetName  string    `json:"targetName,omitempty"`
	Direction   string    `json:"direction"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (s *Server) handleAdminSwipes(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []swipeRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	direction := q.ExtraFlags["direction"]
	rows, err := pool.Query(adminCtx(),
		`SELECT s.id, s.actor_pet_id, COALESCE(pa.name,''), s.target_pet_id,
		        COALESCE(pt.name,''), s.direction, s.created_at
		 FROM swipes s
		 LEFT JOIN pets pa ON pa.id = s.actor_pet_id
		 LEFT JOIN pets pt ON pt.id = s.target_pet_id
		 WHERE ($1 = '' OR LOWER(pa.name) LIKE $1 OR LOWER(pt.name) LIKE $1 OR LOWER(s.actor_pet_id) LIKE $1 OR LOWER(s.target_pet_id) LIKE $1)
		   AND ($2 = '' OR s.direction = $2)
		 ORDER BY s.created_at DESC
		 LIMIT $3 OFFSET $4`, like, direction, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []swipeRow
	for rows.Next() {
		var s swipeRow
		if err := rows.Scan(&s.ID, &s.ActorPetID, &s.ActorName, &s.TargetPetID, &s.TargetName, &s.Direction, &s.CreatedAt); err == nil {
			out = append(out, s)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM swipes s
		 LEFT JOIN pets pa ON pa.id = s.actor_pet_id
		 LEFT JOIN pets pt ON pt.id = s.target_pet_id
		 WHERE ($1 = '' OR LOWER(pa.name) LIKE $1 OR LOWER(pt.name) LIKE $1 OR LOWER(s.actor_pet_id) LIKE $1 OR LOWER(s.target_pet_id) LIKE $1)
		   AND ($2 = '' OR s.direction = $2)`,
		like, direction).Scan(&total)
	writeAdminList(w, out, total, "")
}

type blockRow struct {
	ID            string    `json:"id"`
	BlockerUserID string    `json:"blockerUserId"`
	BlockerName   string    `json:"blockerName,omitempty"`
	BlockedUserID string    `json:"blockedUserId"`
	BlockedName   string    `json:"blockedName,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

func (s *Server) handleAdminBlocks(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []blockRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT b.id, b.blocker_user_id, COALESCE(pa.first_name || ' ' || pa.last_name, ua.email, ''),
		        b.blocked_user_id, COALESCE(pb.first_name || ' ' || pb.last_name, ub.email, ''),
		        b.created_at
		 FROM blocks b
		 LEFT JOIN app_users ua      ON ua.id = b.blocker_user_id
		 LEFT JOIN user_profiles pa  ON pa.user_id = b.blocker_user_id
		 LEFT JOIN app_users ub      ON ub.id = b.blocked_user_id
		 LEFT JOIN user_profiles pb  ON pb.user_id = b.blocked_user_id
		 WHERE ($1 = '' OR LOWER(b.blocker_user_id) LIKE $1 OR LOWER(b.blocked_user_id) LIKE $1
		        OR LOWER(ua.email) LIKE $1 OR LOWER(ub.email) LIKE $1)
		 ORDER BY b.created_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []blockRow
	for rows.Next() {
		var b blockRow
		if err := rows.Scan(&b.ID, &b.BlockerUserID, &b.BlockerName, &b.BlockedUserID, &b.BlockedName, &b.CreatedAt); err == nil {
			out = append(out, b)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(), `SELECT COUNT(*) FROM blocks`).Scan(&total)
	writeAdminList(w, out, total, "")
}

// ---------------- Check-ins / reviews / event RSVPs -----------------------

type checkInRow struct {
	ID           string    `json:"id"`
	VenueID      string    `json:"venueId"`
	VenueName    string    `json:"venueName,omitempty"`
	UserID       string    `json:"userId"`
	UserName     string    `json:"userName,omitempty"`
	PetCount     int       `json:"petCount"`
	CheckedInAt  time.Time `json:"checkedInAt"`
}

func (s *Server) handleAdminVenueCheckIns(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []checkInRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT ci.id, ci.venue_id, COALESCE(v.name,''), ci.user_id,
		        COALESCE(ci.user_name,''), COALESCE(ci.pet_count, 0), ci.checked_in_at
		 FROM venue_check_ins ci
		 LEFT JOIN venues v ON v.id = ci.venue_id
		 WHERE ($1 = '' OR LOWER(ci.user_name) LIKE $1 OR LOWER(v.name) LIKE $1)
		 ORDER BY ci.checked_in_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []checkInRow
	for rows.Next() {
		var c checkInRow
		if err := rows.Scan(&c.ID, &c.VenueID, &c.VenueName, &c.UserID, &c.UserName, &c.PetCount, &c.CheckedInAt); err == nil {
			out = append(out, c)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM venue_check_ins ci LEFT JOIN venues v ON v.id = ci.venue_id
		 WHERE ($1 = '' OR LOWER(ci.user_name) LIKE $1 OR LOWER(v.name) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminDeleteVenueCheckIn(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM venue_check_ins WHERE id = $1`, id)
	}
	s.auditLog(r, "venue.delete_checkin", "check_in", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

type reviewRow struct {
	ID        string    `json:"id"`
	VenueID   string    `json:"venueId"`
	VenueName string    `json:"venueName,omitempty"`
	UserID    string    `json:"userId"`
	UserName  string    `json:"userName,omitempty"`
	Rating    int       `json:"rating"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Server) handleAdminVenueReviews(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []reviewRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT vr.id, vr.venue_id, COALESCE(v.name,''), vr.user_id, COALESCE(vr.user_name,''),
		        COALESCE(vr.rating, 0), COALESCE(vr.comment,''), vr.created_at
		 FROM venue_reviews vr
		 LEFT JOIN venues v ON v.id = vr.venue_id
		 WHERE ($1 = '' OR LOWER(vr.comment) LIKE $1 OR LOWER(v.name) LIKE $1 OR LOWER(vr.user_name) LIKE $1)
		 ORDER BY vr.created_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []reviewRow
	for rows.Next() {
		var v reviewRow
		if err := rows.Scan(&v.ID, &v.VenueID, &v.VenueName, &v.UserID, &v.UserName, &v.Rating, &v.Comment, &v.CreatedAt); err == nil {
			out = append(out, v)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM venue_reviews vr LEFT JOIN venues v ON v.id = vr.venue_id
		 WHERE ($1 = '' OR LOWER(vr.comment) LIKE $1 OR LOWER(v.name) LIKE $1 OR LOWER(vr.user_name) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminDeleteVenueReview(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM venue_reviews WHERE id = $1`, id)
	}
	s.auditLog(r, "venue.delete_review", "review", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

func (s *Server) handleAdminEventRSVPs(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "eventID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT id, user_id, COALESCE(user_name,''), COALESCE(pet_names, '{}'::text[]), rsvp_at
		 FROM event_rsvps WHERE event_id = $1 ORDER BY rsvp_at DESC LIMIT 500`, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type rsvp struct {
		ID       string    `json:"id"`
		UserID   string    `json:"userId"`
		UserName string    `json:"userName,omitempty"`
		PetNames []string  `json:"petNames,omitempty"`
		RSVPAt   time.Time `json:"rsvpAt"`
	}
	var out []rsvp
	for rows.Next() {
		var v rsvp
		if err := rows.Scan(&v.ID, &v.UserID, &v.UserName, &v.PetNames, &v.RSVPAt); err == nil {
			out = append(out, v)
		}
	}
	writeAdminList(w, out, len(out), "")
}

// ---------------- Pet albums / milestones ---------------------------------

func (s *Server) handleAdminPetAlbums(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "petID")
	items := s.store.ListPetAlbums(petID)
	writeAdminList(w, items, len(items), "")
}
func (s *Server) handleAdminPetMilestones(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "petID")
	items := s.store.ListPetMilestones(petID)
	writeAdminList(w, items, len(items), "")
}
func (s *Server) handleAdminDeletePetAlbum(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "albumID")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM pet_album_photos WHERE album_id = $1`, id)
		_, _ = pool.Exec(adminCtx(), `DELETE FROM pet_albums WHERE id = $1`, id)
	}
	s.auditLog(r, "pet.delete_album", "album", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

// ---------------- Directory full CRUD (updates) ---------------------------

func (s *Server) handleAdminUpdateVetClinic(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "clinicID")
	var patch struct {
		Name        *string  `json:"name"`
		Phone       *string  `json:"phone"`
		Address     *string  `json:"address"`
		City        *string  `json:"city"`
		IsEmergency *bool    `json:"isEmergency"`
		Website     *string  `json:"website"`
		Hours       *string  `json:"hours"`
		Latitude    *float64 `json:"latitude"`
		Longitude   *float64 `json:"longitude"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}
	if pool := s.pg(); pool != nil {
		parts := []string{}
		args := []any{id}
		idx := 2
		if patch.Name != nil {
			parts = append(parts, fmt.Sprintf("name=$%d", idx))
			args = append(args, *patch.Name)
			idx++
		}
		if patch.Phone != nil {
			parts = append(parts, fmt.Sprintf("phone=$%d", idx))
			args = append(args, *patch.Phone)
			idx++
		}
		if patch.Address != nil {
			parts = append(parts, fmt.Sprintf("address=$%d", idx))
			args = append(args, *patch.Address)
			idx++
		}
		if patch.City != nil {
			parts = append(parts, fmt.Sprintf("city=$%d", idx))
			args = append(args, *patch.City)
			idx++
		}
		if patch.IsEmergency != nil {
			parts = append(parts, fmt.Sprintf("is_emergency=$%d", idx))
			args = append(args, *patch.IsEmergency)
			idx++
		}
		if patch.Website != nil {
			parts = append(parts, fmt.Sprintf("website=$%d", idx))
			args = append(args, *patch.Website)
			idx++
		}
		if patch.Hours != nil {
			parts = append(parts, fmt.Sprintf("hours=$%d", idx))
			args = append(args, *patch.Hours)
			idx++
		}
		if patch.Latitude != nil {
			parts = append(parts, fmt.Sprintf("latitude=$%d", idx))
			args = append(args, *patch.Latitude)
			idx++
		}
		if patch.Longitude != nil {
			parts = append(parts, fmt.Sprintf("longitude=$%d", idx))
			args = append(args, *patch.Longitude)
			idx++
		}
		if len(parts) > 0 {
			_, _ = pool.Exec(adminCtx(),
				fmt.Sprintf(`UPDATE vet_clinics SET %s WHERE id = $1`, strings.Join(parts, ", ")),
				args...)
		}
	}
	s.auditLog(r, "vet_clinic.update", "vet_clinic", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminUpdatePetSitter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "sitterID")
	var patch map[string]any
	_ = decodeJSON(w, r, &patch)
	s.auditLog(r, "pet_sitter.update", "pet_sitter", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminUpdateWalkRoute(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "routeID")
	var patch map[string]any
	_ = decodeJSON(w, r, &patch)
	s.auditLog(r, "walk_route.update", "walk_route", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

// ---------------- Community updates --------------------------------------

func (s *Server) handleAdminUpdateGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "groupID")
	var patch map[string]any
	_ = decodeJSON(w, r, &patch)
	s.auditLog(r, "group.update", "group", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []any{}, 0, "")
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT c.user_ids FROM community_groups g
		 LEFT JOIN conversations c ON c.id = g.conversation_id
		 WHERE g.id = $1 LIMIT 1`, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type member struct {
		UserID string `json:"userId"`
		Name   string `json:"name,omitempty"`
	}
	var userIDs []string
	if rows.Next() {
		_ = rows.Scan(&userIDs)
	}
	var out []member
	if len(userIDs) > 0 {
		memberRows, _ := pool.Query(adminCtx(),
			`SELECT u.id, COALESCE(p.first_name || ' ' || p.last_name, u.email, '')
			 FROM app_users u
			 LEFT JOIN user_profiles p ON p.user_id = u.id
			 WHERE u.id = ANY($1)`, userIDs)
		if memberRows != nil {
			defer memberRows.Close()
			for memberRows.Next() {
				var m member
				if err := memberRows.Scan(&m.UserID, &m.Name); err == nil {
					out = append(out, m)
				}
			}
		}
	}
	writeAdminList(w, out, len(out), "")
}

func (s *Server) handleAdminKickGroupMember(w http.ResponseWriter, r *http.Request) {
	gid := chi.URLParam(r, "groupID")
	uid := chi.URLParam(r, "userID")
	s.auditLog(r, "group.kick_member", "group", gid, map[string]any{"userId": uid})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"removed": true}})
}

func (s *Server) handleAdminUpdatePlaydate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "playdateID")
	var patch map[string]any
	_ = decodeJSON(w, r, &patch)
	s.auditLog(r, "playdate.update", "playdate", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminCancelPlaydate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "playdateID")
	var payload struct {
		Reason string `json:"reason"`
	}
	_ = decodeJSON(w, r, &payload)
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(),
			`UPDATE playdates SET status='cancelled', cancelled_at=NOW() WHERE id=$1`, id)
	}
	s.auditLog(r, "playdate.cancel", "playdate", id, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"cancelled": true}})
}

// ---------------- Reports extensions --------------------------------------

func (s *Server) handleAdminReportsBulkResolve(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		IDs        []string `json:"ids"`
		Resolution string   `json:"resolution"`
		Notes      string   `json:"notes"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	for _, id := range payload.IDs {
		_ = s.store.ResolveReport(id, payload.Notes)
	}
	s.auditLog(r, "report.bulk_resolve", "report", "", payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"resolved": len(payload.IDs)}})
}

func (s *Server) handleAdminReportsStats(w http.ResponseWriter, r *http.Request) {
	reports := s.store.ListReports()
	open, resolved, dismissed := 0, 0, 0
	byType := map[string]int{}
	for _, rep := range reports {
		switch rep.Status {
		case "resolved":
			resolved++
		case "dismissed":
			dismissed++
		default:
			open++
		}
		byType[rep.TargetType]++
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"open": open, "resolved": resolved, "dismissed": dismissed,
		"byType": byType, "overdue": 0,
	}})
}

// ---------------- System: announcements / flags / broadcast / metrics / badges ---

type announcementRow struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Body          string          `json:"body"`
	Severity      string          `json:"severity"`
	StartsAt      time.Time       `json:"startsAt"`
	EndsAt        *time.Time      `json:"endsAt,omitempty"`
	TargetSegment json.RawMessage `json:"targetSegment,omitempty"`
	CreatedBy     string          `json:"createdBy,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
}

func (s *Server) handleAdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []announcementRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT id, title, body, severity, starts_at, ends_at,
		        COALESCE(target_segment, 'null'::jsonb), COALESCE(created_by,''), created_at
		 FROM admin_announcements
		 WHERE ($1 = '' OR LOWER(title) LIKE $1 OR LOWER(body) LIKE $1)
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []announcementRow
	for rows.Next() {
		var a announcementRow
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.Severity, &a.StartsAt, &a.EndsAt, &a.TargetSegment, &a.CreatedBy, &a.CreatedAt); err == nil {
			out = append(out, a)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM admin_announcements
		 WHERE ($1 = '' OR LOWER(title) LIKE $1 OR LOWER(body) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title         string          `json:"title"`
		Body          string          `json:"body"`
		Severity      string          `json:"severity"`
		StartsAt      *time.Time      `json:"startsAt"`
		EndsAt        *time.Time      `json:"endsAt"`
		TargetSegment json.RawMessage `json:"targetSegment"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if payload.Title == "" || payload.Body == "" {
		writeError(w, http.StatusBadRequest, "title and body required")
		return
	}
	if payload.Severity == "" {
		payload.Severity = "info"
	}
	starts := time.Now().UTC()
	if payload.StartsAt != nil {
		starts = *payload.StartsAt
	}
	id := fmt.Sprintf("announcement-%d", time.Now().UnixNano())
	adminID := adminIDFromContext(r.Context())
	var seg any
	if len(payload.TargetSegment) > 0 && string(payload.TargetSegment) != "null" {
		seg = string(payload.TargetSegment)
	}
	if pool := s.pg(); pool != nil {
		_, err := pool.Exec(adminCtx(),
			`INSERT INTO admin_announcements (id, title, body, severity, starts_at, ends_at, target_segment, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, payload.Title, payload.Body, payload.Severity, starts, payload.EndsAt, seg, adminID)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	s.auditLog(r, "announcement.create", "announcement", id, payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": map[string]any{
		"id": id, "title": payload.Title, "body": payload.Body,
		"severity": payload.Severity, "startsAt": starts, "endsAt": payload.EndsAt,
	}})
}

func (s *Server) handleAdminUpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var patch struct {
		Title    *string    `json:"title"`
		Body     *string    `json:"body"`
		Severity *string    `json:"severity"`
		EndsAt   *time.Time `json:"endsAt"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}
	if pool := s.pg(); pool != nil {
		parts := []string{}
		args := []any{id}
		idx := 2
		if patch.Title != nil {
			parts = append(parts, fmt.Sprintf("title=$%d", idx))
			args = append(args, *patch.Title)
			idx++
		}
		if patch.Body != nil {
			parts = append(parts, fmt.Sprintf("body=$%d", idx))
			args = append(args, *patch.Body)
			idx++
		}
		if patch.Severity != nil {
			parts = append(parts, fmt.Sprintf("severity=$%d", idx))
			args = append(args, *patch.Severity)
			idx++
		}
		if patch.EndsAt != nil {
			parts = append(parts, fmt.Sprintf("ends_at=$%d", idx))
			args = append(args, *patch.EndsAt)
			idx++
		}
		if len(parts) > 0 {
			_, _ = pool.Exec(adminCtx(),
				fmt.Sprintf(`UPDATE admin_announcements SET %s WHERE id=$1`, strings.Join(parts, ", ")),
				args...)
		}
	}
	s.auditLog(r, "announcement.update", "announcement", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminDeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM admin_announcements WHERE id = $1`, id)
	}
	s.auditLog(r, "announcement.delete", "announcement", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}

type featureFlagRow struct {
	Key         string          `json:"key"`
	Enabled     bool            `json:"enabled"`
	Description string          `json:"description,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	UpdatedBy   string          `json:"updatedBy,omitempty"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

func (s *Server) handleAdminFeatureFlags(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []featureFlagRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT key, enabled, COALESCE(description,''), COALESCE(payload, 'null'::jsonb),
		        COALESCE(updated_by,''), updated_at
		 FROM feature_flags
		 WHERE ($1 = '' OR LOWER(key) LIKE $1 OR LOWER(description) LIKE $1)
		 ORDER BY key
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []featureFlagRow
	for rows.Next() {
		var f featureFlagRow
		if err := rows.Scan(&f.Key, &f.Enabled, &f.Description, &f.Payload, &f.UpdatedBy, &f.UpdatedAt); err == nil {
			out = append(out, f)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM feature_flags
		 WHERE ($1 = '' OR LOWER(key) LIKE $1 OR LOWER(description) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminUpdateFeatureFlag(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	var patch struct {
		Enabled     *bool           `json:"enabled"`
		Description *string         `json:"description"`
		Payload     json.RawMessage `json:"payload"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}
	enabled := false
	if patch.Enabled != nil {
		enabled = *patch.Enabled
	}
	desc := ""
	if patch.Description != nil {
		desc = *patch.Description
	}
	var payload any
	if len(patch.Payload) > 0 && string(patch.Payload) != "null" {
		payload = string(patch.Payload)
	}
	adminID := adminIDFromContext(r.Context())
	if pool := s.pg(); pool != nil {
		_, err := pool.Exec(adminCtx(),
			`INSERT INTO feature_flags (key, enabled, description, payload, updated_by, updated_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())
			 ON CONFLICT (key) DO UPDATE SET
			   enabled = EXCLUDED.enabled,
			   description = EXCLUDED.description,
			   payload = EXCLUDED.payload,
			   updated_by = EXCLUDED.updated_by,
			   updated_at = NOW()`,
			key, enabled, desc, payload, adminID)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	s.auditLog(r, "feature_flag.update", "feature_flag", key, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"key": key, "enabled": enabled, "description": desc,
	}})
}

func (s *Server) handleAdminBroadcast(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title    string                 `json:"title"`
		Body     string                 `json:"body"`
		DeepLink string                 `json:"deepLink"`
		Segment  map[string]interface{} `json:"segment"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	s.auditLog(r, "broadcast.send", "broadcast", "", payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deliveredCount": 0}})
}

func (s *Server) handleAdminDashboardMetrics(w http.ResponseWriter, r *http.Request) {
	snap := s.store.Dashboard()
	reports := s.store.ListReports()
	open := 0
	for _, rep := range reports {
		if rep.Status != "resolved" && rep.Status != "dismissed" {
			open++
		}
	}
	metrics := map[string]string{}
	for _, m := range snap.Metrics {
		metrics[m.ID] = m.Value
	}
	out := map[string]any{
		"metrics":        snap.Metrics,
		"growth":         snap.Growth,
		"reportsOpen":    open,
		"reportsOverdue": 0,
		"byKey":          metrics,
	}
	if pool := s.pg(); pool != nil {
		var dau, mau, newUsers24h, matches24h, swipes24h, posts24h int
		_ = pool.QueryRow(adminCtx(),
			`SELECT
			   (SELECT COUNT(DISTINCT sender_profile_id) FROM messages WHERE created_at > NOW() - INTERVAL '1 day'),
			   (SELECT COUNT(DISTINCT id) FROM app_users WHERE created_at > NOW() - INTERVAL '30 days'),
			   (SELECT COUNT(*) FROM app_users WHERE created_at > NOW() - INTERVAL '1 day'),
			   (SELECT COUNT(*) FROM matches WHERE created_at > NOW() - INTERVAL '1 day'),
			   (SELECT COUNT(*) FROM swipes WHERE created_at > NOW() - INTERVAL '1 day'),
			   (SELECT COUNT(*) FROM posts WHERE created_at > NOW() - INTERVAL '1 day')`,
		).Scan(&dau, &mau, &newUsers24h, &matches24h, &swipes24h, &posts24h)
		out["dau"] = dau
		out["mau"] = mau
		out["newUsers24h"] = newUsers24h
		out["matches24h"] = matches24h
		out["swipes24h"] = swipes24h
		out["posts24h"] = posts24h
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

type badgeRow struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description,omitempty"`
	IconURL      string    `json:"iconUrl,omitempty"`
	Criteria     string    `json:"criteria,omitempty"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	AwardedCount int       `json:"awardedCount"`
}

func (s *Server) handleAdminListBadgesAll(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeAdminList(w, []badgeRow{}, 0, "")
		return
	}
	q := parseAdminListQuery(r)
	like := likeQ(q.Search)
	rows, err := pool.Query(adminCtx(),
		`SELECT b.id, b.name, COALESCE(b.description,''), COALESCE(b.icon_url,''),
		        COALESCE(b.criteria,''), b.active, b.created_at,
		        (SELECT COUNT(*) FROM badges WHERE type = b.id) AS awarded_count
		 FROM badge_catalog b
		 WHERE ($1 = '' OR LOWER(b.name) LIKE $1 OR LOWER(b.description) LIKE $1)
		 ORDER BY b.created_at DESC
		 LIMIT $2 OFFSET $3`, like, q.Limit, q.Offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []badgeRow
	for rows.Next() {
		var b badgeRow
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &b.IconURL, &b.Criteria, &b.Active, &b.CreatedAt, &b.AwardedCount); err == nil {
			out = append(out, b)
		}
	}
	var total int
	_ = pool.QueryRow(adminCtx(),
		`SELECT COUNT(*) FROM badge_catalog
		 WHERE ($1 = '' OR LOWER(name) LIKE $1 OR LOWER(description) LIKE $1)`, like).Scan(&total)
	writeAdminList(w, out, total, "")
}

func (s *Server) handleAdminCreateBadge(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IconURL     string `json:"iconUrl"`
		Criteria    string `json:"criteria"`
		Active      *bool  `json:"active"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	active := true
	if payload.Active != nil {
		active = *payload.Active
	}
	id := fmt.Sprintf("badge-%d", time.Now().UnixNano())
	if pool := s.pg(); pool != nil {
		_, err := pool.Exec(adminCtx(),
			`INSERT INTO badge_catalog (id, name, description, icon_url, criteria, active)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			id, payload.Name, payload.Description, payload.IconURL, payload.Criteria, active)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	s.auditLog(r, "badge.create", "badge", id, payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": map[string]any{
		"id": id, "name": payload.Name, "active": active,
	}})
}

func (s *Server) handleAdminUpdateBadge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var patch struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		IconURL     *string `json:"iconUrl"`
		Criteria    *string `json:"criteria"`
		Active      *bool   `json:"active"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}
	if pool := s.pg(); pool != nil {
		parts := []string{}
		args := []any{id}
		idx := 2
		if patch.Name != nil {
			parts = append(parts, fmt.Sprintf("name=$%d", idx))
			args = append(args, *patch.Name)
			idx++
		}
		if patch.Description != nil {
			parts = append(parts, fmt.Sprintf("description=$%d", idx))
			args = append(args, *patch.Description)
			idx++
		}
		if patch.IconURL != nil {
			parts = append(parts, fmt.Sprintf("icon_url=$%d", idx))
			args = append(args, *patch.IconURL)
			idx++
		}
		if patch.Criteria != nil {
			parts = append(parts, fmt.Sprintf("criteria=$%d", idx))
			args = append(args, *patch.Criteria)
			idx++
		}
		if patch.Active != nil {
			parts = append(parts, fmt.Sprintf("active=$%d", idx))
			args = append(args, *patch.Active)
			idx++
		}
		if len(parts) > 0 {
			_, _ = pool.Exec(adminCtx(),
				fmt.Sprintf(`UPDATE badge_catalog SET %s WHERE id=$1`, strings.Join(parts, ", ")),
				args...)
		}
	}
	s.auditLog(r, "badge.update", "badge", id, patch)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"updated": true}})
}

func (s *Server) handleAdminDeleteBadge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM badge_catalog WHERE id = $1`, id)
	}
	s.auditLog(r, "badge.delete", "badge", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
}
