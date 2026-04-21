package server

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

// HTTP surface for the shelter team feature. All authenticated endpoints
// live under /v1/shelter/members/*. Public invite-accept endpoints sit
// under /v1/public/shelter-invites/* so an invitee without a session can
// resolve the token and create their membership.

var allowedShelterMemberRoles = map[string]bool{
	"admin":  true,
	"editor": true,
	"viewer": true,
}

// ── Authenticated: members + invites + audit log ────────────────

type shelterMemberSummary struct {
	Member domain.ShelterMember `json:"member"`
}

func (s *Server) handleShelterListMembers(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	members := s.store.ListShelterMembers(shelterID)
	// Include pending invites so the UI can render a single combined
	// "team" view. Tokens are already redacted by the store.
	invites := s.store.ListShelterMemberInvites(shelterID)
	pending := make([]domain.ShelterMemberInvite, 0, len(invites))
	for _, inv := range invites {
		if inv.AcceptedAt == "" && inv.RevokedAt == "" {
			pending = append(pending, inv)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"members":        members,
			"pendingInvites": pending,
		},
	})
}

func (s *Server) handleShelterCreateMemberInvite(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	var input struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" || !strings.Contains(email, "@") {
		writeError(w, http.StatusBadRequest, "valid email is required")
		return
	}
	if !allowedShelterMemberRoles[input.Role] {
		writeError(w, http.StatusBadRequest, "role must be admin, editor, or viewer")
		return
	}
	invited, err := s.store.CreateShelterMemberInvite(domain.ShelterMemberInvite{
		ShelterID:         shelterID,
		Email:             email,
		Role:              input.Role,
		InvitedByMemberID: currentShelterMemberID(r),
	})
	if err != nil {
		switch err {
		case store.ErrShelterMemberDuplicateEmail:
			writeError(w, http.StatusConflict, "a member with this email already exists")
		case store.ErrShelterMemberInviteDuplicateEmail:
			writeError(w, http.StatusConflict, "an invite for this email is already pending")
		case store.ErrShelterTeamFull:
			writeError(w, http.StatusConflict, "team is full (20 members max)")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberInvite, "invite", invited.ID, map[string]any{
		"email": email,
		"role":  input.Role,
	})
	writeJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{
			"invite":    invited,
			"inviteUrl": buildInviteURL(s.cfg.ShelterWebBaseURL, invited.Token),
		},
	})
}

func (s *Server) handleShelterListMemberInvites(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterMemberInvites(shelterID),
	})
}

