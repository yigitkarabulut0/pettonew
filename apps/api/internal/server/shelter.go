package server

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

// ── Utilities ──────────────────────────────────────────────────────────

// generateTempPassword produces a 14-character base32 token. base32 is
// used so the password is copy-paste friendly (no 0/O/l/1 confusion).
func generateTempPassword() string {
	var b [10]byte
	_, _ = rand.Read(b[:])
	pw := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:])
	return strings.ToUpper(pw[:14])
}

// currentShelterID is an alias for currentUserID — shelterAuth stores the
// shelter id under userIDKey so the two helpers share a context key.
func currentShelterID(r *http.Request) string { return currentUserID(r) }

// ── Admin-side shelter management ──────────────────────────────────────

type adminShelterCreateInput struct {
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	Phone     string  `json:"phone"`
	About     string  `json:"about"`
	Address   string  `json:"address"`
	CityLabel string  `json:"cityLabel"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	LogoURL   *string `json:"logoUrl,omitempty"`
	HeroURL   *string `json:"heroUrl,omitempty"`
	Hours     string  `json:"hours"`
	Website   string  `json:"website"`
}

func (s *Server) handleAdminCreateShelter(w http.ResponseWriter, r *http.Request) {
	var input adminShelterCreateInput
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if input.Email == "" || input.Name == "" {
		writeError(w, http.StatusBadRequest, "name and email are required")
		return
	}
	if _, _, err := s.store.GetShelterByEmail(input.Email); err == nil {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}

	tempPassword := generateTempPassword()
	hash, err := auth.HashPassword(tempPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}

	shelter := domain.Shelter{
		Email:     input.Email,
		Name:      input.Name,
		Phone:     input.Phone,
		About:     input.About,
		Address:   input.Address,
		CityLabel: input.CityLabel,
		Latitude:  input.Latitude,
		Longitude: input.Longitude,
		LogoURL:   input.LogoURL,
		HeroURL:   input.HeroURL,
		Hours:     input.Hours,
		Website:   input.Website,
		Status:    "active",
	}
	created, err := s.store.CreateShelter(shelter, hash)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{
			"shelter":       created,
			"tempPassword":  tempPassword,
			"passwordNotice": "Save this password now — it will not be shown again. Share it with the shelter; they will be forced to change it on first login.",
		},
	})
}

func (s *Server) handleAdminListShelters(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListShelters()})
}

func (s *Server) handleAdminGetShelter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "shelterID")
	sh, err := s.store.GetShelter(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	stats := s.store.GetShelterStats(id)
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"shelter": sh,
			"stats":   stats,
		},
	})
}

func (s *Server) handleAdminDeleteShelter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "shelterID")
	if err := s.store.DeleteShelter(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminResetShelterPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "shelterID")
	if _, err := s.store.GetShelter(id); err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	tempPassword := generateTempPassword()
	hash, err := auth.HashPassword(tempPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	if err := s.store.UpdateShelterPassword(id, hash); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Force the shelter to change it again next login.
	if sh, err := s.store.GetShelter(id); err == nil && sh != nil {
		_, _ = s.store.UpdateShelter(id, *sh)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"tempPassword":   tempPassword,
			"passwordNotice": "Password reset. Save this — it will not be shown again.",
		},
	})
}

// ── Shelter-side authentication ────────────────────────────────────────

func (s *Server) handleShelterLogin(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	// v0.15+: auth via shelter_members. The old shelters.email/
	// password_hash columns are now read-only legacy — the 0006
	// migration back-fills an "admin" member mirror of every existing
	// shelter, so previously-valid credentials keep working without
	// any user-visible change.
	member, hash, err := s.store.GetShelterMemberByEmailForLogin(email)
	if err != nil || member == nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !auth.VerifyPassword(input.Password, hash) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	sh, err := s.store.GetShelter(member.ShelterID)
	if err != nil || sh == nil {
		writeError(w, http.StatusInternalServerError, "shelter record missing")
		return
	}
	_ = s.store.MarkShelterMemberLoggedIn(member.ID)
	// Keep the top-level shelter.last_login_at in sync so the admin
	// panel "last login" column still reflects activity. Best-effort —
	// failure here shouldn't kill the login.
	_ = s.store.MarkShelterLoggedIn(sh.ID)
	session, err := s.issueShelterSession(sh, member)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleShelterChangePassword(w http.ResponseWriter, r *http.Request) {
	memberID := currentShelterMemberID(r)
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	member, err := s.store.GetShelterMember(memberID)
	if err != nil || member == nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	_, hash, err := s.store.GetShelterMemberByEmailForLogin(member.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read credentials")
		return
	}
	if !auth.VerifyPassword(input.CurrentPassword, hash) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	newHash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	if err := s.store.UpdateShelterMemberPassword(memberID, newHash); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditMemberPasswordChange, "member", memberID, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleShelterMe(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	sh, err := s.store.GetShelter(shelterID)
	if err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": sh})
}

type shelterProfilePatch struct {
	Name      string  `json:"name"`
	About     string  `json:"about"`
	Phone     string  `json:"phone"`
	Website   string  `json:"website"`
	LogoURL   *string `json:"logoUrl,omitempty"`
	HeroURL   *string `json:"heroUrl,omitempty"`
	Address   string  `json:"address"`
	CityLabel string  `json:"cityLabel"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Hours     string  `json:"hours"`
}

