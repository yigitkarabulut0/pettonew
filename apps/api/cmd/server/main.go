package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/petto/api/internal/auth"
	"github.com/petto/api/internal/config"
	"github.com/petto/api/internal/handlers"
	"github.com/petto/api/internal/middleware"
	"github.com/petto/api/internal/ws"
)

func main() {
	cfg := config.Load()

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("Unable to ping database: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	authService := auth.NewService(cfg.JWTSecret, cfg.JWTExpHours, cfg.RefreshDays)
	handlers.InitR2(cfg)

	r := gin.Default()
	r.Use(middleware.CORSConfig())

	api := r.Group("/api")
	v1 := api.Group("/v1")

	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/register", handlers.Register(db, authService))
		authGroup.POST("/login", handlers.Login(db, authService))
		authGroup.POST("/refresh", handlers.RefreshToken(db, authService))
	}

	protected := v1.Group("")
	protected.Use(middleware.AuthMiddleware(authService))
	{
		protected.GET("/users/me", handlers.GetMe(db))
		protected.PUT("/users/me", handlers.UpdateMe(db))
		protected.DELETE("/users/me", handlers.DeleteMe(db))

		protected.GET("/pets", handlers.ListMyPets(db))
		protected.POST("/pets", handlers.CreatePet(db))
		protected.GET("/pets/:id", handlers.GetPet(db))
		protected.PUT("/pets/:id", handlers.UpdatePet(db))
		protected.DELETE("/pets/:id", handlers.DeletePet(db))

		protected.GET("/options/species", handlers.GetSpecies(db))
		protected.GET("/options/breeds/:speciesId", handlers.GetBreedsBySpecies(db))
		protected.GET("/options/compatibilities", handlers.GetCompatibilities(db))
		protected.GET("/options/hobbies", handlers.GetHobbies(db))

		protected.POST("/upload/url", handlers.GenerateUploadURL)

		protected.GET("/posts", handlers.ListPosts(db))
		protected.POST("/posts", handlers.CreatePost(db))
		protected.GET("/posts/:id", handlers.GetPost(db))
		protected.DELETE("/posts/:id", handlers.DeletePost(db))
		protected.POST("/posts/:id/react", handlers.ReactToPost(db))
		protected.DELETE("/posts/:id/react", handlers.RemoveReaction(db))
		protected.GET("/posts/search", handlers.SearchPosts(db))

		protected.GET("/match/candidates", handlers.GetMatchCandidates(db))
		protected.POST("/match/swipe", handlers.Swipe(db))
		protected.GET("/match/matches", handlers.GetMatches(db))
		protected.GET("/match/stats", handlers.GetMatchStats(db))

		protected.GET("/chat/conversations", handlers.ListConversations(db))
		protected.GET("/chat/conversations/:id", handlers.GetConversation(db))
		protected.POST("/chat/conversations", handlers.CreateConversation(db))
		protected.GET("/chat/conversations/:id/messages", handlers.ListMessages(db))
		protected.POST("/chat/conversations/:id/messages", handlers.SendMessage(db))

		protected.GET("/explore/locations", handlers.ListLocations(db))
		protected.GET("/explore/locations/nearby", handlers.GetNearbyLocations(db))
		protected.GET("/explore/locations/:id/checkins", handlers.GetLocationCheckIns(db))
		protected.POST("/explore/check-in", handlers.CheckIn(db))
		protected.POST("/explore/check-out", handlers.CheckOut(db))
		protected.GET("/explore/events", handlers.ListEvents(db))
		protected.GET("/explore/events/:id", handlers.GetEvent(db))
		protected.POST("/explore/events/:id/join", handlers.JoinEvent(db))
		protected.POST("/explore/events/:id/leave", handlers.LeaveEvent(db))
	}

	protectedAdmin := v1.Group("/admin")
	protectedAdmin.Use(middleware.AuthMiddleware(authService), middleware.AdminOnly())
	{
		protectedAdmin.GET("/dashboard", handlers.AdminDashboard(db))
		protectedAdmin.GET("/users", handlers.AdminListUsers(db))
		protectedAdmin.GET("/users/:id", handlers.AdminGetUser(db))
		protectedAdmin.PUT("/users/:id/ban", handlers.AdminBanUser(db))
		protectedAdmin.PUT("/users/:id/role", handlers.AdminUpdateRole(db))
		protectedAdmin.DELETE("/users/:id", handlers.AdminDeleteUser(db))
		protectedAdmin.GET("/pets", handlers.AdminListPets(db))
		protectedAdmin.GET("/options/species", handlers.GetSpecies(db))
		protectedAdmin.POST("/options/species", handlers.AdminCreateSpecies(db))
		protectedAdmin.DELETE("/options/species/:id", handlers.AdminDeleteSpecies(db))
		protectedAdmin.GET("/options/breeds", handlers.AdminGetAllBreeds(db))
		protectedAdmin.POST("/options/breeds", handlers.AdminCreateBreed(db))
		protectedAdmin.DELETE("/options/breeds/:id", handlers.AdminDeleteBreed(db))
		protectedAdmin.POST("/options/compatibilities", handlers.AdminCreateCompatibility(db))
		protectedAdmin.DELETE("/options/compatibilities/:id", handlers.AdminDeleteCompatibility(db))
		protectedAdmin.POST("/options/hobbies", handlers.AdminCreateHobby(db))
		protectedAdmin.DELETE("/options/hobbies/:id", handlers.AdminDeleteHobby(db))
		protectedAdmin.GET("/locations", handlers.AdminListLocations(db))
		protectedAdmin.POST("/locations", handlers.AdminCreateLocation(db))
		protectedAdmin.PUT("/locations/:id", handlers.AdminUpdateLocation(db))
		protectedAdmin.DELETE("/locations/:id", handlers.AdminDeleteLocation(db))
		protectedAdmin.GET("/events", handlers.AdminListAllEvents(db))
		protectedAdmin.POST("/events", handlers.AdminCreateEvent(db))
		protectedAdmin.PUT("/events/:id", handlers.AdminUpdateEvent(db))
		protectedAdmin.DELETE("/events/:id", handlers.AdminDeleteEvent(db))
		protectedAdmin.GET("/posts", handlers.AdminListPosts(db))
		protectedAdmin.DELETE("/posts/:id", handlers.AdminDeletePost(db))
		protectedAdmin.GET("/analytics/users", handlers.AdminUserAnalytics(db))
		protectedAdmin.GET("/analytics/posts", handlers.AdminPostAnalytics(db))
		protectedAdmin.GET("/analytics/matches", handlers.AdminMatchAnalytics(db))
	}

	wsHub := ws.NewHub()
	go wsHub.Run()
	v1.GET("/chat/ws", func(c *gin.Context) {
		c.Set("hub", wsHub)
		ws.HandleWebSocket(c)
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}
