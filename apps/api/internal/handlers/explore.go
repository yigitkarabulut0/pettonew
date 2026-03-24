package handlers

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
	"github.com/sqlc-dev/pqtype"
)

func ListLocations(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		categoryID := c.Query("category_id")
		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountLocations(ctx, categoryID)
		locations, _ := q.ListLocations(ctx, sqlcgen.ListLocationsParams{
			Column1: categoryID,
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		var result []gin.H
		for _, loc := range locations {
			result = append(result, gin.H{
				"id":            loc.ID,
				"name":          loc.Name,
				"description":   fromNullString(loc.Description),
				"category_id":   loc.CategoryID,
				"lat":           loc.Lat,
				"lng":           loc.Lng,
				"address":       fromNullString(loc.Address),
				"image_url":     fromNullString(loc.ImageUrl),
				"created_by":    fromNullUUID(loc.CreatedBy),
				"created_at":    loc.CreatedAt,
				"updated_at":    loc.UpdatedAt,
				"category_name": loc.CategoryName,
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

func GetNearbyLocations(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		latStr := c.Query("lat")
		if latStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "lat required"})
			return
		}
		lat, err := strconv.ParseFloat(latStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "invalid lat"})
			return
		}
		lngStr := c.Query("lng")
		if lngStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "lng required"})
			return
		}
		lng, err := strconv.ParseFloat(lngStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "invalid lng"})
			return
		}
		radiusStr := c.DefaultQuery("radius", "10000")
		radius, _ := strconv.ParseFloat(radiusStr, 64)
		if radius == 0 {
			radius = 10000
		}

		locations, _ := q.GetNearbyLocations(c.Request.Context(), sqlcgen.GetNearbyLocationsParams{
			LlToEarth:   lat,
			LlToEarth_2: lng,
			Lat:         radius,
		})

		var result []gin.H
		for _, loc := range locations {
			result = append(result, gin.H{
				"id":              loc.ID,
				"name":            loc.Name,
				"description":     fromNullString(loc.Description),
				"category_id":     loc.CategoryID,
				"lat":             loc.Lat,
				"lng":             loc.Lng,
				"address":         fromNullString(loc.Address),
				"image_url":       fromNullString(loc.ImageUrl),
				"created_by":      fromNullUUID(loc.CreatedBy),
				"created_at":      loc.CreatedAt,
				"updated_at":      loc.UpdatedAt,
				"category_name":   loc.CategoryName,
				"distance_meters": loc.DistanceMeters,
			})
		}

		c.JSON(http.StatusOK, result)
	}
}

func GetLocationCheckIns(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		checkIns, _ := q.GetActiveCheckInsByLocation(c.Request.Context(), id)

		var result []gin.H
		for _, ci := range checkIns {
			result = append(result, gin.H{
				"id":             ci.ID,
				"user_id":        ci.UserID,
				"location_id":    ci.LocationID,
				"checked_in_at":  ci.CheckedInAt,
				"checked_out_at": fromNullTime(ci.CheckedOutAt),
				"first_name":     ci.FirstName,
				"last_name":      ci.LastName,
				"user_avatar":    fromNullString(ci.UserAvatar),
			})
		}

		c.JSON(http.StatusOK, result)
	}
}