func (s *Server) handleShelterUpdateProfile(w http.ResponseWriter, r *http.Request) {
	// Editing shelter-wide profile is admin-only — editors and viewers
	// can see it but can't change the org's public face.
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "admin") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	sh, err := s.store.GetShelter(shelterID)
	if err != nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	var patch shelterProfilePatch
	if !decodeJSON(w, r, &patch) {
		return
	}
	merged := *sh
	merged.Name = patch.Name
	merged.About = patch.About
	merged.Phone = patch.Phone
	merged.Website = patch.Website
	merged.LogoURL = patch.LogoURL
	merged.HeroURL = patch.HeroURL
	merged.Address = patch.Address
	merged.CityLabel = patch.CityLabel
	merged.Latitude = patch.Latitude
	merged.Longitude = patch.Longitude
	merged.Hours = patch.Hours
	updated, err := s.store.UpdateShelter(shelterID, merged)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditProfileUpdate, "profile", shelterID, map[string]any{
		"name": merged.Name,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": updated})
}

// ── Shelter pets (CRUD from shelter panel) ─────────────────────────────

type shelterPetInput struct {
	domain.ShelterPet
}

func (s *Server) handleShelterListPets(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	status := r.URL.Query().Get("status")
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterPets(shelterID, status),
	})
}

func (s *Server) handleShelterGetPet(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	pet, err := s.store.GetShelterPet(chi.URLParam(r, "petID"))
	if err != nil || pet.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pet})
}

// checkShelterCompliance enforces jurisdiction-specific rules (breed
// blocks, microchip requirement) against a pet the shelter is trying
// to save. Returns "" when OK, else a user-facing reason. The shelter's
// operating country comes from the approved application; legacy admin-
// created shelters that don't have one skip these checks (effectively
// opt-out until an admin moves them to a region).
func (s *Server) checkShelterCompliance(shelterID string, pet domain.ShelterPet) string {
	sh, err := s.store.GetShelter(shelterID)
	if err != nil || sh == nil || sh.OperatingCountry == "" {
		return ""
	}
	if pet.Species != "" && !domain.IsAllowedSpecies(pet.Species) {
		return "species_not_allowed: only dogs, cats, rabbits, ferrets and small mammals can be listed for adoption"
	}
	if domain.BreedBlockedInCountry(sh.OperatingCountry, pet.Breed) {
		return "breed_blocked_in_region: this breed is restricted in the shelter's operating region and cannot be listed for adoption"
	}
	if domain.MicrochipRequired(sh.OperatingCountry) && strings.TrimSpace(pet.MicrochipID) == "" {
		return "microchip_required_in_region: shelter's operating region requires a microchip id before rehoming"
	}
	return ""
}

func (s *Server) handleShelterCreatePet(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	// Unverified shelters cannot create listings. The frontend hides the
	// entry point too, but we keep the backend authoritative.
	if sh, err := s.store.GetShelter(shelterID); err == nil && sh.VerifiedAt == "" {
		writeError(w, http.StatusForbidden, "verification_required: account must be verified before creating listings")
		return
	}
	var in shelterPetInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	in.ShelterPet.ID = ""
	in.ShelterPet.ShelterID = shelterID
	if in.ShelterPet.Status == "" {
		in.ShelterPet.Status = "available"
	}
	// New listings always start as `draft` in the moderation lifecycle;
	// shelter must call POST /shelter/v1/pets/{id}/submit to enter the
	// queue.
	in.ShelterPet.ListingState = domain.ListingStateDraft
	if msg := s.checkShelterCompliance(shelterID, in.ShelterPet); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, msg)
		return
	}
	out, err := s.store.UpsertShelterPet(shelterID, in.ShelterPet)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditPetCreate, "pet", out.ID, map[string]any{
		"name":    out.Name,
		"species": out.Species,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"data": out})
}

