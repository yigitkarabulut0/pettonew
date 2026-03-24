package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/config"
	"github.com/yigitkarabulut/petto/apps/api/internal/server"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

func main() {
	cfg := config.Load()
	var dataStore store.Store
	var closable store.ClosableStore

	if cfg.DatabaseURL != "" {
		persistentStore, err := store.NewPersistentStore(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("database init failed: %v", err)
		}
		dataStore = persistentStore
		closable = persistentStore
		log.Printf("petto api using Neon/Postgres persistence")
	} else {
		dataStore = store.NewMemoryStore()
	}

	if closable != nil {
		defer func() {
			_ = closable.Close()
		}()
	}

	apiServer := server.New(cfg, dataStore)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           apiServer.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("petto api listening on http://localhost:%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
