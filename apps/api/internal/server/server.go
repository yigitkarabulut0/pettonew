package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/chat"
	"github.com/yigitkarabulut/petto/apps/api/internal/config"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

type contextKey string

const userIDKey contextKey = "userID"

type Server struct {
	cfg   config.Config
	store store.Store
	hub   *chat.Hub
}

func New(cfg config.Config, dataStore store.Store) *Server {
	return &Server{
		cfg:   cfg,
		store: dataStore,
		hub:   chat.NewHub(),
	}
}

func (s *Server) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(s.cors)
	router.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadsDir))))

	router.Get("/healthz", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})

	router.Route("/v1", func(router chi.Router) {
		router.Route("/auth", func(router chi.Router) {
			router.Post("/register", s.handleRegister)
			router.Post("/login", s.handleLogin)
			router.Post("/refresh", s.handleRefresh)
			router.Post("/verify-email/request", s.handleVerifyRequest)
			router.Post("/verify-email/confirm", s.handleVerifyConfirm)
			router.Post("/forgot-password", s.handleForgotPassword)
			router.Post("/reset-password", s.handleResetPassword)
		})

		router.Group(func(router chi.Router) {
			router.Use(s.appAuth)
			router.Get("/me", s.handleMe)
			router.Put("/me/profile", s.handleUpdateProfile)
			router.Get("/me/pets", s.handleListPets)
			router.Post("/me/pets", s.handleCreatePet)
			router.Put("/me/pets/{petID}", s.handleUpdatePet)
			router.Patch("/me/pets/{petID}/visibility", s.handlePetVisibility)
			router.Get("/pets/{petID}", s.handleGetPet)
			router.Get("/taxonomies/{kind}", s.handleTaxonomyList)
			router.Get("/discovery/feed", s.handleDiscoveryFeed)
			router.Post("/swipes", s.handleSwipe)
			router.Get("/matches", s.handleMatches)
			router.Get("/conversations", s.handleConversations)
			router.Get("/messages", s.handleMessages)
			router.Post("/messages", s.handleSendMessage)
			router.Post("/messages/read", s.handleMarkMessagesRead)
			router.Post("/conversations/dm", s.handleCreateDirectConversation)
			router.Get("/home/feed", s.handleHomeFeed)
			router.Post("/home/posts", s.handleHomePostCreate)
			router.Post("/home/posts/{postID}/likes", s.handleHomePostLikeToggle)
			router.Get("/me/check-in-history", s.handleCheckInHistory)
			router.Get("/explore/venues", s.handleExploreVenues)
			router.Post("/explore/check-ins", s.handleExploreCheckIn)
			router.Get("/explore/events", s.handleExploreEvents)
			router.Post("/explore/events/{eventID}/rsvps", s.handleExploreEventRSVP)
			router.Get("/discover/nearby", s.handleNearbyPets)
			router.Get("/ws", s.handleWebSocket)
			router.Get("/pets/{petID}/diary", s.handleListDiary)
			router.Post("/pets/{petID}/diary", s.handleCreateDiaryEntry)
			router.Get("/favorites", s.handleListFavorites)
			router.Post("/favorites", s.handleAddFavorite)
			router.Delete("/favorites/{petID}", s.handleRemoveFavorite)
			router.Get("/users/{userID}/profile", s.handlePublicUserProfile)
			router.Post("/blocks", s.handleBlockUser)
			router.Post("/reports", s.handleReport)
			router.Post("/push-token", s.handleSavePushToken)
			router.Post("/media/upload", s.handleUpload)
			router.Post("/media/presign", s.handleMediaPresign)
			// Health
			router.Get("/pets/{petID}/health", s.handleListHealth)
			router.Post("/pets/{petID}/health", s.handleCreateHealth)
			router.Delete("/pets/{petID}/health/{recordID}", s.handleDeleteHealth)
			// Weight
			router.Get("/pets/{petID}/weight", s.handleListWeight)
			router.Post("/pets/{petID}/weight", s.handleCreateWeight)
			// Vet
			router.Get("/vet-contacts", s.handleListVetContacts)
			router.Post("/vet-contacts", s.handleCreateVetContact)
			router.Delete("/vet-contacts/{contactID}", s.handleDeleteVetContact)
			// Feeding
			router.Get("/pets/{petID}/feeding", s.handleListFeeding)
			router.Post("/pets/{petID}/feeding", s.handleCreateFeeding)
			router.Delete("/pets/{petID}/feeding/{scheduleID}", s.handleDeleteFeeding)
			// Playdates
			router.Get("/playdates", s.handleListPlaydates)
			router.Post("/playdates", s.handleCreatePlaydate)
			router.Post("/playdates/{playdateID}/join", s.handleJoinPlaydate)
			// Groups
			router.Get("/groups", s.handleListGroups)
			router.Post("/groups", s.handleCreateGroup)
			router.Post("/groups/{groupID}/join", s.handleJoinGroup)
			router.Post("/groups/{groupID}/leave", s.handleLeaveGroup)
			router.Post("/groups/join-by-code", s.handleJoinGroupByCode)
			router.Get("/groups/conversation/{conversationID}", s.handleGetGroupByConversation)
			// Lost pets
			router.Get("/lost-pets", s.handleListLostPets)
			router.Post("/lost-pets", s.handleCreateLostPet)
			router.Patch("/lost-pets/{alertID}", s.handleUpdateLostPetStatus)
			// Badges
			router.Get("/badges", s.handleListBadges)
			// Training tips
			router.Get("/training-tips", s.handleListTrainingTips)
			router.Get("/training-tips/{tipID}", s.handleGetTrainingTip)
			router.Post("/training-tips/{tipID}/bookmark", s.handleBookmarkTip)
			router.Delete("/training-tips/{tipID}/bookmark", s.handleUnbookmarkTip)
			router.Post("/training-tips/{tipID}/complete", s.handleCompleteTip)
			// Vet clinics nearby
			router.Get("/vet-clinics", s.handleListVetClinicsNearby)
			// Venue reviews
			router.Get("/venues/{venueID}/photos", s.handleVenuePhotos)
			router.Get("/venues/{venueID}/reviews", s.handleListVenueReviews)
			router.Post("/venues/{venueID}/reviews", s.handleCreateVenueReview)
			// Pet sitters
			router.Get("/pet-sitters", s.handleListPetSitters)
			router.Post("/pet-sitters", s.handleCreatePetSitter)
			// Walk routes
			router.Get("/walk-routes", s.handleListWalkRoutes)
			// Adoptions
			router.Get("/adoptions", s.handleListAdoptions)
			router.Post("/adoptions", s.handleCreateAdoption)
			router.Patch("/adoptions/{listingID}", s.handleUpdateMyAdoption)
			router.Delete("/adoptions/{listingID}", s.handleDeleteMyAdoption)
			// Pet albums
			router.Get("/pets/{petID}/albums", s.handleListPetAlbums)
			router.Post("/pets/{petID}/albums", s.handleCreatePetAlbum)
			// Pet milestones
			router.Get("/pets/{petID}/milestones", s.handleListPetMilestones)
			// Group messages
			router.Get("/groups/{groupID}", s.handleGetGroup)
			router.Get("/groups/{groupID}/messages", s.handleListGroupMessages)
			router.Post("/groups/{groupID}/messages", s.handleSendGroupMessage)
			router.Delete("/groups/{groupID}/messages/{messageID}", s.handleDeleteGroupMessage)
			router.Post("/groups/{groupID}/messages/{messageID}/pin", s.handlePinGroupMessage)
			router.Delete("/groups/{groupID}/messages/{messageID}/pin", s.handleUnpinGroupMessage)
			router.Get("/groups/{groupID}/pinned", s.handleListGroupPinned)
			router.Get("/groups/{groupID}/preview", s.handleGroupChatPreview)
			router.Post("/groups/{groupID}/mutes", s.handleMuteGroupMember)
			router.Delete("/groups/{groupID}/mutes/{userID}", s.handleUnmuteGroupMember)
			router.Delete("/groups/{groupID}/members/{userID}", s.handleKickGroupMember)
			router.Post("/groups/{groupID}/admins/{userID}", s.handlePromoteGroupAdmin)
			router.Delete("/groups/{groupID}/admins/{userID}", s.handleDemoteGroupAdmin)
		})

		router.Get("/media/proxy", s.handleMediaProxy)

		router.Route("/admin", func(router chi.Router) {
			router.Post("/auth/login", s.handleAdminLogin)
			router.Group(func(router chi.Router) {
				router.Use(s.adminAuth)
				router.Get("/dashboard", s.handleAdminDashboard)
				router.Get("/users", s.handleAdminUsers)
				router.Get("/users/{userID}", s.handleAdminUserDetail)
				router.Patch("/users/{userID}", s.handleAdminUserUpdate)
				router.Delete("/users/{userID}", s.handleAdminUserDelete)
				router.Get("/pets", s.handleAdminPets)
				router.Get("/pets/{petID}", s.handleAdminPetDetail)
				router.Patch("/pets/{petID}", s.handleAdminPetUpdate)
				router.Get("/posts", s.handleAdminPosts)
				router.Delete("/posts/{postID}", s.handleAdminDeletePost)
				router.Get("/venues", s.handleAdminVenues)
				router.Post("/venues", s.handleAdminVenueUpsert)
				router.Put("/venues/{venueID}", s.handleAdminVenueUpdate)
				router.Delete("/venues/{venueID}", s.handleAdminVenueDelete)
				router.Get("/events", s.handleAdminEvents)
				router.Post("/events", s.handleAdminEventUpsert)
				router.Delete("/events/{eventID}", s.handleAdminEventDelete)
				router.Get("/taxonomies/{kind}", s.handleAdminTaxonomyList)
				router.Post("/taxonomies/{kind}", s.handleAdminTaxonomyUpsert)
				router.Delete("/taxonomies/{kind}/{itemID}", s.handleAdminTaxonomyDelete)
				router.Get("/reports", s.handleAdminReports)
				router.Get("/reports/{reportID}", s.handleAdminReportDetail)
				router.Post("/reports/{reportID}/resolve", s.handleAdminResolveReport)
				router.Get("/notifications", s.handleAdminListNotifications)
				router.Post("/notifications/send", s.handleAdminSendNotification)

				// Pet care data
				router.Get("/pets/{petID}/health", s.handleAdminPetHealth)
				router.Get("/pets/{petID}/weight", s.handleAdminPetWeight)
				router.Get("/pets/{petID}/feeding", s.handleAdminPetFeeding)
				router.Get("/pets/{petID}/diary", s.handleAdminPetDiary)
				router.Delete("/pets/{petID}/health/{recordID}", s.handleAdminDeleteHealthRecord)

				// Training tips
				router.Get("/training-tips", s.handleAdminTrainingTips)
				router.Post("/training-tips", s.handleAdminCreateTrainingTip)
				router.Put("/training-tips/{tipID}", s.handleAdminUpdateTrainingTip)
				router.Delete("/training-tips/{tipID}", s.handleAdminDeleteTrainingTip)

				// Vet clinics
				router.Get("/vet-clinics", s.handleAdminListVetClinics)
				router.Post("/vet-clinics", s.handleAdminCreateVetClinic)
				router.Delete("/vet-clinics/{clinicID}", s.handleAdminDeleteVetClinic)

				// Pet sitters
				router.Get("/pet-sitters", s.handleAdminPetSitters)
				router.Post("/pet-sitters", s.handleAdminCreatePetSitter)
				router.Delete("/pet-sitters/{sitterID}", s.handleAdminDeletePetSitter)

				// Walk routes
				router.Get("/walk-routes", s.handleAdminListWalkRoutes)
				router.Post("/walk-routes", s.handleAdminCreateWalkRoute)
				router.Delete("/walk-routes/{routeID}", s.handleAdminDeleteWalkRoute)
				// Adoptions
				router.Get("/adoptions", s.handleAdminListAdoptions)
				router.Patch("/adoptions/{listingID}", s.handleAdminUpdateAdoption)
				router.Delete("/adoptions/{listingID}", s.handleAdminDeleteAdoption)

				// Playdates
				router.Get("/playdates", s.handleAdminPlaydates)
				router.Delete("/playdates/{playdateID}", s.handleAdminDeletePlaydate)

				// Groups
				router.Get("/groups", s.handleAdminGroups)
				router.Post("/groups", s.handleAdminCreateGroup)
				router.Delete("/groups/{groupID}", s.handleAdminDeleteGroup)

				// Lost pets
				router.Get("/lost-pets", s.handleAdminLostPets)
				router.Patch("/lost-pets/{alertID}", s.handleAdminUpdateLostPet)

				// Badges
				router.Get("/badges", s.handleAdminBadges)

				// Media (reuse app handler)
				router.Post("/media/presign", s.handleMediaPresign)
			})
		})
	})

	return router
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
	})
}

