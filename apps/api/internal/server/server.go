package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/chat"
	"github.com/yigitkarabulut/petto/apps/api/internal/config"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
	"github.com/yigitkarabulut/petto/apps/api/internal/store"
)

type contextKey string

const userIDKey contextKey = "userID"

type Server struct {
	cfg   config.Config
	store store.Store
	hub   *chat.Hub
}

func New(cfg config.Config, dataStore store.Store) *Server {
	srv := &Server{
		cfg:   cfg,
		store: dataStore,
		hub:   chat.NewHub(),
	}
	// Start the background playdate-reminder scheduler. Sends a "starts in 1
	// hour" push to each attendee/host exactly once per playdate.
	go srv.runPlaydateReminderLoop()
	// v0.14.1 — Care reminders.
	// Per-minute medication sweeper: walks active medications, computes the
	// next due time in each medication's stored timezone, and pushes once
	// per scheduled occurrence.
	go srv.runMedicationReminderLoop()
	// Hourly Sunday weekly-summary sender. Idempotent via the
	// user_weekly_summary_log table — restart-safe.
	go srv.runWeeklySummaryLoop()
	// Per-minute scheduled-push loop — fires every admin-defined recurring
	// broadcast whose next_run_at has passed, then rolls next_run_at
	// forward. State lives in `scheduled_pushes`; restart-safe.
	go srv.runScheduledPushLoop()
	return srv
}

// runPlaydateReminderLoop ticks every minute, looks for playdates whose `date`
// falls in the window [now+55min, now+65min], and fires a push + in-app
// notification to every unseen (playdate, user) pair. Idempotency is enforced
// by `playdate_reminders_sent`, so a service restart inside the window can
// only re-attempt — never double-send.
func (s *Server) runPlaydateReminderLoop() {
	const kind = "1h_before"
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PLAYDATE-REMINDER] panic recovered: %v", r)
		}
	}()
	// Small initial delay so short-lived processes don't hammer the DB on boot.
	time.Sleep(20 * time.Second)
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[PLAYDATE-REMINDER] tick panic: %v", r)
				}
			}()
			now := time.Now().UTC()
			from := now.Add(55 * time.Minute).Format(time.RFC3339)
			to := now.Add(65 * time.Minute).Format(time.RFC3339)
			targets := s.store.ListDuePlaydateReminders(from, to, kind)
			for _, tgt := range targets {
				title := "Playdate in 1 hour"
				body := tgt.PlaydateTitle
				if tgt.CityLabel != "" {
					body = tgt.PlaydateTitle + " · " + tgt.CityLabel
				}
				s.store.SaveNotification(domain.Notification{
					ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
					Title:  title,
					Body:   body,
					Target: tgt.UserID,
					SentAt: time.Now().UTC().Format(time.RFC3339),
					SentBy: "system",
				})
				if s.store.ShouldSendPush(tgt.UserID, "playdates") {
					tokens := s.store.GetUserPushTokens(tgt.UserID)
					var push []string
					for _, t := range tokens {
						push = append(push, t.Token)
					}
					if len(push) > 0 {
						_ = service.SendExpoPush(push, title, body, map[string]string{
							"type":       "playdate_reminder",
							"playdateId": tgt.PlaydateID,
						})
					}
				}
				s.store.MarkPlaydateReminderSent(tgt.PlaydateID, tgt.UserID, kind)
			}
			if len(targets) > 0 {
				log.Printf("[PLAYDATE-REMINDER] sent %d reminders for 1h window", len(targets))
			}
		}()
	}
}

// runMedicationReminderLoop fires once a minute. For each active medication
// it computes the scheduled HH:MM time *in the medication's stored timezone*
// for today, and pushes a reminder to the owner if:
//   - today is one of the days_of_week
//   - now is within [scheduled-1m, scheduled+2m] (small grace window)
//   - we haven't already pushed for today's date in that timezone
// Idempotency is enforced by `pet_medications.last_push_date`.
func (s *Server) runMedicationReminderLoop() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[MED-REMINDER] panic recovered: %v", r)
		}
	}()
	time.Sleep(25 * time.Second)
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[MED-REMINDER] tick panic: %v", r)
				}
			}()
			rows := s.store.ListActiveMedicationsForSweeper()
			pushed := 0
			now := time.Now().UTC()
			for _, row := range rows {
				loc, err := time.LoadLocation(row.Timezone)
				if err != nil {
					continue
				}
				localNow := now.In(loc)
				todayDate := localNow.Format("2006-01-02")
				if row.LastPushDate == todayDate {
					continue
				}
				// Day-of-week gate. time.Weekday: Sunday=0..Saturday=6.
				dow := int(localNow.Weekday())
				match := false
				for _, d := range row.DaysOfWeek {
					if d == dow {
						match = true
						break
					}
				}
				if !match {
					continue
				}
				// Date-range gate.
				if row.StartDate != "" && todayDate < row.StartDate {
					continue
				}
				if row.EndDate != "" && todayDate > row.EndDate {
					continue
				}
				// Compute scheduled time today in pet TZ.
				h, m, ok := parseHHMM(row.TimeOfDay)
				if !ok {
					continue
				}
				scheduled := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), h, m, 0, 0, loc)
				delta := localNow.Sub(scheduled)
				// Grace window — fire from 1 min early to 2 min late so the
				// per-minute ticker can never miss a slot.
				if delta < -time.Minute || delta > 2*time.Minute {
					continue
				}
				// Send push.
				title := "Medication reminder"
				body := fmt.Sprintf("Time for %s's %s", row.PetName, row.Name)
				if row.Dosage != "" {
					body = fmt.Sprintf("%s · %s", body, row.Dosage)
				}
				s.store.SaveNotification(domain.Notification{
					ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
					Title:  title,
					Body:   body,
					Target: row.OwnerID,
					SentAt: time.Now().UTC().Format(time.RFC3339),
					SentBy: "system",
				})
				if s.store.ShouldSendPush(row.OwnerID, "medications") {
					tokens := s.store.GetUserPushTokens(row.OwnerID)
					var t []string
					for _, tk := range tokens {
						t = append(t, tk.Token)
					}
					if len(t) > 0 {
						_ = service.SendExpoPush(t, title, body, map[string]string{
							"type":  "medication",
							"petId": row.PetID,
							"medId": row.MedID,
						})
					}
				}
				_ = s.store.MarkMedicationPushed(row.MedID, todayDate)
				pushed++
			}
			if pushed > 0 {
				log.Printf("[MED-REMINDER] pushed %d medication reminders", pushed)
			}
		}()
	}
}

// runWeeklySummaryLoop fires once an hour. On Sundays at 18:00 UTC it
// aggregates each user's last 7 days of Care activity and pushes a summary
// — but only when something actually happened. Quiet weeks stay quiet.
//
// 18:00 UTC lands at: 21:00 Istanbul, 19:00 London, 14:00 New York. It's
// not perfect for everyone but a reasonable default for v1; per-user TZ is
// a Faz 3 follow-up.
func (s *Server) runWeeklySummaryLoop() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[WEEKLY-SUMMARY] panic recovered: %v", r)
		}
	}()
	time.Sleep(40 * time.Second)
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		s.maybeRunWeeklySummary()
		<-ticker.C
	}
}

func (s *Server) maybeRunWeeklySummary() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[WEEKLY-SUMMARY] tick panic: %v", r)
		}
	}()
	now := time.Now().UTC()
	if now.Weekday() != time.Sunday || now.Hour() != 18 {
		return
	}
	weekStart, weekEnd := lastWeekUTCWindow(now)
	users := s.store.ListUsersForWeeklySummary(weekStart)
	if len(users) == 0 {
		return
	}
	pushed := 0
	for _, uid := range users {
		sum := s.store.GetWeeklyHealthSummaryForUser(uid, weekStart, weekEnd)
		if !sum.HasActivity {
			s.store.RecordWeeklySummarySent(uid, weekStart) // mark anyway so we don't recompute every hour
			continue
		}
		title := "Your week in Care"
		body := buildWeeklyDigest(sum)
		s.store.SaveNotification(domain.Notification{
			ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
			Title:  title,
			Body:   body,
			Target: uid,
			SentAt: time.Now().UTC().Format(time.RFC3339),
			SentBy: "system",
		})
		if s.store.ShouldSendPush(uid, "weekly_summary") {
			tokens := s.store.GetUserPushTokens(uid)
			var t []string
			for _, tk := range tokens {
				t = append(t, tk.Token)
			}
			if len(t) > 0 {
				_ = service.SendExpoPush(t, title, body, map[string]string{
					"type": "weekly_summary",
				})
			}
		}
		s.store.RecordWeeklySummarySent(uid, weekStart)
		pushed++
	}
	if pushed > 0 {
		log.Printf("[WEEKLY-SUMMARY] sent %d weekly digests for week %s", pushed, weekStart)
	}
}

// lastWeekUTCWindow — the just-completed Mon..Sun window. Used by the
// Sunday push so the digest summarises *this past* week.
func lastWeekUTCWindow(now time.Time) (string, string) {
	wd := int(now.Weekday()) - 1
	if wd < 0 {
		wd = 6
	}
	monday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, -wd)
	return monday.Format(time.RFC3339), monday.AddDate(0, 0, 7).Format(time.RFC3339)
}

