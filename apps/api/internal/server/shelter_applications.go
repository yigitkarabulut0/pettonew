package server

import (
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

// ── Entity-type taxonomy (country-scoped) ────────────────────────────
//
// The wizard calls this first to fill the country → entity-type dropdown.
// Values are baked in rather than stored in the DB so the product surface
// (issue table) stays the single source of truth until we build an admin
// editor.

var shelterEntityTypes = []domain.ShelterEntityType{
	// Turkey
	{Slug: "tr_dernek", Country: "TR", Label: "Dernek"},
	{Slug: "tr_vakif", Country: "TR", Label: "Vakıf"},
	{Slug: "tr_belediye_bakimevi", Country: "TR", Label: "Belediye bakımevi"},
	{Slug: "tr_tarim_bakanligi_bakimevi", Country: "TR", Label: "Tarım Bakanlığı bakımevi"},
	// United Kingdom
	{Slug: "gb_registered_charity_ew", Country: "GB", Label: "Registered charity (England & Wales)"},
	{Slug: "gb_registered_charity_scotland", Country: "GB", Label: "Registered charity (Scotland)"},
	{Slug: "gb_registered_charity_ni", Country: "GB", Label: "Registered charity (Northern Ireland)"},
	{Slug: "gb_cic", Country: "GB", Label: "Community Interest Company (CIC)"},
	// United States
	{Slug: "us_501c3", Country: "US", Label: "501(c)(3)"},
	// Germany
	{Slug: "de_ev", Country: "DE", Label: "Eingetragener Verein (e.V.)"},
	{Slug: "de_ggmbh", Country: "DE", Label: "Gemeinnützige GmbH"},
	// France
	{Slug: "fr_association_1901", Country: "FR", Label: "Association loi 1901"},
	{Slug: "fr_fondation_rup", Country: "FR", Label: "Fondation reconnue d'utilité publique"},
	// Italy
	{Slug: "it_aps", Country: "IT", Label: "APS (Associazione di Promozione Sociale)"},
	{Slug: "it_odv", Country: "IT", Label: "ODV (Organizzazione di Volontariato)"},
	{Slug: "it_fondazione_ets", Country: "IT", Label: "Fondazione ETS"},
	// Spain
	{Slug: "es_asociacion", Country: "ES", Label: "Asociación"},
	{Slug: "es_fundacion", Country: "ES", Label: "Fundación"},
	// Netherlands
	{Slug: "nl_stichting", Country: "NL", Label: "Stichting"},
	{Slug: "nl_vereniging", Country: "NL", Label: "Vereniging"},
	// Ireland
	{Slug: "ie_registered_charity_cro", Country: "IE", Label: "Registered charity (CRO)"},
	// Other EU fallback — admin manually verifies the document
	{Slug: "other_eu_nonprofit", Country: "other_eu", Label: "Other registered nonprofit (manual review)"},
}

func (s *Server) handlePublicShelterEntityTypes(w http.ResponseWriter, r *http.Request) {
	country := strings.TrimSpace(r.URL.Query().Get("country"))
	out := []domain.ShelterEntityType{}
	if country == "" {
		out = append(out, shelterEntityTypes...)
	} else {
		normalised := strings.ToUpper(country)
		if country == "other_eu" {
			normalised = "other_eu"
		}
		for _, et := range shelterEntityTypes {
			if et.Country == normalised {
				out = append(out, et)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ── Public wizard submission ─────────────────────────────────────────

type shelterApplicationSubmitInput struct {
	EntityType                 string   `json:"entityType"`
	Country                    string   `json:"country"`
	RegistrationNumber         string   `json:"registrationNumber"`
	RegistrationCertificateURL string   `json:"registrationCertificateUrl"`
	OrgName                    string   `json:"orgName"`
	OrgAddress                 string   `json:"orgAddress"`
	OperatingRegionCountry     string   `json:"operatingRegionCountry"`
	OperatingRegionCity        string   `json:"operatingRegionCity"`
	SpeciesFocus               []string `json:"speciesFocus"`
	DonationURL                string   `json:"donationUrl"`
	PrimaryContactName         string   `json:"primaryContactName"`
	PrimaryContactEmail        string   `json:"primaryContactEmail"`
	PrimaryContactPhone        string   `json:"primaryContactPhone"`
}

var allowedSpeciesFocus = map[string]bool{
	"dog":          true,
	"cat":          true,
	"rabbit":       true,
	"ferret":       true,
	"small_mammal": true,
}

var allowedApplicationCountries = map[string]bool{
	"TR": true, "GB": true, "US": true, "DE": true, "FR": true,
	"IT": true, "ES": true, "NL": true, "IE": true, "other_eu": true,
}

// validateShelterApplicationInput runs cheap structural checks on the
// wizard submission before we hit the store. Returns a message suitable
// for showing inline on step 5; the wizard does a full validation pass
// client-side but the server is authoritative.
func validateShelterApplicationInput(in shelterApplicationSubmitInput) string {
	// Entity + country
	if in.EntityType == "" {
		return "entity type is required"
	}
	if !allowedApplicationCountries[in.Country] {
		return "country is not supported"
	}
	// Cross-check: entity type's country must match selected country.
	found := false
	for _, et := range shelterEntityTypes {
		if et.Slug == in.EntityType {
			if et.Country != in.Country {
				return "entity type does not match selected country"
			}
			found = true
			break
		}
	}
	if !found {
		return "entity type is not recognised"
	}
	// Registration
	if strings.TrimSpace(in.RegistrationNumber) == "" {
		return "registration number is required"
	}
	if len(in.RegistrationNumber) > 100 {
		return "registration number must be at most 100 characters"
	}
	if strings.TrimSpace(in.RegistrationCertificateURL) == "" {
		return "registration certificate is required"
	}
	// Organisation
	if strings.TrimSpace(in.OrgName) == "" {
		return "organisation name is required"
	}
	if len(in.OrgName) > 150 {
		return "organisation name must be at most 150 characters"
	}
	if !allowedApplicationCountries[strings.ToUpper(in.OperatingRegionCountry)] && in.OperatingRegionCountry != "other_eu" {
		return "operating region country is not supported"
	}
	if strings.TrimSpace(in.OperatingRegionCity) == "" {
		return "operating region city is required"
	}
	if len(in.OperatingRegionCountry)+len(in.OperatingRegionCity) > 200 {
		return "operating region must be at most 200 characters"
	}
	if len(in.SpeciesFocus) == 0 {
		return "species focus must include at least one option"
	}
	seen := map[string]bool{}
	for _, sp := range in.SpeciesFocus {
		if !allowedSpeciesFocus[sp] {
			return "species focus contains an unsupported value"
		}
		if seen[sp] {
			return "species focus contains duplicates"
		}
		seen[sp] = true
	}
	// Primary contact
	if strings.TrimSpace(in.PrimaryContactName) == "" {
		return "primary contact name is required"
	}
	if len(in.PrimaryContactName) > 100 {
		return "primary contact name must be at most 100 characters"
	}
	email := strings.ToLower(strings.TrimSpace(in.PrimaryContactEmail))
	if email == "" || !strings.Contains(email, "@") || !strings.Contains(email, ".") {
		return "primary contact email is required"
	}
	return ""
}

func (s *Server) handlePublicShelterApplicationSubmit(w http.ResponseWriter, r *http.Request) {
	var in shelterApplicationSubmitInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if msg := validateShelterApplicationInput(in); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	app := domain.ShelterApplication{
		EntityType:                 in.EntityType,
		Country:                    in.Country,
		RegistrationNumber:         strings.TrimSpace(in.RegistrationNumber),
		RegistrationCertificateURL: strings.TrimSpace(in.RegistrationCertificateURL),
		OrgName:                    strings.TrimSpace(in.OrgName),
		OrgAddress:                 strings.TrimSpace(in.OrgAddress),
		OperatingRegionCountry:     strings.ToUpper(strings.TrimSpace(in.OperatingRegionCountry)),
		OperatingRegionCity:        strings.TrimSpace(in.OperatingRegionCity),
		SpeciesFocus:               in.SpeciesFocus,
		DonationURL:                strings.TrimSpace(in.DonationURL),
		PrimaryContactName:         strings.TrimSpace(in.PrimaryContactName),
		PrimaryContactEmail:        strings.ToLower(strings.TrimSpace(in.PrimaryContactEmail)),
		PrimaryContactPhone:        strings.TrimSpace(in.PrimaryContactPhone),
	}
	created, err := s.store.CreateShelterOnboardingApplication(app)
	if err != nil {
		if err == store.ErrShelterApplicationDuplicateEmail {
			writeError(w, http.StatusConflict, "an application with this email is already in review")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{
			"id":          created.ID,
			"accessToken": created.AccessToken,
			"status":      created.Status,
			"submittedAt": created.SubmittedAt,
			"slaDeadline": created.SLADeadline,
		},
	})
}

// handlePublicShelterApplicationStatus looks up an application by its
// opaque access token — the same token the confirmation screen shows
// to the applicant. We return a redacted view: nothing identifying
// about the reviewer, only status + rejection details if any.
func (s *Server) handlePublicShelterApplicationStatus(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	app, err := s.store.GetShelterOnboardingApplicationByToken(token)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"id":                  app.ID,
			"status":              app.Status,
			"submittedAt":         app.SubmittedAt,
			"slaDeadline":         app.SLADeadline,
			"orgName":             app.OrgName,
			"primaryContactEmail": app.PrimaryContactEmail,
			// Rejection context for the applicant; empty unless rejected.
			"rejectionReasonCode": app.RejectionReasonCode,
			"rejectionReasonNote": app.RejectionReasonNote,
		},
	})
}

// ── Admin review queue ──────────────────────────────────────────────

func (s *Server) handleAdminListShelterApplications(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListShelterOnboardingApplications(status, limit, offset),
	})
}

