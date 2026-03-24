package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/auth"
	"github.com/petto/api/internal/models"
)

type AuthHandler struct {
	db   *sql.DB
	q    *sqlcgen.Queries
	auth *auth.Service
}

func Register(db *sql.DB, authService *auth.Service) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req models.UserCreate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()
		_, err := q.GetUserByEmail(ctx, req.Email)
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"code": "email_exists", "message": "email already registered"})
			return
		}

		hash, err := authService.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to hash password"})
			return
		}

		user, err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
			Email:        req.Email,
			PasswordHash: hash,
			FirstName:    req.FirstName,
			LastName:     req.LastName,
			Phone:        toNullString(req.Phone),
			Gender:       toNullString(req.Gender),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create user"})
			return
		}

		accessToken, err := authService.GenerateAccessToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate token"})
			return
		}

		refreshToken, tokenHash, err := authService.GenerateRefreshToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate refresh token"})
			return
		}

		q.StoreRefreshToken(ctx, sqlcgen.StoreRefreshTokenParams{
			UserID:    user.ID,
			TokenHash: tokenHash,
			ExpiresAt: authService.GetRefreshExpiry(),
		})

		c.JSON(http.StatusCreated, models.AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         userToModel(user),
		})
	}
}

func Login(db *sql.DB, authService *auth.Service) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req models.UserLogin
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()
		user, err := q.GetUserByEmail(ctx, req.Email)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": "invalid_credentials", "message": "invalid email or password"})
			return
		}

		if !authService.CheckPassword(req.Password, user.PasswordHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": "invalid_credentials", "message": "invalid email or password"})
			return
		}

		if user.IsBanned {
			c.JSON(http.StatusForbidden, gin.H{"code": "banned", "message": "account has been banned"})
			return
		}

		accessToken, err := authService.GenerateAccessToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate token"})
			return
		}

		refreshToken, tokenHash, err := authService.GenerateRefreshToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate refresh token"})
			return
		}

		q.StoreRefreshToken(ctx, sqlcgen.StoreRefreshTokenParams{
			UserID:    user.ID,
			TokenHash: tokenHash,
			ExpiresAt: authService.GetRefreshExpiry(),
		})

		c.JSON(http.StatusOK, models.AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         userToModel(user),
		})
	}
}

func RefreshToken(db *sql.DB, authService *auth.Service) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req models.RefreshRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()
		tokenHash := authService.HashToken(req.RefreshToken)
		token, err := q.GetRefreshToken(ctx, tokenHash)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": "invalid_token", "message": "invalid refresh token"})
			return
		}

		if token.ExpiresAt.Before(time.Now()) {
			q.DeleteRefreshToken(ctx, tokenHash)
			c.JSON(http.StatusUnauthorized, gin.H{"code": "token_expired", "message": "refresh token has expired"})
			return
		}

		user, err := q.GetUserByID(ctx, token.UserID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": "invalid_token", "message": "user not found"})
			return
		}

		q.DeleteRefreshToken(ctx, tokenHash)

		newAccessToken, err := authService.GenerateAccessToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate token"})
			return
		}

		newRefreshToken, newTokenHash, err := authService.GenerateRefreshToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to generate refresh token"})
			return
		}

		q.StoreRefreshToken(ctx, sqlcgen.StoreRefreshTokenParams{
			UserID:    user.ID,
			TokenHash: newTokenHash,
			ExpiresAt: authService.GetRefreshExpiry(),
		})

		c.JSON(http.StatusOK, models.AuthResponse{
			AccessToken:  newAccessToken,
			RefreshToken: newRefreshToken,
			User:         userToModel(user),
		})
	}
}