func buildWeeklyDigest(sum domain.WeeklyHealthSummary) string {
	parts := []string{}
	if sum.WeightEntries > 0 {
		parts = append(parts, fmt.Sprintf("%d weight log%s", sum.WeightEntries, plural(sum.WeightEntries)))
	}
	if sum.HealthRecords > 0 {
		parts = append(parts, fmt.Sprintf("%d health record%s", sum.HealthRecords, plural(sum.HealthRecords)))
	}
	if sum.SymptomLogs > 0 {
		parts = append(parts, fmt.Sprintf("%d symptom log%s", sum.SymptomLogs, plural(sum.SymptomLogs)))
	}
	if sum.MedicationsGiven > 0 {
		parts = append(parts, fmt.Sprintf("%d medication dose%s", sum.MedicationsGiven, plural(sum.MedicationsGiven)))
	}
	if sum.DiaryEntries > 0 {
		if sum.DiaryEntries == 1 {
			parts = append(parts, "1 diary entry")
		} else {
			parts = append(parts, fmt.Sprintf("%d diary entries", sum.DiaryEntries))
		}
	}
	if len(parts) == 0 {
		return "Open Fetcht to see this week's activity."
	}
	return "This week: " + strings.Join(parts, ", ")
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func parseHHMM(s string) (int, int, bool) {
	if !validMedicationTime(s) {
		return 0, 0, false
	}
	h, _ := strconv.Atoi(s[0:2])
	m, _ := strconv.Atoi(s[3:5])
	return h, m, true
}

func (s *Server) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(s.cors)
	router.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadsDir))))

	router.Get("/healthz", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})

	// v0.11.0 — public share landing page.
	// Tapping a WhatsApp / SMS share link hits this URL instead of the raw
	// petto:// scheme (which WhatsApp strips). We render a tiny HTML page
	// that tries to open the app via the custom scheme and falls through to
	// store badges if the app isn't installed.
	router.Get("/p/{playdateID}", s.handlePlaydateShareLanding)

	router.Route("/v1", func(router chi.Router) {
		router.Route("/auth", func(router chi.Router) {
			router.Post("/register", s.handleRegister)
			router.Post("/login", s.handleLogin)
			router.Post("/refresh", s.handleRefresh)
			router.Post("/verify-email/request", s.handleVerifyRequest)
			router.Post("/verify-email/confirm", s.handleVerifyConfirm)
			router.Post("/forgot-password", s.handleForgotPassword)
			router.Post("/reset-password", s.handleResetPassword)
		})

		// v0.14 — Public shelter onboarding. The wizard runs
		// unauthenticated (applicants don't have accounts yet); rate
		// limiting is handled at the edge.
		router.Route("/public", func(router chi.Router) {
			router.Get("/taxonomies/shelter-entity-types", s.handlePublicShelterEntityTypes)
			router.Post("/shelter-applications", s.handlePublicShelterApplicationSubmit)
			router.Get("/shelter-applications/{token}", s.handlePublicShelterApplicationStatus)
			router.Post("/shelter-applications/presign", s.handlePublicShelterApplicationPresign)
			// v0.15 — Public shelter member invite accept.
			router.Get("/shelter-invites/{token}", s.handlePublicShelterInviteInfo)
			router.Post("/shelter-invites/{token}/accept", s.handlePublicShelterInviteAccept)
			// v0.24 — Featured shelters rail for the fetcht discovery
			// home. Admin-curated, verified-only, capped at 10.
			// Registered BEFORE the slug route so chi's trie picks the
			// literal match first.
			router.Get("/shelters/featured", s.handlePublicListFeaturedShelters)
			// v0.21 — Public shelter profile pages. Slug-keyed,
			// verified-only; contact channels stripped from payload.
			router.Get("/shelters/{slug}", s.handlePublicShelterProfile)
			router.Get("/shelters/{slug}/pets", s.handlePublicShelterPets)
			router.Get("/shelters/{slug}/pets/{petID}", s.handlePublicShelterPetDetail)
			router.Get("/shelters/{slug}/recently-adopted", s.handlePublicShelterRecentlyAdopted)
			// v0.22 — Anonymous view tracking (increments view_count).
			router.Post("/pets/{petID}/view", s.handlePublicPetView)
		})

		router.Group(func(router chi.Router) {
			router.Use(s.appAuth)
			router.Get("/me", s.handleMe)
			router.Put("/me/profile", s.handleUpdateProfile)
			router.Get("/me/pets", s.handleListPets)
			router.Post("/me/pets", s.handleCreatePet)
			router.Put("/me/pets/{petID}", s.handleUpdatePet)
			router.Patch("/me/pets/{petID}/visibility", s.handlePetVisibility)
			router.Get("/pets/{petID}", s.handleGetPet)
			router.Get("/taxonomies/{kind}", s.handleTaxonomyList)
			router.Get("/discovery/feed", s.handleDiscoveryFeed)
			router.Post("/swipes", s.handleSwipe)
			router.Get("/matches", s.handleMatches)
			router.Get("/conversations", s.handleConversations)
			router.Get("/messages", s.handleMessages)
			router.Post("/messages", s.handleSendMessage)
			router.Post("/messages/read", s.handleMarkMessagesRead)
			router.Post("/conversations/dm", s.handleCreateDirectConversation)
			router.Get("/home/feed", s.handleHomeFeed)
			router.Post("/home/posts", s.handleHomePostCreate)
			router.Post("/home/posts/{postID}/likes", s.handleHomePostLikeToggle)
			router.Get("/me/check-in-history", s.handleCheckInHistory)
			router.Get("/explore/venues", s.handleExploreVenues)
			router.Post("/explore/check-ins", s.handleExploreCheckIn)
			router.Get("/explore/events", s.handleExploreEvents)
			router.Post("/explore/events/{eventID}/rsvps", s.handleExploreEventRSVP)
			router.Get("/explore/feed", s.handleExploreFeed)
			// v0.11.0 — per-user notification preferences
			router.Get("/me/notification-prefs", s.handleGetNotificationPrefs)
			router.Put("/me/notification-prefs", s.handleUpdateNotificationPrefs)
			router.Get("/discover/nearby", s.handleNearbyPets)
			router.Get("/ws", s.handleWebSocket)
			router.Get("/pets/{petID}/diary", s.handleListDiary)
			router.Post("/pets/{petID}/diary", s.handleCreateDiaryEntry)
			router.Get("/favorites", s.handleListFavorites)
			router.Post("/favorites", s.handleAddFavorite)
			router.Delete("/favorites/{petID}", s.handleRemoveFavorite)
			// Adoption favorites — scoped to shelter_pets (adoptable listings).
			router.Get("/adoption/favorites", s.handleListAdoptionFavorites)
			router.Post("/adoption/favorites", s.handleAddAdoptionFavorite)
			router.Delete("/adoption/favorites/{petID}", s.handleRemoveAdoptionFavorite)
			router.Get("/users/{userID}/profile", s.handlePublicUserProfile)
			router.Post("/blocks", s.handleBlockUser)
			router.Post("/reports", s.handleReport)
			router.Post("/push-token", s.handleSavePushToken)
			// Presence — foreground heartbeat + offline ping.
			router.Post("/presence/heartbeat", s.handlePresenceHeartbeat)
			router.Post("/presence/offline", s.handlePresenceOffline)
			router.Post("/media/upload", s.handleUpload)
			router.Post("/media/presign", s.handleMediaPresign)
			// Health
			router.Get("/pets/{petID}/health", s.handleListHealth)
			router.Post("/pets/{petID}/health", s.handleCreateHealth)
			router.Delete("/pets/{petID}/health/{recordID}", s.handleDeleteHealth)
			// Health profile (allergies + dietary restrictions + emergency notes)
			router.Get("/pets/{petID}/health-profile", s.handleGetHealthProfile)
			router.Put("/pets/{petID}/health-profile", s.handleUpsertHealthProfile)
			// Symptom log (categorised symptom timeline, vet-export-ready)
			router.Get("/pets/{petID}/symptoms", s.handleListSymptoms)
			router.Post("/pets/{petID}/symptoms", s.handleCreateSymptom)
			router.Delete("/pets/{petID}/symptoms/{logID}", s.handleDeleteSymptom)
			// Medications (recurring schedule, server-pushed reminders)
			router.Get("/pets/{petID}/medications", s.handleListMedications)
			router.Post("/pets/{petID}/medications", s.handleCreateMedication)
			router.Patch("/pets/{petID}/medications/{medID}", s.handleUpdateMedication)
			router.Delete("/pets/{petID}/medications/{medID}", s.handleDeleteMedication)
			router.Post("/pets/{petID}/medications/{medID}/mark-given", s.handleMarkMedicationGiven)
			// v0.14.3 — per-medication dose history (timeline of "given" taps).
			router.Get("/pets/{petID}/medications/{medID}/doses", s.handleListMedicationDoses)
			// v0.14.4 — aggregated doses across all the pet's medications,
			// filtered by an arbitrary [from, to) ISO range. Powers the
			// Apple-style date strip on mobile.
			router.Get("/pets/{petID}/medication-doses", s.handleListMedicationDosesByPet)
			// Weekly summary — viewable any time; cron also pushes Sundays.
			router.Get("/me/weekly-summary", s.handleWeeklySummary)
			// Pet documents (vaccine cards, microchip papers, insurance, etc.)
			router.Get("/pets/{petID}/documents", s.handleListPetDocuments)
			router.Post("/pets/{petID}/documents", s.handleCreatePetDocument)
			router.Delete("/pets/{petID}/documents/{docID}", s.handleDeletePetDocument)
			// Calorie counter — food DB + meal log
			router.Get("/food-items", s.handleListFoodItems)
			router.Post("/food-items", s.handleCreateFoodItem)
			router.Get("/pets/{petID}/meals", s.handleListMeals)
			router.Post("/pets/{petID}/meals", s.handleCreateMeal)
			router.Delete("/pets/{petID}/meals/{mealID}", s.handleDeleteMeal)
			router.Get("/pets/{petID}/meals/summary", s.handleDailyMealSummary)
			// Breed care guides (read; admin manages via /admin)
			router.Get("/pets/{petID}/breed-care", s.handleGetBreedCareForPet)
			// First-aid handbook (mobile downloads + caches offline)
			router.Get("/first-aid", s.handleListFirstAid)
			// Weight
			router.Get("/pets/{petID}/weight", s.handleListWeight)
			router.Post("/pets/{petID}/weight", s.handleCreateWeight)
			// Vet
			router.Get("/vet-contacts", s.handleListVetContacts)
			router.Post("/vet-contacts", s.handleCreateVetContact)
			router.Delete("/vet-contacts/{contactID}", s.handleDeleteVetContact)
			// Feeding
			router.Get("/pets/{petID}/feeding", s.handleListFeeding)
			router.Post("/pets/{petID}/feeding", s.handleCreateFeeding)
			router.Delete("/pets/{petID}/feeding/{scheduleID}", s.handleDeleteFeeding)
			// v0.14.2 — bridge feeding plan -> calorie counter. Tapping
			// "Log it" on a schedule creates a meal_log row "as eaten now".
			router.Post("/pets/{petID}/feeding/{scheduleID}/log-now", s.handleLogFeedingNow)
			// Playdates
			router.Get("/playdates", s.handleListPlaydates)
			router.Get("/playdates/{playdateID}", s.handleGetPlaydate)
			router.Post("/playdates", s.handleCreatePlaydate)
			router.Patch("/playdates/{playdateID}", s.handleUpdatePlaydate)
			router.Post("/playdates/{playdateID}/join", s.handleJoinPlaydate)
			router.Post("/playdates/{playdateID}/leave", s.handleLeavePlaydate)
			router.Patch("/playdates/{playdateID}/attendee-pets", s.handleUpdateAttendeePets)
			router.Post("/playdates/{playdateID}/cancel", s.handleCancelPlaydate)
			router.Post("/playdates/{playdateID}/announce", s.handlePlaydateAnnounce)
			router.Get("/playdates/{playdateID}/invitable-users", s.handleListInvitableUsers)
			router.Post("/playdates/{playdateID}/invites", s.handleCreatePlaydateInvites)
			// v0.13.5 — WhatsApp/SMS share-link claim. The token is part of the
			// URL the host sent out; any authenticated user who opens the URL
			// can swap it for a pending playdate_invites row.
			router.Post("/playdates/{playdateID}/claim-share/{token}", s.handleClaimPlaydateShare)
			router.Post("/playdates/join-by-code", s.handleJoinPlaydateByCode)
			router.Get("/me/playdates", s.handleListMyPlaydates)
			router.Get("/me/playdate-invites", s.handleListMyPlaydateInvites)
			router.Post("/playdate-invites/{inviteID}/accept", s.handleAcceptPlaydateInvite)
			router.Post("/playdate-invites/{inviteID}/decline", s.handleDeclinePlaydateInvite)
			// Playdate chat moderation
			router.Post("/playdates/{playdateID}/chat-mutes", s.handleMutePlaydateMember)
			router.Delete("/playdates/{playdateID}/chat-mutes/{userID}", s.handleUnmutePlaydateMember)
			// Host control panel (v0.16.0)
			router.Delete("/playdates/{playdateID}/attendees/{userID}", s.handleKickPlaydateAttendee)
			router.Post("/playdates/{playdateID}/lock", s.handleSetPlaydateLock)
			router.Post("/playdates/{playdateID}/transfer", s.handleTransferPlaydateOwnership)
			// Generalised conversation-level controls (works for DM / group / playdate)
			router.Get("/conversations/{conversationID}/playdate", s.handleGetPlaydateByConversation)
			router.Post("/conversations/{conversationID}/messages/{messageID}/delete", s.handleDeleteConversationMessage)
			router.Post("/conversations/{conversationID}/mute", s.handleMuteConversation)
			router.Delete("/conversations/{conversationID}/mute", s.handleUnmuteConversation)
			router.Post("/conversations/{conversationID}/messages/{messageID}/pin", s.handlePinConversationMessage)
			router.Post("/conversations/{conversationID}/messages/{messageID}/unpin", s.handleUnpinConversationMessage)
			router.Get("/conversations/{conversationID}/pinned", s.handleListConversationPinned)
			// Groups
			router.Get("/groups", s.handleListGroups)
			router.Post("/groups", s.handleCreateGroup)
			router.Post("/groups/{groupID}/join", s.handleJoinGroup)
			router.Post("/groups/{groupID}/leave", s.handleLeaveGroup)
			router.Post("/groups/join-by-code", s.handleJoinGroupByCode)
			router.Get("/groups/conversation/{conversationID}", s.handleGetGroupByConversation)
			// Lost pets
			router.Get("/lost-pets", s.handleListLostPets)
			router.Post("/lost-pets", s.handleCreateLostPet)
			router.Patch("/lost-pets/{alertID}", s.handleUpdateLostPetStatus)
			// Badges
			router.Get("/badges", s.handleListBadges)
			// Training tips
			router.Get("/training-tips", s.handleListTrainingTips)
			router.Get("/training-tips/{tipID}", s.handleGetTrainingTip)
			router.Post("/training-tips/{tipID}/bookmark", s.handleBookmarkTip)
			router.Delete("/training-tips/{tipID}/bookmark", s.handleUnbookmarkTip)
			router.Post("/training-tips/{tipID}/complete", s.handleCompleteTip)
			// Vet clinics nearby
			router.Get("/vet-clinics", s.handleListVetClinicsNearby)
			// Venue reviews & detail
			router.Get("/venues/{venueID}", s.handleVenueDetail)
			router.Get("/venues/{venueID}/photos", s.handleVenuePhotos)
			router.Get("/venues/{venueID}/posts", s.handleVenuePostsFeed)
			router.Get("/venues/{venueID}/check-ins", s.handleVenueCheckInsList)
			router.Get("/venues/{venueID}/reviews", s.handleListVenueReviews)
			router.Post("/venues/{venueID}/reviews", s.handleCreateVenueReview)
			router.Get("/venues/{venueID}/reviews/summary", s.handleVenueReviewSummary)
			router.Get("/venues/{venueID}/reviews/eligibility", s.handleVenueReviewEligibility)
			// Pet sitters
			router.Get("/pet-sitters", s.handleListPetSitters)
			router.Post("/pet-sitters", s.handleCreatePetSitter)
			// Walk routes
			router.Get("/walk-routes", s.handleListWalkRoutes)

			// Adoption (shelter-powered, v0.13) — public browse + user application flow.
			router.Get("/shelters", s.handlePublicListShelters)
			router.Get("/shelters/{shelterID}", s.handlePublicGetShelter)
			router.Get("/adoption-pets", s.handlePublicListAdoptablePets)
			router.Get("/adoption-pets/{petID}", s.handlePublicGetAdoptablePet)
			router.Post("/adoption-applications", s.handlePublicCreateApplication)
			router.Get("/me/adoption-applications", s.handlePublicListMyApplications)
			router.Post("/adoption-applications/{appID}/withdraw", s.handlePublicWithdrawApplication)

			// Pet albums
			router.Get("/pets/{petID}/albums", s.handleListPetAlbums)
			router.Post("/pets/{petID}/albums", s.handleCreatePetAlbum)
			// Pet milestones
			router.Get("/pets/{petID}/milestones", s.handleListPetMilestones)
			// Group messages
			router.Get("/groups/{groupID}", s.handleGetGroup)
			router.Get("/groups/{groupID}/messages", s.handleListGroupMessages)
			router.Post("/groups/{groupID}/messages", s.handleSendGroupMessage)
			router.Delete("/groups/{groupID}/messages/{messageID}", s.handleDeleteGroupMessage)
			router.Post("/groups/{groupID}/messages/{messageID}/pin", s.handlePinGroupMessage)
			router.Delete("/groups/{groupID}/messages/{messageID}/pin", s.handleUnpinGroupMessage)
			router.Get("/groups/{groupID}/pinned", s.handleListGroupPinned)
			router.Get("/groups/{groupID}/preview", s.handleGroupChatPreview)
			router.Post("/groups/{groupID}/mutes", s.handleMuteGroupMember)
			router.Delete("/groups/{groupID}/mutes/{userID}", s.handleUnmuteGroupMember)
			router.Delete("/groups/{groupID}/members/{userID}", s.handleKickGroupMember)
			router.Post("/groups/{groupID}/admins/{userID}", s.handlePromoteGroupAdmin)
			router.Delete("/groups/{groupID}/admins/{userID}", s.handleDemoteGroupAdmin)
		})

		router.Get("/media/proxy", s.handleMediaProxy)

		router.Route("/admin", func(router chi.Router) {
			router.Post("/auth/login", s.handleAdminLogin)
			router.Group(func(router chi.Router) {
				router.Use(s.adminAuth)
				router.Get("/dashboard", s.handleAdminDashboard)
				router.Get("/users", s.handleAdminUsers)
				router.Get("/users/{userID}", s.handleAdminUserDetail)
				router.Patch("/users/{userID}", s.handleAdminUserUpdate)
				router.Delete("/users/{userID}", s.handleAdminUserDelete)
				router.Get("/pets", s.handleAdminPets)
				router.Get("/pets/{petID}", s.handleAdminPetDetail)
				router.Patch("/pets/{petID}", s.handleAdminPetUpdate)
				router.Get("/posts", s.handleAdminPosts)
				router.Delete("/posts/{postID}", s.handleAdminDeletePost)
				router.Get("/venues", s.handleAdminVenues)
				router.Post("/venues", s.handleAdminVenueUpsert)
				router.Put("/venues/{venueID}", s.handleAdminVenueUpdate)
				router.Delete("/venues/{venueID}", s.handleAdminVenueDelete)
				// v0.13.7 — photo gallery mgmt (admin-curated + post hide).
				router.Get("/venues/{venueID}/photos", s.handleAdminVenuePhotos)
				router.Post("/venues/{venueID}/photos", s.handleAdminVenueAddPhoto)
				router.Delete("/venues/{venueID}/photos/{photoID}", s.handleAdminVenueDeletePhoto)
				router.Patch("/venues/{venueID}/post-photos/{postID}", s.handleAdminVenueSetPostPhotoHidden)
				router.Get("/events", s.handleAdminEvents)
				router.Post("/events", s.handleAdminEventUpsert)
				router.Delete("/events/{eventID}", s.handleAdminEventDelete)
				router.Get("/taxonomies/{kind}", s.handleAdminTaxonomyList)
				router.Post("/taxonomies/{kind}", s.handleAdminTaxonomyUpsert)
				router.Delete("/taxonomies/{kind}/{itemID}", s.handleAdminTaxonomyDelete)
				router.Get("/reports", s.handleAdminReports)
				router.Get("/reports/{reportID}", s.handleAdminReportDetail)
				router.Post("/reports/{reportID}/resolve", s.handleAdminResolveReport)
				router.Get("/notifications", s.handleAdminListNotifications)
				router.Post("/notifications/send", s.handleAdminSendNotification)

				// Pet care data
				router.Get("/pets/{petID}/health", s.handleAdminPetHealth)
				router.Get("/pets/{petID}/weight", s.handleAdminPetWeight)
				router.Get("/pets/{petID}/feeding", s.handleAdminPetFeeding)
				router.Get("/pets/{petID}/diary", s.handleAdminPetDiary)
				router.Delete("/pets/{petID}/health/{recordID}", s.handleAdminDeleteHealthRecord)

				// Training tips
				router.Get("/training-tips", s.handleAdminTrainingTips)
				router.Post("/training-tips", s.handleAdminCreateTrainingTip)
				router.Put("/training-tips/{tipID}", s.handleAdminUpdateTrainingTip)
				router.Delete("/training-tips/{tipID}", s.handleAdminDeleteTrainingTip)

				// Breed care guides
				router.Get("/breed-care-guides", s.handleAdminListBreedCareGuides)
				router.Post("/breed-care-guides", s.handleAdminUpsertBreedCareGuide)
				router.Patch("/breed-care-guides/{guideID}", s.handleAdminUpdateBreedCareGuide)
				router.Delete("/breed-care-guides/{guideID}", s.handleAdminDeleteBreedCareGuide)

				// First-aid topics
				router.Get("/first-aid-topics", s.handleAdminListFirstAidTopics)
				router.Post("/first-aid-topics", s.handleAdminUpsertFirstAidTopic)
				router.Patch("/first-aid-topics/{topicID}", s.handleAdminUpdateFirstAidTopic)
				router.Delete("/first-aid-topics/{topicID}", s.handleAdminDeleteFirstAidTopic)

				// Food items (calorie counter database)
				router.Get("/food-items", s.handleAdminListFoodItems)
				router.Post("/food-items", s.handleAdminUpsertFoodItem)
				router.Patch("/food-items/{itemID}", s.handleAdminUpdateFoodItem)
				router.Delete("/food-items/{itemID}", s.handleAdminDeleteFoodItem)

				// Vet clinics
				router.Get("/vet-clinics", s.handleAdminListVetClinics)
				router.Post("/vet-clinics", s.handleAdminCreateVetClinic)
				router.Delete("/vet-clinics/{clinicID}", s.handleAdminDeleteVetClinic)

				// Pet sitters
				router.Get("/pet-sitters", s.handleAdminPetSitters)
				router.Post("/pet-sitters", s.handleAdminCreatePetSitter)
				router.Delete("/pet-sitters/{sitterID}", s.handleAdminDeletePetSitter)

				// Walk routes
				router.Get("/walk-routes", s.handleAdminListWalkRoutes)
				router.Post("/walk-routes", s.handleAdminCreateWalkRoute)
				router.Delete("/walk-routes/{routeID}", s.handleAdminDeleteWalkRoute)
				// Shelters & shelter pets (v0.13) — routes registered in a
				// dedicated block below alongside the new handlers.

				// Playdates
				router.Get("/playdates", s.handleAdminPlaydates)
				router.Get("/playdates/{playdateID}", s.handleAdminPlaydateDetail)
				router.Delete("/playdates/{playdateID}", s.handleAdminDeletePlaydate)
				// Live chat ticket — short-lived HMAC ticket the admin browser
				// trades for a read-only WebSocket subscription. The WS upgrade
				// itself is registered outside adminAuth (see below) because
				// browsers can't attach a Bearer header to `new WebSocket()`.
				router.Get("/conversations/{conversationID}/ws-ticket", s.handleAdminConversationWsTicket)

				// Groups
				router.Get("/groups", s.handleAdminGroups)
				router.Get("/groups/{groupID}", s.handleAdminGroupDetail)
				router.Post("/groups", s.handleAdminCreateGroup)
				router.Delete("/groups/{groupID}", s.handleAdminDeleteGroup)

				// Lost pets
				router.Get("/lost-pets", s.handleAdminLostPets)
				router.Patch("/lost-pets/{alertID}", s.handleAdminUpdateLostPet)

				// Badges (legacy — user awards list)
				router.Get("/badges/awards", s.handleAdminBadges)

				// Media (reuse app handler)
				router.Post("/media/presign", s.handleMediaPresign)

				// === v0.17.0 admin panel rebuild — new endpoints ===

				// Users: ban workflow, badge awards, aggregate slices
				router.Post("/users/{userID}/ban", s.handleAdminBanUser)
				router.Post("/users/{userID}/unban", s.handleAdminUnbanUser)
				router.Get("/users/{userID}/bans", s.handleAdminUserBans)
				router.Post("/users/{userID}/award-badge", s.handleAdminUserAwardBadge)
				router.Get("/users/{userID}/playdates", s.handleAdminUserPlaydates)
				router.Get("/users/{userID}/groups", s.handleAdminUserGroups)
				router.Get("/users/{userID}/reports", s.handleAdminUserReports)
				router.Get("/users/{userID}/activity", s.handleAdminUserActivity)
				router.Get("/users/{userID}/location", s.handleAdminUserLocation)
				router.Get("/active-users", s.handleAdminActiveUsers)
				router.Get("/pets/{petID}/playdates", s.handleAdminPetPlaydates)
				router.Get("/pets/{petID}/photos", s.handleAdminPetPhotos)

				// Admin accounts (RBAC)
				router.Get("/admins", s.handleAdminListAdmins)
				router.Post("/admins", s.handleAdminCreateAdmin)
				router.Patch("/admins/{adminID}", s.handleAdminUpdateAdmin)
				router.Post("/admins/{adminID}/reset-password", s.handleAdminResetAdminPassword)
				router.Delete("/admins/{adminID}", s.handleAdminDeleteAdmin)

				// Audit
				router.Get("/audit-logs", s.handleAdminAuditLogs)

				// Shelters (v0.13) — create/list/delete + password reset.
				router.Get("/shelters", s.handleAdminListShelters)
				router.Post("/shelters", s.handleAdminCreateShelter)
				router.Get("/shelters/{shelterID}", s.handleAdminGetShelter)
				router.Delete("/shelters/{shelterID}", s.handleAdminDeleteShelter)
				router.Post("/shelters/{shelterID}/reset-password", s.handleAdminResetShelterPassword)
				// v0.24 — Featured-on-discovery toggle.
				router.Post("/shelters/{shelterID}/featured", s.handleAdminSetShelterFeatured)

				// Listings moderation (v0.17) — DSA Art. 16/17/22/23 queue,
				// reports queue, and shelter strike tracking.
				router.Get("/listings", s.handleAdminListingQueue)
				router.Get("/listings/rejection-codes", s.handleAdminListingRejectionCodes)
				router.Get("/listings/{listingID}", s.handleAdminListingDetail)
				router.Post("/listings/{listingID}/approve", s.handleAdminApproveListing)
				router.Post("/listings/{listingID}/reject", s.handleAdminRejectListing)
				router.Get("/listing-reports", s.handleAdminListListingReports)
				router.Post("/listing-reports/{reportID}/resolve", s.handleAdminResolveListingReport)
				router.Get("/shelters/{shelterID}/strikes", s.handleAdminShelterStrikes)
				router.Post("/shelters/{shelterID}/suspend", s.handleAdminSuspendShelter)

				// Shelter onboarding applications (v0.14) — public wizard → admin queue.
				router.Get("/shelter-applications", s.handleAdminListShelterApplications)
				router.Get("/shelter-applications/{appID}", s.handleAdminGetShelterApplication)
				router.Post("/shelter-applications/{appID}/approve", s.handleAdminApproveShelterApplication)
				router.Post("/shelter-applications/{appID}/reject", s.handleAdminRejectShelterApplication)

				// Shelter teams & audit (v0.15) — per-shelter read-only views.
				router.Get("/shelters/{shelterID}/members", s.handleAdminShelterMembers)
				router.Get("/shelters/{shelterID}/audit-log", s.handleAdminShelterAuditLog)
				router.Post("/shelters/{shelterID}/transfer-admin", s.handleAdminShelterTransferAdmin)

				// Moderation — conversations, matches, swipes, blocks
				router.Get("/conversations", s.handleAdminConversations)
				router.Get("/conversations/{conversationID}/messages", s.handleAdminConversationMessages)
				router.Delete("/conversations/{conversationID}/messages/{messageID}", s.handleAdminDeleteConversationMessage)
				router.Get("/matches", s.handleAdminMatches)
				router.Delete("/matches/{matchID}", s.handleAdminDeleteMatch)
				router.Get("/swipes", s.handleAdminSwipes)
				router.Get("/blocks", s.handleAdminBlocks)

				// Venue check-ins & reviews, event RSVPs
				router.Get("/venue-check-ins", s.handleAdminVenueCheckIns)
				router.Delete("/venue-check-ins/{id}", s.handleAdminDeleteVenueCheckIn)
				router.Get("/venue-reviews", s.handleAdminVenueReviews)
				router.Delete("/venue-reviews/{id}", s.handleAdminDeleteVenueReview)
				router.Get("/events/{eventID}/rsvps", s.handleAdminEventRSVPs)

				// Pet albums, milestones
				router.Get("/pets/{petID}/albums", s.handleAdminPetAlbums)
				router.Get("/pets/{petID}/milestones", s.handleAdminPetMilestones)
				router.Delete("/pet-albums/{albumID}", s.handleAdminDeletePetAlbum)

				// Directory updates (close CRUD gaps)
				router.Put("/vet-clinics/{clinicID}", s.handleAdminUpdateVetClinic)
				router.Put("/pet-sitters/{sitterID}", s.handleAdminUpdatePetSitter)
				router.Put("/walk-routes/{routeID}", s.handleAdminUpdateWalkRoute)

				// Groups & playdates (full moderation)
				router.Put("/groups/{groupID}", s.handleAdminUpdateGroup)
				router.Get("/groups/{groupID}/members", s.handleAdminGroupMembers)
				router.Delete("/groups/{groupID}/members/{userID}", s.handleAdminKickGroupMember)
				router.Patch("/playdates/{playdateID}", s.handleAdminUpdatePlaydate)
				router.Post("/playdates/{playdateID}/cancel", s.handleAdminCancelPlaydate)

				// Reports
				router.Post("/reports/bulk-resolve", s.handleAdminReportsBulkResolve)
				router.Get("/reports/stats", s.handleAdminReportsStats)

				// System: announcements, feature flags, broadcast, metrics, badges CRUD
				router.Get("/announcements", s.handleAdminAnnouncements)
				router.Post("/announcements", s.handleAdminCreateAnnouncement)
				router.Patch("/announcements/{id}", s.handleAdminUpdateAnnouncement)
				router.Delete("/announcements/{id}", s.handleAdminDeleteAnnouncement)
				router.Get("/feature-flags", s.handleAdminFeatureFlags)
				router.Put("/feature-flags/{key}", s.handleAdminUpdateFeatureFlag)
				router.Post("/broadcast", s.handleAdminBroadcast)
				// Scheduled / recurring push manager — separate from one-shot
				// `/broadcast`. The per-minute scheduler in Server.New fires
				// each row whose next_run_at has passed.
				router.Get("/scheduled-pushes", s.handleAdminListScheduledPushes)
				router.Post("/scheduled-pushes", s.handleAdminCreateScheduledPush)
				router.Patch("/scheduled-pushes/{id}", s.handleAdminUpdateScheduledPush)
				router.Delete("/scheduled-pushes/{id}", s.handleAdminDeleteScheduledPush)
				// Curated country / city / timezone catalogue. Drives the
				// scheduling page's dropdowns so admins can't typo a city.
				router.Get("/locations", s.handleAdminLocations)
				router.Get("/dashboard/metrics", s.handleAdminDashboardMetrics)
				router.Get("/badges", s.handleAdminListBadgesAll)
				router.Post("/badges", s.handleAdminCreateBadge)
				router.Put("/badges/{id}", s.handleAdminUpdateBadge)
				router.Delete("/badges/{id}", s.handleAdminDeleteBadge)
			})

			// Read-only admin WebSocket — authenticates via HMAC ticket
			// (issued by /admin/conversations/{id}/ws-ticket inside the
			// admin auth group). Sits outside adminAuth because browsers
			// cannot attach an Authorization header to `new WebSocket()`.
			router.Get("/ws-stream", s.handleAdminWsStream)
		})

		// ── Shelter panel API (v0.13) ────────────────────────────
		// Signed-in shelter uses /shelter/v1. Public URL shape:
		//   POST /shelter/v1/auth/login
		//   GET  /shelter/v1/me
		//   GET  /shelter/v1/pets ...
		router.Route("/shelter", func(router chi.Router) {
			router.Post("/auth/login", s.handleShelterLogin)
			router.Group(func(router chi.Router) {
				router.Use(s.shelterAuth)
				router.Get("/me", s.handleShelterMe)
				router.Put("/me", s.handleShelterUpdateProfile)
				router.Post("/me/password", s.handleShelterChangePassword)
				router.Get("/stats", s.handleShelterStats)

				// Shared catalogue + uploads so shelters can use the same species
				// and breed taxonomy as admins, and upload photos directly to R2.
				router.Get("/taxonomies/{kind}", s.handleTaxonomyList)
				router.Post("/media/presign", s.handleMediaPresign)

				router.Get("/pets", s.handleShelterListPets)
				router.Post("/pets", s.handleShelterCreatePet)
				router.Get("/pets/{petID}", s.handleShelterGetPet)
				router.Put("/pets/{petID}", s.handleShelterUpdatePet)
				router.Patch("/pets/{petID}/status", s.handleShelterUpdatePetStatus)
				router.Delete("/pets/{petID}", s.handleShelterDeletePet)
				// Listing lifecycle (v0.17) — DSA state machine.
				router.Post("/pets/{petID}/submit", s.handleShelterSubmitListing)
				router.Post("/pets/{petID}/transition", s.handleShelterListingTransition)
				// Wizard support (v0.18) — jurisdiction config + duplicate.
				router.Get("/listing-config", s.handleShelterListingConfig)
				router.Post("/pets/{petID}/duplicate", s.handleShelterDuplicateListing)
				// Bulk CSV import (v0.19) — client pre-validates rows; server
				// re-checks compliance + creates drafts in a single POST.
				router.Post("/pets/bulk", s.handleShelterBulkCreate)
				// Post-publish management (v0.20) — bulk actions, restore.
				router.Post("/pets/bulk-action", s.handleShelterBulkAction)
				router.Post("/pets/{petID}/restore", s.handleShelterRestoreListing)

				// Analytics dashboard (v0.22) — editor+ only.
				router.Group(func(r chi.Router) {
					r.Use(s.requireShelterRole("editor"))
					r.Get("/analytics/overview", s.handleShelterAnalyticsOverview)
					r.Get("/analytics/listings", s.handleShelterAnalyticsListings)
					r.Get("/analytics/funnel", s.handleShelterAnalyticsFunnel)
					r.Get("/analytics/export.csv", s.handleShelterAnalyticsExport)
				})

				router.Get("/applications", s.handleShelterListApplications)
				router.Get("/applications/{appID}", s.handleShelterGetApplication)
				router.Post("/applications/{appID}/approve", s.handleShelterApproveApplication)
				router.Post("/applications/{appID}/reject", s.handleShelterRejectApplication)
				router.Post("/applications/{appID}/complete", s.handleShelterCompleteAdoption)

				// v0.15 — team members + invites + audit log.
				router.Get("/members", s.handleShelterListMembers)
				router.Patch("/members/{memberID}", s.handleShelterUpdateMemberRole)
				router.Delete("/members/{memberID}", s.handleShelterRevokeMember)
				router.Get("/members/invites", s.handleShelterListMemberInvites)
				router.Post("/members/invites", s.handleShelterCreateMemberInvite)
				router.Post("/members/invites/{inviteID}/resend", s.handleShelterResendMemberInvite)
				router.Delete("/members/invites/{inviteID}", s.handleShelterRevokeMemberInvite)
				router.Get("/audit-log", s.handleShelterListAuditLog)

				// Shelters reuse the user messaging endpoints through their shelter
				// identity; GET /shelter/v1/conversations proxies the same store.
				router.Get("/conversations", s.handleConversations)
				router.Get("/messages", s.handleMessages)
				router.Post("/messages", s.handleSendMessage)
				router.Post("/messages/read", s.handleMarkMessagesRead)
			})
		})
	})

	return router
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
	})
}