func (s *Server) appAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		userID, err := s.authenticate(request, s.cfg.JWTAccessSecret, "app")
		if err != nil {
			writeError(writer, http.StatusUnauthorized, err.Error())
			return
		}

		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), userIDKey, userID)))
	})
}

func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		userID, err := s.authenticate(request, s.cfg.AdminJWTSecret, "admin")
		if err != nil {
			writeError(writer, http.StatusUnauthorized, err.Error())
			return
		}

		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), userIDKey, userID)))
	})
}

func (s *Server) authenticate(request *http.Request, secret string, expectedKind string) (string, error) {
	header := request.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", errors.New("missing bearer token")
	}

	claims, err := auth.ParseToken(secret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return "", errors.New("invalid token")
	}
	if claims.Kind != expectedKind {
		return "", errors.New("invalid token kind")
	}

	return claims.UserID, nil
}

func (s *Server) issueAppSession(userID string) (map[string]any, error) {
	accessToken, err := auth.CreateToken(s.cfg.JWTAccessSecret, userID, "app", "petto-mobile", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	refreshToken, err := auth.CreateToken(s.cfg.JWTRefreshSecret, userID, "app-refresh", "petto-mobile", 30*24*time.Hour)
	if err != nil {
		return nil, err
	}
	user, err := s.store.GetUser(userID)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"user": user.Profile,
		"tokens": map[string]any{
			"accessToken":      accessToken,
			"refreshToken":     refreshToken,
			"expiresInSeconds": 900,
		},
	}, nil
}

