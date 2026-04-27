package domain

import "time"

// LiveActivity tracks an iOS ActivityKit Live Activity that a device has
// started and is willing to receive `liveactivity` APNs updates for. The
// `push_token` is the per-activity token (rotates), and EndedAt marks rows
// the device has explicitly closed.
type LiveActivity struct {
	ID           string
	UserID       string
	Kind         string // "playdate" | "medication" | "match"
	RelatedID    string // playdate id / medication id / match id
	PushToken    string
	StartedAt    time.Time
	EndedAt      *time.Time
	LastUpdateAt *time.Time
}

// LiveActivityStartToken is the per-device, per-kind push-to-start token
// (iOS 17.2+). Apple lets us start a Live Activity remotely with this; the
// payload differs from a normal update in that it carries the attributes.
type LiveActivityStartToken struct {
	UserID    string
	DeviceID  string
	Kind      string
	Token     string
	UpdatedAt time.Time
}
