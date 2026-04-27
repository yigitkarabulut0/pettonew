package server

import (
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
)

// playdateLiveActivityState builds the ContentState payload that mirrors
// the SwiftUI struct's `Codable` keys exactly. Any rename here MUST happen
// in PlaydateAttributes.swift on the device too — the JSON keys are the
// contract between server and client.
func (s *Server) playdateLiveActivityState(p *domain.Playdate, statusOverride string, statusMessage string) map[string]any {
	startsAt, _ := time.Parse(time.RFC3339, p.Date)
	if startsAt.IsZero() {
		// Fall back to "now + 1h" so a malformed date doesn't poison the
		// state — the UI shows a placeholder instead of crashing.
		startsAt = time.Now().Add(time.Hour)
	}
	endsAt := startsAt.Add(2 * time.Hour)

	status := statusOverride
	if status == "" {
		switch {
		case p.Status == "cancelled":
			status = "cancelled"
		case time.Now().After(endsAt):
			status = "ended"
		case time.Now().After(startsAt):
			status = "in_progress"
		default:
			status = "upcoming"
		}
	}

	avatars := make([]string, 0, 3)
	for _, a := range p.AttendeesInfo {
		if a.AvatarURL != "" && len(avatars) < 3 {
			avatars = append(avatars, a.AvatarURL)
		}
	}

	out := map[string]any{
		"status":         status,
		"startsAtSec":    startsAt.Unix(),
		"endsAtSec":      endsAt.Unix(),
		"attendeeCount":  len(p.Attendees),
		"maxPets":        p.MaxPets,
		"firstAvatars":   avatars,
	}
	if statusMessage != "" {
		out["statusMessage"] = statusMessage
	}
	return out
}

func (s *Server) playdateLiveActivityAttributes(p *domain.Playdate) map[string]any {
	return map[string]any{
		"playdateId": p.ID,
		"title":      p.Title,
		"city":       p.CityLabel,
		"hostName":   playdateHostName(p),
		"hostAvatar": playdateHostAvatar(p),
		"emoji":      "🐾",
	}
}

func playdateHostName(p *domain.Playdate) string {
	if p.HostInfo != nil && p.HostInfo.FirstName != "" {
		return p.HostInfo.FirstName
	}
	return "Host"
}

func playdateHostAvatar(p *domain.Playdate) string {
	if p.HostInfo != nil {
		return p.HostInfo.AvatarURL
	}
	return ""
}

// pushPlaydateLiveActivityUpdate fans out an `update` event to every
// device that has registered a per-activity push token for this playdate.
// Best-effort: failures are logged and discarded so the calling user-
// facing handler never errors because of a Live Activity hiccup.
func (s *Server) pushPlaydateLiveActivityUpdate(playdateID string, statusOverride string, statusMessage string) {
	if s.apns == nil {
		return
	}
	activities := s.store.GetActiveLiveActivitiesForRelated("playdate", playdateID)
	if len(activities) == 0 {
		return
	}
	playdate, err := s.store.GetPlaydate(playdateID)
	if err != nil || playdate == nil {
		return
	}
	state := s.playdateLiveActivityState(playdate, statusOverride, statusMessage)
	for _, a := range activities {
		err := s.apns.SendUpdate(a.PushToken, state, nil, 30*time.Minute)
		service.LogSendError("playdate update "+a.ID, err)
	}
}

// endPlaydateLiveActivities issues an `end` event to every active Live
// Activity for the playdate, then marks them ended in the store. Used
// when the playdate is cancelled or finishes.
func (s *Server) endPlaydateLiveActivities(playdateID string, statusOverride string, statusMessage string, immediate bool) {
	if s.apns == nil {
		return
	}
	activities := s.store.GetActiveLiveActivitiesForRelated("playdate", playdateID)
	if len(activities) == 0 {
		return
	}
	playdate, err := s.store.GetPlaydate(playdateID)
	var state map[string]any
	if err == nil && playdate != nil {
		state = s.playdateLiveActivityState(playdate, statusOverride, statusMessage)
	}
	dismiss := time.Hour
	if immediate {
		dismiss = 0
	}
	for _, a := range activities {
		err := s.apns.SendEnd(a.PushToken, state, dismiss)
		service.LogSendError("playdate end "+a.ID, err)
		s.store.MarkLiveActivityEnded(a.ID, a.UserID)
	}
}

// pushPlaydateLiveActivityStart fires push-to-start for users that have
// uploaded a push-to-start token but don't yet have an active Live
// Activity for this playdate. Used by the 1-hour reminder loop so the
// activity appears on the lock screen even if the app hasn't been opened
// recently. Requires iOS 17.2+ on the device; older devices silently
// no-op (the start payload is ignored by the OS).
func (s *Server) pushPlaydateLiveActivityStart(playdateID string, userIDs []string) {
	if s.apns == nil || len(userIDs) == 0 {
		return
	}
	playdate, err := s.store.GetPlaydate(playdateID)
	if err != nil || playdate == nil {
		return
	}
	attrs := s.playdateLiveActivityAttributes(playdate)
	state := s.playdateLiveActivityState(playdate, "", "")
	alert := &service.LiveActivityAlert{
		Title: "Playdate in 1 hour",
		Body:  playdate.Title,
		Sound: "default",
	}

	existingByUser := map[string]bool{}
	for _, a := range s.store.GetActiveLiveActivitiesForRelated("playdate", playdateID) {
		existingByUser[a.UserID] = true
	}

	for _, uid := range userIDs {
		if existingByUser[uid] {
			continue
		}
		tokens := s.store.GetUserLiveActivityStartTokens(uid, "playdate")
		for _, t := range tokens {
			err := s.apns.SendStart(t.Token, "PlaydateAttributes", attrs, state, alert)
			service.LogSendError("playdate start "+playdateID, err)
		}
	}
}
