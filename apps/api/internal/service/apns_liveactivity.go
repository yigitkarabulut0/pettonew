package service

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// LiveActivityAPNs sends Live Activity push notifications directly to Apple
// Push Notification service via HTTP/2. Expo Push does not support the
// `liveactivity` push type, so this is a separate sender.
//
// Auth uses a JWT signed with an ES256 .p8 Authentication Key, which APNs
// validates against the configured KeyID + TeamID. JWTs are reusable for up
// to 60 minutes; we cache and rotate every 50 minutes.
//
// The endpoint differs by environment: production builds use api.push.apple
// .com, dev/sandbox builds use api.sandbox.push.apple.com. APNs rejects the
// "wrong" environment with 400 + reason "BadDeviceToken".
type LiveActivityAPNs struct {
	keyID     string
	teamID    string
	topic     string // app bundle id
	signKey   *ecdsa.PrivateKey
	endpoint  string
	client    *http.Client
	tokenLock sync.Mutex
	jwtCache  string
	jwtIssued time.Time
}

type LiveActivityAPNsConfig struct {
	KeyID      string
	TeamID     string
	KeyPath    string
	Topic      string // e.g. "app.petto.mobile"
	Production bool
}

// NewLiveActivityAPNs loads the .p8 key and prepares an HTTP/2 client.
// Returns nil + error if the key file cannot be read; callers should treat
// that as "Live Activities disabled" and skip Live Activity work.
func NewLiveActivityAPNs(cfg LiveActivityAPNsConfig) (*LiveActivityAPNs, error) {
	if cfg.KeyID == "" || cfg.TeamID == "" || cfg.KeyPath == "" || cfg.Topic == "" {
		return nil, errors.New("apns config incomplete")
	}
	pem, err := os.ReadFile(cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("read p8 key: %w", err)
	}
	key, err := parseP8(pem)
	if err != nil {
		return nil, err
	}
	endpoint := "https://api.sandbox.push.apple.com/3/device/"
	if cfg.Production {
		endpoint = "https://api.push.apple.com/3/device/"
	}
	return &LiveActivityAPNs{
		keyID:    cfg.KeyID,
		teamID:   cfg.TeamID,
		topic:    cfg.Topic,
		signKey:  key,
		endpoint: endpoint,
		// Stdlib http transport upgrades to HTTP/2 over TLS via ALPN, which
		// is exactly what APNs requires.
		client: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func parseP8(b []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(b)
	if block == nil {
		return nil, errors.New("invalid p8 pem")
	}
	pk, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse pkcs8: %w", err)
	}
	ec, ok := pk.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("p8 key is not ecdsa")
	}
	return ec, nil
}

func (a *LiveActivityAPNs) jwtToken() (string, error) {
	a.tokenLock.Lock()
	defer a.tokenLock.Unlock()
	if a.jwtCache != "" && time.Since(a.jwtIssued) < 50*time.Minute {
		return a.jwtCache, nil
	}
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": a.teamID,
		"iat": now.Unix(),
	})
	tok.Header["kid"] = a.keyID
	signed, err := tok.SignedString(a.signKey)
	if err != nil {
		return "", err
	}
	a.jwtCache = signed
	a.jwtIssued = now
	return signed, nil
}

// LiveActivityEvent corresponds to APNs `aps.event`: "update", "end", or
// "start" (push-to-start, iOS 17.2+).
type LiveActivityEvent string

const (
	LAEventUpdate LiveActivityEvent = "update"
	LAEventEnd    LiveActivityEvent = "end"
	LAEventStart  LiveActivityEvent = "start"
)