func (s *Server) handleShelterUpdatePet(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	existing, err := s.store.GetShelterPet(petID)
	if err != nil || existing.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	// Pending-review and adopted/archived listings are locked for
	// edits until the state moves — per spec "pending_review listings
	// cannot be edited or deleted until admin resolves".
	if existing.ListingState == domain.ListingStatePendingReview ||
		existing.ListingState == domain.ListingStateAdopted ||
		existing.ListingState == domain.ListingStateArchived {
		writeError(w, http.StatusConflict, "listing is locked for edits in its current state")
		return
	}
	var in shelterPetInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.ShelterPet.ID = petID
	in.ShelterPet.ShelterID = shelterID
	// Preserve lifecycle state through the upsert (client shouldn't be
	// able to flip listing_state via a PUT).
	in.ShelterPet.ListingState = existing.ListingState
	if msg := s.checkShelterCompliance(shelterID, in.ShelterPet); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, msg)
		return
	}
	out, err := s.store.UpsertShelterPet(shelterID, in.ShelterPet)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Re-run the auto-flag rules on edits to published listings. If any
	// rule fires, yank the listing back to pending_review — same gate
	// the submit path uses on new listings. `draft` and `rejected` edits
	// keep their state; they enter moderation only via explicit submit
	// or restart → submit.
	if existing.ListingState == domain.ListingStatePublished || existing.ListingState == domain.ListingStatePaused {
		country := ""
		if sh, err := s.store.GetShelter(shelterID); err == nil && sh != nil {
			country = sh.OperatingCountry
		}
		if triggered, rules := domain.AutoFlagListing(out, country); triggered {
			_ = s.store.SetListingAutoFlagReasons(out.ID, rules)
			reason := ""
			if len(rules) > 0 {
				reason = rules[0]
			}
			if transitioned, tErr := s.store.TransitionListingState(
				out.ID, domain.ListingStatePendingReview,
				currentShelterMemberID(r), domain.ListingActorShelter,
				reason, "auto-flag triggered on edit",
				map[string]any{"autoFlag": rules, "viaEdit": true}); tErr == nil {
				out = transitioned
			}
			s.recordShelterAudit(r, domain.AuditListingAutoFlag, "listing", out.ID, map[string]any{
				"rules": rules,
			})
		} else {
			// Clear any lingering auto-flag reasons so the detail page
			// stops showing stale warnings after a corrective edit.
			_ = s.store.SetListingAutoFlagReasons(out.ID, []string{})
			out.AutoFlagReasons = nil
		}
	}

	s.recordShelterAudit(r, domain.AuditPetUpdate, "pet", out.ID, map[string]any{
		"name": out.Name,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (s *Server) handleShelterUpdatePetStatus(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	switch body.Status {
	case "available", "reserved", "adopted", "hidden":
	default:
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	if err := s.store.UpdateShelterPetStatus(petID, body.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditPetStatusChange, "pet", petID, map[string]any{
		"status":  body.Status,
		"petName": pet.Name,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]string{"status": body.Status}})
}

func (s *Server) handleShelterDeletePet(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	// Matrix: delete is disallowed on pending_review / adopted. The
	// frontend hides the button too but we enforce server-side.
	if pet.ListingState == domain.ListingStatePendingReview ||
		pet.ListingState == domain.ListingStateAdopted {
		writeError(w, http.StatusConflict, "listing cannot be deleted in its current state")
		return
	}
	if err := s.store.DeleteShelterPet(petID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditPetDelete, "pet", petID, map[string]any{
		"petName": pet.Name,
		"soft":    pet.ListingState != domain.ListingStateDraft,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Shelter dashboard + applications ───────────────────────────────────

func (s *Server) handleShelterStats(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.GetShelterStats(shelterID)})
}

func (s *Server) handleShelterListApplications(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	status := r.URL.Query().Get("status")
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterApplications(shelterID, status),
	})
}

func (s *Server) handleShelterGetApplication(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	app, err := s.store.GetApplication(chi.URLParam(r, "appID"))
	if err != nil || app.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": app})
}

// openChatForApplication pre-creates a direct conversation between the
// shelter-owner user view and the applicant. We reuse the existing
// `conversations` table; `shelter_id` + `adoption_application_id` are
// stamped so each side can list them later.
func (s *Server) openChatForApplication(ctx context.Context, app *domain.AdoptionApplication, sh *domain.Shelter) (string, error) {
	// Shelter messaging identity uses the shelter id so user-side queries
	// can treat it like any other participant in user_ids[]. The actual
	// shelter-side app addresses conversations through adoption_application_id.
	conv, err := s.store.CreateOrFindDirectConversation(sh.ID, app.UserID)
	if err != nil {
		return "", err
	}
	// Stamp the bridge columns directly; only PostgresStore has a Pool().
	if pg, ok := s.store.(interface{ Pool() *pgxpool.Pool }); ok && pg.Pool() != nil {
		_, _ = pg.Pool().Exec(ctx,
			`UPDATE conversations SET adoption_application_id=$1, shelter_id=$2,
			   title=COALESCE(NULLIF(title,''), $3), subtitle='Adoption inquiry' WHERE id=$4`,
			app.ID, sh.ID, sh.Name, conv.ID)
	}
	return conv.ID, nil
}

func (s *Server) handleShelterApproveApplication(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	appID := chi.URLParam(r, "appID")
	app, err := s.store.GetApplication(appID)
	if err != nil || app.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	sh, err := s.store.GetShelter(shelterID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "shelter missing")
		return
	}
	conversationID, err := s.openChatForApplication(r.Context(), app, sh)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.store.ApproveApplication(appID, conversationID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Reload with the new conversation id so the client gets fresh state.
	refreshed, _ := s.store.GetApplication(appID)
	s.recordShelterAudit(r, domain.AuditApplicationApprove, "application", appID, map[string]any{
		"petName":  app.PetName,
		"userName": app.UserName,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": refreshed})
}

func (s *Server) handleShelterRejectApplication(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	appID := chi.URLParam(r, "appID")
	app, err := s.store.GetApplication(appID)
	if err != nil || app.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decodeJSONSilent(r, &body)
	if err := s.store.RejectApplication(appID, body.Reason); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	refreshed, _ := s.store.GetApplication(appID)
	s.recordShelterAudit(r, domain.AuditApplicationReject, "application", appID, map[string]any{
		"petName":  app.PetName,
		"userName": app.UserName,
		"reason":   body.Reason,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": refreshed})
}

func (s *Server) handleShelterCompleteAdoption(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	appID := chi.URLParam(r, "appID")
	app, err := s.store.GetApplication(appID)
	if err != nil || app.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	if err := s.store.CompleteAdoption(appID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	refreshed, _ := s.store.GetApplication(appID)
	s.recordShelterAudit(r, domain.AuditApplicationComplete, "application", appID, map[string]any{
		"petName":  app.PetName,
		"userName": app.UserName,
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": refreshed})
}

// ── Public adoption endpoints (app user) ───────────────────────────────

// parseOptionalLatLng pulls ?lat/&lng from a request and returns a
// (lat, lng, ok) tuple. `ok` is false if either value is missing or
// not a finite number — callers can then skip distance enrichment.
func parseOptionalLatLng(r *http.Request) (float64, float64, bool) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	if latStr == "" || lngStr == "" {
		return 0, 0, false
	}
	lat, err1 := strconv.ParseFloat(latStr, 64)
	lng, err2 := strconv.ParseFloat(lngStr, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return lat, lng, true
}

// stripShelterPublic removes contact + operational fields that
// shouldn't reach the adopter. Must be called on every Shelter struct
// before it crosses the public-facing wire.
func stripShelterPublic(sh *domain.Shelter) {
	sh.MustChangePassword = false
	sh.LastLoginAt = ""
	sh.Email = ""
	sh.Phone = ""
	sh.Address = "" // city-level only per spec
}

// enrichPetForAdopter masks the microchip ID (returning the surface
// flag), wipes moderation metadata, and attaches shelter denormalised
// fields + optional distance. Returns the microchipPresent flag for
// the caller to bundle into the top-level response.
func enrichPetForAdopter(pet *domain.ShelterPet, sh *domain.Shelter, userLat, userLng float64, hasLoc bool) bool {
	microchipPresent := strings.TrimSpace(pet.MicrochipID) != ""
	pet.MicrochipID = ""
	pet.AutoFlagReasons = nil
	pet.LastRejectionCode = ""
	pet.LastRejectionNote = ""
	pet.AdopterName = ""
	pet.AdoptionDate = ""
	pet.AdoptionNotes = ""
	if sh != nil {
		pet.ShelterName = sh.Name
		pet.ShelterCity = sh.CityLabel
		pet.ShelterVerified = sh.VerifiedAt != ""
	}
	if hasLoc && sh != nil && sh.Latitude != 0 && sh.Longitude != 0 {
		d := haversineKm(userLat, userLng, sh.Latitude, sh.Longitude)
		pet.DistanceKm = &d
	}
	return microchipPresent
}

func (s *Server) handlePublicListShelters(w http.ResponseWriter, r *http.Request) {
	// Only expose safe fields; password/must_change etc. never leak via
	// ListShelters — the domain.Shelter serialization already omits hash.
	shelters := s.store.ListShelters()
	active := make([]domain.Shelter, 0, len(shelters))
	for _, sh := range shelters {
		if sh.Status == "active" && sh.VerifiedAt != "" {
			// Scrub contact + admin-only fields for the public feed.
			stripShelterPublic(&sh)
			active = append(active, sh)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": active})
}

// handlePublicGetShelter returns a shelter profile for an adopter —
// pets denormalise the shelter name/verified flag so the mobile card
// renders without a second round-trip; contact channels stripped; the
// shelter's listing grid is pre-filtered to `published` only.
func (s *Server) handlePublicGetShelter(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "shelterID")
	sh, err := s.store.GetShelter(id)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	// Only verified shelters are publicly visible.
	if sh.VerifiedAt == "" {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	stripShelterPublic(sh)

	lat, lng, hasLoc := parseOptionalLatLng(r)
	all := s.store.ListShelterPets(id, "")
	pets := make([]domain.ShelterPet, 0, len(all))
	for _, p := range all {
		if p.ListingState != domain.ListingStatePublished {
			continue
		}
		enrichPetForAdopter(&p, sh, lat, lng, hasLoc)
		p.PublishedAt = earliestPublishedAt(s, p.ID, p.CreatedAt)
		pets = append(pets, p)
	}
	// Recently adopted (opt-in).
	var recentlyAdopted []domain.ShelterPet
	if sh.ShowRecentlyAdopted {
		ra := s.store.ListRecentlyAdopted(id, 10)
		for i := range ra {
			enrichPetForAdopter(&ra[i], sh, lat, lng, hasLoc)
		}
		recentlyAdopted = ra
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"shelter":         sh,
			"pets":            pets,
			"recentlyAdopted": recentlyAdopted,
			"disclosure":      domain.DisclosureForCountry(sh.OperatingCountry),
		},
	})
}

func (s *Server) handlePublicListAdoptablePets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	params := store.ListAdoptablePetsParams{
		Species:          q.Get("species"),
		Sex:              q.Get("sex"),
		Size:             q.Get("size"),
		City:             q.Get("city"),
		Search:           q.Get("search"),
		SpecialNeedsOnly: q.Get("specialNeeds") == "1" || q.Get("specialNeeds") == "true",
	}
	params.Limit = parseIntDefault(q.Get("limit"), 30, 100)
	params.Offset = parseIntDefault(q.Get("offset"), 0, 10_000)
	params.MinAge = parseIntDefault(q.Get("minAgeMonths"), 0, 1200)
	params.MaxAge = parseIntDefault(q.Get("maxAgeMonths"), 0, 1200)
	if mdk := q.Get("maxDistanceKm"); mdk != "" {
		if v, err := strconv.ParseFloat(mdk, 64); err == nil && v > 0 {
			params.MaxDistanceKm = v
		}
	}

	pets := s.store.ListPublicAdoptablePets(params)
	lat, lng, hasLoc := parseOptionalLatLng(r)
	for i := range pets {
		// The list query already denormalises shelter name/city; we
		// only need to strip microchip + add distance. Enrichment
		// helper tolerates a nil shelter.
		var sh *domain.Shelter
		if pets[i].ShelterID != "" {
			sh, _ = s.store.GetShelter(pets[i].ShelterID)
			if sh != nil {
				stripShelterPublic(sh)
			}
		}
		enrichPetForAdopter(&pets[i], sh, lat, lng, hasLoc)
		pets[i].PublishedAt = earliestPublishedAt(s, pets[i].ID, pets[i].CreatedAt)
	}

	// Distance cap is applied post-enrichment — SQL can't do haversine
	// without a PostGIS dep, and the in-memory filter is fine at the
	// discovery page's scale (hundreds, not thousands, per request).
	if params.MaxDistanceKm > 0 {
		filtered := pets[:0]
		for _, p := range pets {
			if p.DistanceKm != nil && *p.DistanceKm <= params.MaxDistanceKm {
				filtered = append(filtered, p)
			}
		}
		pets = filtered
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": pets})
}

// handlePublicGetAdoptablePet — the detail endpoint the fetcht mobile
// app calls. 404 for anything not currently `published` so paused /
// adopted / archived / rejected all look identical to "not found" from
// the outside. Microchip ID never leaves the server; only the badge
// flag. Bundles shelter mini-card + jurisdiction disclosure.
func (s *Server) handlePublicGetAdoptablePet(w http.ResponseWriter, r *http.Request) {
	pet, err := s.store.GetShelterPet(chi.URLParam(r, "petID"))
	if err != nil || pet == nil {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	if pet.ListingState != domain.ListingStatePublished || pet.DeletedAt != "" {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	sh, err := s.store.GetShelter(pet.ShelterID)
	if err != nil || sh == nil || sh.VerifiedAt == "" {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	stripShelterPublic(sh)

	lat, lng, hasLoc := parseOptionalLatLng(r)
	microchipPresent := enrichPetForAdopter(pet, sh, lat, lng, hasLoc)
	pet.PublishedAt = earliestPublishedAt(s, pet.ID, pet.CreatedAt)

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"pet":              pet,
			"microchipPresent": microchipPresent,
			"shelter":          sh,
			"disclosure":       domain.DisclosureForCountry(sh.OperatingCountry),
		},
	})
}

func (s *Server) handlePublicCreateApplication(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	var body struct {
		PetID           string `json:"petId"`
		HousingType     string `json:"housingType"`
		HasOtherPets    bool   `json:"hasOtherPets"`
		OtherPetsDetail string `json:"otherPetsDetail"`
		Experience      string `json:"experience"`
		Message         string `json:"message"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.PetID == "" {
		writeError(w, http.StatusBadRequest, "petId is required")
		return
	}
	pet, err := s.store.GetShelterPet(body.PetID)
	if err != nil {
		writeError(w, http.StatusNotFound, "pet not found")
		return
	}
	if pet.Status != "available" {
		writeError(w, http.StatusConflict, "pet is no longer available")
		return
	}
	// User profile for denormalization.
	user, err := s.store.GetUser(userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	app := domain.AdoptionApplication{
		PetID:           pet.ID,
		ShelterID:       pet.ShelterID,
		UserID:          userID,
		UserName:        strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName),
		UserAvatarURL:   user.Profile.AvatarURL,
		HousingType:     body.HousingType,
		HasOtherPets:    body.HasOtherPets,
		OtherPetsDetail: body.OtherPetsDetail,
		Experience:      body.Experience,
		Message:         body.Message,
		Status:          "pending",
	}
	out, err := s.store.CreateAdoptionApplication(app)
	if err != nil {
		// Uniqueness violation ⇒ duplicate application.
		if strings.Contains(err.Error(), "duplicate") ||
			strings.Contains(err.Error(), "unique") ||
			strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "you already applied for this pet")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": out})
}

func (s *Server) handlePublicListMyApplications(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListUserApplications(userID),
	})
}

func (s *Server) handlePublicWithdrawApplication(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	appID := chi.URLParam(r, "appID")
	if err := s.store.WithdrawApplication(appID, userID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"withdrawn": true}})
}

// ── Helpers ────────────────────────────────────────────────────────────

// decodeJSONSilent is a best-effort JSON decoder — it never writes to w.
// Used where the body is optional (e.g. rejection reason).
func decodeJSONSilent(r *http.Request, dest any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dest)
}

// parseIntDefault returns a bounded int from a query value.
func parseIntDefault(raw string, def, max int) int {
	if raw == "" {
		return def
	}
	n := 0
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil {
		return def
	}
	if n < 0 {
		return 0
	}
	if n > max {
		return max
	}
	return n
}
