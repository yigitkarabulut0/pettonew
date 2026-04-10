package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/config"
	"github.com/yigitkarabulut/petto/apps/api/internal/server"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
}

func main() {
	loadEnvFile(".env")

	cfg := config.Load()
	var dataStore store.Store
	var closable store.ClosableStore

	storeBackend := os.Getenv("STORE_BACKEND")
	if storeBackend == "" {
		storeBackend = "postgres" // default to relational DB
	}

	if cfg.DatabaseURL != "" && storeBackend == "postgres" {
		pgStore, err := store.NewPostgresStore(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("postgres store init failed: %v", err)
		}
		dataStore = pgStore
		closable = pgStore
		log.Printf("petto api using PostgresStore (relational tables)")
	} else if cfg.DatabaseURL != "" && storeBackend == "persistent" {
		persistentStore, err := store.NewPersistentStore(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("database init failed: %v", err)
		}
		dataStore = persistentStore
		closable = persistentStore
		log.Printf("petto api using PersistentStore (JSON blob)")
	} else {
		dataStore = store.NewMemoryStore()
		log.Printf("petto api using MemoryStore (in-memory only)")
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
