package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/petto/api/internal/config"
)

var r2Client *minio.Client
var r2Config *config.Config

func InitR2(cfg *config.Config) {
	if cfg.R2Endpoint == "" {
		return
	}
	client, err := minio.New(cfg.R2Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.R2AccessKey, cfg.R2SecretKey, ""),
		Secure: true,
	})
	if err != nil {
		return
	}
	r2Client = client
	r2Config = cfg
}

func GenerateUploadURL(c *gin.Context) {
	if r2Client == nil || r2Config == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "r2_not_configured", "message": "file storage not configured"})
		return
	}

	var req struct {
		Filename string `json:"filename" binding:"required"`
		FileType string `json:"file_type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
		return
	}

	userID := c.GetString("userID")
	ext := req.Filename
	objectName := "uploads/" + userID + "/" + ext

	presignedURL, err := r2Client.PresignedPutObject(c.Request.Context(), r2Config.R2Bucket, objectName, 15*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "upload_error", "message": "failed to generate upload URL"})
		return
	}

	publicURL := r2Config.R2PublicURL + "/" + r2Config.R2Bucket + "/" + objectName

	c.JSON(http.StatusOK, gin.H{
		"upload_url": presignedURL.String(),
		"file_url":   publicURL,
	})
}