func (s *Server) issueAdminSession(adminID string) (map[string]any, error) {
	accessToken, err := auth.CreateToken(s.cfg.AdminJWTSecret, adminID, "admin", "petto-admin", 8*time.Hour)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"accessToken": accessToken,
		"expiresIn":   28800,
	}, nil
}

func (s *Server) handleRegister(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	user, _, err := s.store.Register(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.issueAppSession(user.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": session})
}

func (s *Server) handleVerifyRequest(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusNotImplemented, "email verification delivery is not configured")
}

func (s *Server) handleVerifyConfirm(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusGone, "email verification is not required for the current local setup")
}

func (s *Server) handleLogin(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	user, err := s.store.Login(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, err.Error())
		return
	}

	session, err := s.issueAppSession(user.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleRefresh(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		RefreshToken string `json:"refreshToken"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	claims, err := auth.ParseToken(s.cfg.JWTRefreshSecret, payload.RefreshToken)
	if err != nil || claims.Kind != "app-refresh" {
		writeError(writer, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	session, err := s.issueAppSession(claims.UserID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleForgotPassword(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusNotImplemented, "password reset delivery is not configured")
}

func (s *Server) handleResetPassword(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.ResetPassword(payload.Token, payload.NewPassword); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"reset": true}})
}

func (s *Server) handleMe(writer http.ResponseWriter, request *http.Request) {
	user, err := s.store.GetUser(currentUserID(request))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": user.Profile})
}

func (s *Server) handleUpdateProfile(writer http.ResponseWriter, request *http.Request) {
	var payload store.UpdateProfileInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	profile, err := s.store.UpdateProfile(currentUserID(request), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": profile})
}

func (s *Server) handleListPets(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPets(currentUserID(request))})
}

func (s *Server) handleGetPet(writer http.ResponseWriter, request *http.Request) {
	petID := chi.URLParam(request, "petID")
	pet, err := s.store.GetPet(petID)
	if err != nil || pet == nil {
		writeError(writer, http.StatusNotFound, "pet not found")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": pet})
}

func (s *Server) handleCreatePet(writer http.ResponseWriter, request *http.Request) {
	var payload store.PetInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	pet, err := s.store.UpsertPet(currentUserID(request), "", payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": pet})
}

func (s *Server) handleUpdatePet(writer http.ResponseWriter, request *http.Request) {
	var payload store.PetInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	pet, err := s.store.UpsertPet(currentUserID(request), chi.URLParam(request, "petID"), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": pet})
}

func (s *Server) handlePetVisibility(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Hidden bool `json:"hidden"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	petID := chi.URLParam(request, "petID")
	userID := currentUserID(request)
	pets := s.store.ListPets(userID)
	owned := false
	for _, p := range pets {
		if p.ID == petID {
			owned = true
			break
		}
	}
	if !owned {
		writeError(writer, http.StatusForbidden, "pet does not belong to you")
		return
	}

	if err := s.store.SetPetVisibility(petID, payload.Hidden); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleTaxonomyList(writer http.ResponseWriter, request *http.Request) {
	lang := request.URL.Query().Get("lang")
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"), lang)})
}

func (s *Server) handleDiscoveryFeed(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	petID := request.URL.Query().Get("petId")
	if petID != "" {
		writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.DiscoveryFeedForPet(userID, petID)})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.DiscoveryFeed(userID)})
}