func (s *Server) appAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		userID, err := s.authenticate(request, s.cfg.JWTAccessSecret, "app")
		if err != nil {
			writeError(writer, http.StatusUnauthorized, err.Error())
			return
		}

		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), userIDKey, userID)))
	})
}

func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		userID, err := s.authenticate(request, s.cfg.AdminJWTSecret, "admin")
		if err != nil {
			writeError(writer, http.StatusUnauthorized, err.Error())
			return
		}

		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), userIDKey, userID)))
	})
}

// shelterAuth validates shelter-issued JWTs (kind="shelter"). The shelter
// identity is stored under userIDKey so handlers can read it with
// currentUserID(r) — consistent with the user and admin middlewares.
//
// Starting with v0.15 (team accounts), the JWT subject is a member ID
// (not the shelter ID directly). The middleware looks up the member,
// enforces active status, and injects memberID/shelterID/role into
// context so downstream handlers can gate per-role without re-querying.
func (s *Server) shelterAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		memberID, err := s.authenticate(request, s.cfg.AdminJWTSecret, "shelter")
		if err != nil {
			writeError(writer, http.StatusUnauthorized, err.Error())
			return
		}
		member, err := s.store.GetShelterMember(memberID)
		if err != nil || member == nil {
			writeError(writer, http.StatusUnauthorized, "invalid session")
			return
		}
		// Revoke takes effect at the next request — the member's JWT
		// is still signed and unexpired, but we refuse it here.
		if member.Status != "active" {
			writeError(writer, http.StatusUnauthorized, "member is no longer active")
			return
		}
		ctx := request.Context()
		// Keep userIDKey pointing at the shelter ID so every legacy
		// handler that calls `currentShelterID(r)` (which is aliased to
		// currentUserID) keeps working — it reads the shelter scope,
		// not who's acting. Member-specific helpers read from the new
		// keys below.
		ctx = context.WithValue(ctx, userIDKey, member.ShelterID)
		ctx = context.WithValue(ctx, shelterMemberIDKey, member.ID)
		ctx = context.WithValue(ctx, shelterMemberRoleKey, member.Role)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

const shelterMemberIDKey contextKey = "shelterMemberID"
const shelterMemberRoleKey contextKey = "shelterMemberRole"

func currentShelterMemberID(r *http.Request) string {
	if v, ok := r.Context().Value(shelterMemberIDKey).(string); ok {
		return v
	}
	return ""
}

func currentShelterMemberRole(r *http.Request) string {
	if v, ok := r.Context().Value(shelterMemberRoleKey).(string); ok {
		return v
	}
	return ""
}

func (s *Server) authenticate(request *http.Request, secret string, expectedKind string) (string, error) {
	header := request.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", errors.New("missing bearer token")
	}

	claims, err := auth.ParseToken(secret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return "", errors.New("invalid token")
	}
	if claims.Kind != expectedKind {
		return "", errors.New("invalid token kind")
	}

	return claims.UserID, nil
}

func (s *Server) issueAppSession(userID string) (map[string]any, error) {
	accessToken, err := auth.CreateToken(s.cfg.JWTAccessSecret, userID, "app", "petto-mobile", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	refreshToken, err := auth.CreateToken(s.cfg.JWTRefreshSecret, userID, "app-refresh", "petto-mobile", 30*24*time.Hour)
	if err != nil {
		return nil, err
	}
	user, err := s.store.GetUser(userID)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"user": user.Profile,
		"tokens": map[string]any{
			"accessToken":      accessToken,
			"refreshToken":     refreshToken,
			"expiresInSeconds": 900,
		},
	}, nil
}

func (s *Server) issueAdminSession(adminID string) (map[string]any, error) {
	accessToken, err := auth.CreateToken(s.cfg.AdminJWTSecret, adminID, "admin", "petto-admin", 8*time.Hour)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"accessToken": accessToken,
		"expiresIn":   28800,
	}, nil
}

// issueShelterSession produces a shelter JWT. Signed with AdminJWTSecret
// (separate namespace via kind="shelter") so we don't need a new env var.
//
// The JWT subject is the member ID (v0.15+). Clients receive the full
// shelter + member object in the response so they can render role-based
// UI without a second round-trip. `shelter` is kept for back-compat
// with older web/mobile builds; new clients read `member.role`.
func (s *Server) issueShelterSession(shelter *domain.Shelter, member *domain.ShelterMember) (map[string]any, error) {
	accessToken, err := auth.CreateToken(s.cfg.AdminJWTSecret, member.ID, "shelter", "petto-shelter", 12*time.Hour)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"shelter":            shelter,
		"member":             member,
		"accessToken":        accessToken,
		"expiresIn":          12 * 60 * 60,
		"mustChangePassword": member.MustChangePassword,
	}, nil
}

func (s *Server) handleRegister(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	user, _, err := s.store.Register(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.issueAppSession(user.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": session})
}

func (s *Server) handleVerifyRequest(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusNotImplemented, "email verification delivery is not configured")
}

func (s *Server) handleVerifyConfirm(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusGone, "email verification is not required for the current local setup")
}

