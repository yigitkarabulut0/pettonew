package server

import (
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// haversineKm returns the great-circle distance in km between two
// (lat, lng) points. Used to enrich public-pet responses with a
// `distanceKm` field when the caller passes their location.
func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKm = 6371.0
	rad := math.Pi / 180
	dLat := (lat2 - lat1) * rad
	dLng := (lng2 - lng1) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusKm * c
}

// Public shelter profile endpoints — no auth required. Serve the
// shelter's branded profile page, available pets, and (optionally)
// recently adopted animals. Unverified shelters do not resolve here;
// GetShelterBySlug already filters on VerifiedAt.

// handlePublicShelterProfile returns the core shelter record the
// public profile header renders. Only slug-keyed access: shelter IDs
// stay private to the authed surfaces. Phone + email are stripped
// from the response so the "contact = in-app message" rule holds even
// for scrapers reading the raw JSON.
func (s *Server) handlePublicShelterProfile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug required")
		return
	}
	sh, err := s.store.GetShelterBySlug(slug)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}

	// Strip any contact channel that isn't "open the in-app chat".
	sh.Email = ""
	sh.Phone = ""

	// Derive SpeciesFocus from the shelter's currently-published pets
	// so the header "species we rehome" copy is always fresh.
	speciesSeen := map[string]struct{}{}
	for _, p := range s.store.ListShelterPets(sh.ID, "") {
		if p.ListingState != domain.ListingStatePublished {
			continue
		}
		if p.Species == "" {
			continue
		}
		speciesSeen[p.Species] = struct{}{}
	}
	focus := make([]string, 0, len(speciesSeen))
	for sp := range speciesSeen {
		focus = append(focus, sp)
	}
	sh.SpeciesFocus = focus

	writeJSON(w, http.StatusOK, map[string]any{"data": sh})
}

// handlePublicShelterPets returns the shelter's published-and-available
// listings. Excludes draft / pending_review / paused / adopted /
// archived / rejected and anything soft-deleted — the spec ("Available
// pets grid shows only published listings") is enforced server-side.
//
// Optional `?lat=&lng=` query params enrich each pet with a
// `distanceKm` from the caller's location, used by the card's
// distance badge. The shelter's verified status is denormalised onto
// each row so clients don't need a second fetch to render the card.
func (s *Server) handlePublicShelterPets(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	sh, err := s.store.GetShelterBySlug(slug)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}

	// Optional distance enrichment. Invalid numbers are silently
	// ignored — the client just gets `distanceKm` absent.
	var userLat, userLng float64
	hasUserLoc := false
	if latStr := r.URL.Query().Get("lat"); latStr != "" {
		if v, err := strconv.ParseFloat(latStr, 64); err == nil {
			userLat = v
			if lngStr := r.URL.Query().Get("lng"); lngStr != "" {
				if w, err := strconv.ParseFloat(lngStr, 64); err == nil {
					userLng = w
					hasUserLoc = true
				}
			}
		}
	}

	shelterVerified := sh.VerifiedAt != ""
	all := s.store.ListShelterPets(sh.ID, "")
	out := make([]domain.ShelterPet, 0, len(all))
	for _, p := range all {
		if p.ListingState != domain.ListingStatePublished {
			continue
		}
		// Strip any moderation metadata — public doesn't need it.
		p.AutoFlagReasons = nil
		p.LastRejectionCode = ""
		p.LastRejectionNote = ""
		p.AdopterName = ""
		p.AdoptionDate = ""
		p.AdoptionNotes = ""
		// Enrichment for the card.
		p.ShelterName = sh.Name
		p.ShelterCity = sh.CityLabel
		p.ShelterVerified = shelterVerified
		// Derive publishedAt from the listing_state_transitions log;
		// fall back to created_at if the listing pre-dates the log.
		p.PublishedAt = earliestPublishedAt(s, p.ID, p.CreatedAt)
		if hasUserLoc && sh.Latitude != 0 && sh.Longitude != 0 {
			d := haversineKm(userLat, userLng, sh.Latitude, sh.Longitude)
			p.DistanceKm = &d
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

// earliestPublishedAt finds the oldest `published` transition for a
// listing. Cheap helper so the public endpoint can fill PublishedAt
// without a second roundtrip from each caller; returns fallback on
// listings that have no transitions recorded.
func earliestPublishedAt(s *Server, listingID, fallback string) string {
	transitions := s.store.ListListingTransitions(listingID)
	for _, t := range transitions {
		if t.NewState == domain.ListingStatePublished {
			return t.CreatedAt
		}
	}
	return fallback
}

// handlePublicShelterPetDetail returns a single listing for the
// public detail page. Enforces every spec rule:
//   - 404 if the listing isn't `published` (paused/adopted/archived
//     all behave identically to "not found" for the public surface)
//   - microchip ID is never exposed; only a boolean flag
//   - shelter mini-card + jurisdiction disclosure bundled so the UI
//     renders in one round-trip
//   - banned-breed listings already filtered out since they can't
//     reach `published` state
func (s *Server) handlePublicShelterPetDetail(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	petID := strings.TrimSpace(chi.URLParam(r, "petID"))
	sh, err := s.store.GetShelterBySlug(slug)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	pet, err := s.store.GetShelterPet(petID)
	if err != nil || pet == nil || pet.ShelterID != sh.ID ||
		pet.ListingState != domain.ListingStatePublished ||
		pet.DeletedAt != "" {
		// Paused / adopted / archived / rejected / soft-deleted all
		// collapse to 404 per spec — the page must not leak the
		// listing's current state to a public viewer.
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}

	// Strip anything that shouldn't leak. Microchip ID is the critical
	// one — never expose to adopters; the `microchipPresent` flag is
	// all the UI needs to render the badge.
	microchipPresent := strings.TrimSpace(pet.MicrochipID) != ""
	pet.MicrochipID = ""
	pet.AutoFlagReasons = nil
	pet.LastRejectionCode = ""
	pet.LastRejectionNote = ""
	pet.AdopterName = ""
	pet.AdoptionDate = ""
	pet.AdoptionNotes = ""
	pet.ShelterName = sh.Name
	pet.ShelterCity = sh.CityLabel
	pet.ShelterVerified = sh.VerifiedAt != ""
	pet.PublishedAt = earliestPublishedAt(s, pet.ID, pet.CreatedAt)

	// Optional distance enrichment — same lat/lng protocol as the list.
	if latStr := r.URL.Query().Get("lat"); latStr != "" {
		if lat, err := strconv.ParseFloat(latStr, 64); err == nil {
			if lngStr := r.URL.Query().Get("lng"); lngStr != "" {
				if lng, err := strconv.ParseFloat(lngStr, 64); err == nil &&
					sh.Latitude != 0 && sh.Longitude != 0 {
					d := haversineKm(lat, lng, sh.Latitude, sh.Longitude)
					pet.DistanceKm = &d
				}
			}
		}
	}

	// Shelter mini-card — strip contact channels; verified-shelter
	// profile page is the canonical "contact" surface.
	mini := *sh
	mini.Email = ""
	mini.Phone = ""

	// Jurisdiction disclosure — nil for unsupported countries.
	disclosure := domain.DisclosureForCountry(sh.OperatingCountry)

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"pet":              pet,
			"microchipPresent": microchipPresent,
			"shelter":          mini,
			"disclosure":       disclosure,
		},
	})
}

