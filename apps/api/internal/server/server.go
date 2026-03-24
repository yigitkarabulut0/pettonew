package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/chat"
	"github.com/yigitkarabulut/petto/apps/api/internal/config"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
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
			router.Get("/taxonomies/{kind}", s.handleTaxonomyList)
			router.Get("/discovery/feed", s.handleDiscoveryFeed)
			router.Post("/swipes", s.handleSwipe)
			router.Get("/matches", s.handleMatches)
			router.Get("/conversations", s.handleConversations)
			router.Get("/messages", s.handleMessages)
			router.Post("/messages", s.handleSendMessage)
			router.Get("/home/feed", s.handleHomeFeed)
			router.Post("/home/posts", s.handleHomePostCreate)
			router.Post("/home/posts/{postID}/likes", s.handleHomePostLikeToggle)
			router.Get("/explore/venues", s.handleExploreVenues)
			router.Post("/explore/check-ins", s.handleExploreCheckIn)
			router.Get("/explore/events", s.handleExploreEvents)
			router.Post("/explore/events/{eventID}/rsvps", s.handleExploreEventRSVP)
			router.Get("/ws", s.handleWebSocket)
			router.Post("/blocks", s.handleBlockUser)
			router.Post("/reports", s.handleReport)
			router.Post("/media/upload", s.handleUpload)
			router.Post("/media/presign", s.handleMediaPresign)
		})

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
				router.Patch("/pets/{petID}", s.handleAdminPetUpdate)
				router.Get("/posts", s.handleAdminPosts)
				router.Get("/venues", s.handleAdminVenues)
				router.Post("/venues", s.handleAdminVenueUpsert)
				router.Delete("/venues/{venueID}", s.handleAdminVenueDelete)
				router.Get("/events", s.handleAdminEvents)
				router.Post("/events", s.handleAdminEventUpsert)
				router.Delete("/events/{eventID}", s.handleAdminEventDelete)
				router.Get("/taxonomies/{kind}", s.handleAdminTaxonomyList)
				router.Post("/taxonomies/{kind}", s.handleAdminTaxonomyUpsert)
				router.Delete("/taxonomies/{kind}/{itemID}", s.handleAdminTaxonomyDelete)
				router.Get("/reports", s.handleAdminReports)
				router.Post("/reports/{reportID}/resolve", s.handleAdminResolveReport)
			})
		})
	})

	return router
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
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

func (s *Server) handleTaxonomyList(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"))})
}

func (s *Server) handleDiscoveryFeed(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.DiscoveryFeed(currentUserID(request))})
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

	match, err := s.store.CreateSwipe(currentUserID(request), payload.ActorPetID, payload.TargetPetID, payload.Direction)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{"match": match}})
}

func (s *Server) handleMatches(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMatches(currentUserID(request))})
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
		ConversationID string `json:"conversationId"`
		Body           string `json:"body"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	message, err := s.store.SendMessage(currentUserID(request), payload.ConversationID, payload.Body)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	_ = s.hub.Publish(payload.ConversationID, map[string]any{
		"type": "message.created",
		"data": message,
	})

	writeJSON(writer, http.StatusCreated, map[string]any{"data": message})
}

func (s *Server) handleWebSocket(writer http.ResponseWriter, request *http.Request) {
	conversationID := request.URL.Query().Get("conversationId")
	if conversationID == "" {
		writeError(writer, http.StatusBadRequest, "conversationId is required")
		return
	}

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
			if _, _, err := connection.Read(ctx); err != nil {
				return
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

func (s *Server) handleReport(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Reason      string `json:"reason"`
		TargetType  string `json:"targetType"`
		TargetLabel string `json:"targetLabel"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	user, _ := s.store.GetUser(currentUserID(request))
	report := s.store.CreateReport(user.Profile.FirstName, payload.Reason, payload.TargetType, payload.TargetLabel)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": report})
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
		Status string `json:"status"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.SuspendUser(chi.URLParam(request, "userID"), payload.Status); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
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
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"))})
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

func (s *Server) handleAdminResolveReport(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.ResolveReport(chi.URLParam(request, "reportID")); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"resolved": true}})
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