func (s *Server) handleLogin(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	user, err := s.store.Login(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, err.Error())
		return
	}

	session, err := s.issueAppSession(user.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleRefresh(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		RefreshToken string `json:"refreshToken"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	claims, err := auth.ParseToken(s.cfg.JWTRefreshSecret, payload.RefreshToken)
	if err != nil || claims.Kind != "app-refresh" {
		writeError(writer, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	session, err := s.issueAppSession(claims.UserID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleForgotPassword(writer http.ResponseWriter, request *http.Request) {
	writeError(writer, http.StatusNotImplemented, "password reset delivery is not configured")
}

func (s *Server) handleResetPassword(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.ResetPassword(payload.Token, payload.NewPassword); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"reset": true}})
}

func (s *Server) handleMe(writer http.ResponseWriter, request *http.Request) {
	user, err := s.store.GetUser(currentUserID(request))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": user.Profile})
}

func (s *Server) handleUpdateProfile(writer http.ResponseWriter, request *http.Request) {
	var payload store.UpdateProfileInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	profile, err := s.store.UpdateProfile(currentUserID(request), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": profile})
}

func (s *Server) handleListPets(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPets(currentUserID(request))})
}

func (s *Server) handleGetPet(writer http.ResponseWriter, request *http.Request) {
	petID := chi.URLParam(request, "petID")
	pet, err := s.store.GetPet(petID)
	if err != nil || pet == nil {
		writeError(writer, http.StatusNotFound, "pet not found")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": pet})
}

func (s *Server) handleCreatePet(writer http.ResponseWriter, request *http.Request) {
	var payload store.PetInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	pet, err := s.store.UpsertPet(currentUserID(request), "", payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": pet})
}

func (s *Server) handleUpdatePet(writer http.ResponseWriter, request *http.Request) {
	var payload store.PetInput
	if !decodeJSON(writer, request, &payload) {
		return
	}

	pet, err := s.store.UpsertPet(currentUserID(request), chi.URLParam(request, "petID"), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": pet})
}

func (s *Server) handlePetVisibility(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Hidden bool `json:"hidden"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	petID := chi.URLParam(request, "petID")
	userID := currentUserID(request)
	pets := s.store.ListPets(userID)
	owned := false
	for _, p := range pets {
		if p.ID == petID {
			owned = true
			break
		}
	}
	if !owned {
		writeError(writer, http.StatusForbidden, "pet does not belong to you")
		return
	}

	if err := s.store.SetPetVisibility(petID, payload.Hidden); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleTaxonomyList(writer http.ResponseWriter, request *http.Request) {
	lang := request.URL.Query().Get("lang")
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"), lang)})
}

func (s *Server) handleDiscoveryFeed(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	petID := request.URL.Query().Get("petId")
	if petID != "" {
		writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.DiscoveryFeedForPet(userID, petID)})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.DiscoveryFeed(userID)})
}

func (s *Server) handleSwipe(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ActorPetID  string `json:"actorPetId"`
		TargetPetID string `json:"targetPetId"`
		Direction   string `json:"direction"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)

	// Send like notification to target pet's owner (before match check)
	if payload.Direction == "like" || payload.Direction == "super-like" {
		targetOwnerID := s.store.GetPetOwnerID(payload.TargetPetID)
		if targetOwnerID != "" && targetOwnerID != userID {
			s.store.SaveNotification(domain.Notification{
				ID: fmt.Sprintf("notif-%d", time.Now().UnixNano()), Title: "Someone liked your pet! ❤️",
				Body: "Your pet got a new like!", Target: targetOwnerID,
				SentAt: time.Now().UTC().Format(time.RFC3339), SentBy: "system",
			})
			if s.store.ShouldSendPush(targetOwnerID, "matches") {
				likeTokens := s.store.GetUserPushTokens(targetOwnerID)
				var likePushTokens []string
				for _, t := range likeTokens {
					likePushTokens = append(likePushTokens, t.Token)
				}
				if len(likePushTokens) > 0 {
					go func() {
						if err := service.SendExpoPush(likePushTokens, "New Like! ❤️", "Someone liked your pet!", map[string]string{"type": "like"}); err != nil {
							log.Printf("[PUSH-LIKE] error: %v", err)
						}
					}()
				} else {
					log.Printf("[PUSH-LIKE] no tokens for user %s", targetOwnerID)
				}
			}
		}
	}

	match, err := s.store.CreateSwipe(userID, payload.ActorPetID, payload.TargetPetID, payload.Direction)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	if match != nil {
		// Build notification body with pet names and actor's owner name
		matchBody := fmt.Sprintf("%s and %s matched! Start chatting.", match.Pet.Name, match.MatchedPet.Name)
		s.store.SaveNotification(domain.Notification{
			ID: fmt.Sprintf("notif-%d", time.Now().UnixNano()), Title: "New Match! 🎉", Body: matchBody,
			Target: match.MatchedPet.OwnerID, SentAt: time.Now().UTC().Format(time.RFC3339), SentBy: "system",
		})
		if s.store.ShouldSendPush(match.MatchedPet.OwnerID, "matches") {
			matchTokens := s.store.GetUserPushTokens(match.MatchedPet.OwnerID)
			var pushTokens []string
			for _, t := range matchTokens {
				pushTokens = append(pushTokens, t.Token)
			}
			if len(pushTokens) > 0 {
				go func() {
					if err := service.SendExpoPush(pushTokens, "New Match! 🎉", matchBody, map[string]string{"type": "match", "conversationId": match.ConversationID}); err != nil {
						log.Printf("[PUSH-MATCH] error: %v", err)
					}
				}()
			} else {
				log.Printf("[PUSH-MATCH] no tokens for user %s", match.MatchedPet.OwnerID)
			}
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{"match": match}})
}

func (s *Server) handleMatches(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	petID := request.URL.Query().Get("petId")
	if petID != "" {
		writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMatchesByPet(userID, petID)})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMatches(userID)})
}

func (s *Server) handleConversations(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListConversations(currentUserID(request))})
}

func (s *Server) handleMessages(writer http.ResponseWriter, request *http.Request) {
	conversationID := request.URL.Query().Get("conversationId")
	// v0.11.4 — pagination: ?limit=50&before=<messageId>
	limit := 50
	if v := request.URL.Query().Get("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	before := request.URL.Query().Get("before") // cursor
	messages, err := s.store.ListMessages(currentUserID(request), conversationID, limit, before)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleSendMessage(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ConversationID string         `json:"conversationId"`
		Type           string         `json:"type"`
		Body           string         `json:"body"`
		ImageURL       string         `json:"imageUrl"`
		Metadata       map[string]any `json:"metadata"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	var message domain.Message
	var err error

	// Route based on conversation type so mutes/types/metadata/rate limits all
	// work the same for group, playdate, and DM chats.
	groupForConv := s.store.GetGroupByConversation(payload.ConversationID)
	playdateForConv := s.store.GetPlaydateByConversation(payload.ConversationID)
	if payload.Type == "" {
		payload.Type = "text"
	}
	richInput := store.SendGroupMessageInput{
		Type:     payload.Type,
		Body:     payload.Body,
		ImageURL: payload.ImageURL,
		Metadata: payload.Metadata,
	}
	switch {
	case groupForConv != nil && (payload.Type == "image" || payload.Type == "pet_share" || payload.Type == "text"):
		message, err = s.store.SendGroupMessageEx(userID, groupForConv.ID, richInput)
	case playdateForConv != nil:
		message, err = s.store.SendPlaydateMessageEx(userID, playdateForConv.ID, richInput)
	default:
		message, err = s.store.SendMessage(userID, payload.ConversationID, payload.Body)
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	_ = s.hub.Publish(payload.ConversationID, map[string]any{
		"type": "message.created",
		"data": message,
	})

	// Send push notifications to other users — fast path (no ListConversations)
	senderID := currentUserID(request)
	go func() {
		// Get conversation user_ids directly
		convUserIDs := s.store.GetConversationUserIDs(payload.ConversationID)

		// Check if group conversation
		groupInfo := s.store.GetGroupByConversation(payload.ConversationID)
		isGroup := groupInfo != nil

		// Compute title/body once — they're identical for every recipient in
		// the same conversation.
		msgText := message.Body
		if msgText == "" {
			switch message.Type {
			case "pet_share":
				if pn, ok := message.Metadata["petName"].(string); ok && pn != "" {
					msgText = "🐾 Shared " + pn
				} else {
					msgText = "🐾 Shared a pet"
				}
			case "image":
				msgText = "📷 Photo"
			}
		}
		var pushTitle, pushBody string
		if isGroup {
			pushTitle = groupInfo.Name
			pushBody = message.SenderName + ": " + msgText
		} else {
			pushTitle = message.SenderName
			pushBody = msgText
		}

		// Collect every eligible recipient's push tokens into a single
		// batch. Expo accepts up to 100 tokens per request, so a single
		// HTTPS round-trip delivers the push to every device — huge win
		// on group chats (previously one request per user).
		var allTokens []string
		for _, uid := range convUserIDs {
			if uid == senderID {
				continue
			}
			if s.store.IsConversationMuted(uid, payload.ConversationID) {
				continue
			}
			if !s.store.ShouldSendPush(uid, "messages") {
				continue
			}
			for _, t := range s.store.GetUserPushTokens(uid) {
				if t.Token != "" {
					allTokens = append(allTokens, t.Token)
				}
			}
		}

		if len(allTokens) > 0 {
			// Enriched payload carries everything the inline-reply handler
			// needs: conversationId to post to, messageId for client-side
			// dedup, senderName/isGroup for future UI polish. Priority
			// "high" (default in SendExpoPushEx) hits the fast APNs/FCM
			// delivery path. CategoryID "message_reply" enables the text
			// input action; ChannelID "messages" is the Android channel
			// the client creates at startup.
			service.SendExpoPushEx(allTokens, pushTitle, pushBody, map[string]string{
				"type":           "message",
				"conversationId": payload.ConversationID,
				"messageId":      message.ID,
				"senderId":       message.SenderProfileID,
				"senderName":     message.SenderName,
				"isGroup":        strconv.FormatBool(isGroup),
			}, service.ExpoPushOpts{
				CategoryID: "message_reply",
				ChannelID:  "messages",
				Priority:   "high",
			})
		}
	}()

	writeJSON(writer, http.StatusCreated, map[string]any{"data": message})
}

func (s *Server) handleMarkMessagesRead(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		ConversationID string `json:"conversationId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	s.store.MarkMessagesRead(userID, payload.ConversationID)

	_ = s.hub.Publish(payload.ConversationID, map[string]any{
		"type":   "messages.read",
		"userId": userID,
	})

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"ok": true}})
}

func (s *Server) handleCreateDirectConversation(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		TargetUserID string `json:"targetUserId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)
	if payload.TargetUserID == "" {
		writeError(writer, http.StatusBadRequest, "targetUserId is required")
		return
	}

	conversation, err := s.store.CreateOrFindDirectConversation(userID, payload.TargetUserID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": conversation})
}

func (s *Server) handleWebSocket(writer http.ResponseWriter, request *http.Request) {
	conversationID := request.URL.Query().Get("conversationId")
	if conversationID == "" {
		writeError(writer, http.StatusBadRequest, "conversationId is required")
		return
	}

	userID := currentUserID(request)

	connection, err := websocket.Accept(writer, request, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return
	}
	defer connection.CloseNow()

	channel := s.hub.Subscribe(conversationID)
	defer s.hub.Unsubscribe(conversationID, channel)

	ctx := request.Context()
	go func() {
		for {
			_, data, err := connection.Read(ctx)
			if err != nil {
				return
			}
			var incoming struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(data, &incoming) == nil && incoming.Type == "typing" {
				s.hub.Publish(conversationID, map[string]any{
					"type":   "typing",
					"userId": userID,
				})
			}
		}
	}()

	for {
		select {
		case payload := <-channel:
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := connection.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (s *Server) verifyPetOwnership(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := currentUserID(r)
	petID := chi.URLParam(r, "petID")
	pets := s.store.ListPets(userID)
	for _, p := range pets {
		if p.ID == petID {
			return petID, true
		}
	}
	writeError(w, http.StatusForbidden, "not your pet")
	return "", false
}

func (s *Server) handleListDiary(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	entries := s.store.ListDiary(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": entries})
}

func (s *Server) handleCreateDiaryEntry(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}

	var payload struct {
		Body     string  `json:"body"`
		ImageURL *string `json:"imageUrl"`
		Mood     string  `json:"mood"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := currentUserID(request)

	entry := s.store.CreateDiaryEntry(userID, petID, payload.Body, payload.ImageURL, payload.Mood)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": entry})
}

func (s *Server) handleSavePushToken(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	s.store.SavePushToken(currentUserID(r), payload.Token, payload.Platform)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"saved": true}})
}

func (s *Server) handleListFavorites(writer http.ResponseWriter, request *http.Request) {
	pets := s.store.ListFavorites(currentUserID(request))
	if pets == nil {
		pets = []domain.Pet{}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": pets})
}

func (s *Server) handleAddFavorite(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		PetID string `json:"petId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.AddFavorite(currentUserID(request), payload.PetID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": map[string]bool{"saved": true}})
}

func (s *Server) handleRemoveFavorite(writer http.ResponseWriter, request *http.Request) {
	petID := chi.URLParam(request, "petID")
	if err := s.store.RemoveFavorite(currentUserID(request), petID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"removed": true}})
}

func (s *Server) handleListAdoptionFavorites(writer http.ResponseWriter, request *http.Request) {
	pets := s.store.ListAdoptionFavorites(currentUserID(request))
	if pets == nil {
		pets = []domain.ShelterPet{}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": pets})
}

func (s *Server) handleAddAdoptionFavorite(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		PetID string `json:"petId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.AddAdoptionFavorite(currentUserID(request), payload.PetID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": map[string]bool{"saved": true}})
}

func (s *Server) handleRemoveAdoptionFavorite(writer http.ResponseWriter, request *http.Request) {
	petID := chi.URLParam(request, "petID")
	if err := s.store.RemoveAdoptionFavorite(currentUserID(request), petID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"removed": true}})
}

func (s *Server) handleBlockUser(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		TargetUserID string `json:"targetUserId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.BlockUser(currentUserID(request), payload.TargetUserID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"blocked": true}})
}

func (s *Server) handlePublicUserProfile(writer http.ResponseWriter, request *http.Request) {
	userID := chi.URLParam(request, "userID")
	user, err := s.store.GetUser(userID)
	if err != nil || user == nil {
		writeError(writer, http.StatusNotFound, "user not found")
		return
	}
	// Get visible pets
	allPets := s.store.ListPets(userID)
	visiblePets := make([]domain.Pet, 0)
	for _, p := range allPets {
		if !p.IsHidden {
			visiblePets = append(visiblePets, p)
		}
	}
	// Strip email for privacy
	profile := user.Profile
	// Get user's posts (with like state for the viewer)
	viewerID := currentUserID(request)
	posts := s.store.ListUserPosts(userID, viewerID)

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"user": map[string]any{
			"id":        profile.ID,
			"firstName": profile.FirstName,
			"lastName":  profile.LastName,
			"avatarUrl": profile.AvatarURL,
			"bio":       profile.Bio,
		},
		"pets":  visiblePets,
		"posts": posts,
	}})
}