func CheckIn(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req struct {
			LocationID string  `json:"location_id" binding:"required,uuid"`
			Lat        float64 `json:"lat" binding:"required"`
			Lng        float64 `json:"lng" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()

		_, err := q.GetActiveCheckIn(ctx, userID)
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"code": "already_checked_in", "message": "already checked in at another location"})
			return
		}

		location, err := q.GetLocationByID(ctx, req.LocationID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "location not found"})
			return
		}

		distance := earthDistance(req.Lat, req.Lng, location.Lat, location.Lng)
		if distance > 1000 {
			c.JSON(http.StatusForbidden, gin.H{"code": "too_far", "message": "you must be within 1km of the location"})
			return
		}

		checkIn, err := q.CreateCheckIn(ctx, sqlcgen.CreateCheckInParams{
			UserID:     userID,
			LocationID: req.LocationID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to check in"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":             checkIn.ID,
			"user_id":        checkIn.UserID,
			"location_id":    checkIn.LocationID,
			"checked_in_at":  checkIn.CheckedInAt,
			"checked_out_at": fromNullTime(checkIn.CheckedOutAt),
		})
	}
}

func CheckOut(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		ctx := c.Request.Context()
		q.Checkout(ctx, userID)
		c.JSON(http.StatusOK, gin.H{"message": "checked out"})
	}
}

func ListEvents(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountUpcomingEvents(ctx)
		events, _ := q.ListEvents(ctx, sqlcgen.ListEventsParams{
			Limit:  int32(p.PageSize),
			Offset: int32(offset),
		})

		var result []gin.H
		for _, event := range events {
			participantCount, _ := q.CountEventParticipants(ctx, event.ID)
			isParticipating, _ := q.IsEventParticipant(ctx, sqlcgen.IsEventParticipantParams{
				EventID: event.ID,
				UserID:  c.GetString("userID"),
			})

			result = append(result, gin.H{
				"id":                event.ID,
				"title":             event.Title,
				"description":       fromNullString(event.Description),
				"location_id":       fromNullUUID(event.LocationID),
				"lat":               event.Lat,
				"lng":               event.Lng,
				"start_time":        event.StartTime,
				"end_time":          event.EndTime,
				"max_participants":  fromNullInt32(event.MaxParticipants),
				"filters":           event.Filters,
				"image_url":         fromNullString(event.ImageUrl),
				"participant_count": participantCount,
				"is_participating":  isParticipating,
				"created_at":        event.CreatedAt,
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

func GetEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		ctx := c.Request.Context()

		event, err := q.GetEventByID(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "event not found"})
			return
		}

		participants, _ := q.GetEventParticipants(ctx, id)

		var participantList []gin.H
		for _, ep := range participants {
			participantList = append(participantList, gin.H{
				"event_id":    ep.EventID,
				"user_id":     ep.UserID,
				"status":      ep.Status,
				"joined_at":   ep.JoinedAt,
				"first_name":  ep.FirstName,
				"last_name":   ep.LastName,
				"user_avatar": fromNullString(ep.UserAvatar),
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"event": gin.H{
				"id":               event.ID,
				"title":            event.Title,
				"description":      fromNullString(event.Description),
				"location_id":      fromNullUUID(event.LocationID),
				"lat":              event.Lat,
				"lng":              event.Lng,
				"start_time":       event.StartTime,
				"end_time":         event.EndTime,
				"max_participants": fromNullInt32(event.MaxParticipants),
				"filters":          event.Filters,
				"image_url":        fromNullString(event.ImageUrl),
				"created_by":       event.CreatedBy,
				"created_at":       event.CreatedAt,
				"updated_at":       event.UpdatedAt,
			},
			"participants": participantList,
		})
	}
}

func JoinEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		var req struct {
			Status string `json:"status" binding:"required,oneof=going interested"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()

		event, err := q.GetEventByID(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "event not found"})
			return
		}

		if event.MaxParticipants.Valid {
			count, _ := q.CountEventParticipants(ctx, id)
			if int(count) >= int(event.MaxParticipants.Int32) {
				c.JSON(http.StatusConflict, gin.H{"code": "full", "message": "event is full"})
				return
			}
		}

		_, err = q.JoinEvent(ctx, sqlcgen.JoinEventParams{
			EventID: id,
			UserID:  userID,
			Status:  req.Status,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to join event"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "joined event"})
	}
}

func LeaveEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		q.LeaveEvent(c.Request.Context(), sqlcgen.LeaveEventParams{
			EventID: id,
			UserID:  userID,
		})
		c.JSON(http.StatusOK, gin.H{"message": "left event"})
	}
}

