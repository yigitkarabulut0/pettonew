package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// AuditLogEntry is the shape returned by the audit-log list endpoint.
type AuditLogEntry struct {
	ID           string         `json:"id"`
	ActorAdminID string         `json:"actorAdminId"`
	ActorName    string         `json:"actorName,omitempty"`
	Action       string         `json:"action"`
	EntityType   string         `json:"entityType"`
	EntityID     string         `json:"entityId,omitempty"`
	Payload      map[string]any `json:"payload,omitempty"`
	CreatedAt    string         `json:"createdAt"`
}

// auditLog records an admin action — persists to the audit_logs table when a
// Postgres store is configured, and always emits a stdout log line for
// realtime log aggregation / debugging. Never blocks the caller.
func (s *Server) auditLog(r *http.Request, action string, entityType string, entityID string, diff any) {
	adminID := adminIDFromContext(r.Context())
	if adminID == "" {
		adminID = "system"
	}
	var payload []byte
	if diff != nil {
		if b, err := json.Marshal(diff); err == nil {
			payload = b
		}
	}
	log.Printf("[AUDIT] admin=%s action=%s entity=%s:%s payload=%s", adminID, action, entityType, entityID, string(payload))

	pool := s.pg()
	if pool == nil {
		return
	}
	id := fmt.Sprintf("audit-%d", time.Now().UnixNano())
	var payloadJSON any
	if len(payload) > 0 {
		payloadJSON = string(payload)
	}
	_, err := pool.Exec(adminCtx(),
		`INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, payload)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, adminID, action, entityType, entityID, payloadJSON)
	if err != nil {
		log.Printf("[AUDIT] insert failed: %v", err)
	}
}
