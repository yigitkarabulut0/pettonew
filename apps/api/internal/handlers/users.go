package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func GetMe(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		user, err := q.GetUserByID(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "user not found"})
			return
		}
		c.JSON(http.StatusOK, userToModel(user))
	}
}

func UpdateMe(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req models.UserUpdate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		user, err := q.UpdateUser(c.Request.Context(), sqlcgen.UpdateUserParams{
			ID:        userID,
			FirstName: toNullString(req.FirstName),
			LastName:  toNullString(req.LastName),
			Phone:     toNullString(req.Phone),
			Gender:    toNullString(req.Gender),
			AvatarUrl: toNullString(req.AvatarURL),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to update user"})
			return
		}

		c.JSON(http.StatusOK, userToModel(user))
	}
}

func DeleteMe(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		ctx := c.Request.Context()
		q.DeleteUserRefreshTokens(ctx, userID)
		if err := q.DeleteUser(ctx, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to delete user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
	}
}

func AdminListUsers(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		if p.PageSize == 0 {
			p.PageSize = 20
		}

		search := c.Query("search")
		role := c.Query("role")
		if role == "" {
			role = "user"
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountUsers(ctx, sqlcgen.CountUsersParams{
			Column1: search,
			Column2: role,
		})

		users, _ := q.ListUsers(ctx, sqlcgen.ListUsersParams{
			Column1: search,
			Column2: role,
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		var result []models.User
		for _, u := range users {
			result = append(result, userToModel(u))
		}

		c.JSON(http.StatusOK, models.PaginatedResponse{
			Data:     result,
			Total:    total,
			Page:     p.Page,
			PageSize: p.PageSize,
			HasMore:  int64(offset+p.PageSize) < total,
		})
	}
}

func AdminGetUser(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		user, err := q.GetUserByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "user not found"})
			return
		}

		stats, _ := q.GetUserPostStats(c.Request.Context(), id)
		matchCount, _ := q.CountUserMatches(c.Request.Context(), id)

		c.JSON(http.StatusOK, gin.H{
			"user":        userToModel(user),
			"post_stats":  stats,
			"match_count": matchCount,
		})
	}
}

func AdminBanUser(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			IsBanned bool `json:"is_banned"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		q.UpdateUserBan(c.Request.Context(), sqlcgen.UpdateUserBanParams{
			ID:       id,
			IsBanned: req.IsBanned,
		})
		c.JSON(http.StatusOK, gin.H{"message": "user ban status updated"})
	}
}

func AdminUpdateRole(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Role string `json:"role" binding:"required,oneof=user admin"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		q.UpdateUserRole(c.Request.Context(), sqlcgen.UpdateUserRoleParams{
			ID:   id,
			Role: req.Role,
		})
		c.JSON(http.StatusOK, gin.H{"message": "user role updated"})
	}
}

func AdminDeleteUser(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		ctx := c.Request.Context()
		q.DeleteUserRefreshTokens(ctx, id)
		if err := q.DeleteUser(ctx, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to delete user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
	}
}

func AdminUserAnalytics(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		total, _ := q.CountUsers(ctx, sqlcgen.CountUsersParams{})
		today := time.Now().Truncate(24 * time.Hour)
		newToday, _ := q.CountUsersCreatedAfter(ctx, today)
		activeToday, _ := q.CountActiveUsersAfter(ctx, today)
		petCount, _ := q.CountPets(ctx)

		c.JSON(http.StatusOK, gin.H{
			"total_users":        total,
			"new_users_today":    newToday,
			"active_users_today": activeToday,
			"total_pets":         petCount,
		})
	}
}
