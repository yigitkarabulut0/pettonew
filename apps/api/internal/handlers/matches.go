package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func GetMatchCandidates(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		pets, _ := q.ListPetsByUserID(ctx, userID)
		petIDs := make([]string, len(pets))
		for i, pet := range pets {
			petIDs[i] = pet.ID
		}

		if len(petIDs) == 0 {
			c.JSON(http.StatusOK, models.PaginatedResponse{
				Data:     []interface{}{},
				Total:    0,
				Page:     p.Page,
				PageSize: p.PageSize,
				HasMore:  false,
			})
			return
		}

		candidates, _ := q.ListPetsForMatching(ctx, sqlcgen.ListPetsForMatchingParams{
			UserID:  userID,
			Column2: petIDs,
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		var result []gin.H
		for _, candidate := range candidates {
			compatibilities, _ := q.GetPetCompatibilities(ctx, candidate.ID)
			var compNames []string
			for _, comp := range compatibilities {
				compNames = append(compNames, comp.Name)
			}

			result = append(result, gin.H{
				"pet":             petToModel(candidate),
				"compatibilities": compNames,
			})
		}

		c.JSON(http.StatusOK, models.PaginatedResponse{
			Data:     result,
			Total:    int64(len(result)),
			Page:     p.Page,
			PageSize: p.PageSize,
			HasMore:  len(result) == p.PageSize,
		})
	}
}

func Swipe(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req models.SwipeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()
		pets, _ := q.ListPetsByUserID(ctx, userID)

		swiperPetID := c.Query("pet_id")
		if swiperPetID == "" && len(pets) > 0 {
			swiperPetID = pets[0].ID
		}

		if swiperPetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": "no_pet", "message": "no pet selected for swiping"})
			return
		}

		hasSwiped, _ := q.HasSwiped(ctx, sqlcgen.HasSwipedParams{
			SwiperPetID: swiperPetID,
			SwipedPetID: req.SwipedPetID,
		})
		if hasSwiped {
			c.JSON(http.StatusConflict, gin.H{"code": "already_swiped", "message": "already swiped on this pet"})
			return
		}

		swipe, err := q.CreateSwipe(ctx, sqlcgen.CreateSwipeParams{
			SwiperPetID: swiperPetID,
			SwipedPetID: req.SwipedPetID,
			Direction:   req.Direction,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to swipe"})
			return
		}

		isMatch := false
		if req.Direction == "like" {
			likedBack, _ := q.HasLikedBack(ctx, sqlcgen.HasLikedBackParams{
				SwiperPetID: req.SwipedPetID,
				SwipedPetID: swiperPetID,
			})

			if likedBack {
				_, matchErr := q.CreateMatch(ctx, sqlcgen.CreateMatchParams{
					Column1: swiperPetID,
					Column2: req.SwipedPetID,
				})
				isMatch = matchErr == nil
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"id":            swipe.ID,
			"swiper_pet_id": swipe.SwiperPetID,
			"swiped_pet_id": swipe.SwipedPetID,
			"direction":     swipe.Direction,
			"created_at":    swipe.CreatedAt,
			"is_match":      isMatch,
		})
	}
}

func GetMatches(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountMatchesByUserID(ctx, userID)
		matches, _ := q.ListMatchesByUserID(ctx, sqlcgen.ListMatchesByUserIDParams{
			UserID: userID,
			Limit:  int32(p.PageSize),
			Offset: int32(offset),
		})

		var result []gin.H
		for _, m := range matches {
			result = append(result, gin.H{
				"id":              m.ID,
				"pet_id_1":        m.PetID1,
				"pet_id_2":        m.PetID2,
				"matched_at":      m.MatchedAt,
				"pet1_name":       m.Pet1Name,
				"pet1_avatar":     fromNullString(m.Pet1Avatar),
				"pet2_name":       m.Pet2Name,
				"pet2_avatar":     fromNullString(m.Pet2Avatar),
				"pet1_owner_name": m.Pet1OwnerName,
				"pet2_owner_name": m.Pet2OwnerName,
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

func GetMatchStats(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		ctx := c.Request.Context()

		pets, _ := q.ListPetsByUserID(ctx, userID)

		var result []gin.H
		for _, pet := range pets {
			stats, _ := q.GetPetSwipeStats(ctx, pet.ID)
			matchCount, _ := q.CountMatches(ctx)

			var matchRate float64
			if stats.TotalLikes+stats.TotalPasses > 0 {
				matchRate = float64(matchCount) / float64(stats.TotalLikes) * 100
			}

			result = append(result, gin.H{
				"pet_id":        pet.ID,
				"pet_name":      pet.Name,
				"total_likes":   stats.TotalLikes,
				"total_passes":  stats.TotalPasses,
				"total_matches": matchCount,
				"match_rate":    matchRate,
			})
		}

		c.JSON(http.StatusOK, result)
	}
}

func AdminMatchAnalytics(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		total, _ := q.CountMatches(ctx)
		msgCount, _ := q.CountMessages(ctx)

		c.JSON(http.StatusOK, gin.H{
			"total_matches":  total,
			"total_messages": msgCount,
		})
	}
}