func (s *Server) handleSwipe(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ActorPetID  string `json:"actorPetId"`
		TargetPetID string `json:"targetPetId"`
		Direction   string `json:"direction"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)

	// Send like notification to target pet's owner (before match check)
	if payload.Direction == "like" || payload.Direction == "super-like" {
		targetOwnerID := s.store.GetPetOwnerID(payload.TargetPetID)
		if targetOwnerID != "" && targetOwnerID != userID {
			s.store.SaveNotification(domain.Notification{
				ID: fmt.Sprintf("notif-%d", time.Now().UnixNano()), Title: "Someone liked your pet! ❤️",
				Body: "Your pet got a new like!", Target: targetOwnerID,
				SentAt: time.Now().UTC().Format(time.RFC3339), SentBy: "system",
			})
			likeTokens := s.store.GetUserPushTokens(targetOwnerID)
			var likePushTokens []string
			for _, t := range likeTokens {
				likePushTokens = append(likePushTokens, t.Token)
			}
			if len(likePushTokens) > 0 {
				go func() {
					if err := service.SendExpoPush(likePushTokens, "New Like! ❤️", "Someone liked your pet!", map[string]string{"type": "like"}); err != nil {
						log.Printf("[PUSH-LIKE] error: %v", err)
					}
				}()
			} else {
				log.Printf("[PUSH-LIKE] no tokens for user %s", targetOwnerID)
			}
		}
	}

	match, err := s.store.CreateSwipe(userID, payload.ActorPetID, payload.TargetPetID, payload.Direction)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	if match != nil {
		// Build notification body with pet names and actor's owner name
		matchBody := fmt.Sprintf("%s and %s matched! Start chatting.", match.Pet.Name, match.MatchedPet.Name)
		s.store.SaveNotification(domain.Notification{
			ID: fmt.Sprintf("notif-%d", time.Now().UnixNano()), Title: "New Match! 🎉", Body: matchBody,
			Target: match.MatchedPet.OwnerID, SentAt: time.Now().UTC().Format(time.RFC3339), SentBy: "system",
		})
		matchTokens := s.store.GetUserPushTokens(match.MatchedPet.OwnerID)
		var pushTokens []string
		for _, t := range matchTokens {
			pushTokens = append(pushTokens, t.Token)
		}
		if len(pushTokens) > 0 {
			go func() {
				if err := service.SendExpoPush(pushTokens, "New Match! 🎉", matchBody, map[string]string{"type": "match", "conversationId": match.ConversationID}); err != nil {
					log.Printf("[PUSH-MATCH] error: %v", err)
				}
			}()
		} else {
			log.Printf("[PUSH-MATCH] no tokens for user %s", match.MatchedPet.OwnerID)
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{"match": match}})
}

func (s *Server) handleMatches(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	petID := request.URL.Query().Get("petId")
	if petID != "" {
		writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMatchesByPet(userID, petID)})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMatches(userID)})
}

func (s *Server) handleConversations(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListConversations(currentUserID(request))})
}

func (s *Server) handleMessages(writer http.ResponseWriter, request *http.Request) {
	conversationID := request.URL.Query().Get("conversationId")
	messages, err := s.store.ListMessages(currentUserID(request), conversationID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleSendMessage(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ConversationID string         `json:"conversationId"`
		Type           string         `json:"type"`
		Body           string         `json:"body"`
		ImageURL       string         `json:"imageUrl"`
		Metadata       map[string]any `json:"metadata"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	var message domain.Message
	var err error

	// If this conversation belongs to a community group, go through the
	// enriched group send path so mutes/types/metadata work the same in DM and
	// group messages. Otherwise fall back to the plain DM send.
	groupForConv := s.store.GetGroupByConversation(payload.ConversationID)
	if groupForConv != nil && (payload.Type == "image" || payload.Type == "pet_share" || payload.Type == "text") {
		if payload.Type == "" {
			payload.Type = "text"
		}
		message, err = s.store.SendGroupMessageEx(userID, groupForConv.ID, store.SendGroupMessageInput{
			Type:     payload.Type,
			Body:     payload.Body,
			ImageURL: payload.ImageURL,
			Metadata: payload.Metadata,
		})
	} else {
		message, err = s.store.SendMessage(userID, payload.ConversationID, payload.Body)
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	_ = s.hub.Publish(payload.ConversationID, map[string]any{
		"type": "message.created",
		"data": message,
	})

	// Send push notifications to other users — fast path (no ListConversations)
	senderID := currentUserID(request)
	go func() {
		// Get conversation user_ids directly
		convUserIDs := s.store.GetConversationUserIDs(payload.ConversationID)

		// Check if group conversation
		groupInfo := s.store.GetGroupByConversation(payload.ConversationID)
		isGroup := groupInfo != nil

		for _, uid := range convUserIDs {
			if uid == senderID {
				continue
			}
			userTokens := s.store.GetUserPushTokens(uid)
			var tokens []string
			for _, t := range userTokens {
				tokens = append(tokens, t.Token)
			}
			if len(tokens) > 0 {
				// Type-aware body fallback: pet_share + image messages have
				// empty Body, so fall back to metadata/type so the push isn't
				// just "SenderName:" on its own.
				msgText := message.Body
				if msgText == "" {
					switch message.Type {
					case "pet_share":
						if pn, ok := message.Metadata["petName"].(string); ok && pn != "" {
							msgText = "🐾 Shared " + pn
						} else {
							msgText = "🐾 Shared a pet"
						}
					case "image":
						msgText = "📷 Photo"
					}
				}
				var title, body string
				if isGroup {
					title = groupInfo.Name
					body = message.SenderName + ": " + msgText
				} else {
					title = message.SenderName
					body = msgText
				}
				service.SendExpoPush(tokens, title, body, map[string]string{
					"type": "message", "conversationId": payload.ConversationID,
				})
			}
		}
	}()

	writeJSON(writer, http.StatusCreated, map[string]any{"data": message})
}

func (s *Server) handleMarkMessagesRead(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ConversationID string `json:"conversationId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	s.store.MarkMessagesRead(userID, payload.ConversationID)

	_ = s.hub.Publish(payload.ConversationID, map[string]any{
		"type":   "messages.read",
		"userId": userID,
	})

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"ok": true}})
}

func (s *Server) handleCreateDirectConversation(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		TargetUserID string `json:"targetUserId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	if payload.TargetUserID == "" {
		writeError(writer, http.StatusBadRequest, "targetUserId is required")
		return
	}

	conversation, err := s.store.CreateOrFindDirectConversation(userID, payload.TargetUserID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": conversation})
}

func (s *Server) handleWebSocket(writer http.ResponseWriter, request *http.Request) {
	conversationID := request.URL.Query().Get("conversationId")
	if conversationID == "" {
		writeError(writer, http.StatusBadRequest, "conversationId is required")
		return
	}

	userID := currentUserID(request)

	connection, err := websocket.Accept(writer, request, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return
	}
	defer connection.CloseNow()

	channel := s.hub.Subscribe(conversationID)
	defer s.hub.Unsubscribe(conversationID, channel)

	ctx := request.Context()
	go func() {
		for {
			_, data, err := connection.Read(ctx)
			if err != nil {
				return
			}
			var incoming struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(data, &incoming) == nil && incoming.Type == "typing" {
				s.hub.Publish(conversationID, map[string]any{
					"type":   "typing",
					"userId": userID,
				})
			}
		}
	}()

	for {
		select {
		case payload := <-channel:
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := connection.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (s *Server) verifyPetOwnership(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := currentUserID(r)
	petID := chi.URLParam(r, "petID")
	pets := s.store.ListPets(userID)
	for _, p := range pets {
		if p.ID == petID {
			return petID, true
		}
	}
	writeError(w, http.StatusForbidden, "not your pet")
	return "", false
}

func (s *Server) handleListDiary(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	entries := s.store.ListDiary(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": entries})
}

func (s *Server) handleCreateDiaryEntry(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}

	var payload struct {
		Body     string  `json:"body"`
		ImageURL *string `json:"imageUrl"`
		Mood     string  `json:"mood"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)

	entry := s.store.CreateDiaryEntry(userID, petID, payload.Body, payload.ImageURL, payload.Mood)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": entry})
}

func (s *Server) handleSavePushToken(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	s.store.SavePushToken(currentUserID(r), payload.Token, payload.Platform)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"saved": true}})
}

func (s *Server) handleListFavorites(writer http.ResponseWriter, request *http.Request) {
	pets := s.store.ListFavorites(currentUserID(request))
	if pets == nil {
		pets = []domain.Pet{}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": pets})
}

func (s *Server) handleAddFavorite(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		PetID string `json:"petId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.AddFavorite(currentUserID(request), payload.PetID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": map[string]bool{"saved": true}})
}

func (s *Server) handleRemoveFavorite(writer http.ResponseWriter, request *http.Request) {
	petID := chi.URLParam(request, "petID")
	if err := s.store.RemoveFavorite(currentUserID(request), petID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"removed": true}})
}

func (s *Server) handleBlockUser(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		TargetUserID string `json:"targetUserId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.BlockUser(currentUserID(request), payload.TargetUserID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"blocked": true}})
}

func (s *Server) handlePublicUserProfile(writer http.ResponseWriter, request *http.Request) {
	userID := chi.URLParam(request, "userID")
	user, err := s.store.GetUser(userID)
	if err != nil || user == nil {
		writeError(writer, http.StatusNotFound, "user not found")
		return
	}
	// Get visible pets
	allPets := s.store.ListPets(userID)
	visiblePets := make([]domain.Pet, 0)
	for _, p := range allPets {
		if !p.IsHidden {
			visiblePets = append(visiblePets, p)
		}
	}
	// Strip email for privacy
	profile := user.Profile
	// Get user's posts (with like state for the viewer)
	viewerID := currentUserID(request)
	posts := s.store.ListUserPosts(userID, viewerID)

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"user": map[string]any{
			"id":        profile.ID,
			"firstName": profile.FirstName,
			"lastName":  profile.LastName,
			"avatarUrl": profile.AvatarURL,
			"bio":       profile.Bio,
		},
		"pets":  visiblePets,
		"posts": posts,
	}})
}

func (s *Server) handleReport(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Reason      string `json:"reason"`
		TargetType  string `json:"targetType"`
		TargetID    string `json:"targetID"`
		TargetLabel string `json:"targetLabel"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if payload.TargetType == "pet" {
		pets := s.store.ListPets(currentUserID(request))
		for _, p := range pets {
			if p.ID == payload.TargetID {
				writeError(writer, http.StatusBadRequest, "cannot report your own pet")
				return
			}
		}
	}

	user, _ := s.store.GetUser(currentUserID(request))
	report, err := s.store.CreateReport(user.Profile.ID, user.Profile.FirstName, payload.Reason, payload.TargetType, payload.TargetID, payload.TargetLabel)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": report})
}

func (s *Server) handleNearbyPets(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	cards := s.store.DiscoveryFeed(userID)
	var nearby []domain.DiscoveryCard
	for _, card := range cards {
		nearby = append(nearby, card)
	}
	if nearby == nil {
		nearby = []domain.DiscoveryCard{}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": nearby})
}

func (s *Server) handleUpload(writer http.ResponseWriter, request *http.Request) {
	if err := request.ParseMultipartForm(10 << 20); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid upload payload")
		return
	}

	source, header, err := request.FormFile("file")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "file is required")
		return
	}
	defer source.Close()

	if err := os.MkdirAll(s.cfg.UploadsDir, 0o755); err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to prepare uploads directory")
		return
	}

	extension := filepath.Ext(header.Filename)
	if extension == "" {
		contentType := header.Header.Get("Content-Type")
		if contentType != "" {
			if extensions, lookupErr := mime.ExtensionsByType(contentType); lookupErr == nil && len(extensions) > 0 {
				extension = extensions[0]
			}
		}
	}
	if extension == "" {
		extension = ".jpg"
	}

	fileName := newUploadFileName(extension)
	targetPath := filepath.Join(s.cfg.UploadsDir, fileName)
	target, err := os.Create(targetPath)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to create uploaded file")
		return
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to store uploaded file")
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{
		"data": map[string]string{
			"id":  fileName,
			"url": strings.TrimRight(s.cfg.APIBaseURL, "/") + "/uploads/" + fileName,
		},
	})
}