func (s *Server) handleReport(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Reason      string `json:"reason"`
		TargetType  string `json:"targetType"`
		TargetID    string `json:"targetID"`
		TargetLabel string `json:"targetLabel"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if payload.TargetType == "pet" {
		pets := s.store.ListPets(currentUserID(request))
		for _, p := range pets {
			if p.ID == payload.TargetID {
				writeError(writer, http.StatusBadRequest, "cannot report your own pet")
				return
			}
		}
	}

	user, _ := s.store.GetUser(currentUserID(request))
	report, err := s.store.CreateReport(user.Profile.ID, user.Profile.FirstName, payload.Reason, payload.TargetType, payload.TargetID, payload.TargetLabel)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	// DSA notice-and-action (Art. 16): listing reports also enter the
	// dedicated listing_reports queue so admins can apply listing-
	// specific resolutions (dismiss / warn / remove / suspend) and so
	// trusted flaggers (Art. 22) can be prioritised.
	if payload.TargetType == "shelter_listing" && payload.TargetID != "" {
		shelterID := ""
		if pet, err := s.store.GetShelterPet(payload.TargetID); err == nil && pet != nil {
			shelterID = pet.ShelterID
		}
		_, _ = s.store.CreateListingReport(domain.ListingReport{
			ListingID:      payload.TargetID,
			ShelterID:      shelterID,
			ReporterID:     user.Profile.ID,
			ReporterName:   user.Profile.FirstName,
			TrustedFlagger: domain.IsTrustedFlagger(user.Profile.ID),
			Reason:         payload.Reason,
			Description:    payload.TargetLabel,
			Status:         "open",
		})
	}

	writeJSON(writer, http.StatusCreated, map[string]any{"data": report})
}

func (s *Server) handleNearbyPets(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	cards := s.store.DiscoveryFeed(userID)
	var nearby []domain.DiscoveryCard
	for _, card := range cards {
		nearby = append(nearby, card)
	}
	if nearby == nil {
		nearby = []domain.DiscoveryCard{}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": nearby})
}

func (s *Server) handleUpload(writer http.ResponseWriter, request *http.Request) {
	if err := request.ParseMultipartForm(10 << 20); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid upload payload")
		return
	}

	source, header, err := request.FormFile("file")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "file is required")
		return
	}
	defer source.Close()

	if err := os.MkdirAll(s.cfg.UploadsDir, 0o755); err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to prepare uploads directory")
		return
	}

	extension := filepath.Ext(header.Filename)
	if extension == "" {
		contentType := header.Header.Get("Content-Type")
		if contentType != "" {
			if extensions, lookupErr := mime.ExtensionsByType(contentType); lookupErr == nil && len(extensions) > 0 {
				extension = extensions[0]
			}
		}
	}
	if extension == "" {
		extension = ".jpg"
	}

	fileName := newUploadFileName(extension)
	targetPath := filepath.Join(s.cfg.UploadsDir, fileName)
	target, err := os.Create(targetPath)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to create uploaded file")
		return
	}
	defer target.Close()

	if _, err := io.Copy(target, source); err != nil {
		writeError(writer, http.StatusInternalServerError, "unable to store uploaded file")
		return
	}

	writeJSON(writer, http.StatusCreated, map[string]any{
		"data": map[string]string{
			"id":  fileName,
			"url": strings.TrimRight(s.cfg.APIBaseURL, "/") + "/uploads/" + fileName,
		},
	})
}

func (s *Server) handleAdminLogin(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	admin, err := s.store.AdminLogin(payload.Email, payload.Password)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, err.Error())
		return
	}

	session, err := s.issueAdminSession(admin.ID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": session})
}

func (s *Server) handleAdminDashboard(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.Dashboard()})
}

func (s *Server) handleAdminUsers(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListUsers()})
}

func (s *Server) handleAdminUserUpdate(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Status    string  `json:"status"`
		FirstName string  `json:"firstName"`
		LastName  string  `json:"lastName"`
		Bio       *string `json:"bio"`
		CityLabel string  `json:"cityLabel"`
		Gender    string  `json:"gender"`
		BirthDate string  `json:"birthDate"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	userID := chi.URLParam(request, "userID")

	if payload.Status != "" {
		if err := s.store.SuspendUser(userID, payload.Status); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
	}

	if payload.FirstName != "" || payload.LastName != "" || payload.Bio != nil || payload.CityLabel != "" || payload.Gender != "" || payload.BirthDate != "" {
		input := store.UpdateProfileInput{
			FirstName: payload.FirstName,
			LastName:  payload.LastName,
			Bio:       payload.Bio,
			Gender:    payload.Gender,
			CityLabel: payload.CityLabel,
			BirthDate: payload.BirthDate,
		}
		if _, err := s.store.UpdateProfile(userID, input); err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminUserDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.UserDetail(chi.URLParam(request, "userID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminUserDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteUser(chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminPets(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListAllPets()})
}

func (s *Server) handleAdminPetDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.PetDetail(chi.URLParam(request, "petID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminPetUpdate(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Hidden bool `json:"hidden"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}

	if err := s.store.SetPetVisibility(chi.URLParam(request, "petID"), payload.Hidden); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

func (s *Server) handleAdminTaxonomyList(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListTaxonomy(chi.URLParam(request, "kind"), "")})
}

func (s *Server) handleAdminTaxonomyUpsert(writer http.ResponseWriter, request *http.Request) {
	var payload domain.TaxonomyItem
	if !decodeJSON(writer, request, &payload) {
		return
	}

	item := s.store.UpsertTaxonomy(chi.URLParam(request, "kind"), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": item})
}

func (s *Server) handleAdminTaxonomyDelete(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteTaxonomy(chi.URLParam(request, "kind"), chi.URLParam(request, "itemID")); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleAdminReports(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListReports()})
}

func (s *Server) handleAdminReportDetail(writer http.ResponseWriter, request *http.Request) {
	detail, err := s.store.GetReportDetail(chi.URLParam(request, "reportID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": detail})
}

func (s *Server) handleAdminResolveReport(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Notes string `json:"notes"`
	}
	_ = decodeJSON(writer, request, &payload)

	reportID := chi.URLParam(request, "reportID")

	// Snapshot the reporter + target before we mutate so we can compose a
	// meaningful push body once the resolve succeeds. Best-effort — a miss
	// here only weakens the push wording, never blocks the resolve.
	var (
		reporterID  string
		targetType  string
		targetLabel string
		reason      string
	)
	if detail, err := s.store.GetReportDetail(reportID); err == nil && detail != nil {
		reporterID = detail.ReporterID
		targetType = detail.TargetType
		targetLabel = detail.TargetLabel
		reason = detail.Reason
	}

	if err := s.store.ResolveReport(reportID, payload.Notes); err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	// Notify the reporter their flag was reviewed. Fire-and-forget so a
	// missing token / network blip never blocks the admin response.
	go s.sendReportResolvedPush(reporterID, reportID, targetType, targetLabel, reason, payload.Notes)

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"resolved": true}})
}

// sendReportResolvedPush delivers a single Expo push to the reporter saying
// their report has been reviewed. Best-effort; missing tokens silently no-op.
func (s *Server) sendReportResolvedPush(reporterID, reportID, targetType, targetLabel, reason, notes string) {
	if reporterID == "" {
		return
	}
	userTokens := s.store.GetUserPushTokens(reporterID)
	if len(userTokens) == 0 {
		return
	}
	tokens := make([]string, 0, len(userTokens))
	for _, t := range userTokens {
		if t.Token != "" {
			tokens = append(tokens, t.Token)
		}
	}
	if len(tokens) == 0 {
		return
	}

	title := "Report reviewed"
	body := "Thanks for flagging — our moderators have reviewed your report."
	if targetLabel != "" {
		body = fmt.Sprintf("Your report on %s has been reviewed. Thanks for keeping Petto safe.", targetLabel)
	} else if reason != "" {
		body = fmt.Sprintf("Your report (%q) has been reviewed. Thanks for keeping Petto safe.", reason)
	}
	data := map[string]string{
		"type":       "report_resolved",
		"reportId":   reportID,
		"targetType": targetType,
	}
	if notes != "" {
		data["notes"] = notes
	}
	if err := service.SendExpoPush(tokens, title, body, data); err != nil {
		log.Printf("[REPORT] resolve push failed report=%s reporter=%s: %v", reportID, reporterID, err)
	}
}

func (s *Server) handleAdminListNotifications(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListNotifications()})
}

func (s *Server) handleAdminSendNotification(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Title  string `json:"title"`
		Body   string `json:"body"`
		Target string `json:"target"` // "all" or userId
	}
	if !decodeJSON(w, r, &payload) {
		return
	}

	notification := domain.Notification{
		ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
		Title:  payload.Title,
		Body:   payload.Body,
		Target: payload.Target,
		SentAt: time.Now().UTC().Format(time.RFC3339),
		SentBy: "admin",
	}
	s.store.SaveNotification(notification)

	// Send via Expo Push API
	var tokens []string
	if payload.Target == "all" {
		allTokens := s.store.ListAllPushTokens()
		for _, t := range allTokens {
			tokens = append(tokens, t.Token)
		}
	} else {
		userTokens := s.store.GetUserPushTokens(payload.Target)
		for _, t := range userTokens {
			tokens = append(tokens, t.Token)
		}
	}
	if len(tokens) > 0 {
		go service.SendExpoPush(tokens, payload.Title, payload.Body, map[string]string{"type": "admin"})
	}

	writeJSON(w, http.StatusCreated, map[string]any{"data": notification})
}

// ── Admin Pet Care ──────────────────────────────────────────────────

func (s *Server) handleAdminPetHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListHealthRecords(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetWeight(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListWeightEntries(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetFeeding(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListFeedingSchedules(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminPetDiary(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListDiary(chi.URLParam(r, "petID"))})
}

func (s *Server) handleAdminDeleteHealthRecord(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteHealthRecord(chi.URLParam(r, "petID"), chi.URLParam(r, "recordID")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Training Tips ─────────────────────────────────────────────

func (s *Server) handleAdminTrainingTips(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListTrainingTips("")})
}

func (s *Server) handleAdminCreateTrainingTip(w http.ResponseWriter, r *http.Request) {
	var payload domain.TrainingTip
	if !decodeJSON(w, r, &payload) {
		return
	}
	tip := s.store.CreateTrainingTip(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": tip})
}

func (s *Server) handleAdminUpdateTrainingTip(w http.ResponseWriter, r *http.Request) {
	var payload domain.TrainingTip
	if !decodeJSON(w, r, &payload) {
		return
	}
	payload.ID = chi.URLParam(r, "tipID")
	tip, err := s.store.UpdateTrainingTip(payload)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": tip})
}

func (s *Server) handleAdminDeleteTrainingTip(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Pet Sitters ───────────────────────────────────────────────

func (s *Server) handleAdminPetSitters(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListPetSitters("")})
}

func (s *Server) handleAdminDeletePetSitter(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Playdates ─────────────────────────────────────────────────

func (s *Server) handleAdminPlaydates(w http.ResponseWriter, r *http.Request) {
	// Admin sees the full table — past + cancelled + private. The public
	// /v1/playdates discovery feed still hides those rows.
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ListPlaydates(store.ListPlaydatesParams{
			IncludePast: true,
			IncludeAll:  true,
		}),
	})
}

func (s *Server) handleAdminDeletePlaydate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Groups ────────────────────────────────────────────────────

func (s *Server) handleAdminGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListGroups(store.ListGroupsParams{})})
}