func AdminListLocations(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountLocations(ctx, "")
		locations, _ := q.ListLocations(ctx, sqlcgen.ListLocationsParams{
			Column1: "",
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		var result []gin.H
		for _, loc := range locations {
			result = append(result, gin.H{
				"id":            loc.ID,
				"name":          loc.Name,
				"description":   fromNullString(loc.Description),
				"category_id":   loc.CategoryID,
				"lat":           loc.Lat,
				"lng":           loc.Lng,
				"address":       fromNullString(loc.Address),
				"image_url":     fromNullString(loc.ImageUrl),
				"created_by":    fromNullUUID(loc.CreatedBy),
				"created_at":    loc.CreatedAt,
				"updated_at":    loc.UpdatedAt,
				"category_name": loc.CategoryName,
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

func AdminCreateLocation(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req struct {
			Name        string  `json:"name" binding:"required"`
			Description *string `json:"description,omitempty"`
			CategoryID  string  `json:"category_id" binding:"required,uuid"`
			Lat         float64 `json:"lat" binding:"required"`
			Lng         float64 `json:"lng" binding:"required"`
			Address     *string `json:"address,omitempty"`
			ImageURL    *string `json:"image_url,omitempty"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		parsedUserID, _ := uuid.Parse(userID)
		location, err := q.CreateLocation(c.Request.Context(), sqlcgen.CreateLocationParams{
			Name:        req.Name,
			Description: toNullString(req.Description),
			CategoryID:  req.CategoryID,
			Lat:         req.Lat,
			Lng:         req.Lng,
			Address:     toNullString(req.Address),
			ImageUrl:    toNullString(req.ImageURL),
			CreatedBy:   uuid.NullUUID{UUID: parsedUserID, Valid: true},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create location"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":          location.ID,
			"name":        location.Name,
			"description": fromNullString(location.Description),
			"category_id": location.CategoryID,
			"lat":         location.Lat,
			"lng":         location.Lng,
			"address":     fromNullString(location.Address),
			"image_url":   fromNullString(location.ImageUrl),
			"created_by":  fromNullUUID(location.CreatedBy),
			"created_at":  location.CreatedAt,
			"updated_at":  location.UpdatedAt,
		})
	}
}

func AdminUpdateLocation(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Name        *string  `json:"name,omitempty"`
			Description *string  `json:"description,omitempty"`
			CategoryID  *string  `json:"category_id,omitempty"`
			Lat         *float64 `json:"lat,omitempty"`
			Lng         *float64 `json:"lng,omitempty"`
			Address     *string  `json:"address,omitempty"`
			ImageURL    *string  `json:"image_url,omitempty"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		location, err := q.UpdateLocation(c.Request.Context(), sqlcgen.UpdateLocationParams{
			ID:          id,
			Name:        toNullString(req.Name),
			Description: toNullString(req.Description),
			CategoryID:  toNullUUID(req.CategoryID),
			Lat:         toNullFloat64(req.Lat),
			Lng:         toNullFloat64(req.Lng),
			Address:     toNullString(req.Address),
			ImageUrl:    toNullString(req.ImageURL),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to update location"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":          location.ID,
			"name":        location.Name,
			"description": fromNullString(location.Description),
			"category_id": location.CategoryID,
			"lat":         location.Lat,
			"lng":         location.Lng,
			"address":     fromNullString(location.Address),
			"image_url":   fromNullString(location.ImageUrl),
			"created_by":  fromNullUUID(location.CreatedBy),
			"created_at":  location.CreatedAt,
			"updated_at":  location.UpdatedAt,
		})
	}
}

func AdminDeleteLocation(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteLocation(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "location deleted"})
	}
}

func AdminListAllEvents(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 20
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountAllEvents(ctx)
		events, _ := q.ListAllEventsAdmin(ctx, sqlcgen.ListAllEventsAdminParams{
			Limit:  int32(p.PageSize),
			Offset: int32(offset),
		})

		var result []gin.H
		for _, event := range events {
			result = append(result, gin.H{
				"id":               event.ID,
				"title":            event.Title,
				"description":      fromNullString(event.Description),
				"location_id":      fromNullUUID(event.LocationID),
				"lat":              event.Lat,
				"lng":              event.Lng,
				"start_time":       event.StartTime,
				"end_time":         event.EndTime,
				"max_participants": fromNullInt32(event.MaxParticipants),
				"filters":          event.Filters,
				"image_url":        fromNullString(event.ImageUrl),
				"created_by":       event.CreatedBy,
				"created_at":       event.CreatedAt,
				"updated_at":       event.UpdatedAt,
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

func AdminCreateEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req models.Event
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		filtersJSON, _ := json.Marshal(req.Filters)

		event, err := q.CreateEvent(c.Request.Context(), sqlcgen.CreateEventParams{
			Title:           req.Title,
			Description:     toNullString(req.Description),
			LocationID:      toNullUUID(req.LocationID),
			Lat:             req.Lat,
			Lng:             req.Lng,
			StartTime:       req.StartTime,
			EndTime:         req.EndTime,
			MaxParticipants: toNullInt32(req.MaxParticipants),
			Filters:         filtersJSON,
			ImageUrl:        toNullString(req.ImageURL),
			CreatedBy:       userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create event"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":               event.ID,
			"title":            event.Title,
			"description":      fromNullString(event.Description),
			"location_id":      fromNullUUID(event.LocationID),
			"lat":              event.Lat,
			"lng":              event.Lng,
			"start_time":       event.StartTime,
			"end_time":         event.EndTime,
			"max_participants": fromNullInt32(event.MaxParticipants),
			"filters":          event.Filters,
			"image_url":        fromNullString(event.ImageUrl),
			"created_by":       event.CreatedBy,
			"created_at":       event.CreatedAt,
			"updated_at":       event.UpdatedAt,
		})
	}
}

func AdminUpdateEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		var req models.Event
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		filtersJSON, _ := json.Marshal(req.Filters)

		event, err := q.UpdateEvent(c.Request.Context(), sqlcgen.UpdateEventParams{
			ID:              id,
			Title:           toNullString(&req.Title),
			Description:     toNullString(req.Description),
			Lat:             toNullFloat64(&req.Lat),
			Lng:             toNullFloat64(&req.Lng),
			StartTime:       toNullTimeIfNonZero(req.StartTime),
			EndTime:         toNullTimeIfNonZero(req.EndTime),
			MaxParticipants: toNullInt32(req.MaxParticipants),
			Filters:         pqtype.NullRawMessage{RawMessage: filtersJSON, Valid: len(filtersJSON) > 0 && string(filtersJSON) != "{}"},
			ImageUrl:        toNullString(req.ImageURL),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to update event"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":               event.ID,
			"title":            event.Title,
			"description":      fromNullString(event.Description),
			"location_id":      fromNullUUID(event.LocationID),
			"lat":              event.Lat,
			"lng":              event.Lng,
			"start_time":       event.StartTime,
			"end_time":         event.EndTime,
			"max_participants": fromNullInt32(event.MaxParticipants),
			"filters":          event.Filters,
			"image_url":        fromNullString(event.ImageUrl),
			"created_by":       event.CreatedBy,
			"created_at":       event.CreatedAt,
			"updated_at":       event.UpdatedAt,
		})
	}
}

func AdminDeleteEvent(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteEvent(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "event deleted"})
	}
}

func AdminDashboard(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		now := time.Now().Truncate(24 * time.Hour)

		userCount, _ := q.CountUsers(ctx, sqlcgen.CountUsersParams{})
		petCount, _ := q.CountPets(ctx)
		postCount, _ := q.CountPosts(ctx)
		matchCount, _ := q.CountMatches(ctx)
		msgCount, _ := q.CountMessages(ctx)
		checkInCount, _ := q.CountCheckIns(ctx)
		newUsersToday, _ := q.CountUsersCreatedAfter(ctx, now)
		newPostsToday, _ := q.CountPostsCreatedAfter(ctx, now)
		activeUsersToday, _ := q.CountActiveUsersAfter(ctx, now)

		c.JSON(http.StatusOK, models.DashboardStats{
			TotalUsers:       userCount,
			TotalPets:        petCount,
			TotalPosts:       postCount,
			TotalMatches:     matchCount,
			TotalMessages:    msgCount,
			TotalCheckIns:    checkInCount,
			NewUsersToday:    newUsersToday,
			NewPostsToday:    newPostsToday,
			ActiveUsersToday: activeUsersToday,
		})
	}
}

func earthDistance(lat1, lng1, lat2, lng2 float64) float64 {
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLng := (lng2 - lng1) * math.Pi / 180

	a := deltaLat/2*deltaLat/2 + lat1Rad*lat1Rad*deltaLng/2*deltaLng/2
	_ = lat2Rad
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return c * 6371000
}
