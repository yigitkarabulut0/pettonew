package config

import "os"

type Config struct {
	Port              string
	AppBaseURL        string
	AdminBaseURL      string
	APIBaseURL        string
	// ShelterWebBaseURL is where the public shelter portal lives. The
	// invite-link generator uses it to build absolute URLs the admin
	// can copy+share. Empty = fall back to path-only (/invite/<token>).
	ShelterWebBaseURL string
	JWTAccessSecret   string
	JWTRefreshSecret  string
	AdminJWTSecret    string
	UploadsDir        string
	DatabaseURL       string
	R2AccountID       string
	R2Bucket          string
	R2AccessKeyID     string
	R2SecretKey       string
	R2PublicBaseURL   string
}

func Load() Config {
	return Config{
		Port:              env("API_PORT", "8080"),
		AppBaseURL:        env("APP_BASE_URL", "http://localhost:8081"),
		AdminBaseURL:      env("ADMIN_BASE_URL", "http://localhost:3000"),
		APIBaseURL:        env("API_BASE_URL", "http://localhost:8080"),
		ShelterWebBaseURL: env("SHELTER_WEB_BASE_URL", "http://localhost:3001"),
		JWTAccessSecret:   env("JWT_ACCESS_SECRET", "dev-access-secret"),
		JWTRefreshSecret:  env("JWT_REFRESH_SECRET", "dev-refresh-secret"),
		AdminJWTSecret:    env("ADMIN_JWT_SECRET", "dev-admin-secret"),
		UploadsDir:        env("UPLOADS_DIR", "/tmp/petto-uploads"),
		DatabaseURL:       env("DATABASE_URL", ""),
		R2AccountID:       env("R2_ACCOUNT_ID", ""),
		R2Bucket:          env("R2_BUCKET", ""),
		R2AccessKeyID:     env("R2_ACCESS_KEY_ID", ""),
		R2SecretKey:       env("R2_SECRET_ACCESS_KEY", ""),
		R2PublicBaseURL:   env("R2_PUBLIC_BASE_URL", ""),
	}
}

func env(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}
