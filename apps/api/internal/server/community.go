package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
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

func (s *Server) handleExploreVenues(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListVenues()})
}

func (s *Server) handleExploreCheckIn(writer http.ResponseWriter, request *http.Request) {
	var payload store.VenueCheckInInput
	if !decodeJSON(writer, request, &payload) {
		return
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

func (s *Server) handleAdminPosts(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPostsAdmin()})
}

func (s *Server) handleAdminVenues(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListVenues()})
}

func (s *Server) handleAdminVenueUpsert(writer http.ResponseWriter, request *http.Request) {
	var payload store.VenueInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	venue := s.store.UpsertVenue("", payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": venue})
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
