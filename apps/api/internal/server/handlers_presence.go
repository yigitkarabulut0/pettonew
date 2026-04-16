package server

import (
	"encoding/json"
	"net/http"
	"time"
)

// ---------------------------------------------------------------------------
// Presence — real-time online status + last known coordinates.
//
// Mobile client contract:
//   - On app foreground: POST /v1/presence/heartbeat every ~20 seconds with
//     { lat, lng, accuracy, platform }. This upserts the user_presence row
//     with is_online=true and last_seen_at=now.
//   - On app background / terminate: POST /v1/presence/offline to flip
//     is_online=false. The admin dashboard uses (is_online AND last_seen_at
//     within 60s) as the "live now" definition, so even if the offline ping
//     is lost the server self-heals after a minute.
//
// Admin reads go through handlers_admin_extensions.go:
//   - GET /admin/active-users — everyone live now
//   - GET /admin/users/:id/location — presence.lat/lng for map pin
// ---------------------------------------------------------------------------

type presenceHeartbeatPayload struct {
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
	Accuracy *float64 `json:"accuracy"`
	Platform string   `json:"platform"`
	State    string   `json:"state"` // "foreground" | "background"
}

func (s *Server) handlePresenceHeartbeat(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var payload presenceHeartbeatPayload
	_ = json.NewDecoder(r.Body).Decode(&payload)

	if payload.State == "" {
		payload.State = "foreground"
	}

	pool := s.pg()
	if pool == nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"ok": true}})
		return
	}

	isOnline := payload.State == "foreground"
	_, err := pool.Exec(adminCtx(),
		`INSERT INTO user_presence
		   (user_id, is_online, app_state, latitude, longitude, accuracy, platform, last_seen_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		 ON CONFLICT (user_id) DO UPDATE SET
		   is_online    = EXCLUDED.is_online,
		   app_state    = EXCLUDED.app_state,
		   latitude     = COALESCE(EXCLUDED.latitude, user_presence.latitude),
		   longitude    = COALESCE(EXCLUDED.longitude, user_presence.longitude),
		   accuracy     = COALESCE(EXCLUDED.accuracy, user_presence.accuracy),
		   platform     = COALESCE(NULLIF(EXCLUDED.platform, ''), user_presence.platform),
		   last_seen_at = NOW(),
		   updated_at   = NOW()`,
		userID, isOnline, payload.State, payload.Lat, payload.Lng, payload.Accuracy, payload.Platform)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"ok":         true,
		"serverTime": time.Now().UTC().Format(time.RFC3339),
	}})
}

func (s *Server) handlePresenceOffline(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if pool := s.pg(); pool != nil {
		_, _ = pool.Exec(adminCtx(),
			`UPDATE user_presence
			 SET is_online = FALSE, app_state = 'background', updated_at = NOW()
			 WHERE user_id = $1`, userID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"ok": true}})
}
