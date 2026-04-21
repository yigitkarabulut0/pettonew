package server

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// Endpoints powering the shelter-facing listing-creation wizard. The
// wizard runs step-by-step validation client-side but every rule below
// is also enforced server-side on the underlying `POST /pets` and
// `POST /pets/{id}/submit` handlers — the wizard's role is to keep the
// UX tight, not to be load-bearing security.

// handleShelterListingConfig returns the jurisdiction-specific config
// the wizard needs on step 1 (species), step 2 (breed), and step 5
// (microchip). Pulls the shelter's operating country from its profile
// so the client doesn't have to round-trip twice.
func (s *Server) handleShelterListingConfig(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	sh, err := s.store.GetShelter(shelterID)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	country := sh.OperatingCountry
	bannedBreeds := domain.BreedBlocksByCountry[country]
	if bannedBreeds == nil {
		bannedBreeds = []string{}
	}
	microchipMode := "none"
	switch {
	case domain.MicrochipRequired(country):
		microchipMode = "required"
	case domain.MicrochipAdvisoryByCountry[country]:
		microchipMode = "advisory"
	}

	rejectionCodes := make([]map[string]string, 0, len(domain.RejectionReasonCodes))
	for code, label := range domain.RejectionReasonCodes {
		rejectionCodes = append(rejectionCodes, map[string]string{"code": code, "label": label})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"operatingCountry":   country,
			"allowedSpecies":     domain.AllowedSpeciesForAdoption,
			"prohibitedSpecies":  domain.ProhibitedSpecies,
			"bannedBreeds":       bannedBreeds,
			"microchipMode":      microchipMode, // none | advisory | required
			"minAgeWeeks":        domain.MinAgeWeeks,
			"pregnancyKeywords":  domain.PregnancyKeywords,
			"shelterCityLabel":   sh.CityLabel,
			"shelterLatitude":    sh.Latitude,
			"shelterLongitude":   sh.Longitude,
			"shelterVerifiedAt":  sh.VerifiedAt,
		},
	})
}

