package server

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
)

// scheduledPushRow is the wire shape for one recurring push schedule. The
// admin surface CRUDs these; the per-minute loop fires them when the time
// arrives. CityFilter is a free-text contains match against
// user_profiles.city_label — we don't have a country column on profiles,
// so the admin enters whatever locale string they curate.
type scheduledPushRow struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Body          string    `json:"body"`
	DeepLink      string    `json:"deepLink,omitempty"`
	Audience      string    `json:"audience"`
	PetTypes      []string  `json:"petTypes"`
	UserIDs       []string  `json:"userIds"`
	CountryFilter string    `json:"countryFilter,omitempty"`
	CityFilter    string    `json:"cityFilter,omitempty"`
	DaysOfWeek    []int     `json:"daysOfWeek"`
	TimeOfDay     string    `json:"timeOfDay"`
	Timezone      string    `json:"timezone"`
	Enabled       bool      `json:"enabled"`
	LastRunAt     *string   `json:"lastRunAt,omitempty"`
	NextRunAt     string    `json:"nextRunAt"`
	CreatedAt     time.Time `json:"createdAt"`
	CreatedBy     string    `json:"createdBy,omitempty"`
}

// ── HTTP handlers ────────────────────────────────────────────────────────

func (s *Server) handleAdminListScheduledPushes(w http.ResponseWriter, r *http.Request) {
	pool := s.pg()
	if pool == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": []scheduledPushRow{}})
		return
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT id, title, body, deep_link, audience, pet_types, user_ids,
		        country_filter, city_filter,
		        days_of_week, time_of_day, timezone, enabled,
		        last_run_at, next_run_at, created_at, created_by
		 FROM scheduled_pushes
		 ORDER BY enabled DESC, next_run_at ASC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	out := make([]scheduledPushRow, 0)
	for rows.Next() {
		var p scheduledPushRow
		var lastRun, nextRun *time.Time
		if scanErr := rows.Scan(
			&p.ID, &p.Title, &p.Body, &p.DeepLink, &p.Audience, &p.PetTypes,
			&p.UserIDs, &p.CountryFilter, &p.CityFilter,
			&p.DaysOfWeek, &p.TimeOfDay, &p.Timezone,
			&p.Enabled, &lastRun, &nextRun, &p.CreatedAt, &p.CreatedBy,
		); scanErr != nil {
			continue
		}
		if lastRun != nil {
			t := lastRun.UTC().Format(time.RFC3339)
			p.LastRunAt = &t
		}
		if nextRun != nil {
			p.NextRunAt = nextRun.UTC().Format(time.RFC3339)
		}
		if p.PetTypes == nil {
			p.PetTypes = []string{}
		}
		if p.UserIDs == nil {
			p.UserIDs = []string{}
		}
		if p.DaysOfWeek == nil {
			p.DaysOfWeek = []int{}
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (s *Server) handleAdminCreateScheduledPush(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title         string   `json:"title"`
		Body          string   `json:"body"`
		DeepLink      string   `json:"deepLink"`
		Audience      string   `json:"audience"`
		PetTypes      []string `json:"petTypes"`
		UserIDs       []string `json:"userIds"`
		CountryFilter string   `json:"countryFilter"`
		CityFilter    string   `json:"cityFilter"`
		DaysOfWeek    []int    `json:"daysOfWeek"`
		TimeOfDay     string   `json:"timeOfDay"`
		Timezone      string   `json:"timezone"`
		Enabled       *bool    `json:"enabled"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if strings.TrimSpace(payload.Title) == "" || strings.TrimSpace(payload.Body) == "" {
		writeError(w, http.StatusBadRequest, "title and body are required")
		return
	}
	if len(payload.DaysOfWeek) == 0 {
		writeError(w, http.StatusBadRequest, "pick at least one day of week")
		return
	}
	if !validHHMM(payload.TimeOfDay) {
		writeError(w, http.StatusBadRequest, "timeOfDay must be HH:MM")
		return
	}
	tz := payload.Timezone
	if tz == "" {
		tz = "UTC"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid timezone")
		return
	}

	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}
	if payload.Audience == "" {
		payload.Audience = "all"
	}
	if payload.PetTypes == nil {
		payload.PetTypes = []string{}
	}
	if payload.UserIDs == nil {
		payload.UserIDs = []string{}
	}
	next, err := computeNextFire(payload.DaysOfWeek, payload.TimeOfDay, loc, time.Now())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	id := fmt.Sprintf("sched-%d", time.Now().UnixNano())
	createdBy := adminIDFromContext(r.Context())
	if createdBy == "" {
		createdBy = currentUserID(r)
	}
	_, err = pool.Exec(adminCtx(),
		`INSERT INTO scheduled_pushes
			(id, title, body, deep_link, audience, pet_types, user_ids,
			 country_filter, city_filter,
			 days_of_week, time_of_day, timezone, enabled, next_run_at, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		id, payload.Title, payload.Body, payload.DeepLink, payload.Audience,
		payload.PetTypes, payload.UserIDs,
		payload.CountryFilter, payload.CityFilter,
		payload.DaysOfWeek, payload.TimeOfDay, tz, enabled, next, createdBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.auditLog(r, "scheduled_push.create", "scheduled_push", id, payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": map[string]any{"id": id}})
}

func (s *Server) handleAdminUpdateScheduledPush(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var payload struct {
		Title         *string   `json:"title"`
		Body          *string   `json:"body"`
		DeepLink      *string   `json:"deepLink"`
		Audience      *string   `json:"audience"`
		PetTypes      *[]string `json:"petTypes"`
		UserIDs       *[]string `json:"userIds"`
		CountryFilter *string   `json:"countryFilter"`
		CityFilter    *string   `json:"cityFilter"`
		DaysOfWeek    *[]int    `json:"daysOfWeek"`
		TimeOfDay     *string   `json:"timeOfDay"`
		Timezone      *string   `json:"timezone"`
		Enabled       *bool     `json:"enabled"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Build a dynamic UPDATE so we can patch any subset of fields without
	// blowing away the rest. Any change to days_of_week / time_of_day /
	// timezone also requires recomputing next_run_at.
	sets := []string{}
	args := []any{}
	idx := 1
	if payload.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *payload.Title)
		idx++
	}
	if payload.Body != nil {
		sets = append(sets, fmt.Sprintf("body = $%d", idx))
		args = append(args, *payload.Body)
		idx++
	}
	if payload.DeepLink != nil {
		sets = append(sets, fmt.Sprintf("deep_link = $%d", idx))
		args = append(args, *payload.DeepLink)
		idx++
	}
	if payload.Audience != nil {
		sets = append(sets, fmt.Sprintf("audience = $%d", idx))
		args = append(args, *payload.Audience)
		idx++
	}
	if payload.PetTypes != nil {
		sets = append(sets, fmt.Sprintf("pet_types = $%d", idx))
		args = append(args, *payload.PetTypes)
		idx++
	}
	if payload.UserIDs != nil {
		sets = append(sets, fmt.Sprintf("user_ids = $%d", idx))
		args = append(args, *payload.UserIDs)
		idx++
	}
	if payload.CountryFilter != nil {
		sets = append(sets, fmt.Sprintf("country_filter = $%d", idx))
		args = append(args, *payload.CountryFilter)
		idx++
	}
	if payload.CityFilter != nil {
		sets = append(sets, fmt.Sprintf("city_filter = $%d", idx))
		args = append(args, *payload.CityFilter)
		idx++
	}
	if payload.Enabled != nil {
		sets = append(sets, fmt.Sprintf("enabled = $%d", idx))
		args = append(args, *payload.Enabled)
		idx++
	}
	scheduleChanged := payload.DaysOfWeek != nil || payload.TimeOfDay != nil || payload.Timezone != nil
	if scheduleChanged {
		// Recompute next_run_at from the merged schedule. Read the row first
		// so unchanged fields use the stored values.
		var dow []int
		var hhmm, tz string
		if err := pool.QueryRow(adminCtx(),
			`SELECT days_of_week, time_of_day, timezone FROM scheduled_pushes WHERE id = $1`, id,
		).Scan(&dow, &hhmm, &tz); err != nil {
			writeError(w, http.StatusNotFound, "schedule not found")
			return
		}
		if payload.DaysOfWeek != nil {
			dow = *payload.DaysOfWeek
		}
		if payload.TimeOfDay != nil {
			hhmm = *payload.TimeOfDay
		}
		if payload.Timezone != nil && *payload.Timezone != "" {
			tz = *payload.Timezone
		}
		if !validHHMM(hhmm) {
			writeError(w, http.StatusBadRequest, "timeOfDay must be HH:MM")
			return
		}
		loc, locErr := time.LoadLocation(tz)
		if locErr != nil {
			writeError(w, http.StatusBadRequest, "invalid timezone")
			return
		}
		next, fireErr := computeNextFire(dow, hhmm, loc, time.Now())
		if fireErr != nil {
			writeError(w, http.StatusBadRequest, fireErr.Error())
			return
		}
		sets = append(sets, fmt.Sprintf("days_of_week = $%d", idx))
		args = append(args, dow)
		idx++
		sets = append(sets, fmt.Sprintf("time_of_day = $%d", idx))
		args = append(args, hhmm)
		idx++
		sets = append(sets, fmt.Sprintf("timezone = $%d", idx))
		args = append(args, tz)
		idx++
		sets = append(sets, fmt.Sprintf("next_run_at = $%d", idx))
		args = append(args, next)
		idx++
	}

	if len(sets) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": false}})
		return
	}
	args = append(args, id)
	_, err := pool.Exec(adminCtx(),
		fmt.Sprintf("UPDATE scheduled_pushes SET %s WHERE id = $%d", strings.Join(sets, ", "), idx),
		args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.auditLog(r, "scheduled_push.update", "scheduled_push", id, payload)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminDeleteScheduledPush(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(), `DELETE FROM scheduled_pushes WHERE id = $1`, id)
	}
	s.auditLog(r, "scheduled_push.delete", "scheduled_push", id, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Scheduler loop ───────────────────────────────────────────────────────

// runScheduledPushLoop ticks every minute, fires every enabled schedule whose
// next_run_at has passed, and rolls next_run_at forward to the next matching
// (day, time). Restart-safe: a service restart inside a fire window catches
// up on the same tick; a row never fires twice for the same occurrence
// because we update next_run_at before the push goes out.
func (s *Server) runScheduledPushLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		pool := s.pg()
		if pool == nil {
			continue
		}
		s.fireDueScheduledPushes(pool)
	}
}

func (s *Server) fireDueScheduledPushes(pool *pgxpool.Pool) {
	rows, err := pool.Query(adminCtx(),
		`SELECT id, title, body, deep_link, audience, pet_types, user_ids,
		        country_filter, city_filter,
		        days_of_week, time_of_day, timezone
		 FROM scheduled_pushes
		 WHERE enabled = TRUE AND next_run_at <= NOW()
		 LIMIT 50`)
	if err != nil {
		log.Printf("[SCHEDULER] poll failed: %v", err)
		return
	}
	type fire struct {
		ID            string
		Title         string
		Body          string
		DeepLink      string
		Audience      string
		PetTypes      []string
		UserIDs       []string
		CountryFilter string
		CityFilter    string
		DaysOfWeek    []int
		TimeOfDay     string
		Timezone      string
	}
	var due []fire
	for rows.Next() {
		var f fire
		if err := rows.Scan(&f.ID, &f.Title, &f.Body, &f.DeepLink, &f.Audience,
			&f.PetTypes, &f.UserIDs,
			&f.CountryFilter, &f.CityFilter,
			&f.DaysOfWeek, &f.TimeOfDay, &f.Timezone); err == nil {
			due = append(due, f)
		}
	}
	rows.Close()

	for _, f := range due {
		// Roll next_run_at forward FIRST so a slow push fan-out can't double-fire.
		loc, err := time.LoadLocation(f.Timezone)
		if err != nil {
			loc = time.UTC
		}
		next, err := computeNextFire(f.DaysOfWeek, f.TimeOfDay, loc, time.Now())
		if err != nil {
			log.Printf("[SCHEDULER] %s: cannot compute next fire: %v — disabling", f.ID, err)
			_, _ = pool.Exec(adminCtx(),
				`UPDATE scheduled_pushes SET enabled = FALSE WHERE id = $1`, f.ID)
			continue
		}
		_, _ = pool.Exec(adminCtx(),
			`UPDATE scheduled_pushes SET last_run_at = NOW(), next_run_at = $2 WHERE id = $1`,
			f.ID, next)

		// Resolve audience and fire push. Reuses the broadcast resolver,
		// then layers a city contains-filter on top when present.
		userIDs, err := resolveBroadcastAudience(pool, f.Audience, f.PetTypes, f.UserIDs)
		if err != nil {
			log.Printf("[SCHEDULER] %s: audience resolve failed: %v", f.ID, err)
			continue
		}
		if f.CountryFilter != "" && len(userIDs) > 0 {
			userIDs = filterUsersByCountry(pool, userIDs, f.CountryFilter)
		}
		if f.CityFilter != "" && len(userIDs) > 0 {
			userIDs = filterUsersByCity(pool, userIDs, f.CityFilter)
		}
		var tokens []string
		if len(userIDs) > 0 {
			tRows, terr := pool.Query(adminCtx(),
				`SELECT token FROM push_tokens WHERE user_id = ANY($1) AND token <> ''`, userIDs)
			if terr == nil {
				for tRows.Next() {
					var tok string
					if scanErr := tRows.Scan(&tok); scanErr == nil && tok != "" {
						tokens = append(tokens, tok)
					}
				}
				tRows.Close()
			}
		}
		data := map[string]string{"type": "broadcast", "scheduleId": f.ID}
		if f.DeepLink != "" {
			data["deepLink"] = f.DeepLink
		}
		if len(tokens) > 0 {
			if perr := service.SendExpoPush(tokens, f.Title, f.Body, data); perr != nil {
				log.Printf("[SCHEDULER] %s: push failed: %v", f.ID, perr)
			}
		}

		// History row so the admin Notifications history page (and downstream
		// auditing) sees this fire alongside one-shot broadcasts.
		target := f.Audience
		if f.Audience == "pet_type" && len(f.PetTypes) > 0 {
			target = "pet_type:" + strings.Join(f.PetTypes, ",")
		} else if f.Audience == "users" {
			target = fmt.Sprintf("users:%d", len(f.UserIDs))
		}
		if f.CountryFilter != "" {
			target += "+country:" + f.CountryFilter
		}
		if f.CityFilter != "" {
			target += "+city:" + f.CityFilter
		}
		s.store.SaveNotification(domain.Notification{
			ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
			Title:  f.Title,
			Body:   f.Body,
			Target: target,
			SentAt: time.Now().UTC().Format(time.RFC3339),
			SentBy: "scheduler:" + f.ID,
		})
		log.Printf("[SCHEDULER] fired %s: %d recipients, %d tokens", f.ID, len(userIDs), len(tokens))
	}
}

// ── helpers ──────────────────────────────────────────────────────────────

func validHHMM(s string) bool {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return false
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 23 {
		return false
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return false
	}
	return true
}

// computeNextFire walks at most 8 days forward from `after` and returns the
// first matching (day, hh:mm) — guarantees a fire always lands within a week
// of any "after" time, except when daysOfWeek is empty (validation upstream).
func computeNextFire(days []int, hhmm string, loc *time.Location, after time.Time) (time.Time, error) {
	if len(days) == 0 {
		return time.Time{}, fmt.Errorf("daysOfWeek is empty")
	}
	parts := strings.Split(hhmm, ":")
	hour, _ := strconv.Atoi(parts[0])
	minute, _ := strconv.Atoi(parts[1])
	afterLocal := after.In(loc)
	for offset := 0; offset < 8; offset++ {
		base := time.Date(afterLocal.Year(), afterLocal.Month(), afterLocal.Day(), hour, minute, 0, 0, loc).
			AddDate(0, 0, offset)
		if !containsInt(days, int(base.Weekday())) {
			continue
		}
		if base.After(after) {
			return base.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("no fire day in the next week")
}

func containsInt(haystack []int, needle int) bool {
	for _, v := range haystack {
		if v == needle {
			return true
		}
	}
	return false
}

// filterUsersByCountry narrows a user-id slice to those whose
// user_profiles.city_label matches one of the curated cities in the
// country code's list (see handlers_admin_locations.go). Country itself
// isn't a column on user_profiles, so the curated city list is the
// closest proxy — and it's what the picker on the admin UI uses too,
// keeping picker / resolver in lockstep. Returns the input slice
// unmodified when the country is unknown so we never accidentally drop
// the audience to zero on a typo'd code.
func filterUsersByCountry(pool *pgxpool.Pool, userIDs []string, country string) []string {
	cities := citiesForCountry(country)
	if len(cities) == 0 || len(userIDs) == 0 {
		return userIDs
	}
	// Build "city_label ILIKE ANY (city1, city2, ...)" via a substring
	// match on each curated city — handles "Beyoglu, Istanbul" matching
	// "Istanbul" without requiring an exact city_label string.
	patterns := make([]string, 0, len(cities))
	for _, c := range cities {
		patterns = append(patterns, "%"+c+"%")
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT user_id FROM user_profiles
		 WHERE user_id = ANY($1) AND COALESCE(city_label,'') ILIKE ANY($2::text[])`,
		userIDs, patterns)
	if err != nil {
		return userIDs
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if scanErr := rows.Scan(&id); scanErr == nil && id != "" {
			out = append(out, id)
		}
	}
	return out
}

// filterUsersByCity narrows a user-id slice to those whose user_profiles.city_label
// contains the given fragment (case-insensitive). Used only by the scheduler;
// the broadcast handler doesn't surface city as a top-level filter today.
func filterUsersByCity(pool *pgxpool.Pool, userIDs []string, city string) []string {
	if city == "" || len(userIDs) == 0 {
		return userIDs
	}
	rows, err := pool.Query(adminCtx(),
		`SELECT user_id FROM user_profiles
		 WHERE user_id = ANY($1) AND LOWER(COALESCE(city_label,'')) LIKE LOWER('%' || $2 || '%')`,
		userIDs, city)
	if err != nil {
		return userIDs
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if scanErr := rows.Scan(&id); scanErr == nil && id != "" {
			out = append(out, id)
		}
	}
	return out
}