func (s *Server) handleAdminLogin(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	admin, err := s.store.AdminLogin(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, err.Error())
		return
	}

	session, err := s.issueAdminSession(admin.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleAdminDashboard(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.Dashboard()})
}

func (s *Server) handleAdminUsers(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListUsers()})
}

func (s *Server) handleAdminUserUpdate(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Status    string  `json:"status"`
		FirstName string  `json:"firstName"`
		LastName  string  `json:"lastName"`
		Bio       *string `json:"bio"`
		CityLabel string  `json:"cityLabel"`
		Gender    string  `json:"gender"`
		BirthDate string  `json:"birthDate"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := chi.URLParam(request, "userID")

	if payload.Status != "" {
		if err := s.store.SuspendUser(userID, payload.Status); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
	}

	if payload.FirstName != "" || payload.LastName != "" || payload.Bio != nil || payload.CityLabel != "" || payload.Gender != "" || payload.BirthDate != "" {
		input := store.UpdateProfileInput{
			FirstName: payload.FirstName,
			LastName:  payload.LastName,
			Bio:       payload.Bio,
			Gender:    payload.Gender,
			CityLabel: payload.CityLabel,
			BirthDate: payload.BirthDate,
		}
		if _, err := s.store.UpdateProfile(userID, input); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminUserDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.UserDetail(chi.URLParam(request, "userID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminUserDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteUser(chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminPets(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListAllPets()})
}

func (s *Server) handleAdminPetDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.PetDetail(chi.URLParam(request, "petID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminPetUpdate(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Hidden bool `json:"hidden"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.SetPetVisibility(chi.URLParam(request, "petID"), payload.Hidden); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminTaxonomyList(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"), "")})
}

func (s *Server) handleAdminTaxonomyUpsert(writer http.ResponseWriter, request *http.Request) {
	var payload domain.TaxonomyItem
	if !decodeJSON(writer, request, &payload) {
		return
	}

	item := s.store.UpsertTaxonomy(chi.URLParam(request, "kind"), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": item})
}

func (s *Server) handleAdminTaxonomyDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteTaxonomy(chi.URLParam(request, "kind"), chi.URLParam(request, "itemID")); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminReports(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListReports()})
}

func (s *Server) handleAdminReportDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.GetReportDetail(chi.URLParam(request, "reportID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminResolveReport(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Notes string `json:"notes"`
	}
	_ = decodeJSON(writer, request, &payload)

	if err := s.store.ResolveReport(chi.URLParam(request, "reportID"), payload.Notes); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"resolved": true}})
}

func (s *Server) handleAdminListNotifications(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListNotifications()})
}

func (s *Server) handleAdminSendNotification(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title  string `json:"title"`
		Body   string `json:"body"`
		Target string `json:"target"` // "all" or userId
	}
	if !decodeJSON(w, r, &payload) {
		return
	}

	notification := domain.Notification{
		ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
		Title:  payload.Title,
		Body:   payload.Body,
		Target: payload.Target,
		SentAt: time.Now().UTC().Format(time.RFC3339),
		SentBy: "admin",
	}
	s.store.SaveNotification(notification)

	// Send via Expo Push API
	var tokens []string
	if payload.Target == "all" {
		allTokens := s.store.ListAllPushTokens()
		for _, t := range allTokens {
			tokens = append(tokens, t.Token)
		}
	} else {
		userTokens := s.store.GetUserPushTokens(payload.Target)
		for _, t := range userTokens {
			tokens = append(tokens, t.Token)
		}
	}
	if len(tokens) > 0 {
		go service.SendExpoPush(tokens, payload.Title, payload.Body, map[string]string{"type": "admin"})
	}

	writeJSON(w, http.StatusCreated, map[string]any{"data": notification})
}