// handleShelterBulkCreate takes a client-validated batch of pet
// payloads and creates up to 500 draft listings. Per spec rows beyond
// 500 are silently ignored (the response `ignored` count lets the UI
// tell the shelter). Each row is re-validated server-side via
// `checkShelterCompliance` so a permissive client can't smuggle in a
// banned breed — on failure the row is reported in `errors` and the
// others still go through. The handler never auto-submits; all
// imported listings land as `draft` for the shelter to publish.
func (s *Server) handleShelterBulkCreate(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	if sh, err := s.store.GetShelter(shelterID); err == nil && sh != nil && sh.VerifiedAt == "" {
		writeError(w, http.StatusForbidden, "verification_required: account must be verified before importing listings")
		return
	}
	var body struct {
		Pets []domain.ShelterPet `json:"pets"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	const maxRows = 500
	ignored := 0
	rows := body.Pets
	if len(rows) > maxRows {
		ignored = len(rows) - maxRows
		rows = rows[:maxRows]
	}

	type rowResult struct {
		Index   int               `json:"index"`
		ID      string            `json:"id,omitempty"`
		Error   string            `json:"error,omitempty"`
		Flagged []string          `json:"flagged,omitempty"`
		Listing *domain.ShelterPet `json:"listing,omitempty"`
	}
	created := make([]rowResult, 0, len(rows))
	errors := make([]rowResult, 0)

	shelterCountry := ""
	if sh, err := s.store.GetShelter(shelterID); err == nil && sh != nil {
		shelterCountry = sh.OperatingCountry
	}

	for i, pet := range rows {
		pet.ID = ""
		pet.ShelterID = shelterID
		pet.Status = "available"
		pet.ListingState = domain.ListingStateDraft
		if msg := s.checkShelterCompliance(shelterID, pet); msg != "" {
			errors = append(errors, rowResult{Index: i, Error: msg})
			continue
		}
		out, err := s.store.UpsertShelterPet(shelterID, pet)
		if err != nil {
			errors = append(errors, rowResult{Index: i, Error: err.Error()})
			continue
		}
		// Run the same auto-flag rule set the wizard uses so rows that
		// would trip the queue on submit carry their flags inline. We
		// DO NOT transition to pending_review here — spec says "import
		// as draft and flag for pending_review on publish", so this
		// just marks the draft; the shelter's subsequent submit will
		// route via the state machine.
		if triggered, rules := domain.AutoFlagListing(out, shelterCountry); triggered {
			_ = s.store.SetListingAutoFlagReasons(out.ID, rules)
			out.AutoFlagReasons = rules
			created = append(created, rowResult{Index: i, ID: out.ID, Flagged: rules, Listing: &out})
		} else {
			created = append(created, rowResult{Index: i, ID: out.ID, Listing: &out})
		}
		s.recordShelterAudit(r, domain.AuditPetCreate, "pet", out.ID, map[string]any{
			"viaBulkImport": true,
			"name":          out.Name,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"created": created,
			"errors":  errors,
			"ignored": ignored,
		},
	})
}

// handleShelterDuplicateListing clones an existing listing into a
// fresh `draft`. Per spec: copies everything EXCEPT photos and
// microchip ID. The result is a brand-new shelter_pets row the
// shelter can edit in the wizard before submitting.
func (s *Server) handleShelterDuplicateListing(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	petID := chi.URLParam(r, "petID")
	source, err := s.store.GetShelterPet(petID)
	if err != nil || source == nil || source.ShelterID != shelterID {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}

	clone := *source
	clone.ID = ""
	clone.Photos = []string{}
	clone.MicrochipID = ""
	clone.Status = "available"
	clone.ListingState = domain.ListingStateDraft
	clone.LastRejectionCode = ""
	clone.LastRejectionNote = ""
	clone.AutoFlagReasons = nil
	clone.CreatedAt = ""
	clone.UpdatedAt = ""

	out, err := s.store.UpsertShelterPet(shelterID, clone)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditPetCreate, "pet", out.ID, map[string]any{
		"name":          out.Name,
		"duplicatedFrom": source.ID,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"data": out})
}

// handleShelterBulkAction applies one of four verbs — pause, mark_adopted,
// archive, delete — to a selection of up to 50 listings. Each listing's
// current state is checked against the spec's action matrix; failures
// come back as `errors` alongside successes so the UI can render a
// partial-success summary.
func (s *Server) handleShelterBulkAction(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	shelterID := currentShelterID(r)
	var body struct {
		Action string   `json:"action"`
		IDs    []string `json:"ids"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if len(body.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "ids is required")
		return
	}
	if len(body.IDs) > 50 {
		writeError(w, http.StatusBadRequest, "bulk actions are limited to 50 listings per operation")
		return
	}

	// Per-action allowed-state matrix (mirrors the spec table).
	allowedFrom := map[string]map[string]bool{
		"pause": {
			domain.ListingStatePublished: true,
		},
		"mark_adopted": {
			domain.ListingStatePublished: true,
			domain.ListingStatePaused:    true,
		},
		"archive": {
			domain.ListingStatePublished: true,
			domain.ListingStatePaused:    true,
			domain.ListingStateAdopted:   true,
		},
		"delete": {
			domain.ListingStateDraft:    true,
			domain.ListingStateRejected: true,
		},
	}
	allowed, ok := allowedFrom[body.Action]
	if !ok {
		writeError(w, http.StatusBadRequest, "action must be one of: pause, mark_adopted, archive, delete")
		return
	}

	type result struct {
		ID    string `json:"id"`
		OK    bool   `json:"ok"`
		Error string `json:"error,omitempty"`
	}
	results := make([]result, 0, len(body.IDs))

	for _, id := range body.IDs {
		pet, err := s.store.GetShelterPet(id)
		if err != nil || pet == nil || pet.ShelterID != shelterID {
			results = append(results, result{ID: id, Error: "not found"})
			continue
		}
		if !allowed[pet.ListingState] {
			results = append(results, result{ID: id, Error: "state " + pet.ListingState + " not allowed for " + body.Action})
			continue
		}
		switch body.Action {
		case "pause":
			_, err = s.store.TransitionListingState(id, domain.ListingStatePaused, currentShelterMemberID(r), domain.ListingActorShelter, "", "bulk pause", nil)
		case "mark_adopted":
			_, err = s.store.TransitionListingState(id, domain.ListingStateAdopted, currentShelterMemberID(r), domain.ListingActorShelter, "", "bulk mark_adopted", nil)
		case "archive":
			_, err = s.store.TransitionListingState(id, domain.ListingStateArchived, currentShelterMemberID(r), domain.ListingActorShelter, "", "bulk archive", nil)
		case "delete":
			err = s.store.DeleteShelterPet(id)
		}
		if err != nil {
			results = append(results, result{ID: id, Error: err.Error()})
			continue
		}
		results = append(results, result{ID: id, OK: true})
	}

	s.recordShelterAudit(r, domain.AuditPetUpdate, "pet", "", map[string]any{
		"bulkAction": body.Action,
		"count":      len(body.IDs),
	})
	writeJSON(w, http.StatusOK, map[string]any{"data": results})
}

// handleShelterRestoreListing reverses a soft delete inside the 30-day
// recovery window. Idempotent — restoring an already-live listing is a
// no-op.
func (s *Server) handleShelterRestoreListing(w http.ResponseWriter, r *http.Request) {
	if !domain.ShelterRoleAllows(currentShelterMemberRole(r), "editor") {
		writeError(w, http.StatusForbidden, "insufficient role")
		return
	}
	petID := chi.URLParam(r, "petID")
	if err := s.store.RestoreShelterPet(petID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.recordShelterAudit(r, domain.AuditPetUpdate, "pet", petID, map[string]any{"restored": true})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// StartDraftSweeper runs a background goroutine that hard-deletes any
// shelter_pets row stuck in `draft` with no update for 30+ days. Keeps
// the editor tidy and meets the product spec ("Draft auto-deleted after
// 30 days of inactivity"). Wired from cmd/api/main.go via
// `server.StartDraftSweeper(ctx)` post-boot.
func (s *Server) StartDraftSweeper(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		// Stagger the first sweep so it doesn't pile on cold-start.
		select {
		case <-time.After(2 * time.Minute):
		case <-ctx.Done():
			return
		}
		for {
			if err := s.store.DeleteStaleDrafts(30); err != nil {
				// Silent failure is fine — next tick retries.
				_ = err
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