func (s *Server) handleAdminGetShelterApplication(w http.ResponseWriter, r *http.Request) {
	app, err := s.store.GetShelterOnboardingApplication(chi.URLParam(r, "appID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	// Scrub access token — not useful in the admin view and accidentally
	// leaking it would let an admin impersonate the applicant on /apply/status.
	app.AccessToken = ""
	writeJSON(w, http.StatusOK, map[string]any{"data": app})
}

func (s *Server) handleAdminApproveShelterApplication(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	reviewerID := currentUserID(r)
	tempPassword := generateTempPassword()
	hash, err := auth.HashPassword(tempPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	shelter, app, err := s.store.ApproveShelterOnboardingApplication(appID, reviewerID, hash)
	if err != nil {
		if err == store.ErrShelterApplicationNotFound {
			writeError(w, http.StatusNotFound, "application not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Mint a permanent public-profile slug. Slugs are assigned only on
	// verification — never reserved before — so we do it here at the
	// same transaction boundary where VerifiedAt is set.
	if slug, slugErr := s.store.AssignShelterSlug(shelter.ID, shelter.Name); slugErr == nil {
		shelter.Slug = slug
	}
	app.AccessToken = ""
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"shelter":        shelter,
			"application":    app,
			"tempPassword":   tempPassword,
			"passwordNotice": "Save this password now — it will not be shown again. Share it with the shelter; they will be forced to change it on first login.",
		},
	})
}

type adminShelterApplicationRejectInput struct {
	ReasonCode string `json:"reasonCode"`
	ReasonNote string `json:"reasonNote"`
}

var allowedRejectionCodes = map[string]bool{
	"invalid_registration":  true,
	"documents_unclear":     true,
	"jurisdiction_mismatch": true,
	"duplicate":             true,
	"out_of_scope":          true,
	"other":                 true,
}

func (s *Server) handleAdminRejectShelterApplication(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	reviewerID := currentUserID(r)
	var in adminShelterApplicationRejectInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if !allowedRejectionCodes[in.ReasonCode] {
		writeError(w, http.StatusBadRequest, "invalid rejection reason code")
		return
	}
	if len(in.ReasonNote) > 500 {
		writeError(w, http.StatusBadRequest, "rejection note must be at most 500 characters")
		return
	}
	app, err := s.store.RejectShelterOnboardingApplication(appID, reviewerID, in.ReasonCode, in.ReasonNote)
	if err != nil {
		if err == store.ErrShelterApplicationNotFound {
			writeError(w, http.StatusNotFound, "application not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	app.AccessToken = ""
	writeJSON(w, http.StatusOK, map[string]any{"data": app})
}

// ── Public certificate upload presign ────────────────────────────────
//
// Unauthenticated endpoint — applicants don't have accounts yet. The
// handler forces:
//   * folder = "shelter-applications" (can't be overridden by the client)
//   * mime-type to PDF / JPEG / PNG only (spec: one file, ≤10MB)
// The 10MB cap is enforced client-side in the wizard; R2's free tier
// has a 5GB object cap so it's a best-effort hint here.

var allowedCertificateMimes = map[string]string{
	"application/pdf": ".pdf",
	"image/jpeg":      ".jpg",
	"image/jpg":       ".jpg",
	"image/png":       ".png",
}

func (s *Server) handlePublicShelterApplicationPresign(w http.ResponseWriter, r *http.Request) {
	if s.cfg.R2AccountID == "" || s.cfg.R2Bucket == "" ||
		s.cfg.R2AccessKeyID == "" || s.cfg.R2SecretKey == "" {
		writeError(w, http.StatusNotImplemented, "r2 upload is not configured")
		return
	}
	var payload struct {
		FileName string `json:"fileName"`
		MimeType string `json:"mimeType"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	normalisedMime := strings.ToLower(strings.TrimSpace(payload.MimeType))
	enforcedExt, ok := allowedCertificateMimes[normalisedMime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "only PDF, JPG, or PNG files are accepted")
		return
	}
	// Rebuild file name so we control the extension and strip any odd
	// characters applicants might sneak in (client-supplied names end
	// up visible in admin URLs).
	base := filepath.Base(strings.TrimSpace(payload.FileName))
	base = strings.TrimSuffix(base, filepath.Ext(base))
	safe := make([]rune, 0, len(base))
	for _, ch := range strings.ToLower(base) {
		switch {
		case ch >= 'a' && ch <= 'z', ch >= '0' && ch <= '9', ch == '-', ch == '_':
			safe = append(safe, ch)
		case ch == ' ':
			safe = append(safe, '-')
		}
	}
	if len(safe) == 0 {
		safe = []rune("certificate")
	}
	if len(safe) > 40 {
		safe = safe[:40]
	}
	objectKey := buildObjectKey("shelter-applications", string(safe)+enforcedExt)
	uploadURL, err := s.createPresignedUploadURL(r.Context(), objectKey, normalisedMime)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "unable to create upload URL")
		return
	}
	publicBase := strings.TrimRight(s.cfg.R2PublicBaseURL, "/")
	if publicBase == "" {
		writeError(w, http.StatusBadRequest, "r2 public base URL is not configured")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]string{
			"id":        objectKey,
			"objectKey": objectKey,
			"uploadUrl": uploadURL,
			"url":       publicBase + "/" + objectKey,
		},
	})
}

