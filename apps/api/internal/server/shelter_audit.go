package server

import (
	"net/http"

	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// requireShelterRole returns a middleware that blocks the request
// unless the caller's shelter role meets the minimum. Mirrors the
// admin RBAC pattern in admin_rbac.go, adapted to viewer/editor/admin.
// Usage: `router.With(s.requireShelterRole("editor")).Post(…)` or
// inline: `if !domain.ShelterRoleAllows(role, "admin") { 403 }`.
func (s *Server) requireShelterRole(minimum string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := currentShelterMemberRole(r)
			if !domain.ShelterRoleAllows(role, minimum) {
				writeError(w, http.StatusForbidden, "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// recordShelterAudit captures a single action into shelter_audit_logs.
// Best-effort: a failure here logs internally but doesn't affect the
// user-facing response — audit write failures shouldn't break writes.
// The actor's name/email are denormalised at write time so later role
// changes, renames, or revokes don't silently rewrite history.
func (s *Server) recordShelterAudit(r *http.Request, action, targetType, targetID string, metadata map[string]any) {
	memberID := currentShelterMemberID(r)
	shelterID := currentShelterID(r)
	if shelterID == "" {
		return
	}
	entry := domain.ShelterAuditEntry{
		ShelterID:     shelterID,
		ActorMemberID: memberID,
		Action:        action,
		TargetType:    targetType,
		TargetID:      targetID,
		Metadata:      metadata,
	}
	if memberID != "" {
		if member, err := s.store.GetShelterMember(memberID); err == nil && member != nil {
			entry.ActorName = member.Name
			entry.ActorEmail = member.Email
		}
	}
	_ = s.store.RecordShelterAudit(entry)
}

// recordShelterAuditWithActor is for flows where the actor isn't the
// context's authenticated member (e.g. invite accept — the acceptor
// *becomes* a member through the same request). Caller supplies the
// actor fields explicitly.
func (s *Server) recordShelterAuditWithActor(shelterID, actorMemberID, actorName, actorEmail, action, targetType, targetID string, metadata map[string]any) {
	if shelterID == "" {
		return
	}
	entry := domain.ShelterAuditEntry{
		ShelterID:     shelterID,
		ActorMemberID: actorMemberID,
		ActorName:     actorName,
		ActorEmail:    actorEmail,
		Action:        action,
		TargetType:    targetType,
		TargetID:      targetID,
		Metadata:      metadata,
	}
	_ = s.store.RecordShelterAudit(entry)
}