// handleAdminGroupDetail returns a fully-enriched group view for the admin
// moderation surface — bypasses the public `is_private` visibility gate and
// includes members + per-member mute state + admin user IDs (same shape as
// the user-facing detail call).
func (s *Server) handleAdminGroupDetail(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if groupID == "" {
		writeError(w, http.StatusBadRequest, "groupID is required")
		return
	}
	pool := s.pg()
	if pool == nil {
		writeError(w, http.StatusServiceUnavailable, "database not configured")
		return
	}
	var convID string
	err := pool.QueryRow(adminCtx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`,
		groupID).Scan(&convID)
	if err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	group := s.store.GetGroupByConversation(convID)
	if group == nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": group})
}

func (s *Server) handleAdminCreateGroup(w http.ResponseWriter, r *http.Request) {
	var payload domain.CommunityGroup
	if !decodeJSON(w, r, &payload) {
		return
	}
	// Admin doesn't auto-join the group they create
	group := s.store.CreateGroup("", payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": group})
}

func (s *Server) handleAdminDeleteGroup(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin Lost Pets ─────────────────────────────────────────────────

func (s *Server) handleAdminLostPets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListLostPets()})
}

func (s *Server) handleAdminUpdateLostPet(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	if err := s.store.UpdateLostPetStatus(chi.URLParam(r, "alertID"), payload.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

// ── Admin Badges ────────────────────────────────────────────────────

func (s *Server) handleAdminBadges(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": []domain.Badge{}})
}

// ── Health ───────────────────────────────────────────────────────────

func (s *Server) handleListHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	records := s.store.ListHealthRecords(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": records})
}

func (s *Server) handleCreateHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.HealthRecord
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateHealthRecord(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteHealth(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteHealthRecord(petID, chi.URLParam(request, "recordID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Health Profile (allergies / dietary restrictions / emergency notes) ─

func (s *Server) handleGetHealthProfile(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	profile := s.store.GetHealthProfile(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": profile})
}

func (s *Server) handleUpsertHealthProfile(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.PetHealthProfile
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.UpsertHealthProfile(petID, payload)
	writeJSON(writer, http.StatusOK, map[string]any{"data": result})
}

// ── Symptom Logs ─────────────────────────────────────────────────────

func (s *Server) handleListSymptoms(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	logs := s.store.ListSymptomLogs(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": logs})
}

func (s *Server) handleCreateSymptom(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.SymptomLog
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if payload.Severity < 1 {
		payload.Severity = 1
	}
	if payload.Severity > 5 {
		payload.Severity = 5
	}
	result := s.store.CreateSymptomLog(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteSymptom(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteSymptomLog(petID, chi.URLParam(request, "logID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Medications ──────────────────────────────────────────────────────

func (s *Server) handleListMedications(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListMedications(petID)})
}

func (s *Server) handleCreateMedication(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.PetMedication
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if strings.TrimSpace(payload.Name) == "" {
		writeError(writer, http.StatusBadRequest, "name is required")
		return
	}
	if !validMedicationTime(payload.TimeOfDay) {
		writeError(writer, http.StatusBadRequest, "timeOfDay must be HH:MM (24h)")
		return
	}
	if !validIANATimezone(payload.Timezone) {
		writeError(writer, http.StatusBadRequest, "timezone must be a valid IANA name (e.g. Europe/Istanbul)")
		return
	}
	payload.DaysOfWeek = sanitiseDaysOfWeek(payload.DaysOfWeek)
	result := s.store.CreateMedication(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleUpdateMedication(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.PetMedication
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if payload.TimeOfDay != "" && !validMedicationTime(payload.TimeOfDay) {
		writeError(writer, http.StatusBadRequest, "timeOfDay must be HH:MM (24h)")
		return
	}
	if payload.Timezone != "" && !validIANATimezone(payload.Timezone) {
		writeError(writer, http.StatusBadRequest, "timezone must be a valid IANA name")
		return
	}
	payload.DaysOfWeek = sanitiseDaysOfWeek(payload.DaysOfWeek)
	med, err := s.store.UpdateMedication(petID, chi.URLParam(request, "medID"), payload)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": med})
}

func (s *Server) handleDeleteMedication(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteMedication(petID, chi.URLParam(request, "medID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleMarkMedicationGiven(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	med, err := s.store.MarkMedicationGiven(petID, chi.URLParam(request, "medID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": med})
}

// handleListMedicationDoses returns the per-medication "given" event
// timeline. v0.14.3: powers the History sheet on the mobile medications
// screen so users can see which days/times they actually administered
// each medication.
func (s *Server) handleListMedicationDoses(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	doses := s.store.ListMedicationDoses(petID, chi.URLParam(request, "medID"), 90)
	writeJSON(writer, http.StatusOK, map[string]any{"data": doses})
}

// handleListMedicationDosesByPet powers the Apple-style date strip:
// returns every dose row across the pet's active medications inside the
// requested window. Defaults to "last 30 days" if the caller omits the
// range, capped to 90 days max.
func (s *Server) handleListMedicationDosesByPet(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	q := request.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	now := time.Now().UTC()
	if from == "" {
		// 30 days back, midnight UTC.
		from = now.AddDate(0, 0, -30).Format("2006-01-02") + "T00:00:00Z"
	}
	if to == "" {
		// One day past today so today is fully included.
		to = now.AddDate(0, 0, 1).Format("2006-01-02") + "T00:00:00Z"
	}
	// Hard cap the range so a misbehaving client can't ask for 10 years.
	fromT, errF := time.Parse(time.RFC3339, from)
	toT, errT := time.Parse(time.RFC3339, to)
	if errF == nil && errT == nil && toT.Sub(fromT) > 92*24*time.Hour {
		from = toT.AddDate(0, 0, -90).Format(time.RFC3339)
	}
	doses := s.store.ListMedicationDosesByPet(petID, from, to)
	writeJSON(writer, http.StatusOK, map[string]any{"data": doses})
}

// ── Breed Care Guides (public read) ──────────────────────────────────

func (s *Server) handleGetBreedCareForPet(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	pet, err := s.store.GetPet(petID)
	if err != nil || pet == nil {
		writeError(writer, http.StatusNotFound, "pet not found")
		return
	}
	guide, err := s.store.GetBreedCareGuide(pet.SpeciesID, pet.BreedID)
	if err != nil || guide == nil {
		// Soft-empty: returning a structured "no guide yet" payload lets the
		// mobile screen render its own empty state without an extra round-trip.
		writeJSON(writer, http.StatusOK, map[string]any{
			"data": map[string]any{
				"available":    false,
				"speciesId":    pet.SpeciesID,
				"speciesLabel": pet.SpeciesLabel,
				"breedId":      pet.BreedID,
				"breedLabel":   pet.BreedLabel,
			},
		})
		return
	}
	// Resolve the caller's locale (?locale=… wins; Accept-Language second).
	// Translation lookup is per-field, so a partial translation with only
	// `title` filled in still falls back to base English for summary/body.
	locale := pickLocale(request)
	localized := applyBreedCareLocale(*guide, locale)
	writeJSON(writer, http.StatusOK, map[string]any{
		"data": map[string]any{
			"available":    true,
			"speciesId":    pet.SpeciesID,
			"speciesLabel": pet.SpeciesLabel,
			"breedId":      pet.BreedID,
			"breedLabel":   pet.BreedLabel,
			"guide":        localized,
			"locale":       locale,
		},
	})
}

// pickLocale extracts the caller's preferred locale from the request — the
// `?locale=` query param wins so clients can override per-call, then the
// first language in Accept-Language. Empty when neither is set.
func pickLocale(r *http.Request) string {
	if q := strings.TrimSpace(r.URL.Query().Get("locale")); q != "" {
		return q
	}
	if h := r.Header.Get("Accept-Language"); h != "" {
		// "tr,en-US;q=0.9,en;q=0.8" → "tr"
		first := strings.SplitN(h, ",", 2)[0]
		first = strings.SplitN(first, ";", 2)[0]
		return strings.TrimSpace(first)
	}
	return ""
}

// applyBreedCareLocale returns a copy of `g` with Title/Summary/Body
// overridden by the matching translation when it exists. Empty translation
// fields keep the base English value — partial translations are valid.
// Strips the Translations map from the returned guide so mobile doesn't
// download every locale on every read.
func applyBreedCareLocale(g domain.BreedCareGuide, locale string) domain.BreedCareGuide {
	if locale == "" || len(g.Translations) == 0 {
		g.Translations = nil
		return g
	}
	tr, ok := g.Translations[locale]
	if !ok {
		// Fall back to the language family (e.g. "pt-BR" → "pt") before
		// giving up — keeps regional codes from silently dropping.
		if dash := strings.IndexByte(locale, '-'); dash > 0 {
			tr, ok = g.Translations[locale[:dash]]
		}
	}
	if ok {
		if tr.Title != "" {
			g.Title = tr.Title
		}
		if tr.Summary != "" {
			g.Summary = tr.Summary
		}
		if tr.Body != "" {
			g.Body = tr.Body
		}
	}
	g.Translations = nil
	return g
}

// ── First-Aid Topics (public read) ──────────────────────────────────

func (s *Server) handleListFirstAid(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListFirstAidTopics()})
}

// ── Admin: Breed Care Guides ────────────────────────────────────────

func (s *Server) handleAdminListBreedCareGuides(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListBreedCareGuides()})
}

func (s *Server) handleAdminUpsertBreedCareGuide(writer http.ResponseWriter, request *http.Request) {
	var payload domain.BreedCareGuide
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.SpeciesID = strings.TrimSpace(payload.SpeciesID)
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.SpeciesID == "" {
		writeError(writer, http.StatusBadRequest, "speciesId is required")
		return
	}
	if payload.Title == "" {
		writeError(writer, http.StatusBadRequest, "title is required")
		return
	}
	g, err := s.store.UpsertBreedCareGuide(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": g})
}

func (s *Server) handleAdminUpdateBreedCareGuide(writer http.ResponseWriter, request *http.Request) {
	var payload domain.BreedCareGuide
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.ID = chi.URLParam(request, "guideID")
	if payload.ID == "" {
		writeError(writer, http.StatusBadRequest, "guideID is required")
		return
	}
	g, err := s.store.UpsertBreedCareGuide(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": g})
}

func (s *Server) handleAdminDeleteBreedCareGuide(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteBreedCareGuide(chi.URLParam(request, "guideID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin: First-Aid Topics ─────────────────────────────────────────

func (s *Server) handleAdminListFirstAidTopics(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListFirstAidTopics()})
}

func (s *Server) handleAdminUpsertFirstAidTopic(writer http.ResponseWriter, request *http.Request) {
	var payload domain.FirstAidTopic
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.Title == "" {
		writeError(writer, http.StatusBadRequest, "title is required")
		return
	}
	switch payload.Severity {
	case "", "info", "urgent", "emergency":
		// ok
	default:
		writeError(writer, http.StatusBadRequest, "severity must be one of: emergency, urgent, info")
		return
	}
	t, err := s.store.UpsertFirstAidTopic(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": t})
}

func (s *Server) handleAdminUpdateFirstAidTopic(writer http.ResponseWriter, request *http.Request) {
	var payload domain.FirstAidTopic
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.ID = chi.URLParam(request, "topicID")
	if payload.ID == "" {
		writeError(writer, http.StatusBadRequest, "topicID is required")
		return
	}
	t, err := s.store.UpsertFirstAidTopic(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": t})
}

func (s *Server) handleAdminDeleteFirstAidTopic(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteFirstAidTopic(chi.URLParam(request, "topicID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Admin: Food Items (Calorie Counter database) ────────────────────

func (s *Server) handleAdminListFoodItems(writer http.ResponseWriter, request *http.Request) {
	q := request.URL.Query()
	items := s.store.AdminListFoodItems(q.Get("search"), q.Get("species"), 200)
	writeJSON(writer, http.StatusOK, map[string]any{"data": items})
}

func (s *Server) handleAdminUpsertFoodItem(writer http.ResponseWriter, request *http.Request) {
	var payload domain.FoodItem
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(writer, http.StatusBadRequest, "name is required")
		return
	}
	if payload.KcalPer100g <= 0 {
		writeError(writer, http.StatusBadRequest, "kcalPer100g must be > 0")
		return
	}
	switch payload.Kind {
	case "", "dry", "wet", "treat", "other":
		// ok
	default:
		writeError(writer, http.StatusBadRequest, "kind must be one of: dry, wet, treat, other")
		return
	}
	item, err := s.store.AdminUpsertFoodItem(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": item})
}

func (s *Server) handleAdminUpdateFoodItem(writer http.ResponseWriter, request *http.Request) {
	var payload domain.FoodItem
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.ID = chi.URLParam(request, "itemID")
	if payload.ID == "" {
		writeError(writer, http.StatusBadRequest, "itemID is required")
		return
	}
	item, err := s.store.AdminUpsertFoodItem(payload)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": item})
}

func (s *Server) handleAdminDeleteFoodItem(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.AdminDeleteFoodItem(chi.URLParam(request, "itemID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Pet Documents ────────────────────────────────────────────────────

func (s *Server) handleListPetDocuments(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPetDocuments(petID)})
}

func (s *Server) handleCreatePetDocument(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.PetDocument
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.Title == "" {
		writeError(writer, http.StatusBadRequest, "title is required")
		return
	}
	if payload.FileURL == "" {
		writeError(writer, http.StatusBadRequest, "fileUrl is required (upload to R2 first)")
		return
	}
	switch payload.Kind {
	case "", "vaccine", "medical", "insurance", "microchip", "other":
		// ok
	default:
		writeError(writer, http.StatusBadRequest, "kind must be one of: vaccine, medical, insurance, microchip, other")
		return
	}
	if payload.Kind == "" {
		payload.Kind = "other"
	}
	if payload.FileKind == "" {
		payload.FileKind = "image"
	}
	result := s.store.CreatePetDocument(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeletePetDocument(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeletePetDocument(petID, chi.URLParam(request, "docID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Food Items + Meal Logs (Calorie Counter) ─────────────────────────

func (s *Server) handleListFoodItems(writer http.ResponseWriter, request *http.Request) {
	uid := currentUserID(request)
	q := request.URL.Query()
	items := s.store.ListFoodItems(uid, q.Get("search"), q.Get("species"), 50)
	writeJSON(writer, http.StatusOK, map[string]any{"data": items})
}

func (s *Server) handleCreateFoodItem(writer http.ResponseWriter, request *http.Request) {
	uid := currentUserID(request)
	var payload domain.FoodItem
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		writeError(writer, http.StatusBadRequest, "name is required")
		return
	}
	if payload.KcalPer100g <= 0 {
		writeError(writer, http.StatusBadRequest, "kcalPer100g must be > 0")
		return
	}
	result := s.store.CreateFoodItem(uid, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleListMeals(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	q := request.URL.Query()
	logs := s.store.ListMealLogs(petID, q.Get("from"), q.Get("to"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": logs})
}

func (s *Server) handleCreateMeal(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.MealLog
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if payload.Grams <= 0 {
		writeError(writer, http.StatusBadRequest, "grams must be > 0")
		return
	}
	if payload.FoodItemID == "" && strings.TrimSpace(payload.CustomName) == "" {
		writeError(writer, http.StatusBadRequest, "either foodItemId or customName is required")
		return
	}
	// Compute kcal server-side from the food item for consistency. If the
	// caller passed a foodItemId, that's authoritative — we ignore any
	// kcal they sent. Custom-name meals trust the caller's kcal.
	if payload.FoodItemID != "" {
		item, err := s.store.GetFoodItem(payload.FoodItemID)
		if err != nil {
			writeError(writer, http.StatusBadRequest, "food item not found")
			return
		}
		payload.Kcal = item.KcalPer100g * payload.Grams / 100.0
		if payload.CustomName == "" {
			payload.CustomName = item.Brand + " " + item.Name
		}
	}
	result := s.store.CreateMealLog(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteMeal(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteMealLog(petID, chi.URLParam(request, "mealID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handleDailyMealSummary(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	date := request.URL.Query().Get("date")
	if date == "" {
		date = time.Now().UTC().Format("2006-01-02")
	}
	if len(date) != 10 || date[4] != '-' || date[7] != '-' {
		writeError(writer, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.GetDailyMealSummary(petID, date)})
}

// ── Weekly Summary (viewable anytime) ────────────────────────────────

func (s *Server) handleWeeklySummary(writer http.ResponseWriter, request *http.Request) {
	uid := currentUserID(request)
	weekStart, weekEnd := currentWeekUTCWindow(time.Now().UTC())
	sum := s.store.GetWeeklyHealthSummaryForUser(uid, weekStart, weekEnd)
	writeJSON(writer, http.StatusOK, map[string]any{"data": sum})
}

// ── Care helpers ─────────────────────────────────────────────────────

func validMedicationTime(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	h, errH := strconv.Atoi(s[0:2])
	m, errM := strconv.Atoi(s[3:5])
	if errH != nil || errM != nil {
		return false
	}
	return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

func validIANATimezone(name string) bool {
	if name == "" {
		return false
	}
	_, err := time.LoadLocation(name)
	return err == nil
}

// sanitiseDaysOfWeek dedupes + sorts + clamps each value to [0,6]. Empty
// input means "every day", which we expand here so the sweeper can do a
// straight membership check.
func sanitiseDaysOfWeek(days []int) []int {
	if len(days) == 0 {
		return []int{0, 1, 2, 3, 4, 5, 6}
	}
	seen := make(map[int]struct{}, 7)
	out := make([]int, 0, 7)
	for _, d := range days {
		if d < 0 || d > 6 {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	sort.Ints(out)
	return out
}

// currentWeekUTCWindow returns [weekStartUTC, weekEndUTC) for the
// Monday-anchored ISO week that contains `now`. Both ends are pure dates
// (T00:00:00) in UTC so DB comparisons against DATE / TIMESTAMPTZ both
// behave consistently.
func currentWeekUTCWindow(now time.Time) (string, string) {
	wd := int(now.Weekday()) - 1 // Monday = 0
	if wd < 0 {
		wd = 6 // Sunday wraps to end-of-week
	}
	monday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, -wd)
	return monday.Format(time.RFC3339), monday.AddDate(0, 0, 7).Format(time.RFC3339)
}

// ── Weight ───────────────────────────────────────────────────────────

func (s *Server) handleListWeight(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	entries := s.store.ListWeightEntries(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": entries})
}

func (s *Server) handleCreateWeight(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.WeightEntry
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateWeightEntry(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Vet Contacts ─────────────────────────────────────────────────────

func (s *Server) handleListVetContacts(writer http.ResponseWriter, request *http.Request) {
	contacts := s.store.ListVetContacts(currentUserID(request))
	writeJSON(writer, http.StatusOK, map[string]any{"data": contacts})
}

func (s *Server) handleCreateVetContact(writer http.ResponseWriter, request *http.Request) {
	var payload domain.VetContact
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateVetContact(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteVetContact(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DeleteVetContact(currentUserID(request), chi.URLParam(request, "contactID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Feeding ──────────────────────────────────────────────────────────

func (s *Server) handleListFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	schedules := s.store.ListFeedingSchedules(petID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": schedules})
}

func (s *Server) handleCreateFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	var payload domain.FeedingSchedule
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateFeedingSchedule(petID, payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleDeleteFeeding(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	if err := s.store.DeleteFeedingSchedule(petID, chi.URLParam(request, "scheduleID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// handleLogFeedingNow turns one feeding-plan row into a meal-log row "as
// eaten now", then bumps the schedule's last_logged_at. Bridges the
// recurring-plan view (Feeding Plan) and the daily-actuals view (Calorie
// Counter): tapping "Log it" makes the planned meal show up as eaten in
// today's calorie summary.
func (s *Server) handleLogFeedingNow(writer http.ResponseWriter, request *http.Request) {
	petID, ok := s.verifyPetOwnership(writer, request)
	if !ok {
		return
	}
	scheduleID := chi.URLParam(request, "scheduleID")
	mealLog, err := s.store.LogFeedingScheduleNow(petID, scheduleID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": mealLog})
}

// ── Playdates ────────────────────────────────────────────────────────

func (s *Server) handleListPlaydates(writer http.ResponseWriter, request *http.Request) {
	params := store.ListPlaydatesParams{
		UserID: currentUserID(request),
		Search: request.URL.Query().Get("search"),
		From:   request.URL.Query().Get("from"),
		To:     request.URL.Query().Get("to"),
		Sort:   request.URL.Query().Get("sort"),
	}
	if v := request.URL.Query().Get("lat"); v != "" {
		fmt.Sscanf(v, "%f", &params.Lat)
	}
	if v := request.URL.Query().Get("lng"); v != "" {
		fmt.Sscanf(v, "%f", &params.Lng)
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": s.store.ListPlaydates(params)})
}

func (s *Server) handleGetPlaydate(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	playdate, err := s.store.GetPlaydateForUser(playdateID, userID)
	if err != nil || playdate == nil {
		writeError(writer, http.StatusNotFound, "playdate not found")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": playdate})
}

func (s *Server) handleCreatePlaydate(writer http.ResponseWriter, request *http.Request) {
	var payload domain.Playdate
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreatePlaydate(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleUpdatePlaydate(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	var payload domain.Playdate
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result, err := s.store.UpdatePlaydate(userID, playdateID, payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	// Notify every attendee (except the editing host) that details changed.
	// Spec: "Notify attendees when details change". Fire-and-forget push.
	go func() {
		if result == nil {
			return
		}
		for _, attendeeID := range result.Attendees {
			if attendeeID == userID {
				continue
			}
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  "Playdate details changed",
				Body:   result.Title,
				Target: attendeeID,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if !s.store.ShouldSendPush(attendeeID, "playdates") {
				continue
			}
			tokens := s.store.GetUserPushTokens(attendeeID)
			var push []string
			for _, t := range tokens {
				push = append(push, t.Token)
			}
			if len(push) > 0 {
				_ = service.SendExpoPush(push, "Playdate details changed", result.Title, map[string]string{
					"type":       "playdate_updated",
					"playdateId": playdateID,
				})
			}
		}
	}()
	writeJSON(writer, http.StatusOK, map[string]any{"data": result})
}

func (s *Server) handleJoinPlaydate(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)

	var payload struct {
		PetIds []string `json:"petIds"`
		Note   string   `json:"note"`
	}
	// Body is optional for legacy callers; decode best-effort.
	if request.Body != nil {
		_ = json.NewDecoder(request.Body).Decode(&payload)
	}

	var err error
	if len(payload.PetIds) > 0 {
		err = s.store.JoinPlaydateWithPets(userID, playdateID, payload.PetIds, payload.Note)
	} else {
		// Legacy fallback: picks the user's first pet server-side.
		err = s.store.JoinPlaydate(userID, playdateID)
	}
	if err != nil && err != store.ErrPlaydateWaitlisted {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	waitlisted := err == store.ErrPlaydateWaitlisted

	// Notify the host (non-blocking).
	go func() {
		pd, ferr := s.store.GetPlaydate(playdateID)
		if ferr != nil || pd == nil || pd.OrganizerID == "" || pd.OrganizerID == userID {
			return
		}
		title := "New playdate signup"
		body := "Someone joined your playdate."
		if waitlisted {
			title = "Playdate waitlist update"
			body = "Someone joined the waitlist for your playdate."
		}
		s.store.SaveNotification(domain.Notification{
			ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
			Title:  title,
			Body:   body,
			Target: pd.OrganizerID,
			SentAt: time.Now().UTC().Format(time.RFC3339),
			SentBy: "system",
		})
		if !s.store.ShouldSendPush(pd.OrganizerID, "playdates") {
			return
		}
		tokens := s.store.GetUserPushTokens(pd.OrganizerID)
		var push []string
		for _, t := range tokens {
			push = append(push, t.Token)
		}
		if len(push) > 0 {
			_ = service.SendExpoPush(push, title, body, map[string]string{"type": "playdate_join", "playdateId": playdateID})
		}
	}()

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{
		"joined":     !waitlisted,
		"waitlisted": waitlisted,
	}})
}

func (s *Server) handleLeavePlaydate(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)

	var payload struct {
		PetIds []string `json:"petIds"`
	}
	if request.Body != nil {
		_ = json.NewDecoder(request.Body).Decode(&payload)
	}

	promoted, err := s.store.LeavePlaydateWithPets(userID, playdateID, payload.PetIds)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	// Notify host about the leave + any auto-promoted user.
	go func() {
		pd, ferr := s.store.GetPlaydate(playdateID)
		if ferr != nil || pd == nil {
			return
		}
		if pd.OrganizerID != "" && pd.OrganizerID != userID {
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  "Someone left your playdate",
				Body:   "A participant has left your playdate.",
				Target: pd.OrganizerID,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if s.store.ShouldSendPush(pd.OrganizerID, "playdates") {
				tokens := s.store.GetUserPushTokens(pd.OrganizerID)
				var push []string
				for _, t := range tokens {
					push = append(push, t.Token)
				}
				if len(push) > 0 {
					_ = service.SendExpoPush(push, "Playdate update", "A participant has left your playdate.", map[string]string{"type": "playdate_leave", "playdateId": playdateID})
				}
			}
		}
		for _, promotedUser := range promoted {
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  "You're in!",
				Body:   "A spot opened up on your waitlisted playdate.",
				Target: promotedUser,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if !s.store.ShouldSendPush(promotedUser, "playdates") {
				continue
			}
			tokens := s.store.GetUserPushTokens(promotedUser)
			var push []string
			for _, t := range tokens {
				push = append(push, t.Token)
			}
			if len(push) > 0 {
				_ = service.SendExpoPush(push, "You're in! 🎉", "A spot opened on your waitlisted playdate.", map[string]string{"type": "playdate_promoted", "playdateId": playdateID})
			}
		}
	}()

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"left":     true,
		"promoted": len(promoted) > 0,
	}})
}

func (s *Server) handleUpdateAttendeePets(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	var payload struct {
		PetIds []string `json:"petIds"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.UpdateAttendeePets(userID, playdateID, payload.PetIds); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := s.store.GetPlaydateForUser(playdateID, userID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": updated})
}

func (s *Server) handleCancelPlaydate(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	if err := s.store.CancelPlaydate(userID, playdateID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	// Notify all attendees.
	go func() {
		pd, ferr := s.store.GetPlaydate(playdateID)
		if ferr != nil || pd == nil {
			return
		}
		for _, attendeeID := range pd.Attendees {
			if attendeeID == userID {
				continue
			}
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  "Playdate cancelled",
				Body:   "A playdate you joined has been cancelled.",
				Target: attendeeID,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if !s.store.ShouldSendPush(attendeeID, "playdates") {
				continue
			}
			tokens := s.store.GetUserPushTokens(attendeeID)
			var push []string
			for _, t := range tokens {
				push = append(push, t.Token)
			}
			if len(push) > 0 {
				_ = service.SendExpoPush(push, "Playdate cancelled", "A playdate you joined has been cancelled.", map[string]string{"type": "playdate_cancelled", "playdateId": playdateID})
			}
		}
	}()

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"cancelled": true}})
}

