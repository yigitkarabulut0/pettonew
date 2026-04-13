package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

type ExpoPushMessage struct {
	To    string            `json:"to"`
	Title string            `json:"title"`
	Body  string            `json:"body"`
	Data  map[string]string `json:"data,omitempty"`
	Sound string            `json:"sound,omitempty"`
}

type ExpoPushResponse struct {
	Data []struct {
		Status  string `json:"status"`
		Message string `json:"message,omitempty"`
	} `json:"data"`
}

func SendExpoPush(tokens []string, title string, body string, data map[string]string) error {
	if len(tokens) == 0 {
		return nil
	}

	var messages []ExpoPushMessage
	for _, token := range tokens {
		if token == "" {
			continue
		}
		messages = append(messages, ExpoPushMessage{
			To:    token,
			Title: title,
			Body:  body,
			Data:  data,
			Sound: "default",
		})
	}

	if len(messages) == 0 {
		return nil
	}

	payload, err := json.Marshal(messages)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", "https://exp.host/--/api/v2/push/send", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	log.Printf("[PUSH] sending to %d token(s): title=%q body=%q", len(messages), title, body)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[PUSH] ERROR: %v", err)
		return fmt.Errorf("expo push failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("[PUSH] ERROR status=%d body=%s", resp.StatusCode, string(respBody))
		return fmt.Errorf("expo push returned status %d", resp.StatusCode)
	}

	log.Printf("[PUSH] OK: %s", string(respBody))
	return nil
}
