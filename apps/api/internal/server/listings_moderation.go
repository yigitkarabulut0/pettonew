package server

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// Listings moderation handlers — the DSA Art. 16 / 17 / 22 / 23
// machinery that backs the admin moderation queue, listing-reports
// queue, and shelter lifecycle actions. Route wiring lives in
// server.go; this file is the single home for every handler whose
// audience is "compliance and abuse workflows" so they're easy to
// reason about together.

// ── Shelter-facing endpoints ───────────────────────────────────────

// handleShelterSubmitListing promotes a listing from `draft` into the
// moderation pipeline. The server runs domain.AutoFlagListing; if any
// rule fires the listing is held at `pending_review` for human review,
// otherwise it auto-publishes immediately. The decision (and which
// rules fired) is logged to listing_state_transitions.
func (s *Server) handleShelterSubmitListing(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet == nil || pet.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}

	operatingCountry := ""
	if sh, err := s.store.GetShelter(shelterID); err == nil && sh != nil {
		operatingCountry = sh.OperatingCountry
	}

	triggered, rules := domain.AutoFlagListing(*pet, operatingCountry)
	_ = s.store.SetListingAutoFlagReasons(petID, rules)

	actorID := currentShelterMemberID(r)
	target := domain.ListingStatePublished
	audit := domain.AuditListingSubmit
	meta := map[string]any{"autoFlag": rules}
	reasonCode := ""
	if triggered {
		target = domain.ListingStatePendingReview
		audit = domain.AuditListingAutoFlag
		if len(rules) > 0 {
			reasonCode = rules[0]
		}
	}

	out, err := s.store.TransitionListingState(petID, target, actorID, domain.ListingActorShelter, reasonCode, "", meta)
	if err != nil {
		// Allowed transitions for shelter from `draft` are → pending_review
		// or → published, so this only trips on a non-draft starting
		// state (e.g. shelter retrying submit on a published listing).
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	s.recordShelterAudit(r, audit, "listing", petID, meta)

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"listing":         out,
			"autoFlagReasons": rules,
			"state":           target,
		},
	})
}

// handleShelterListingTransition covers the shelter-initiated moves —
// pause / unpause (via `publish`) / mark_adopted / archive / restart
// (rejected → draft). Admins get their own endpoints below.
func (s *Server) handleShelterListingTransition(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet == nil || pet.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	var body struct {
		Action        string `json:"action"`
		Note          string `json:"note,omitempty"`
		AdopterName   string `json:"adopterName,omitempty"`
		AdoptionDate  string `json:"adoptionDate,omitempty"`
		AdoptionNotes string `json:"adoptionNotes,omitempty"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	target, audit := "", ""
	switch body.Action {
	case "pause":
		target, audit = domain.ListingStatePaused, domain.AuditListingPause
	case "publish":
		target, audit = domain.ListingStatePublished, domain.AuditListingUnpause
	case "mark_adopted":
		target, audit = domain.ListingStateAdopted, domain.AuditListingMarkAdopted
	case "archive":
		target, audit = domain.ListingStateArchived, domain.AuditListingArchive
	case "restart":
		target, audit = domain.ListingStateDraft, domain.AuditListingRestart
	default:
		writeError(w, http.StatusBadRequest, "unknown action")
		return
	}

	if body.Action == "mark_adopted" {
		if len(body.AdopterName) > 100 {
			writeError(w, http.StatusBadRequest, "adopterName must be 100 characters or fewer")
			return
		}
		if len(body.AdoptionNotes) > 500 {
			writeError(w, http.StatusBadRequest, "adoptionNotes must be 500 characters or fewer")
			return
		}
		// Block future adoption dates; the spec requires `cannot be
		// future date`. Empty string is allowed (optional field).
		if body.AdoptionDate != "" {
			if t, err := time.Parse("2006-01-02", body.AdoptionDate); err == nil {
				if t.After(time.Now().UTC().Add(24 * time.Hour)) {
					writeError(w, http.StatusBadRequest, "adoptionDate cannot be in the future")
					return
				}
			}
		}
	}

	actorID := currentShelterMemberID(r)
	out, err := s.store.TransitionListingState(petID, target, actorID, domain.ListingActorShelter, "", body.Note, nil)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if body.Action == "mark_adopted" {
		_ = s.store.SetAdoptionOutcome(petID, body.AdopterName, body.AdoptionDate, body.AdoptionNotes)
		if fresh, err := s.store.GetShelterPet(petID); err == nil && fresh != nil {
			out = *fresh
		}
	}
	s.recordShelterAudit(r, audit, "listing", petID, nil)
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ── Admin moderation queue ─────────────────────────────────────────

// handleAdminListingQueue returns the moderation queue, filtered by
// listing_state. The pending_review tab is oldest-first (SLA pressure
// first); other tabs are newest-first.
func (s *Server) handleAdminListingQueue(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	if state == "" {
		state = domain.ListingStatePendingReview
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total := s.store.ListListingsByState(state, limit, offset)
	writeJSON(w, http.StatusOK, map[string]any{
		"data":  items,
		"total": total,
		"state": state,
	})
}

// handleAdminListingDetail bundles the listing + its transition log +
// every persisted statement of reasons into one response so the admin
// detail page renders in a single round-trip.
func (s *Server) handleAdminListingDetail(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "listingID")
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet == nil {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"listing":              pet,
			"transitions":          s.store.ListListingTransitions(petID),
			"statementsOfReasons":  s.store.ListStatementsOfReasons(petID),
		},
	})
}

