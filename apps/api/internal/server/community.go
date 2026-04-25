package server

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

func (s *Server) handleHomeFeed(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListHomeFeed(currentUserID(request))})
}

func (s *Server) handleHomePostCreate(writer http.ResponseWriter, request *http.Request) {
	var payload store.PostInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	post, err := s.store.CreatePost(currentUserID(request), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": post})
}

func (s *Server) handleHomePostLikeToggle(writer http.ResponseWriter, request *http.Request) {
	post, err := s.store.TogglePostLike(currentUserID(request), chi.URLParam(request, "postID"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": post})
}

func (s *Server) handleCheckInHistory(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	venues := s.store.ListVenues()

	type checkInRecord struct {
		VenueID     string `json:"venueId"`
		VenueName   string `json:"venueName"`
		CheckedInAt string `json:"checkedInAt"`
		PetNames    []string `json:"petNames"`
	}

	var history []checkInRecord
	for _, v := range venues {
		for _, ci := range v.CurrentCheckIns {
			if ci.UserID == userID {
				history = append(history, checkInRecord{
					VenueID:     v.ID,
					VenueName:   v.Name,
					CheckedInAt: ci.CheckedInAt,
					PetNames:    ci.PetNames,
				})
			}
		}
	}
	if history == nil {
		history = []checkInRecord{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": history})
}

func (s *Server) handleExploreVenues(writer http.ResponseWriter, request *http.Request) {
	venues := s.store.ListVenues()

	latStr := request.URL.Query().Get("lat")
	lngStr := request.URL.Query().Get("lng")
	if latStr != "" && lngStr != "" {
		var userLat, userLng float64
		fmt.Sscanf(latStr, "%f", &userLat)
		fmt.Sscanf(lngStr, "%f", &userLng)
		if userLat != 0 && userLng != 0 {
			sort.Slice(venues, func(i, j int) bool {
				distI := service.Haversine(userLat, userLng, venues[i].Latitude, venues[i].Longitude)
				distJ := service.Haversine(userLat, userLng, venues[j].Latitude, venues[j].Longitude)
				return distI < distJ
			})
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": venues})
}

func (s *Server) handleExploreCheckIn(writer http.ResponseWriter, request *http.Request) {
	var payload store.VenueCheckInInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	// Proximity validation
	venueData, err := s.store.GetVenue(payload.VenueID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	if payload.Latitude != 0 || payload.Longitude != 0 {
		dist := service.Haversine(payload.Latitude, payload.Longitude, venueData.Latitude, venueData.Longitude)
		if dist > 0.5 {
			writeError(writer, http.StatusBadRequest, "You must be within 500m of the venue to check in")
			return
		}
	}

	venue, err := s.store.CheckInVenue(currentUserID(request), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": venue})
}

func (s *Server) handleExploreEvents(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListEvents()})
}

// v0.11.0 — unified Discover feed.
// The mobile Events tab pulls admin-created events and user-created playdates
// from a single endpoint so the client can merge/sort them without two
// round-trips.
func (s *Server) handleExploreFeed(writer http.ResponseWriter, request *http.Request) {
	params := store.ListPlaydatesParams{
		UserID: currentUserID(request),
	}
	if v := request.URL.Query().Get("lat"); v != "" {
		fmt.Sscanf(v, "%f", &params.Lat)
	}
	if v := request.URL.Query().Get("lng"); v != "" {
		fmt.Sscanf(v, "%f", &params.Lng)
	}
	events, playdates := s.store.ListExploreFeed(params)
	writeJSON(writer, http.StatusOK, map[string]any{
		"data": map[string]any{
			"events":    events,
			"playdates": playdates,
		},
	})
}

func (s *Server) handleExploreEventRSVP(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		PetIDs []string `json:"petIds"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	event, err := s.store.RSVPEvent(currentUserID(request), chi.URLParam(request, "eventID"), payload.PetIDs)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": event})
}

func (s *Server) handleVenuePhotos(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	// v0.13.7 — gallery respects admin curation (extra photos) and the
	// per-venue hide flag on tagged-post photos. The store orders results:
	// cover → admin-curated → post photos (newest first).
	photos := s.store.ListVenuePhotoUrls(venueID)
	if photos == nil {
		photos = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": photos})
}

// handleAdminVenuePhotos returns the full photo manifest for the admin
// venue detail page, including hidden post photos so the curator can
// un-hide them.
func (s *Server) handleAdminVenuePhotos(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListVenuePhotosManage(venueID)})
}

// handleAdminVenueAddPhoto curates a new photo onto the venue. The image is
// already uploaded to R2 via the shared /media/presign flow; the body just
// carries the public URL.
func (s *Server) handleAdminVenueAddPhoto(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	var payload struct {
		URL string `json:"url"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	entry, err := s.store.AddVenueAdminPhoto(venueID, payload.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": entry})
}

func (s *Server) handleAdminVenueDeletePhoto(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	photoID := chi.URLParam(r, "photoID")
	if err := s.store.DeleteVenueAdminPhoto(venueID, photoID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminVenueSetPostPhotoHidden(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	postID := chi.URLParam(r, "postID")
	var payload struct {
		Hidden bool `json:"hidden"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.store.SetVenuePostPhotoHidden(venueID, postID, payload.Hidden); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"hidden": payload.Hidden}})
}

// handleVenueDetail returns a venue augmented with aggregate stats and
// (optionally) distance from the caller. Drives the mobile venue detail page.
func (s *Server) handleVenueDetail(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	v, err := s.store.GetVenue(venueID)
	if err != nil {
		writeError(w, http.StatusNotFound, "venue not found")
		return
	}

	detail := domain.VenueDetail{
		ExploreVenue: *v,
		Stats:        s.store.GetVenueStats(venueID),
	}
	if lat, lng, ok := parseLatLngQuery(r); ok {
		d := service.Haversine(lat, lng, v.Latitude, v.Longitude)
		detail.DistanceKm = &d
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": detail})
}

// handleVenuePostsFeed returns photo-bearing posts tagged to the venue.
func (s *Server) handleVenuePostsFeed(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	limit := parseLimit(r, 50, 200)
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListVenuePostsWithPhotos(venueID, limit)})
}

// handleVenueCheckInsList returns check-ins for a venue by mode.
// Query params: ?mode=active|history|all&limit=50
func (s *Server) handleVenueCheckInsList(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	mode := r.URL.Query().Get("mode")
	if mode != "active" && mode != "history" && mode != "all" {
		mode = "active"
	}
	limit := parseLimit(r, 50, 200)
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListVenueCheckInsScoped(venueID, mode, limit)})
}

// handleVenueReviewSummary returns the rating aggregate used by the card and
// the reviews section of the detail page (subset of VenueStats).
func (s *Server) handleVenueReviewSummary(w http.ResponseWriter, r *http.Request) {
	stats := s.store.GetVenueStats(chi.URLParam(r, "venueID"))
	writeJSON(w, http.StatusOK, map[string]any{"data": stats})
}

// handleVenueReviewEligibility tells the client whether the current user can
// post a review — used to toggle the "Write a review" CTA.
func (s *Server) handleVenueReviewEligibility(w http.ResponseWriter, r *http.Request) {
	venueID := chi.URLParam(r, "venueID")
	uid := currentUserID(r)

	if !s.store.UserHasCheckedIn(venueID, uid) {
		writeJSON(w, http.StatusOK, map[string]any{
			"data": domain.ReviewEligibility{Eligible: false, Reason: "no_check_in"},
		})
		return
	}
	if s.store.UserHasReviewed(venueID, uid) {
		writeJSON(w, http.StatusOK, map[string]any{
			"data": domain.ReviewEligibility{Eligible: false, Reason: "already_reviewed"},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": domain.ReviewEligibility{Eligible: true},
	})
}

// parseLatLngQuery reads ?lat=&lng= from the request; returns ok=false if
// either value is missing or unparseable.
func parseLatLngQuery(r *http.Request) (float64, float64, bool) {
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

// parseLimit reads a ?limit= query param bounded by max, falling back to def.
func parseLimit(r *http.Request, def, max int) int {
	raw := r.URL.Query().Get("limit")
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func (s *Server) handleAdminPosts(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPostsAdmin()})
}

func (s *Server) handleAdminDeletePost(writer http.ResponseWriter, request *http.Request) {
	postID := chi.URLParam(request, "postID")
	if err := s.store.DeletePost(postID); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]string{"id": postID}})
}

func (s *Server) handleAdminVenues(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListVenues()})
}

func (s *Server) handleAdminVenueUpsert(writer http.ResponseWriter, request *http.Request) {
	var payload store.VenueInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if payload.Latitude == 0 && payload.Longitude == 0 && payload.Address != "" {
		if geo, err := service.Geocode(payload.Address); err == nil {
			payload.Latitude = geo.Lat
			payload.Longitude = geo.Lng
		}
	}

	venue := s.store.UpsertVenue("", payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": venue})
}

func (s *Server) handleAdminVenueUpdate(writer http.ResponseWriter, request *http.Request) {
	venueID := chi.URLParam(request, "venueID")
	var payload store.VenueInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if payload.Latitude == 0 && payload.Longitude == 0 && payload.Address != "" {
		if geo, err := service.Geocode(payload.Address); err == nil {
			payload.Latitude = geo.Lat
			payload.Longitude = geo.Lng
		}
	}

	venue := s.store.UpsertVenue(venueID, payload)
	writeJSON(writer, http.StatusOK, map[string]any{"data": venue})
}

func (s *Server) handleAdminVenueDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteVenue(chi.URLParam(request, "venueID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminEvents(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListEvents()})
}

func (s *Server) handleAdminEventUpsert(writer http.ResponseWriter, request *http.Request) {
	var payload store.EventInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	event, err := s.store.UpsertEvent("", payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": event})
}

func (s *Server) handleAdminEventDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteEvent(chi.URLParam(request, "eventID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}