// LiveActivityPayload is the top-level APNs payload for liveactivity push.
// Only the `aps` block matters to ActivityKit; we serialise it inline so
// callers can build it once and reuse it across multiple device tokens.
type LiveActivityPayload struct {
	Event           LiveActivityEvent      `json:"event"`
	Timestamp       int64                  `json:"timestamp"`
	ContentState    map[string]any         `json:"content-state,omitempty"`
	StaleDate       int64                  `json:"stale-date,omitempty"`
	DismissalDate   int64                  `json:"dismissal-date,omitempty"`
	AttributesType  string                 `json:"attributes-type,omitempty"`
	Attributes      map[string]any         `json:"attributes,omitempty"`
	Alert           *LiveActivityAlert     `json:"alert,omitempty"`
	RelevanceScore  *float64               `json:"relevance-score,omitempty"`
}

type LiveActivityAlert struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Sound string `json:"sound,omitempty"`
}

// SendUpdate pushes an `update` event for an existing Live Activity.
// `pushToken` is the per-activity token the device uploaded.
func (a *LiveActivityAPNs) SendUpdate(pushToken string, state map[string]any, alert *LiveActivityAlert, staleAfter time.Duration) error {
	p := LiveActivityPayload{
		Event:        LAEventUpdate,
		Timestamp:    time.Now().Unix(),
		ContentState: state,
		Alert:        alert,
	}
	if staleAfter > 0 {
		p.StaleDate = time.Now().Add(staleAfter).Unix()
	}
	return a.send(pushToken, p, false)
}

// SendStart fires an iOS 17.2+ push-to-start. `attributesType` MUST match
// the Swift struct name (`PlaydateAttributes`). The device's pushToStart
// token (one per app) is what we send to.
func (a *LiveActivityAPNs) SendStart(pushToStartToken string, attributesType string, attributes map[string]any, state map[string]any, alert *LiveActivityAlert) error {
	p := LiveActivityPayload{
		Event:          LAEventStart,
		Timestamp:      time.Now().Unix(),
		AttributesType: attributesType,
		Attributes:     attributes,
		ContentState:   state,
		Alert:          alert,
	}
	return a.send(pushToStartToken, p, true)
}

// SendEnd ends an existing Live Activity, optionally with a final state.
// `dismissAfter` of zero requests immediate dismissal (.immediate); a
// positive duration sets `dismissal-date`; negative leaves it to the
// system default (~4h Dynamic Island visibility).
func (a *LiveActivityAPNs) SendEnd(pushToken string, finalState map[string]any, dismissAfter time.Duration) error {
	p := LiveActivityPayload{
		Event:        LAEventEnd,
		Timestamp:    time.Now().Unix(),
		ContentState: finalState,
	}
	if dismissAfter == 0 {
		p.DismissalDate = time.Now().Unix()
	} else if dismissAfter > 0 {
		p.DismissalDate = time.Now().Add(dismissAfter).Unix()
	}
	return a.send(pushToken, p, false)
}

func (a *LiveActivityAPNs) send(pushToken string, payload LiveActivityPayload, isStart bool) error {
	if pushToken == "" {
		return errors.New("empty push token")
	}
	body, err := json.Marshal(map[string]any{"aps": payload})
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, a.endpoint+pushToken, bytes.NewReader(body))
	if err != nil {
		return err
	}
	jwtTok, err := a.jwtToken()
	if err != nil {
		return err
	}
	topic := a.topic + ".push-type.liveactivity"
	req.Header.Set("authorization", "bearer "+jwtTok)
	req.Header.Set("apns-topic", topic)
	req.Header.Set("apns-push-type", "liveactivity")
	req.Header.Set("apns-priority", "10")
	req.Header.Set("apns-expiration", fmt.Sprintf("%d", time.Now().Add(1*time.Hour).Unix()))
	req.Header.Set("content-type", "application/json")

	res, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("apns %d: %s", res.StatusCode, string(b))
	}
	return nil
}

// LogSendError logs without breaking the calling request. Live Activity
// push failures must never fail user-visible operations like joining a
// playdate; we degrade gracefully and let the next event re-sync state.
func LogSendError(context string, err error) {
	if err != nil {
		log.Printf("[liveactivity] %s: %v", context, err)
	}
}