// handlePublicListFeaturedShelters returns the admin-curated list of
// verified shelters for the fetcht discovery home's "Featured" rail.
// Server caps at 10 rows; contact channels stripped.
func (s *Server) handlePublicListFeaturedShelters(w http.ResponseWriter, r *http.Request) {
	shelters := s.store.ListFeaturedShelters(10)
	for i := range shelters {
		shelters[i].MustChangePassword = false
		shelters[i].LastLoginAt = ""
		shelters[i].Email = ""
		shelters[i].Phone = ""
		shelters[i].Address = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": shelters})
}

// handleAdminSetShelterFeatured flips the is_featured flag. Platform
// admins only; body is {featured: bool}.
func (s *Server) handleAdminSetShelterFeatured(w http.ResponseWriter, r *http.Request) {
	shelterID := chi.URLParam(r, "shelterID")
	var body struct {
		Featured bool `json:"featured"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := s.store.SetShelterFeatured(shelterID, body.Featured); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "featured": body.Featured})
}

// handlePublicShelterRecentlyAdopted returns the last ten adopted
// listings — only if the shelter has opted into the section via
// `showRecentlyAdopted`. Hidden by default.
func (s *Server) handlePublicShelterRecentlyAdopted(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	sh, err := s.store.GetShelterBySlug(slug)
	if err != nil || sh == nil {
		writeError(w, http.StatusNotFound, "shelter not found")
		return
	}
	if !sh.ShowRecentlyAdopted {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	out := s.store.ListRecentlyAdopted(sh.ID, 10)
	// Same stripping as the pets endpoint.
	for i := range out {
		out[i].AutoFlagReasons = nil
		out[i].LastRejectionCode = ""
		out[i].LastRejectionNote = ""
		out[i].AdopterName = ""
		out[i].AdoptionDate = ""
		out[i].AdoptionNotes = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}
