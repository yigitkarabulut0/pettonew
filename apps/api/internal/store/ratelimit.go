package store

import (
	"sync"
	"time"
)

// chatRateLimit is a tiny in-process sliding-window rate limiter used by the
// chat send paths. The window is 10 seconds and the burst is 5 messages per
// user, which catches scripted spam without interrupting fast typers.
//
// Scope: per-user across all conversations (so a spammer can't get around it
// by rotating chats). The state lives in memory, so it resets on service
// restart — acceptable for a single-instance deployment.
const (
	chatRateWindow = 10 * time.Second
	chatRateBurst  = 5
)

type rateLimitBucket struct {
	mu     sync.Mutex
	events []time.Time
}

var chatRateBuckets sync.Map // map[string]*rateLimitBucket, keyed by userID

// CheckChatRateLimit records an event for userID and returns true if the user
// is within the allowed burst, false if they should be rejected.
func CheckChatRateLimit(userID string) bool {
	if userID == "" {
		return true
	}
	now := time.Now()
	cutoff := now.Add(-chatRateWindow)

	raw, _ := chatRateBuckets.LoadOrStore(userID, &rateLimitBucket{})
	bucket := raw.(*rateLimitBucket)

	bucket.mu.Lock()
	defer bucket.mu.Unlock()

	// Drop events older than the window.
	fresh := bucket.events[:0]
	for _, t := range bucket.events {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	bucket.events = fresh

	if len(bucket.events) >= chatRateBurst {
		return false
	}
	bucket.events = append(bucket.events, now)
	return true
}
