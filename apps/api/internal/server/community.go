package server

import (
	"fmt"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
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
	posts := s.store.ListPostsAdmin()
	var photos []string
	for _, p := range posts {
		if p.VenueID != nil && *p.VenueID == venueID && p.ImageURL != nil {
			photos = append(photos, *p.ImageURL)
		}
	}
	// Also include venue's own imageUrl
	if v, err := s.store.GetVenue(venueID); err == nil && v.ImageURL != nil {
		photos = append([]string{*v.ImageURL}, photos...)
	}
	if photos == nil {
		photos = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": photos})
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
