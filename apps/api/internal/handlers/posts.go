package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func ListPosts(db *sql.DB) gin.HandlerFunc {
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

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()
		userID := c.GetString("userID")

		posts, _ := q.ListPosts(ctx, sqlcgen.ListPostsParams{
			Limit:  int32(p.PageSize),
			Offset: int32(offset),
		})

		total, _ := q.CountPosts(ctx)

		var result []gin.H
		for _, post := range posts {
			reaction, err := q.GetReaction(ctx, sqlcgen.GetReactionParams{
				PostID: post.ID,
				UserID: userID,
			})

			var myReaction *string
			if err == nil {
				r := reaction.Type
				myReaction = &r
			}

			isMatched := false
			pets, _ := q.ListPetsByUserID(ctx, userID)
			petIDs := make([]string, len(pets))
			for i, pet := range pets {
				petIDs[i] = pet.ID
			}
			if len(petIDs) > 0 {
				matchCount, _ := q.CountMatchedUserPosts(ctx, sqlcgen.CountMatchedUserPostsParams{
					UserID:  userID,
					Column2: petIDs,
				})
				isMatched = matchCount > 0
			}

			result = append(result, gin.H{
				"id":              post.ID,
				"user_id":         post.UserID,
				"content":         post.Content,
				"image_urls":      post.ImageUrls,
				"like_count":      post.LikeCount,
				"congrats_count":  post.CongratsCount,
				"funny_count":     post.FunnyCount,
				"my_reaction":     myReaction,
				"is_matched_user": isMatched,
				"created_at":      post.CreatedAt,
			})
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

func CreatePost(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req models.PostCreate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		post, err := q.CreatePost(c.Request.Context(), sqlcgen.CreatePostParams{
			UserID:    userID,
			Content:   req.Content,
			ImageUrls: req.ImageURLs,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create post"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":             post.ID,
			"user_id":        post.UserID,
			"content":        post.Content,
			"image_urls":     post.ImageUrls,
			"like_count":     0,
			"congrats_count": 0,
			"funny_count":    0,
			"created_at":     post.CreatedAt,
		})
	}
}

func GetPost(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		ctx := c.Request.Context()

		post, err := q.GetPostByID(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "post not found"})
			return
		}

		reaction, err := q.GetReaction(ctx, sqlcgen.GetReactionParams{
			PostID: post.ID,
			UserID: userID,
		})

		var myReaction *string
		if err == nil {
			r := reaction.Type
			myReaction = &r
		}

		c.JSON(http.StatusOK, gin.H{
			"id":             post.ID,
			"user_id":        post.UserID,
			"content":        post.Content,
			"image_urls":     post.ImageUrls,
			"like_count":     post.LikeCount,
			"congrats_count": post.CongratsCount,
			"funny_count":    post.FunnyCount,
			"my_reaction":    myReaction,
			"created_at":     post.CreatedAt,
		})
	}
}

func DeletePost(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		if err := q.DeletePost(c.Request.Context(), sqlcgen.DeletePostParams{
			ID:     id,
			UserID: userID,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to delete post"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "post deleted"})
	}
}

func ReactToPost(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		var req models.PostReaction
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		reaction, err := q.SetReaction(c.Request.Context(), sqlcgen.SetReactionParams{
			PostID: id,
			UserID: userID,
			Type:   req.Type,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to set reaction"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"post_id":    reaction.PostID,
			"type":       reaction.Type,
			"created_at": reaction.CreatedAt,
		})
	}
}

func RemoveReaction(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		q.RemoveReaction(c.Request.Context(), sqlcgen.RemoveReactionParams{
			PostID: id,
			UserID: userID,
		})
		c.JSON(http.StatusOK, gin.H{"message": "reaction removed"})
	}
}

func SearchPosts(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "search query required"})
			return
		}

		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountSearchPosts(ctx, query)
		posts, _ := q.SearchPosts(ctx, sqlcgen.SearchPostsParams{
			PlaintoTsquery: query,
			Limit:          int32(p.PageSize),
			Offset:         int32(offset),
		})

		c.JSON(http.StatusOK, models.PaginatedResponse{
			Data:     posts,
			Total:    total,
			Page:     p.Page,
			PageSize: p.PageSize,
			HasMore:  int64(offset+p.PageSize) < total,
		})
	}
}

func AdminListPosts(db *sql.DB) gin.HandlerFunc {
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
		userIDStr := c.Query("user_id")
		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountPostsAdmin(ctx, sqlcgen.CountPostsAdminParams{
			Column1: search,
			Column2: userIDStr,
		})

		posts, _ := q.ListPostsAdmin(ctx, sqlcgen.ListPostsAdminParams{
			Column1: search,
			Column2: userIDStr,
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		c.JSON(http.StatusOK, models.PaginatedResponse{
			Data:     posts,
			Total:    total,
			Page:     p.Page,
			PageSize: p.PageSize,
			HasMore:  int64(offset+p.PageSize) < total,
		})
	}
}

func AdminDeletePost(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeletePostAdmin(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "post deleted"})
	}
}

func AdminPostAnalytics(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		total, _ := q.CountPosts(ctx)
		today := time.Now().Truncate(24 * time.Hour)
		newToday, _ := q.CountPostsCreatedAfter(ctx, today)

		c.JSON(http.StatusOK, gin.H{
			"total_posts":     total,
			"new_posts_today": newToday,
		})
	}
}