func (s *Server) handlePlaydateAnnounce(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	var payload struct {
		Body string `json:"body"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.PostPlaydateAnnouncement(userID, playdateID, payload.Body); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"posted": true}})
}

// ── Playdate invites ────────────────────────────────────────────────

func (s *Server) handleListInvitableUsers(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	users, err := s.store.ListInvitableUsers(userID, playdateID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": users})
}

func (s *Server) handleCreatePlaydateInvites(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	userID := currentUserID(request)
	var payload struct {
		UserIds []string `json:"userIds"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	invites, err := s.store.CreatePlaydateInvites(userID, playdateID, payload.UserIds)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	// Look up playdate + host info once so we can format rich push bodies.
	pd, _ := s.store.GetPlaydate(playdateID)
	go func() {
		for _, inv := range invites {
			title := "You're invited to a playdate"
			body := "Someone invited you to join their playdate on Petto."
			if pd != nil {
				if pd.HostInfo != nil && pd.HostInfo.FirstName != "" {
					body = pd.HostInfo.FirstName + " invited you"
					if pd.Title != "" {
						body += " to " + pd.Title
					}
				} else if pd.Title != "" {
					body = "You've been invited to " + pd.Title
				}
			}
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  title,
				Body:   body,
				Target: inv.InvitedUserID,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if !s.store.ShouldSendPush(inv.InvitedUserID, "playdates") {
				continue
			}
			tokens := s.store.GetUserPushTokens(inv.InvitedUserID)
			var push []string
			for _, t := range tokens {
				push = append(push, t.Token)
			}
			if len(push) > 0 {
				_ = service.SendExpoPush(push, title, body, map[string]string{
					"type":       "playdate_invite",
					"playdateId": playdateID,
					"inviteId":   inv.ID,
				})
			}
		}
	}()

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"invites": invites,
	}})
}

func (s *Server) handleListMyPlaydateInvites(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	invites := s.store.ListMyPendingPlaydateInvites(userID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": invites})
}

func (s *Server) handleListMyPlaydates(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	when := request.URL.Query().Get("when")
	if when != "upcoming" && when != "past" {
		when = "upcoming"
	}
	role := request.URL.Query().Get("role")
	if role != "hosted" {
		role = "all"
	}
	result := s.store.ListMyPlaydates(store.ListMyPlaydatesParams{
		UserID: userID,
		When:   when,
		Role:   role,
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": result})
}

func (s *Server) handleAcceptPlaydateInvite(writer http.ResponseWriter, request *http.Request) {
	inviteID := chi.URLParam(request, "inviteID")
	userID := currentUserID(request)
	playdateID, err := s.store.RespondToPlaydateInvite(userID, inviteID, true)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]string{
		"playdateId": playdateID,
	}})
}

// handleClaimPlaydateShare redeems a host-generated share token. The mobile
// app calls this when a user opens `petto://playdates/{id}?t={token}` — the
// backend upserts a pending invite so the subsequent GetPlaydate request
// passes the private-visibility gate and the detail screen renders.
func (s *Server) handleClaimPlaydateShare(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	token := chi.URLParam(request, "token")
	userID := currentUserID(request)
	if err := s.store.ClaimPlaydateShareToken(userID, playdateID, token); err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if msg == "playdate not found" {
			status = http.StatusNotFound
		} else if msg == "invalid share token" {
			status = http.StatusForbidden
		}
		writeError(writer, status, msg)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"claimed": true}})
}

func (s *Server) handleDeclinePlaydateInvite(writer http.ResponseWriter, request *http.Request) {
	inviteID := chi.URLParam(request, "inviteID")
	userID := currentUserID(request)
	if _, err := s.store.RespondToPlaydateInvite(userID, inviteID, false); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"declined": true}})
}

// ── Playdate chat moderation (v0.14.0) ──────────────────────────────

func (s *Server) handleMutePlaydateMember(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	hostID := currentUserID(request)
	var payload struct {
		UserID   string `json:"userId"`
		Duration string `json:"duration"` // "1h" | "24h" | "forever"
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if payload.UserID == "" {
		writeError(writer, http.StatusBadRequest, "userId required")
		return
	}
	var until *time.Time
	switch payload.Duration {
	case "1h":
		t := time.Now().UTC().Add(1 * time.Hour)
		until = &t
	case "24h":
		t := time.Now().UTC().Add(24 * time.Hour)
		until = &t
	case "", "forever":
		until = nil
	default:
		writeError(writer, http.StatusBadRequest, "invalid duration")
		return
	}
	if err := s.store.SetPlaydateChatMute(hostID, playdateID, payload.UserID, until); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"muted": true}})
}

func (s *Server) handleUnmutePlaydateMember(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	targetUserID := chi.URLParam(request, "userID")
	hostID := currentUserID(request)
	if err := s.store.UnsetPlaydateChatMute(hostID, playdateID, targetUserID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"unmuted": true}})
}

// ── Host Tools panel (v0.16.0) ───────────────────────────────────────

func (s *Server) handleKickPlaydateAttendee(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	targetUserID := chi.URLParam(request, "userID")
	hostID := currentUserID(request)
	promoted, err := s.store.KickPlaydateAttendee(hostID, playdateID, targetUserID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	// Silent removal per spec — no chat system message, no push to the host
	// group. We still ping the kicked user privately so they know they're
	// out, and we ping any promoted waitlisters the usual way.
	go func() {
		pd, ferr := s.store.GetPlaydate(playdateID)
		if ferr != nil || pd == nil {
			return
		}
		// Kicked-user private notification (in-app only — no push badge).
		s.store.SaveNotification(domain.Notification{
			ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
			Title:  "Playdate update",
			Body:   "You are no longer on a playdate's attendee list.",
			Target: targetUserID,
			SentAt: time.Now().UTC().Format(time.RFC3339),
			SentBy: "system",
		})
		// Waitlist promotions — loud, same as Leave flow.
		for _, promotedUser := range promoted {
			s.store.SaveNotification(domain.Notification{
				ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
				Title:  "You're in!",
				Body:   "A spot opened up on your waitlisted playdate.",
				Target: promotedUser,
				SentAt: time.Now().UTC().Format(time.RFC3339),
				SentBy: "system",
			})
			if !s.store.ShouldSendPush(promotedUser, "playdates") {
				continue
			}
			tokens := s.store.GetUserPushTokens(promotedUser)
			var push []string
			for _, t := range tokens {
				push = append(push, t.Token)
			}
			if len(push) > 0 {
				_ = service.SendExpoPush(push, "You're in! 🎉", "A spot opened on your waitlisted playdate.", map[string]string{"type": "playdate_promoted", "playdateId": playdateID})
			}
		}
	}()
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"removed":  true,
		"promoted": len(promoted) > 0,
	}})
}

func (s *Server) handleSetPlaydateLock(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	hostID := currentUserID(request)
	var payload struct {
		Locked bool `json:"locked"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.SetPlaydateLock(hostID, playdateID, payload.Locked); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"locked": payload.Locked}})
}

func (s *Server) handleTransferPlaydateOwnership(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	currentHostID := currentUserID(request)
	var payload struct {
		NewOwnerID string `json:"newOwnerId"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.TransferPlaydateOwnership(currentHostID, playdateID, payload.NewOwnerID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	// Notify the new owner they're now hosting.
	go func() {
		s.store.SaveNotification(domain.Notification{
			ID:     fmt.Sprintf("notif-%d", time.Now().UnixNano()),
			Title:  "You're now hosting",
			Body:   "A playdate host handed ownership over to you.",
			Target: payload.NewOwnerID,
			SentAt: time.Now().UTC().Format(time.RFC3339),
			SentBy: "system",
		})
		if !s.store.ShouldSendPush(payload.NewOwnerID, "playdates") {
			return
		}
		tokens := s.store.GetUserPushTokens(payload.NewOwnerID)
		var push []string
		for _, t := range tokens {
			push = append(push, t.Token)
		}
		if len(push) > 0 {
			_ = service.SendExpoPush(push, "You're now hosting 👑", "A playdate host handed ownership over to you.", map[string]string{"type": "playdate_ownership_transfer", "playdateId": playdateID})
		}
	}()
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"transferred": true}})
}

// ── Conversation controls (generalised for any chat type) ───────────

func (s *Server) handleGetPlaydateByConversation(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	userID := currentUserID(request)
	pd := s.store.GetPlaydateByConversation(conversationID)
	if pd == nil {
		writeError(writer, http.StatusNotFound, "not a playdate conversation")
		return
	}
	// Return the enriched view for the caller so the mobile screen sees
	// isOrganizer / myChatMuted / myConvMuted without a second round trip.
	enriched, err := s.store.GetPlaydateForUser(pd.ID, userID)
	if err != nil || enriched == nil {
		writeError(writer, http.StatusNotFound, "playdate not found")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": enriched})
}

func (s *Server) handleDeleteConversationMessage(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	messageID := chi.URLParam(request, "messageID")
	userID := currentUserID(request)
	if err := s.store.DeleteConversationMessage(userID, conversationID, messageID); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	// Broadcast the deletion over WebSocket so every connected client can
	// mark the message as removed in-place.
	_ = s.hub.Publish(conversationID, map[string]any{
		"type": "message.deleted",
		"data": map[string]string{"messageId": messageID},
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// v0.11.5 — timed mute. Body: {"duration":"1h"|"24h"|"7d"|"forever"} (optional,
// defaults to "forever" for backwards compat with the old bell toggle).
func (s *Server) handleMuteConversation(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	userID := currentUserID(request)
	var payload struct {
		Duration string `json:"duration"`
	}
	// Body is optional — old callers don't send one.
	if request.Body != nil {
		_ = json.NewDecoder(request.Body).Decode(&payload)
	}
	var until *time.Time
	now := time.Now().UTC()
	switch payload.Duration {
	case "1h":
		t := now.Add(1 * time.Hour)
		until = &t
	case "24h":
		t := now.Add(24 * time.Hour)
		until = &t
	case "7d":
		t := now.Add(7 * 24 * time.Hour)
		until = &t
	default:
		// "forever" or empty → NULL (muted indefinitely)
		until = nil
	}
	if err := s.store.MuteConversation(userID, conversationID, until); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	resp := map[string]any{"muted": true}
	if until != nil {
		resp["mutedUntil"] = until.UTC().Format(time.RFC3339)
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": resp})
}

func (s *Server) handleUnmuteConversation(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	userID := currentUserID(request)
	if err := s.store.UnmuteConversation(userID, conversationID); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"unmuted": true}})
}

func (s *Server) handlePinConversationMessage(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	messageID := chi.URLParam(request, "messageID")
	userID := currentUserID(request)
	if err := s.store.PinConversationMessage(userID, conversationID, messageID, true); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	_ = s.hub.Publish(conversationID, map[string]any{
		"type": "message.pinned",
		"data": map[string]string{"messageId": messageID},
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"pinned": true}})
}

func (s *Server) handleUnpinConversationMessage(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	messageID := chi.URLParam(request, "messageID")
	userID := currentUserID(request)
	if err := s.store.PinConversationMessage(userID, conversationID, messageID, false); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	_ = s.hub.Publish(conversationID, map[string]any{
		"type": "message.unpinned",
		"data": map[string]string{"messageId": messageID},
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"unpinned": true}})
}