// ── Admin Pet Care ──────────────────────────────────────────────────

func (s *Server) handleAdminPetHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListHealthRecords(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetWeight(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListWeightEntries(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetFeeding(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListFeedingSchedules(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetDiary(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListDiary(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminDeleteHealthRecord(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteHealthRecord(chi.URLParam(r, "petID"), chi.URLParam(r, "recordID")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Training Tips ─────────────────────────────────────────────

func (s *Server) handleAdminTrainingTips(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListTrainingTips("")})
}

func (s *Server) handleAdminCreateTrainingTip(w http.ResponseWriter, r *http.Request) {
	var payload domain.TrainingTip
	if !decodeJSON(w, r, &payload) {
		return
	}
	tip := s.store.CreateTrainingTip(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": tip})
}

func (s *Server) handleAdminUpdateTrainingTip(w http.ResponseWriter, r *http.Request) {
	var payload domain.TrainingTip
	if !decodeJSON(w, r, &payload) {
		return
	}
	payload.ID = chi.URLParam(r, "tipID")
	tip, err := s.store.UpdateTrainingTip(payload)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": tip})
}

func (s *Server) handleAdminDeleteTrainingTip(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Pet Sitters ───────────────────────────────────────────────

func (s *Server) handleAdminPetSitters(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListPetSitters("")})
}

func (s *Server) handleAdminDeletePetSitter(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Playdates ─────────────────────────────────────────────────

func (s *Server) handleAdminPlaydates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListPlaydates()})
}

func (s *Server) handleAdminDeletePlaydate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Groups ────────────────────────────────────────────────────

func (s *Server) handleAdminGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListGroups(store.ListGroupsParams{})})
}

func (s *Server) handleAdminCreateGroup(w http.ResponseWriter, r *http.Request) {
	var payload domain.CommunityGroup
	if !decodeJSON(w, r, &payload) {
		return
	}
	// Admin doesn't auto-join the group they create
	group := s.store.CreateGroup("", payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": group})
}

func (s *Server) handleAdminDeleteGroup(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Lost Pets ─────────────────────────────────────────────────

func (s *Server) handleAdminLostPets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListLostPets()})
}

func (s *Server) handleAdminUpdateLostPet(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.store.UpdateLostPetStatus(chi.URLParam(r, "alertID"), payload.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

// ── Admin Badges ────────────────────────────────────────────────────

func (s *Server) handleAdminBadges(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": []domain.Badge{}})
}

// ── Health ───────────────────────────────────────────────────────────

func (s *Server) handleListHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	records := s.store.ListHealthRecords(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": records})
}

func (s *Server) handleCreateHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.HealthRecord
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateHealthRecord(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteHealthRecord(petID, chi.URLParam(request, "recordID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Weight ───────────────────────────────────────────────────────────

func (s *Server) handleListWeight(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	entries := s.store.ListWeightEntries(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": entries})
}

func (s *Server) handleCreateWeight(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.WeightEntry
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateWeightEntry(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Vet Contacts ─────────────────────────────────────────────────────

func (s *Server) handleListVetContacts(writer http.ResponseWriter, request *http.Request) {
	contacts := s.store.ListVetContacts(currentUserID(request))
	writeJSON(writer, http.StatusOK, map[string]any{"data": contacts})
}

func (s *Server) handleCreateVetContact(writer http.ResponseWriter, request *http.Request) {
	var payload domain.VetContact
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateVetContact(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteVetContact(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteVetContact(currentUserID(request), chi.URLParam(request, "contactID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Feeding ──────────────────────────────────────────────────────────

func (s *Server) handleListFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	schedules := s.store.ListFeedingSchedules(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": schedules})
}

func (s *Server) handleCreateFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.FeedingSchedule
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateFeedingSchedule(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteFeedingSchedule(petID, chi.URLParam(request, "scheduleID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Playdates ────────────────────────────────────────────────────────

func (s *Server) handleListPlaydates(writer http.ResponseWriter, request *http.Request) {
	playdates := s.store.ListPlaydates()
	writeJSON(writer, http.StatusOK, map[string]any{"data": playdates})
}

func (s *Server) handleCreatePlaydate(writer http.ResponseWriter, request *http.Request) {
	var payload domain.Playdate
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreatePlaydate(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleJoinPlaydate(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.JoinPlaydate(currentUserID(request), chi.URLParam(request, "playdateID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"joined": true}})
}

// ── Groups ───────────────────────────────────────────────────────────

func (s *Server) handleListGroups(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	var lat, lng float64
	if v := request.URL.Query().Get("lat"); v != "" {
		fmt.Sscanf(v, "%f", &lat)
	}
	if v := request.URL.Query().Get("lng"); v != "" {
		fmt.Sscanf(v, "%f", &lng)
	}
	groups := s.store.ListGroups(store.ListGroupsParams{
		UserID:  userID,
		Lat:     lat,
		Lng:     lng,
		Search:  request.URL.Query().Get("search"),
		PetType: request.URL.Query().Get("petType"),
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": groups})
}

func (s *Server) handleCreateGroup(writer http.ResponseWriter, request *http.Request) {
	var payload domain.CommunityGroup
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateGroup(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleJoinGroup(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.JoinGroup(currentUserID(request), chi.URLParam(request, "groupID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"joined": true}})
}

func (s *Server) handleJoinGroupByCode(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Code string `json:"code"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	group, err := s.store.JoinGroupByCode(currentUserID(request), payload.Code)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": group})
}

func (s *Server) handleGetGroupByConversation(writer http.ResponseWriter, request *http.Request) {
	convID := chi.URLParam(request, "conversationID")
	group := s.store.GetGroupByConversation(convID)
	if group == nil {
		writeJSON(writer, http.StatusOK, map[string]any{"data": nil})
		return
	}
	// Only reveal private code to members of the group
	userID := currentUserID(request)
	isMember := false
	for _, m := range group.Members {
		if m.UserID == userID {
			isMember = true
			break
		}
	}
	group.IsMember = isMember
	if !isMember {
		group.Code = ""
	}
	isAdmin, _ := s.store.IsGroupAdmin(userID, group.ID)
	group.IsAdmin = isAdmin
	group.IsOwner = group.OwnerUserID == userID
	muted, until := s.store.GetGroupMute(userID, group.ID)
	group.Muted = muted
	if until != nil {
		t := until.UTC().Format(time.RFC3339)
		group.MutedUntil = &t
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": group})
}

// ── Lost Pets ────────────────────────────────────────────────────────

func (s *Server) handleListLostPets(writer http.ResponseWriter, request *http.Request) {
	alerts := s.store.ListLostPets()
	writeJSON(writer, http.StatusOK, map[string]any{"data": alerts})
}

func (s *Server) handleCreateLostPet(writer http.ResponseWriter, request *http.Request) {
	var payload domain.LostPetAlert
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateLostPetAlert(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleUpdateLostPetStatus(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.UpdateLostPetStatus(chi.URLParam(request, "alertID"), payload.Status); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

// ── Badges ───────────────────────────────────────────────────────────

func (s *Server) handleListBadges(writer http.ResponseWriter, request *http.Request) {
	badges := s.store.ListBadges(currentUserID(request))
	writeJSON(writer, http.StatusOK, map[string]any{"data": badges})
}

// ── Training Tips ────────────────────────────────────────────────────

func (s *Server) handleListTrainingTips(writer http.ResponseWriter, request *http.Request) {
	tips := s.store.ListTrainingTips(request.URL.Query().Get("petType"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": tips})
}

func (s *Server) handleGetTrainingTip(writer http.ResponseWriter, request *http.Request) {
	tipID := chi.URLParam(request, "tipID")
	tip, err := s.store.GetTrainingTip(tipID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	userID := currentUserID(request)
	bookmarks, completed := s.store.GetTipUserState(userID)

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"tip":         tip,
		"bookmarked":  bookmarks[tipID],
		"completed":   completed[tipID],
	}})
}

func (s *Server) handleBookmarkTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.BookmarkTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"bookmarked": true}})
}

func (s *Server) handleUnbookmarkTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.UnbookmarkTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"bookmarked": false}})
}

func (s *Server) handleCompleteTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.CompleteTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"completed": true}})
}

// ── Vet Clinics ──────────────────────────────────────────────────────

func (s *Server) handleListVetClinicsNearby(writer http.ResponseWriter, request *http.Request) {
	clinics := s.store.ListVetClinics()

	latStr := request.URL.Query().Get("lat")
	lngStr := request.URL.Query().Get("lng")

	if latStr != "" && lngStr != "" {
		var userLat, userLng float64
		fmt.Sscanf(latStr, "%f", &userLat)
		fmt.Sscanf(lngStr, "%f", &userLng)

		for i := range clinics {
			clinics[i].Distance = service.Haversine(userLat, userLng, clinics[i].Latitude, clinics[i].Longitude)
		}

		sort.Slice(clinics, func(i, j int) bool {
			return clinics[i].Distance < clinics[j].Distance
		})
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": clinics})
}

func (s *Server) handleAdminListVetClinics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListVetClinics()})
}

func (s *Server) handleAdminCreateVetClinic(w http.ResponseWriter, r *http.Request) {
	var payload domain.VetClinic
	if !decodeJSON(w, r, &payload) {
		return
	}

	if payload.Latitude == 0 && payload.Longitude == 0 && payload.Address != "" {
		if geo, err := service.Geocode(payload.Address); err == nil {
			payload.Latitude = geo.Lat
			payload.Longitude = geo.Lng
		}
	}

	clinic := s.store.CreateVetClinic(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": clinic})
}

func (s *Server) handleAdminDeleteVetClinic(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteVetClinic(chi.URLParam(r, "clinicID")); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Venue Reviews ────────────────────────────────────────────────────

func (s *Server) handleListVenueReviews(writer http.ResponseWriter, request *http.Request) {
	reviews := s.store.ListVenueReviews(chi.URLParam(request, "venueID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": reviews})
}

func (s *Server) handleCreateVenueReview(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	user, err := s.store.GetUser(userID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	review := s.store.CreateVenueReview(domain.VenueReview{
		VenueID:  chi.URLParam(request, "venueID"),
		UserID:   userID,
		UserName: strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName),
		Rating:   payload.Rating,
		Comment:  payload.Comment,
	})

	writeJSON(writer, http.StatusCreated, map[string]any{"data": review})
}

// ── Pet Sitters ──────────────────────────────────────────────────────

func (s *Server) handleListPetSitters(writer http.ResponseWriter, request *http.Request) {
	sitters := s.store.ListPetSitters(request.URL.Query().Get("city"))

	latStr := request.URL.Query().Get("lat")
	lngStr := request.URL.Query().Get("lng")

	if latStr != "" && lngStr != "" {
		var userLat, userLng float64
		fmt.Sscanf(latStr, "%f", &userLat)
		fmt.Sscanf(lngStr, "%f", &userLng)

		if userLat != 0 && userLng != 0 {
			for i := range sitters {
				if sitters[i].Latitude != 0 && sitters[i].Longitude != 0 {
					sitters[i].Distance = service.Haversine(userLat, userLng, sitters[i].Latitude, sitters[i].Longitude)
				}
			}

			sort.Slice(sitters, func(i, j int) bool {
				return sitters[i].Distance < sitters[j].Distance
			})
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": sitters})
}

func (s *Server) handleCreatePetSitter(writer http.ResponseWriter, request *http.Request) {
	var payload domain.PetSitter
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreatePetSitter(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Walk Routes ─────────────────────────────────────────────────────

func (s *Server) handleListWalkRoutes(writer http.ResponseWriter, request *http.Request) {
	routes := s.store.ListWalkRoutes(request.URL.Query().Get("city"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": routes})
}

func (s *Server) handleAdminListWalkRoutes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListWalkRoutes("")})
}

func (s *Server) handleAdminCreateWalkRoute(w http.ResponseWriter, r *http.Request) {
	var payload domain.WalkRoute
	if !decodeJSON(w, r, &payload) {
		return
	}
	route := s.store.CreateWalkRoute(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": route})
}

func (s *Server) handleAdminDeleteWalkRoute(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWalkRoute(chi.URLParam(r, "routeID")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Adoptions ───────────────────────────────────────────────────────

func (s *Server) handleListAdoptions(writer http.ResponseWriter, request *http.Request) {
	adoptions := s.store.ListAdoptions()
	writeJSON(writer, http.StatusOK, map[string]any{"data": adoptions})
}

func (s *Server) handleCreateAdoption(writer http.ResponseWriter, request *http.Request) {
	var payload domain.AdoptionListing
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.UserID = currentUserID(request)
	result := s.store.CreateAdoption(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleAdminListAdoptions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListAdoptions()})
}

func (s *Server) handleAdminUpdateAdoption(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.store.UpdateAdoptionStatus(chi.URLParam(r, "listingID"), payload.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminDeleteAdoption(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteAdoption(chi.URLParam(r, "listingID")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleUpdateMyAdoption(w http.ResponseWriter, r *http.Request) {
	listingID := chi.URLParam(r, "listingID")
	userID := currentUserID(r)

	listing, err := s.store.GetAdoption(listingID)
	if err != nil {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	if listing.UserID != userID {
		writeError(w, http.StatusForbidden, "not your listing")
		return
	}

	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.store.UpdateAdoptionStatus(listingID, payload.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleDeleteMyAdoption(w http.ResponseWriter, r *http.Request) {
	listingID := chi.URLParam(r, "listingID")
	userID := currentUserID(r)

	listing, err := s.store.GetAdoption(listingID)
	if err != nil {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	if listing.UserID != userID {
		writeError(w, http.StatusForbidden, "not your listing")
		return
	}

	if err := s.store.DeleteAdoption(listingID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Pet Albums ──────────────────────────────────────────────────────

func (s *Server) handleListPetAlbums(writer http.ResponseWriter, request *http.Request) {
	albums := s.store.ListPetAlbums(chi.URLParam(request, "petID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": albums})
}

func (s *Server) handleCreatePetAlbum(writer http.ResponseWriter, request *http.Request) {
	var payload domain.PetAlbum
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.PetID = chi.URLParam(request, "petID")
	result := s.store.CreatePetAlbum(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Pet Milestones ──────────────────────────────────────────────────

func (s *Server) handleListPetMilestones(writer http.ResponseWriter, request *http.Request) {
	milestones := s.store.ListPetMilestones(chi.URLParam(request, "petID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": milestones})
}

// ── Group Messages ──────────────────────────────────────────────────

func (s *Server) handleListGroupMessages(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	groupID := chi.URLParam(request, "groupID")
	isMember, _ := s.store.IsGroupMember(userID, groupID)
	if !isMember {
		writeError(writer, http.StatusForbidden, "not a member")
		return
	}
	messages, err := s.store.ListGroupMessagesFor(userID, groupID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleSendGroupMessage(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Type     string         `json:"type"`
		Body     string         `json:"body"`
		ImageURL string         `json:"imageUrl"`
		Metadata map[string]any `json:"metadata"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	groupID := chi.URLParam(request, "groupID")
	if payload.Type == "" {
		payload.Type = "text"
	}
	message, err := s.store.SendGroupMessageEx(currentUserID(request), groupID, store.SendGroupMessageInput{
		Type:     payload.Type,
		Body:     payload.Body,
		ImageURL: payload.ImageURL,
		Metadata: payload.Metadata,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": message})
}

func (s *Server) handleGetGroup(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	userID := currentUserID(request)
	// Find the group's conversation via list then filter — reuse existing paths.
	groups := s.store.ListGroups(store.ListGroupsParams{UserID: userID})
	var found *domain.CommunityGroup
	for i := range groups {
		if groups[i].ID == groupID {
			found = &groups[i]
			break
		}
	}
	if found == nil {
		writeError(writer, http.StatusNotFound, "group not found")
		return
	}
	// Enrich with members + admin/owner state via conversation lookup.
	// NOTE: GetGroupByConversation doesn't populate IsMember for the caller —
	// it has no concept of "viewer". We compute it explicitly below.
	detail := s.store.GetGroupByConversation(found.ConversationID)
	if detail != nil {
		found = detail
	}
	isMember, _ := s.store.IsGroupMember(userID, groupID)
	found.IsMember = isMember
	isAdmin, _ := s.store.IsGroupAdmin(userID, groupID)
	found.IsAdmin = isAdmin
	found.IsOwner = found.OwnerUserID == userID
	muted, until := s.store.GetGroupMute(userID, groupID)
	found.Muted = muted
	if until != nil {
		t := until.UTC().Format(time.RFC3339)
		found.MutedUntil = &t
	}
	if !found.IsMember {
		found.Code = ""
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": found})
}

func (s *Server) handleDeleteGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.DeleteGroupMessage(currentUserID(request), groupID, messageID); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handlePinGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.SetGroupMessagePinned(currentUserID(request), groupID, messageID, true); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"pinned": true}})
}

func (s *Server) handleUnpinGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.SetGroupMessagePinned(currentUserID(request), groupID, messageID, false); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"pinned": false}})
}

func (s *Server) handleListGroupPinned(writer http.ResponseWriter, request *http.Request) {
	messages, err := s.store.ListGroupPinnedMessages(chi.URLParam(request, "groupID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleGroupChatPreview(writer http.ResponseWriter, request *http.Request) {
	messages, err := s.store.GetGroupChatPreview(chi.URLParam(request, "groupID"), 3)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleMuteGroupMember(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		UserID   string `json:"userId"`
		Duration string `json:"duration"` // "1h" | "24h" | "indefinite"
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	var until *time.Time
	switch payload.Duration {
	case "1h":
		t := time.Now().UTC().Add(time.Hour)
		until = &t
	case "24h":
		t := time.Now().UTC().Add(24 * time.Hour)
		until = &t
	case "indefinite", "":
		until = nil
	default:
		writeError(writer, http.StatusBadRequest, "invalid duration")
		return
	}
	if err := s.store.MuteGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), payload.UserID, until); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"muted": true}})
}

func (s *Server) handleUnmuteGroupMember(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.UnmuteGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"muted": false}})
}

func (s *Server) handleKickGroupMember(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.KickGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"kicked": true}})
}

func (s *Server) handlePromoteGroupAdmin(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.PromoteGroupAdmin(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"admin": true}})
}

func (s *Server) handleDemoteGroupAdmin(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DemoteGroupAdmin(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"admin": false}})
}

func (s *Server) handleLeaveGroup(writer http.ResponseWriter, request *http.Request) {
	deleted, err := s.store.LeaveGroup(currentUserID(request), chi.URLParam(request, "groupID"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"left": true, "deleted": deleted}})
}

// ── Admin Create Pet Sitter ─────────────────────────────────────────

func (s *Server) handleAdminCreatePetSitter(w http.ResponseWriter, r *http.Request) {
	var payload domain.PetSitter
	if !decodeJSON(w, r, &payload) {
		return
	}
	sitter := s.store.CreatePetSitter(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": sitter})
}

func currentUserID(request *http.Request) string {
	value := request.Context().Value(userIDKey)
	userID, _ := value.(string)
	return userID
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, dest any) bool {
	defer request.Body.Close()
	if err := json.NewDecoder(request.Body).Decode(dest); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json")
		return false
	}

	return true
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

func newUploadFileName(extension string) string {
	return newAssetID() + extension
}

func newAssetID() string {
	return "asset-" + strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
}