func (s *Server) handleShelterResendMemberInvite(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	inviteID := chi.URLParam(r, "inviteID")
	// Ownership check: the invite must belong to the acting shelter.
	existing, err := s.store.GetShelterMemberInviteByID(inviteID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	invited, err := s.store.ResendShelterMemberInvite(inviteID)
	if err != nil {
		switch err {
		case store.ErrShelterMemberInviteAlreadyUsed:
			writeError(w, http.StatusGone, "invite has already been accepted")
		case store.ErrShelterMemberInviteRevoked:
			writeError(w, http.StatusGone, "invite has been revoked")
		case store.ErrShelterMemberInviteNotFound:
			writeError(w, http.StatusNotFound, "invite not found")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberInviteResend, "invite", invited.ID, map[string]any{
		"email": invited.Email,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"invite":    invited,
			"inviteUrl": buildInviteURL(s.cfg.ShelterWebBaseURL, invited.Token),
		},
	})
}

func (s *Server) handleShelterRevokeMemberInvite(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	inviteID := chi.URLParam(r, "inviteID")
	existing, err := s.store.GetShelterMemberInviteByID(inviteID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	if err := s.store.RevokeShelterMemberInvite(inviteID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberInviteRevoke, "invite", inviteID, map[string]any{
		"email": existing.Email,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"revoked": true}})
}

func (s *Server) handleShelterUpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	memberID := chi.URLParam(r, "memberID")
	existing, err := s.store.GetShelterMember(memberID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if !allowedShelterMemberRoles[body.Role] {
		writeError(w, http.StatusBadRequest, "role must be admin, editor, or viewer")
		return
	}
	updated, err := s.store.UpdateShelterMemberRole(memberID, body.Role)
	if err != nil {
		switch err {
		case store.ErrShelterLastAdmin:
			writeError(w, http.StatusBadRequest, "cannot demote the last active admin")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberRoleChange, "member", memberID, map[string]any{
		"email":     existing.Email,
		"beforeRole": existing.Role,
		"afterRole":  body.Role,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": updated})
}

func (s *Server) handleShelterRevokeMember(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	memberID := chi.URLParam(r, "memberID")
	// Self-revoke protection: an admin must use another admin to remove
	// themselves — prevents accidental lock-out.
	if memberID == currentShelterMemberID(r) {
		writeError(w, http.StatusBadRequest, "cannot revoke yourself — ask another admin")
		return
	}
	existing, err := s.store.GetShelterMember(memberID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if err := s.store.RevokeShelterMember(memberID); err != nil {
		switch err {
		case store.ErrShelterLastAdmin:
			writeError(w, http.StatusBadRequest, "cannot revoke the last active admin")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberRevoke, "member", memberID, map[string]any{
		"email": existing.Email,
		"role":  existing.Role,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"revoked": true}})
}

// Viewers can't see the audit log (per spec). Editor+ only.
func (s *Server) handleShelterListAuditLog(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterAuditLog(shelterID, limit, offset),
	})
}

// ── Public: invite accept flow ───────────────────────────────────

// handlePublicShelterInviteInfo exposes a redacted view of an invite so
// the accept page can render the org name + role before the invitee
// commits. Expired/revoked/accepted invites still return 200 with an
// explicit status flag so the UI can show the right error copy.
func (s *Server) handlePublicShelterInviteInfo(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	invite, err := s.store.GetShelterMemberInviteByToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	shelter, err := s.store.GetShelter(invite.ShelterID)
	if err != nil {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	status := "active"
	if invite.RevokedAt != "" {
		status = "revoked"
	} else if invite.AcceptedAt != "" {
		status = "accepted"
	} else if isInviteExpired(invite.ExpiresAt) {
		status = "expired"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"email":       invite.Email,
			"role":        invite.Role,
			"shelterId":   shelter.ID,
			"shelterName": shelter.Name,
			"expiresAt":   invite.ExpiresAt,
			"status":      status,
		},
	})
}

type shelterInviteAcceptInput struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) handlePublicShelterInviteAccept(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	var input shelterInviteAcceptInput
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(input.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	member, invite, err := s.store.AcceptShelterMemberInvite(token, hash, name)
	if err != nil {
		switch err {
		case store.ErrShelterMemberInviteNotFound:
			writeError(w, http.StatusNotFound, "invite not found")
		case store.ErrShelterMemberInviteAlreadyUsed:
			writeError(w, http.StatusGone, "invite has already been accepted")
		case store.ErrShelterMemberInviteRevoked:
			writeError(w, http.StatusGone, "invite has been revoked")
		case store.ErrShelterMemberInviteExpired:
			writeError(w, http.StatusGone, "invite has expired — ask an admin to resend")
		case store.ErrShelterMemberDuplicateEmail:
			writeError(w, http.StatusConflict, "a member with this email already exists")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	// Audit the acceptance as the new member themselves (they're the
	// actor now that they exist).
	s.recordShelterAuditWithActor(member.ShelterID, member.ID, member.Name, member.Email,
		domain.AuditMemberInviteAccept, "invite", invite.ID, map[string]any{
			"role": member.Role,
		})
	// Issue a session so the invitee lands signed in.
	shelter, err := s.store.GetShelter(member.ShelterID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "shelter not found")
		return
	}
	_ = s.store.MarkShelterMemberLoggedIn(member.ID)
	session, err := s.issueShelterSession(shelter, &member)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": session})
}

// ── Admin panel: per-shelter members + audit view ─────────────────

func (s *Server) handleAdminShelterMembers(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	if _, err := s.store.GetShelter(shelterID); err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"members":        s.store.ListShelterMembers(shelterID),
			"pendingInvites": s.store.ListShelterMemberInvites(shelterID),
		},
	})
}

func (s *Server) handleAdminShelterAuditLog(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	if _, err := s.store.GetShelter(shelterID); err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterAuditLog(shelterID, limit, offset),
	})
}

// handleAdminShelterTransferAdmin is the locked-shelter recovery path
// per spec: "If somehow reached, shelter account locked until platform
// admin manually assigns a new admin." Takes a member id and promotes
// them to admin so the shelter has an authority again.
func (s *Server) handleAdminShelterTransferAdmin(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	var body struct {
		MemberID string `json:"memberId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	existing, err := s.store.GetShelterMember(body.MemberID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if existing.Status != "active" {
		writeError(w, http.StatusBadRequest, "member is not active")
		return
	}
	if existing.Role == "admin" {
		writeError(w, http.StatusOK, "member is already an admin")
		return
	}
	if _, err := s.store.UpdateShelterMemberRole(body.MemberID, "admin"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Record in the shelter's audit log too so the timeline shows the
	// platform admin's intervention.
	s.recordShelterAuditWithActor(shelterID, "", "Platform admin", "",
		domain.AuditMemberRoleChange, "member", body.MemberID, map[string]any{
			"email":      existing.Email,
			"beforeRole": existing.Role,
			"afterRole":  "admin",
			"transferredByPlatformAdmin": true,
		})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"promoted": true}})
}

// ── Helpers ─────────────────────────────────────────────────────

// buildInviteURL builds the full URL an invitee clicks. The frontend
// host comes from config (SHELTER_WEB_BASE_URL in .env). If missing we
// fall back to a path-only URL so the admin can at least copy the
// token — but ideally prod sets the base URL.
func buildInviteURL(baseURL, token string) string {
	if token == "" {
		return ""
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return "/invite/" + token
	}
	return base + "/invite/" + token
}

func isInviteExpired(expiresAt string) bool {
	if expiresAt == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return false
	}
	return time.Now().After(t)
}
