package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

// handleAdminPlaydateDetail returns a fully-enriched playdate view for the
// admin moderation surface. Admins can read any playdate regardless of
// visibility, expiry, or ban state.
//
// GetPlaydate internally calls GetPlaydateForUser("") which strips the
// conversation_id for non-members (chat gating). Admins must see the chat,
// so we re-hydrate the conversation_id from the raw column when it comes
// back blank — mirroring what the host would see.
func (s *Server) handleAdminPlaydateDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "playdateID")
	if id == "" {
		writeError(w, http.StatusBadRequest, "playdateID is required")
		return
	}
	pd, err := s.store.GetPlaydate(id)
	if err != nil || pd == nil {
		writeError(w, http.StatusNotFound, "playdate not found")
		return
	}
	// Same logic strips share_token + join_code for non-hosts. Restore both
	// from the raw row in a single query so the admin sees the same
	// invite/code material the host would.
	if pool := s.pg(); pool != nil {
		var convID, shareToken, joinCode string
		_ = pool.QueryRow(adminCtx(),
			`SELECT COALESCE(conversation_id,''), COALESCE(share_token,''), COALESCE(join_code,'')
			 FROM playdates WHERE id = $1`,
			id).Scan(&convID, &shareToken, &joinCode)
		if pd.ConversationID == "" {
			pd.ConversationID = convID
		}
		if pd.ShareToken == "" {
			pd.ShareToken = shareToken
		}
		if pd.JoinCode == "" {
			pd.JoinCode = joinCode
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pd})
}

// handleAdminConversationWsTicket mints a short-lived HMAC ticket that lets
// the admin browser open a read-only WebSocket against a specific
// conversation. The ticket carries its own expiry, conversation binding, and
// admin identity so the WS upgrade doesn't need a Bearer header (which the
// browser WebSocket API can't set).
func (s *Server) handleAdminConversationWsTicket(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	if convID == "" {
		writeError(w, http.StatusBadRequest, "conversationID is required")
		return
	}
	adminID := currentUserID(r)
	if adminID == "" {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	exp := time.Now().Add(60 * time.Second).Unix()
	ticket := signAdminWsTicket(s.cfg.AdminJWTSecret, convID, adminID, exp)
	s.auditLog(r, "playdate.chat.observe", "conversation", convID, map[string]any{"adminId": adminID})
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"ticket":    ticket,
			"expiresAt": exp,
		},
	})
}

// handleAdminWsStream is registered OUTSIDE adminAuth (the browser cannot
// attach an Authorization header to a WebSocket upgrade). Authentication
// is performed by validating the HMAC ticket query param.
//
// The stream is strictly read-only — any inbound frame is dropped. This
// rules out admin impersonation (e.g. broadcasting "typing" as the admin
// or as another user), and keeps the admin viewer purely observational.
func (s *Server) handleAdminWsStream(w http.ResponseWriter, r *http.Request) {
	ticket := r.URL.Query().Get("ticket")
	if ticket == "" {
		writeError(w, http.StatusUnauthorized, "ticket is required")
		return
	}
	convID, _, ok := verifyAdminWsTicket(s.cfg.AdminJWTSecret, ticket)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid or expired ticket")
		return
	}
	queryConv := r.URL.Query().Get("conversationId")
	if queryConv != "" && queryConv != convID {
		writeError(w, http.StatusForbidden, "ticket conversation mismatch")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	channel := s.hub.Subscribe(convID)
	defer s.hub.Unsubscribe(convID, channel)

	ctx := r.Context()

	// Drain inbound frames so the read pump survives ping/pong, but never
	// publish anything from the admin side.
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case payload, ok := <-channel:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// signAdminWsTicket produces a compact `convID.adminID.exp.sig` string. The
// signature covers the first three segments and uses HMAC-SHA256 with the
// admin JWT secret — same trust root as the admin Bearer token, so issuing
// the ticket can never grant access the admin doesn't already have.
func signAdminWsTicket(secret, convID, adminID string, exp int64) string {
	body := fmt.Sprintf("%s.%s.%d", convID, adminID, exp)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig
}

// verifyAdminWsTicket returns (conversationID, adminID, ok). Any tampering,
// missing field, or expiry past the window collapses to ok=false.
func verifyAdminWsTicket(secret, ticket string) (string, string, bool) {
	parts := strings.Split(ticket, ".")
	if len(parts) != 4 {
		return "", "", false
	}
	convID, adminID, expStr, sig := parts[0], parts[1], parts[2], parts[3]
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", "", false
	}
	if time.Now().Unix() > exp {
		return "", "", false
	}
	body := fmt.Sprintf("%s.%s.%d", convID, adminID, exp)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		return "", "", false
	}
	return convID, adminID, true
}

