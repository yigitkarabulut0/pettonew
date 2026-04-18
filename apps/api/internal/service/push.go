package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ExpoPushMessage is the payload sent to https://exp.host/--/api/v2/push/send.
// Expo forwards `categoryId` to APNs (iOS UNNotificationCategory identifier)
// and `channelId` to the matching Android notification channel. Inline-reply
// notifications use category "message_reply" registered on the client.
//
// `Priority` is critical for delivery latency: "high" maps to `apns-priority: 10`
// (iOS) and `FCM priority: high` — both mean "deliver immediately, wake the
// device if necessary." "default"/"normal" lets the OS coalesce/defer the
// push to save battery, which on iOS can add several seconds up to a minute
// of latency when the device is in Low Power mode or the app is suspended.
type ExpoPushMessage struct {
	To         string            `json:"to"`
	Title      string            `json:"title"`
	Body       string            `json:"body"`
	Data       map[string]string `json:"data,omitempty"`
	Sound      string            `json:"sound,omitempty"`
	Priority   string            `json:"priority,omitempty"`
	CategoryID string            `json:"categoryId,omitempty"`
	ChannelID  string            `json:"channelId,omitempty"`
	TTL        int               `json:"ttl,omitempty"`
}

// ExpoPushOpts passes optional iOS/Android fields without widening the
// public signature of the legacy SendExpoPush used by non-message pushes.
type ExpoPushOpts struct {
	CategoryID string
	ChannelID  string
	Priority   string // "default" | "normal" | "high"; empty = "high"
	TTL        int    // seconds; 0 = Expo default
}

type ExpoPushResponse struct {
	Data []struct {
		Status  string `json:"status"`
		Message string `json:"message,omitempty"`
	} `json:"data"`
}

// Shared HTTP client with a 10-second timeout. http.DefaultClient has no
// timeout, which means a stuck TCP / TLS handshake could hang the goroutine
// indefinitely; 10s is plenty for Expo (p99 is <2s) and lets us log a
// failure and move on.
var expoClient = &http.Client{Timeout: 10 * time.Second}

// SendExpoPush preserves the original signature (used by match / playdate /
// health notifications that don't need interactive actions).
func SendExpoPush(tokens []string, title string, body string, data map[string]string) error {
	return SendExpoPushEx(tokens, title, body, data, ExpoPushOpts{})
}

// SendExpoPushEx adds CategoryID / ChannelID / Priority so message pushes
// can opt into the inline-reply category ("message_reply") and get the
// fast APNs/FCM delivery path.
func SendExpoPushEx(tokens []string, title string, body string, data map[string]string, opts ExpoPushOpts) error {
	if len(tokens) == 0 {
		return nil
	}

	priority := opts.Priority
	if priority == "" {
		// User-initiated pushes (message / match / like / playdate reminder)
		// should always deliver immediately. Default to high and let callers
		// opt back out if they ever need a battery-friendly push.
		priority = "high"
	}

	var messages []ExpoPushMessage
	for _, token := range tokens {
		if token == "" {
			continue
		}
		messages = append(messages, ExpoPushMessage{
			To:         token,
			Title:      title,
			Body:       body,
			Data:       data,
			Sound:      "default",
			Priority:   priority,
			CategoryID: opts.CategoryID,
			ChannelID:  opts.ChannelID,
			TTL:        opts.TTL,
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
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	start := time.Now()
	log.Printf("[PUSH] sending to %d token(s): title=%q body=%q priority=%q category=%q channel=%q",
		len(messages), title, body, priority, opts.CategoryID, opts.ChannelID)

	resp, err := expoClient.Do(req)
	if err != nil {
		log.Printf("[PUSH] ERROR after %v: %v", time.Since(start), err)
		return fmt.Errorf("expo push failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("[PUSH] ERROR status=%d after %v body=%s", resp.StatusCode, time.Since(start), string(respBody))
		return fmt.Errorf("expo push returned status %d", resp.StatusCode)
	}

	log.Printf("[PUSH] OK (%v): %s", time.Since(start), string(respBody))
	return nil
}