// handleAdminApproveListing moves a pending_review listing → published.
func (s *Server) handleAdminApproveListing(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "listingID")
	actorID := currentUserID(r)
	out, err := s.store.TransitionListingState(petID, domain.ListingStatePublished, actorID, domain.ListingActorAdmin, "", "", nil)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

// handleAdminRejectListing moves any non-draft listing → rejected and
// persists a DSA Art. 17 statement of reasons. The shelter sees
// `noteToShelter` and the reason code inline in the editor; the admin-
// only `internalNote` stays in the transition log metadata.
func (s *Server) handleAdminRejectListing(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "listingID")
	var body struct {
		ReasonCode    string `json:"reasonCode"`
		NoteToShelter string `json:"noteToShelter"`
		InternalNote  string `json:"internalNote"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if !domain.IsValidRejectionCode(body.ReasonCode) {
		writeError(w, http.StatusBadRequest, "unknown rejection reason code")
		return
	}
	if len(body.NoteToShelter) > 500 || len(body.InternalNote) > 500 {
		writeError(w, http.StatusBadRequest, "notes must be 500 characters or fewer")
		return
	}
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet == nil {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	actorID := currentUserID(r)
	meta := map[string]any{"internalNote": body.InternalNote}
	out, err := s.store.TransitionListingState(petID, domain.ListingStateRejected, actorID, domain.ListingActorAdmin, body.ReasonCode, body.NoteToShelter, meta)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	// Build + persist the DSA Art. 17 Statement of Reasons.
	legalGround, facts := domain.ListingStatementOfReasonsText(pet.Name, pet.Breed, body.ReasonCode, body.NoteToShelter)
	sor := domain.ListingStatementOfReasons{
		ListingID:          petID,
		ShelterID:          pet.ShelterID,
		ContentDescription: "Adoption listing: " + pet.Name + " (" + pet.Species + "/" + pet.Breed + ")",
		LegalGround:        legalGround,
		FactsReliedOn:      facts,
		Scope:              "Single listing removed from public discovery; shelter history retained for 10 years.",
		RedressOptions:     "Appeal by email to appeal@petto.app within 30 days, or by resubmitting a corrected listing (returns to draft).",
		IssuedBy:           actorID,
	}
	_, _ = s.store.CreateStatementOfReasons(sor)

	writeJSON(w, http.StatusOK, map[string]any{
		"data":                out,
		"statementOfReasons":  sor,
	})
}

// ── Admin reports queue ────────────────────────────────────────────

// handleAdminListListingReports returns the listing-reports queue
// filtered by status (`open` is the default) and with an optional
// `trusted=1` toggle for the Art. 22 priority tab.
func (s *Server) handleAdminListListingReports(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "open"
	}
	trusted := r.URL.Query().Get("trusted") == "1" || r.URL.Query().Get("trusted") == "true"
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total := s.store.ListListingReports(status, trusted, limit, offset)
	writeJSON(w, http.StatusOK, map[string]any{"data": items, "total": total})
}

// handleAdminResolveListingReport applies one of the four verbs and,
// for `remove`, also moves the listing → rejected + persists a DSA
// Art. 17 statement of reasons. `suspend` suspends the shelter too.
func (s *Server) handleAdminResolveListingReport(w http.ResponseWriter, r *http.Request) {
	reportID := chi.URLParam(r, "reportID")
	var body struct {
		Resolution string `json:"resolution"`
		Note       string `json:"note,omitempty"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	report, err := s.store.GetListingReport(reportID)
	if err != nil || report == nil {
		writeError(w, http.StatusNotFound, "report not found")
		return
	}
	if len(body.Note) > 500 {
		writeError(w, http.StatusBadRequest, "note must be 500 characters or fewer")
		return
	}
	actorID := currentUserID(r)

	switch body.Resolution {
	case "dismiss", "warn":
		// No listing transition; just close the report. `warn` is an
		// admin-authored nudge to the shelter via email/notification;
		// email delivery is a follow-up — here we persist the outcome.
	case "remove", "suspend":
		pet, err := s.store.GetShelterPet(report.ListingID)
		if err != nil || pet == nil {
			writeError(w, http.StatusNotFound, "listing gone; cannot remove")
			return
		}
		// Terminal removal: listing → rejected + SoR.
		_, err = s.store.TransitionListingState(
			report.ListingID, domain.ListingStateRejected, actorID, domain.ListingActorAdmin,
			"policy_violation", body.Note,
			map[string]any{"viaReportID": reportID, "resolution": body.Resolution},
		)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		legalGround, facts := domain.ListingStatementOfReasonsText(pet.Name, pet.Breed, "policy_violation", body.Note)
		_, _ = s.store.CreateStatementOfReasons(domain.ListingStatementOfReasons{
			ListingID:          report.ListingID,
			ShelterID:          pet.ShelterID,
			ContentDescription: "Adoption listing: " + pet.Name + " (" + pet.Species + "/" + pet.Breed + ")",
			LegalGround:        legalGround,
			FactsReliedOn:      facts + " Triggered by user report " + reportID + ".",
			Scope:              "Single listing removed from public discovery; shelter history retained for 10 years.",
			RedressOptions:     "Appeal by email to appeal@petto.app within 30 days.",
			IssuedBy:           actorID,
		})
		if body.Resolution == "suspend" {
			_ = s.store.SuspendShelter(pet.ShelterID)
		}
	default:
		writeError(w, http.StatusBadRequest, "resolution must be one of: dismiss, warn, remove, suspend")
		return
	}

	if err := s.store.ResolveListingReport(reportID, body.Resolution, body.Note, actorID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAdminShelterStrikes powers the DSA Art. 23 repeat-offender
// panel on the admin shelter detail page. Threshold is 3 rejections in
// 90 days (product spec) — the flag on the response is used by the UI
// to decide whether to render the red banner + Suspend button.
func (s *Server) handleAdminShelterStrikes(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	count := s.store.CountShelterRejectionsLast90Days(shelterID)
	list := s.store.ListShelterRejections(shelterID, 90)
	writeJSON(w, http.StatusOK, map[string]any{
		"data": domain.ListingStrikeSummary{
			ShelterID:  shelterID,
			Count:      count,
			WindowDays: 90,
			Threshold:  3,
			Triggered:  count >= 3,
			Rejections: list,
		},
	})
}

// handleAdminSuspendShelter is the manual Art. 23 trigger. The
// admin-only `reason` is logged; shelters see their dashboard flip to
// suspended on next login.
func (s *Server) handleAdminSuspendShelter(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	var body struct {
		Reason string `json:"reason,omitempty"`
	}
	_ = decodeJSONSilent(r, &body)
	if err := s.store.SuspendShelter(shelterID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.recordShelterAuditWithActor(shelterID, currentUserID(r), "admin", "", domain.AuditListingSuspendShelter, "shelter", shelterID, map[string]any{
		"reason": body.Reason,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAdminListingRejectionCodes exposes the enum for the admin UI's
// reason-code select so the client doesn't have to hardcode labels.
func (s *Server) handleAdminListingRejectionCodes(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]string, 0, len(domain.RejectionReasonCodes))
	for code, label := range domain.RejectionReasonCodes {
		out = append(out, map[string]string{"code": code, "label": label})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}
