package server

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func (s *Server) handleMediaPresign(writer http.ResponseWriter, request *http.Request) {
	if s.cfg.R2AccountID == "" || s.cfg.R2Bucket == "" || s.cfg.R2AccessKeyID == "" || s.cfg.R2SecretKey == "" {
		writeError(writer, http.StatusNotImplemented, "r2 upload is not configured")
		return
	}

	var payload struct {
		FileName string `json:"fileName"`
		MimeType string `json:"mimeType"`
		Folder   string `json:"folder"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	objectKey := buildObjectKey(payload.Folder, payload.FileName)
	uploadURL, err := s.createPresignedUploadURL(request.Context(), objectKey, payload.MimeType)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to create upload URL")
		return
	}

	publicBase := strings.TrimRight(s.cfg.R2PublicBaseURL, "/")
	if publicBase == "" {
		writeError(writer, http.StatusBadRequest, "r2 public base URL is not configured")
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{
		"data": map[string]string{
			"id":        objectKey,
			"objectKey": objectKey,
			"uploadUrl": uploadURL,
			"url":       publicBase + "/" + objectKey,
		},
	})
}

func (s *Server) createPresignedUploadURL(ctx context.Context, objectKey string, mimeType string) (string, error) {
	cfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKeyID,
			s.cfg.R2SecretKey,
			"",
		)),
	)
	if err != nil {
		return "", err
	}

	client := s3.NewFromConfig(cfg, func(options *s3.Options) {
		options.UsePathStyle = true
		options.BaseEndpoint = aws.String(fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID))
	})
	presignClient := s3.NewPresignClient(client)

	response, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.R2Bucket),
		Key:         aws.String(objectKey),
		ContentType: aws.String(mimeType),
	}, func(options *s3.PresignOptions) {
		options.Expires = 15 * time.Minute
	})
	if err != nil {
		return "", err
	}

	return response.URL, nil
}

func buildObjectKey(folder string, fileName string) string {
	safeFolder := strings.Trim(strings.ToLower(folder), "/")
	extension := filepath.Ext(fileName)
	if extension == "" {
		extension = ".jpg"
	}
	if safeFolder == "" {
		safeFolder = "uploads"
	}
	return fmt.Sprintf("%s/%s%s", safeFolder, newAssetID(), extension)
}

func (s *Server) handleMediaProxy(writer http.ResponseWriter, request *http.Request) {
	rawURL := request.URL.Query().Get("url")
	if rawURL == "" {
		writeError(writer, http.StatusBadRequest, "url query param is required")
		return
	}

	publicBase := strings.TrimRight(s.cfg.R2PublicBaseURL, "/")
	if publicBase == "" || !strings.HasPrefix(rawURL, publicBase+"/") {
		writeError(writer, http.StatusBadRequest, "url must be from configured R2 public base URL")
		return
	}

	objectKey := strings.TrimPrefix(rawURL, publicBase+"/")
	if objectKey == "" {
		writeError(writer, http.StatusBadRequest, "invalid object key")
		return
	}

	cfg, err := awsconfig.LoadDefaultConfig(
		request.Context(),
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s.cfg.R2AccessKeyID,
			s.cfg.R2SecretKey,
			"",
		)),
	)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "failed to create R2 client")
		return
	}

	client := s3.NewFromConfig(cfg, func(options *s3.Options) {
		options.UsePathStyle = true
		options.BaseEndpoint = aws.String(fmt.Sprintf("https://%s.r2.cloudflarestorage.com", s.cfg.R2AccountID))
	})

	result, err := client.GetObject(request.Context(), &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2Bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		writeError(writer, http.StatusNotFound, "file not found in R2")
		return
	}
	defer result.Body.Close()

	contentType := "application/octet-stream"
	if result.ContentType != nil {
		contentType = *result.ContentType
	}

	writer.Header().Set("Content-Type", contentType)
	writer.Header().Set("Cache-Control", "public, max-age=86400")
	writer.Header().Set("Access-Control-Allow-Origin", "*")
	writer.WriteHeader(http.StatusOK)
	io.Copy(writer, result.Body)
}
