package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://petto:petto123@localhost:5432/petto?sslmode=disable"
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	email := "admin@petto.com"
	password := "admin123"
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

	var exists bool
	err = db.QueryRowContext(context.Background(), "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)", email).Scan(&exists)
	if err != nil {
		log.Fatalf("Failed to check user: %v", err)
	}

	if exists {
		_, err = db.ExecContext(context.Background(), "UPDATE users SET role = 'admin', password_hash = $1 WHERE email = $2", string(hash), email)
		if err != nil {
			log.Fatalf("Failed to update user: %v", err)
		}
		fmt.Println("Admin user updated successfully!")
	} else {
		_, err = db.ExecContext(context.Background(),
			"INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5)",
			email, string(hash), "Admin", "User", "admin")
		if err != nil {
			log.Fatalf("Failed to create user: %v", err)
		}
		fmt.Println("Admin user created successfully!")
	}

	fmt.Println("Email: admin@petto.com")
	fmt.Println("Password: admin123")
}