func (s *Server) handleListConversationPinned(writer http.ResponseWriter, request *http.Request) {
	conversationID := chi.URLParam(request, "conversationID")
	msgs, err := s.store.ListConversationPinnedMessages(conversationID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": msgs})
}

// ── Groups ───────────────────────────────────────────────────────────

func (s *Server) handleListGroups(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	var lat, lng float64
	if v := request.URL.Query().Get("lat"); v != "" {
		fmt.Sscanf(v, "%f", &lat)
	}
	if v := request.URL.Query().Get("lng"); v != "" {
		fmt.Sscanf(v, "%f", &lng)
	}
	groups := s.store.ListGroups(store.ListGroupsParams{
		UserID:  userID,
		Lat:     lat,
		Lng:     lng,
		Search:  request.URL.Query().Get("search"),
		PetType: request.URL.Query().Get("petType"),
	})
	writeJSON(writer, http.StatusOK, map[string]any{"data": groups})
}

func (s *Server) handleCreateGroup(writer http.ResponseWriter, request *http.Request) {
	var payload domain.CommunityGroup
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateGroup(currentUserID(request), payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleJoinGroup(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.JoinGroup(currentUserID(request), chi.URLParam(request, "groupID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"joined": true}})
}

func (s *Server) handleJoinGroupByCode(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Code string `json:"code"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	group, err := s.store.JoinGroupByCode(currentUserID(request), payload.Code)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": group})
}

// handleJoinPlaydateByCode mirrors handleJoinGroupByCode but for playdates.
// The "PD-" prefix on join_code means a group code pasted here can never
// match (and vice-versa) — the two code spaces are structurally disjoint.
func (s *Server) handleJoinPlaydateByCode(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Code string `json:"code"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	// Normalize: trim whitespace, force the PD prefix to uppercase, force the
	// 6 character body to uppercase. Defensive: a user may paste "pd-k7m2np"
	// from a casually-shared message and the lookup column is uppercase.
	code := strings.ToUpper(strings.TrimSpace(payload.Code))
	if code == "" {
		writeError(writer, http.StatusBadRequest, "code is required")
		return
	}
	playdate, err := s.store.JoinPlaydateByCode(currentUserID(request), code)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": playdate})
}

func (s *Server) handleGetGroupByConversation(writer http.ResponseWriter, request *http.Request) {
	convID := chi.URLParam(request, "conversationID")
	group := s.store.GetGroupByConversation(convID)
	if group == nil {
		writeJSON(writer, http.StatusOK, map[string]any{"data": nil})
		return
	}
	// Only reveal private code to members of the group
	userID := currentUserID(request)
	isMember := false
	for _, m := range group.Members {
		if m.UserID == userID {
			isMember = true
			break
		}
	}
	group.IsMember = isMember
	if !isMember {
		group.Code = ""
	}
	isAdmin, _ := s.store.IsGroupAdmin(userID, group.ID)
	group.IsAdmin = isAdmin
	group.IsOwner = group.OwnerUserID == userID
	muted, until := s.store.GetGroupMute(userID, group.ID)
	group.Muted = muted
	if until != nil {
		t := until.UTC().Format(time.RFC3339)
		group.MutedUntil = &t
	}
	if group.ConversationID != "" {
		group.MyConvMuted = s.store.IsConversationMuted(userID, group.ConversationID)
		if group.MyConvMuted {
			if u := s.store.GetConversationMuteUntil(userID, group.ConversationID); u != nil {
				t := u.UTC().Format(time.RFC3339)
				group.MyConvMutedUntil = &t
			}
		}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": group})
}

// ── Lost Pets ────────────────────────────────────────────────────────

func (s *Server) handleListLostPets(writer http.ResponseWriter, request *http.Request) {
	alerts := s.store.ListLostPets()
	writeJSON(writer, http.StatusOK, map[string]any{"data": alerts})
}

func (s *Server) handleCreateLostPet(writer http.ResponseWriter, request *http.Request) {
	var payload domain.LostPetAlert
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreateLostPetAlert(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

func (s *Server) handleUpdateLostPetStatus(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Status string `json:"status"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.UpdateLostPetStatus(chi.URLParam(request, "alertID"), payload.Status); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"updated": true}})
}

// ── Badges ───────────────────────────────────────────────────────────

func (s *Server) handleListBadges(writer http.ResponseWriter, request *http.Request) {
	badges := s.store.ListBadges(currentUserID(request))
	writeJSON(writer, http.StatusOK, map[string]any{"data": badges})
}

// ── Training Tips ────────────────────────────────────────────────────

func (s *Server) handleListTrainingTips(writer http.ResponseWriter, request *http.Request) {
	tips := s.store.ListTrainingTips(request.URL.Query().Get("petType"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": tips})
}

func (s *Server) handleGetTrainingTip(writer http.ResponseWriter, request *http.Request) {
	tipID := chi.URLParam(request, "tipID")
	tip, err := s.store.GetTrainingTip(tipID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}

	userID := currentUserID(request)
	bookmarks, completed := s.store.GetTipUserState(userID)

	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]any{
		"tip":         tip,
		"bookmarked":  bookmarks[tipID],
		"completed":   completed[tipID],
	}})
}

func (s *Server) handleBookmarkTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.BookmarkTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"bookmarked": true}})
}

func (s *Server) handleUnbookmarkTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.UnbookmarkTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"bookmarked": false}})
}

func (s *Server) handleCompleteTip(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.CompleteTip(currentUserID(request), chi.URLParam(request, "tipID")); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"completed": true}})
}

// ── Vet Clinics ──────────────────────────────────────────────────────

func (s *Server) handleListVetClinicsNearby(writer http.ResponseWriter, request *http.Request) {
	clinics := s.store.ListVetClinics()

	latStr := request.URL.Query().Get("lat")
	lngStr := request.URL.Query().Get("lng")

	if latStr != "" && lngStr != "" {
		var userLat, userLng float64
		fmt.Sscanf(latStr, "%f", &userLat)
		fmt.Sscanf(lngStr, "%f", &userLng)

		for i := range clinics {
			clinics[i].Distance = service.Haversine(userLat, userLng, clinics[i].Latitude, clinics[i].Longitude)
		}

		sort.Slice(clinics, func(i, j int) bool {
			return clinics[i].Distance < clinics[j].Distance
		})
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": clinics})
}

func (s *Server) handleAdminListVetClinics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListVetClinics()})
}

func (s *Server) handleAdminCreateVetClinic(w http.ResponseWriter, r *http.Request) {
	var payload domain.VetClinic
	if !decodeJSON(w, r, &payload) {
		return
	}

	if payload.Latitude == 0 && payload.Longitude == 0 && payload.Address != "" {
		if geo, err := service.Geocode(payload.Address); err == nil {
			payload.Latitude = geo.Lat
			payload.Longitude = geo.Lng
		}
	}

	clinic := s.store.CreateVetClinic(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": clinic})
}

func (s *Server) handleAdminDeleteVetClinic(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteVetClinic(chi.URLParam(r, "clinicID")); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// ── Venue Reviews ────────────────────────────────────────────────────

func (s *Server) handleListVenueReviews(writer http.ResponseWriter, request *http.Request) {
	reviews := s.store.ListVenueReviews(chi.URLParam(request, "venueID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": reviews})
}

func (s *Server) handleCreateVenueReview(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if payload.Rating < 1 || payload.Rating > 5 {
		writeError(writer, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	userID := currentUserID(request)
	venueID := chi.URLParam(request, "venueID")

	// Gate: only past visitors may review; one review per user per venue.
	if !s.store.UserHasCheckedIn(venueID, userID) {
		writeError(writer, http.StatusForbidden, "you must check in at this venue before reviewing")
		return
	}
	if s.store.UserHasReviewed(venueID, userID) {
		writeError(writer, http.StatusConflict, "you have already reviewed this venue")
		return
	}

	user, err := s.store.GetUser(userID)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}

	review := s.store.CreateVenueReview(domain.VenueReview{
		VenueID:  venueID,
		UserID:   userID,
		UserName: strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName),
		Rating:   payload.Rating,
		Comment:  payload.Comment,
	})

	writeJSON(writer, http.StatusCreated, map[string]any{"data": review})
}

// ── Pet Sitters ──────────────────────────────────────────────────────

func (s *Server) handleListPetSitters(writer http.ResponseWriter, request *http.Request) {
	sitters := s.store.ListPetSitters(request.URL.Query().Get("city"))

	latStr := request.URL.Query().Get("lat")
	lngStr := request.URL.Query().Get("lng")

	if latStr != "" && lngStr != "" {
		var userLat, userLng float64
		fmt.Sscanf(latStr, "%f", &userLat)
		fmt.Sscanf(lngStr, "%f", &userLng)

		if userLat != 0 && userLng != 0 {
			for i := range sitters {
				if sitters[i].Latitude != 0 && sitters[i].Longitude != 0 {
					sitters[i].Distance = service.Haversine(userLat, userLng, sitters[i].Latitude, sitters[i].Longitude)
				}
			}

			sort.Slice(sitters, func(i, j int) bool {
				return sitters[i].Distance < sitters[j].Distance
			})
		}
	}

	writeJSON(writer, http.StatusOK, map[string]any{"data": sitters})
}

func (s *Server) handleCreatePetSitter(writer http.ResponseWriter, request *http.Request) {
	var payload domain.PetSitter
	if !decodeJSON(writer, request, &payload) {
		return
	}
	result := s.store.CreatePetSitter(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Walk Routes ─────────────────────────────────────────────────────

func (s *Server) handleListWalkRoutes(writer http.ResponseWriter, request *http.Request) {
	routes := s.store.ListWalkRoutes(request.URL.Query().Get("city"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": routes})
}

func (s *Server) handleAdminListWalkRoutes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"data": s.store.ListWalkRoutes("")})
}

func (s *Server) handleAdminCreateWalkRoute(w http.ResponseWriter, r *http.Request) {
	var payload domain.WalkRoute
	if !decodeJSON(w, r, &payload) {
		return
	}
	route := s.store.CreateWalkRoute(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": route})
}

func (s *Server) handleAdminDeleteWalkRoute(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWalkRoute(chi.URLParam(r, "routeID")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

// Adoptions v0.13 — old user-created listings removed. See server.go
// shelter + adoption-application routes below for the new flow.

// ── Pet Albums ──────────────────────────────────────────────────────

func (s *Server) handleListPetAlbums(writer http.ResponseWriter, request *http.Request) {
	albums := s.store.ListPetAlbums(chi.URLParam(request, "petID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": albums})
}

func (s *Server) handleCreatePetAlbum(writer http.ResponseWriter, request *http.Request) {
	var payload domain.PetAlbum
	if !decodeJSON(writer, request, &payload) {
		return
	}
	payload.PetID = chi.URLParam(request, "petID")
	result := s.store.CreatePetAlbum(payload)
	writeJSON(writer, http.StatusCreated, map[string]any{"data": result})
}

// ── Pet Milestones ──────────────────────────────────────────────────

func (s *Server) handleListPetMilestones(writer http.ResponseWriter, request *http.Request) {
	milestones := s.store.ListPetMilestones(chi.URLParam(request, "petID"))
	writeJSON(writer, http.StatusOK, map[string]any{"data": milestones})
}

// ── Group Messages ──────────────────────────────────────────────────

func (s *Server) handleListGroupMessages(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	groupID := chi.URLParam(request, "groupID")
	isMember, _ := s.store.IsGroupMember(userID, groupID)
	if !isMember {
		writeError(writer, http.StatusForbidden, "not a member")
		return
	}
	messages, err := s.store.ListGroupMessagesFor(userID, groupID)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleSendGroupMessage(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Type     string         `json:"type"`
		Body     string         `json:"body"`
		ImageURL string         `json:"imageUrl"`
		Metadata map[string]any `json:"metadata"`
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	groupID := chi.URLParam(request, "groupID")
	if payload.Type == "" {
		payload.Type = "text"
	}
	message, err := s.store.SendGroupMessageEx(currentUserID(request), groupID, store.SendGroupMessageInput{
		Type:     payload.Type,
		Body:     payload.Body,
		ImageURL: payload.ImageURL,
		Metadata: payload.Metadata,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"data": message})
}

func (s *Server) handleGetGroup(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	userID := currentUserID(request)
	// Find the group's conversation via list then filter — reuse existing paths.
	groups := s.store.ListGroups(store.ListGroupsParams{UserID: userID})
	var found *domain.CommunityGroup
	for i := range groups {
		if groups[i].ID == groupID {
			found = &groups[i]
			break
		}
	}
	if found == nil {
		writeError(writer, http.StatusNotFound, "group not found")
		return
	}
	// Enrich with members + admin/owner state via conversation lookup.
	// NOTE: GetGroupByConversation doesn't populate IsMember for the caller —
	// it has no concept of "viewer". We compute it explicitly below.
	detail := s.store.GetGroupByConversation(found.ConversationID)
	if detail != nil {
		found = detail
	}
	isMember, _ := s.store.IsGroupMember(userID, groupID)
	found.IsMember = isMember
	isAdmin, _ := s.store.IsGroupAdmin(userID, groupID)
	found.IsAdmin = isAdmin
	found.IsOwner = found.OwnerUserID == userID
	muted, until := s.store.GetGroupMute(userID, groupID)
	found.Muted = muted
	if until != nil {
		t := until.UTC().Format(time.RFC3339)
		found.MutedUntil = &t
	}
	// v0.11.0 — caller's per-user push mute on the group conversation.
	if found.ConversationID != "" {
		found.MyConvMuted = s.store.IsConversationMuted(userID, found.ConversationID)
		if found.MyConvMuted {
			if u := s.store.GetConversationMuteUntil(userID, found.ConversationID); u != nil {
				t := u.UTC().Format(time.RFC3339)
				found.MyConvMutedUntil = &t
			}
		}
	}
	if !found.IsMember {
		found.Code = ""
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": found})
}

func (s *Server) handleDeleteGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.DeleteGroupMessage(currentUserID(request), groupID, messageID); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"deleted": true}})
}

func (s *Server) handlePinGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.SetGroupMessagePinned(currentUserID(request), groupID, messageID, true); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"pinned": true}})
}

func (s *Server) handleUnpinGroupMessage(writer http.ResponseWriter, request *http.Request) {
	groupID := chi.URLParam(request, "groupID")
	messageID := chi.URLParam(request, "messageID")
	if err := s.store.SetGroupMessagePinned(currentUserID(request), groupID, messageID, false); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"pinned": false}})
}

func (s *Server) handleListGroupPinned(writer http.ResponseWriter, request *http.Request) {
	messages, err := s.store.ListGroupPinnedMessages(chi.URLParam(request, "groupID"))
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleGroupChatPreview(writer http.ResponseWriter, request *http.Request) {
	messages, err := s.store.GetGroupChatPreview(chi.URLParam(request, "groupID"), 3)
	if err != nil {
		writeError(writer, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": messages})
}

func (s *Server) handleMuteGroupMember(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		UserID   string `json:"userId"`
		Duration string `json:"duration"` // "1h" | "24h" | "indefinite"
	}
	if !decodeJSON(writer, request, &payload) {
		return
	}
	var until *time.Time
	switch payload.Duration {
	case "1h":
		t := time.Now().UTC().Add(time.Hour)
		until = &t
	case "24h":
		t := time.Now().UTC().Add(24 * time.Hour)
		until = &t
	case "indefinite", "":
		until = nil
	default:
		writeError(writer, http.StatusBadRequest, "invalid duration")
		return
	}
	if err := s.store.MuteGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), payload.UserID, until); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"muted": true}})
}

func (s *Server) handleUnmuteGroupMember(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.UnmuteGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"muted": false}})
}

func (s *Server) handleKickGroupMember(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.KickGroupMember(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"kicked": true}})
}

func (s *Server) handlePromoteGroupAdmin(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.PromoteGroupAdmin(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"admin": true}})
}

func (s *Server) handleDemoteGroupAdmin(writer http.ResponseWriter, request *http.Request) {
	if err := s.store.DemoteGroupAdmin(currentUserID(request), chi.URLParam(request, "groupID"), chi.URLParam(request, "userID")); err != nil {
		writeError(writer, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"admin": false}})
}

func (s *Server) handleLeaveGroup(writer http.ResponseWriter, request *http.Request) {
	deleted, err := s.store.LeaveGroup(currentUserID(request), chi.URLParam(request, "groupID"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": map[string]bool{"left": true, "deleted": deleted}})
}

// ── Admin Create Pet Sitter ─────────────────────────────────────────

func (s *Server) handleAdminCreatePetSitter(w http.ResponseWriter, r *http.Request) {
	var payload domain.PetSitter
	if !decodeJSON(w, r, &payload) {
		return
	}
	sitter := s.store.CreatePetSitter(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"data": sitter})
}

func currentUserID(request *http.Request) string {
	value := request.Context().Value(userIDKey)
	userID, _ := value.(string)
	return userID
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, dest any) bool {
	defer request.Body.Close()
	if err := json.NewDecoder(request.Body).Decode(dest); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid json")
		return false
	}

	return true
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writeJSON(writer, status, map[string]string{"error": message})
}

func newUploadFileName(extension string) string {
	return newAssetID() + extension
}

func newAssetID() string {
	return "asset-" + strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
}

// ── v0.11.0: notification preferences ──────────────────────────────────

func (s *Server) handleGetNotificationPrefs(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	prefs := s.store.GetNotificationPrefs(userID)
	writeJSON(writer, http.StatusOK, map[string]any{"data": prefs})
}

func (s *Server) handleUpdateNotificationPrefs(writer http.ResponseWriter, request *http.Request) {
	userID := currentUserID(request)
	var payload domain.NotificationPreferences
	if !decodeJSON(writer, request, &payload) {
		return
	}
	if err := s.store.UpsertNotificationPrefs(userID, payload); err != nil {
		writeError(writer, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"data": payload})
}

// ── v0.11.0: public /p/{id} share landing ──────────────────────────────
// Tiny HTML page that opens the Expo app via the petto:// scheme and falls
// back to store badges. We look the playdate up to decorate the page with
// the title + city — but the page itself is never gated by auth, so even a
// deleted / private playdate still returns a "Open in Petto" fallback (we
// just don't leak details in that case).
func (s *Server) handlePlaydateShareLanding(writer http.ResponseWriter, request *http.Request) {
	playdateID := chi.URLParam(request, "playdateID")
	title := "Petto buluşması"
	subtitle := "Petto'da bir buluşmaya davet edildin"
	if pd, err := s.store.GetPlaydate(playdateID); err == nil && pd != nil && pd.Visibility == "public" {
		if pd.Title != "" {
			title = pd.Title
		}
		if pd.CityLabel != "" {
			subtitle = pd.CityLabel
		} else if pd.Location != "" {
			subtitle = pd.Location
		}
	}
	// Forward the ?t= token from the share URL into the deep link so the
	// mobile app can claim access before loading the detail screen. Private
	// playdates are only visible to invitees + token-holders; this is the only
	// way an off-graph invitee (WhatsApp recipient) can bootstrap themselves
	// past the visibility gate.
	deepLink := fmt.Sprintf("petto://playdates/%s", playdateID)
	if tok := strings.TrimSpace(request.URL.Query().Get("t")); tok != "" {
		deepLink += "?t=" + url.QueryEscape(tok)
	}
	html := `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>` + htmlEscape(title) + ` · Petto</title>
<meta property="og:title" content="` + htmlEscape(title) + `">
<meta property="og:description" content="` + htmlEscape(subtitle) + `">
<meta property="og:type" content="website">
<meta name="theme-color" content="#E6694A">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "SF Pro Text", Inter, system-ui, sans-serif; background: #FAF7F2; color: #161514; }
  .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 380px; background: #ffffff; border-radius: 24px; padding: 28px; box-shadow: 0 12px 40px rgba(22,21,20,0.08); text-align: center; }
  .badge { display: inline-block; background: #E6694A; color: #fff; border-radius: 999px; padding: 6px 14px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; margin-bottom: 14px; }
  h1 { font-size: 22px; margin: 0 0 8px; line-height: 1.25; }
  p { font-size: 14px; color: #6B6962; margin: 0 0 20px; line-height: 1.45; }
  .cta { display: block; background: #E6694A; color: #fff; text-decoration: none; padding: 14px 18px; border-radius: 999px; font-weight: 700; font-size: 15px; margin-bottom: 10px; }
  .stores { display: flex; gap: 10px; justify-content: center; margin-top: 18px; }
  .stores a { flex: 1; border: 1px solid #E6E2DC; border-radius: 12px; padding: 10px; text-decoration: none; color: #161514; font-size: 12px; font-weight: 600; }
  footer { margin-top: 28px; font-size: 11px; color: #9A968F; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <span class="badge">Petto · Buluşma</span>
      <h1>` + htmlEscape(title) + `</h1>
      <p>` + htmlEscape(subtitle) + `</p>
      <a class="cta" href="` + deepLink + `">Uygulamada aç</a>
      <div class="stores">
        <a href="https://apps.apple.com/app/id0000000000">App Store</a>
        <a href="https://play.google.com/store/apps/details?id=app.petto.mobile">Google Play</a>
      </div>
    </div>
    <footer>© Petto</footer>
  </div>
  <script>
    // Try to open the app automatically. If the app isn't installed, the
    // scheme navigation fails silently and the user stays on this page —
    // the store badges above are the fallback.
    (function () {
      var deep = ` + "`" + deepLink + "`" + `;
      setTimeout(function () { window.location.replace(deep); }, 80);
    })();
  </script>
</body>
</html>`
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Cache-Control", "public, max-age=60")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(html))
}

func htmlEscape(s string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&#39;",
	)
	return replacer.Replace(s)
}
