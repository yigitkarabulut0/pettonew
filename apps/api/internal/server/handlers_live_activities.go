package server

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// /v1/live-activities/start-tokens — device sends its push-to-start token
// (one per app, iOS 17.2+). The server uses this to start a Live Activity
// remotely when an event the user opted into fires.
type liveActivityStartTokenInput struct {
	Kind     string `json:"kind"`
	DeviceID string `json:"deviceId"`
	Token    string `json:"token"`
}

func (s *Server) handleSaveLiveActivityStartToken(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var in liveActivityStartTokenInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Kind == "" || in.DeviceID == "" || in.Token == "" {
		writeError(w, http.StatusBadRequest, "kind, deviceId, token required")
		return
	}

	s.store.UpsertLiveActivityStartToken(domain.LiveActivityStartToken{
		UserID:   userID,
		DeviceID: in.DeviceID,
		Kind:     in.Kind,
		Token:    strings.ToLower(in.Token),
	})

	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"ok": true}})
}

// /v1/live-activities/tokens — per-activity push token (rotates). Body
// includes the activity id (from ActivityKit) and the related entity id
// (e.g. playdate id).
type liveActivityTokenInput struct {
	ActivityID string `json:"activityId"`
	Kind       string `json:"kind"`
	RelatedID  string `json:"relatedId"`
	Token      string `json:"token"`
}

func (s *Server) handleSaveLiveActivityToken(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var in liveActivityTokenInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.ActivityID == "" || in.Kind == "" || in.Token == "" {
		writeError(w, http.StatusBadRequest, "activityId, kind, token required")
		return
	}
	s.store.UpsertLiveActivity(domain.LiveActivity{
		ID:        in.ActivityID,
		UserID:    userID,
		Kind:      in.Kind,
		RelatedID: in.RelatedID,
		PushToken: strings.ToLower(in.Token),
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"ok": true}})
}

// /v1/live-activities/{activityId} DELETE — device tells the server the
// activity ended (so we stop trying to push to a dead token).
func (s *Server) handleDeleteLiveActivity(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "activityID")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing id")
		return
	}
	s.store.MarkLiveActivityEnded(id, userID)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"ok": true}})
}
