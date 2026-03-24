package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func ListConversations(db *sql.DB) gin.HandlerFunc {
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

		total, _ := q.CountUserConversations(ctx, userID)
		conversations, _ := q.ListUserConversations(ctx, sqlcgen.ListUserConversationsParams{
			UserID: userID,
			Limit:  int32(p.PageSize),
			Offset: int32(offset),
		})

		var result []gin.H
		for _, conv := range conversations {
			members, _ := q.GetConversationMembers(ctx, conv.ID)
			unread, _ := q.GetUnreadCount(ctx, sqlcgen.GetUnreadCountParams{
				ConversationID: conv.ID,
				SenderID:       userID,
			})

			msgCount, _ := q.CountConversationMessages(ctx, conv.ID)
			var lastMsg interface{}
			if msgCount > 0 {
				msgs, _ := q.ListMessages(ctx, sqlcgen.ListMessagesParams{
					ConversationID: conv.ID,
					Limit:          1,
					Offset:         int32(msgCount - 1),
				})
				if len(msgs) > 0 {
					m := msgs[0]
					lastMsg = gin.H{
						"id":              m.ID,
						"conversation_id": m.ConversationID,
						"sender_id":       m.SenderID,
						"type":            m.Type,
						"content":         m.Content,
						"created_at":      m.CreatedAt,
						"first_name":      m.FirstName,
						"last_name":       m.LastName,
						"sender_avatar":   fromNullString(m.SenderAvatar),
					}
				}
			}

			var memberList []gin.H
			for _, cm := range members {
				memberList = append(memberList, gin.H{
					"conversation_id": cm.ConversationID,
					"user_id":         cm.UserID,
					"pet_id":          fromNullUUID(cm.PetID),
					"joined_at":       cm.JoinedAt,
					"last_read_at":    fromNullTime(cm.LastReadAt),
					"first_name":      cm.FirstName,
					"last_name":       cm.LastName,
					"user_avatar":     fromNullString(cm.UserAvatar),
					"pet_name":        fromNullString(cm.PetName),
					"pet_avatar":      fromNullString(cm.PetAvatar),
				})
			}

			result = append(result, gin.H{
				"id":           conv.ID,
				"type":         conv.Type,
				"name":         fromNullString(conv.Name),
				"event_id":     fromNullUUID(conv.EventID),
				"members":      memberList,
				"unread_count": unread,
				"last_message": lastMsg,
				"created_at":   conv.CreatedAt,
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

func GetConversation(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		ctx := c.Request.Context()

		isMember, _ := q.IsConversationMember(ctx, sqlcgen.IsConversationMemberParams{
			ConversationID: id,
			UserID:         userID,
		})
		if !isMember {
			c.JSON(http.StatusForbidden, gin.H{"code": "forbidden", "message": "not a member of this conversation"})
			return
		}

		conv, err := q.GetConversationByID(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "conversation not found"})
			return
		}

		members, _ := q.GetConversationMembers(ctx, id)
		q.UpdateLastReadAt(ctx, sqlcgen.UpdateLastReadAtParams{
			ConversationID: id,
			UserID:         userID,
		})

		var memberList []gin.H
		for _, cm := range members {
			memberList = append(memberList, gin.H{
				"conversation_id": cm.ConversationID,
				"user_id":         cm.UserID,
				"pet_id":          fromNullUUID(cm.PetID),
				"joined_at":       cm.JoinedAt,
				"last_read_at":    fromNullTime(cm.LastReadAt),
				"first_name":      cm.FirstName,
				"last_name":       cm.LastName,
				"user_avatar":     fromNullString(cm.UserAvatar),
				"pet_name":        fromNullString(cm.PetName),
				"pet_avatar":      fromNullString(cm.PetAvatar),
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"id":         conv.ID,
			"type":       conv.Type,
			"name":       fromNullString(conv.Name),
			"event_id":   fromNullUUID(conv.EventID),
			"members":    memberList,
			"created_at": conv.CreatedAt,
		})
	}
}

func CreateConversation(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req struct {
			Type    string   `json:"type" binding:"required,oneof=dm group"`
			Name    *string  `json:"name,omitempty"`
			EventID *string  `json:"event_id,omitempty"`
			UserIDs []string `json:"user_ids" binding:"required,min=1"`
			PetID   *string  `json:"pet_id,omitempty"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()

		if req.Type == "dm" {
			if len(req.UserIDs) != 1 {
				c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": "DM requires exactly one user_id"})
				return
			}

			existing, err := q.GetDMConversation(ctx, sqlcgen.GetDMConversationParams{
				UserID:   userID,
				UserID_2: req.UserIDs[0],
			})
			if err == nil {
				c.JSON(http.StatusOK, gin.H{
					"id":         existing.ID,
					"type":       existing.Type,
					"message":    "conversation already exists",
					"created_at": existing.CreatedAt,
				})
				return
			}
		}

		conv, err := q.CreateConversation(ctx, sqlcgen.CreateConversationParams{
			Type:    req.Type,
			Name:    toNullString(req.Name),
			EventID: toNullUUID(req.EventID),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create conversation"})
			return
		}

		var petID uuid.NullUUID
		if req.PetID != nil {
			parsed, err := uuid.Parse(*req.PetID)
			if err == nil {
				petID = uuid.NullUUID{UUID: parsed, Valid: true}
			}
		}
		q.AddConversationMember(ctx, sqlcgen.AddConversationMemberParams{
			ConversationID: conv.ID,
			UserID:         userID,
			PetID:          petID,
		})

		for _, uid := range req.UserIDs {
			q.AddConversationMember(ctx, sqlcgen.AddConversationMemberParams{
				ConversationID: conv.ID,
				UserID:         uid,
			})
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":         conv.ID,
			"type":       conv.Type,
			"name":       fromNullString(conv.Name),
			"event_id":   fromNullUUID(conv.EventID),
			"created_at": conv.CreatedAt,
		})
	}
}

func ListMessages(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			p.Page = 1
			p.PageSize = 50
		}

		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		isMember, _ := q.IsConversationMember(ctx, sqlcgen.IsConversationMemberParams{
			ConversationID: id,
			UserID:         userID,
		})
		if !isMember {
			c.JSON(http.StatusForbidden, gin.H{"code": "forbidden", "message": "not a member"})
			return
		}

		total, _ := q.CountConversationMessages(ctx, id)
		messages, _ := q.ListMessages(ctx, sqlcgen.ListMessagesParams{
			ConversationID: id,
			Limit:          int32(p.PageSize),
			Offset:         int32(offset),
		})

		q.UpdateLastReadAt(ctx, sqlcgen.UpdateLastReadAtParams{
			ConversationID: id,
			UserID:         userID,
		})

		var result []gin.H
		for _, m := range messages {
			result = append(result, gin.H{
				"id":              m.ID,
				"conversation_id": m.ConversationID,
				"sender_id":       m.SenderID,
				"type":            m.Type,
				"content":         m.Content,
				"created_at":      m.CreatedAt,
				"first_name":      m.FirstName,
				"last_name":       m.LastName,
				"sender_avatar":   fromNullString(m.SenderAvatar),
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

func SendMessage(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		userID := c.GetString("userID")
		var req models.MessageSend
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()

		isMember, _ := q.IsConversationMember(ctx, sqlcgen.IsConversationMemberParams{
			ConversationID: id,
			UserID:         userID,
		})
		if !isMember {
			c.JSON(http.StatusForbidden, gin.H{"code": "forbidden", "message": "not a member"})
			return
		}

		msgType := req.Type
		if msgType == "" {
			msgType = "text"
		}

		msg, err := q.CreateMessage(ctx, sqlcgen.CreateMessageParams{
			ConversationID: id,
			SenderID:       userID,
			Type:           msgType,
			Content:        req.Content,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to send message"})
			return
		}

		q.UpdateConversationTimestamp(ctx, id)

		c.JSON(http.StatusCreated, gin.H{
			"id":              msg.ID,
			"conversation_id": msg.ConversationID,
			"sender_id":       msg.SenderID,
			"type":            msg.Type,
			"content":         msg.Content,
			"created_at":      msg.CreatedAt,
		})
	}
}
