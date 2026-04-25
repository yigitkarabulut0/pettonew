package store

import (
	"errors"
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// ErrShelterApplicationDuplicateEmail is returned by
// CreateShelterOnboardingApplication when the submitter's email already
// has a submitted/under_review application open.
var ErrShelterApplicationDuplicateEmail = errors.New("an application with this email is already in review")

// ErrShelterApplicationNotFound is returned for lookups by id/token that
// don't resolve.
var ErrShelterApplicationNotFound = errors.New("shelter application not found")

// ── Shelter team errors ────────────────────────────────────────────
// Surface these as sentinel errors so HTTP handlers can map them to
// specific status codes (409/410/423) without sniffing message text.

var ErrShelterMemberNotFound = errors.New("shelter member not found")
var ErrShelterMemberDuplicateEmail = errors.New("a member with this email already exists for this shelter")
var ErrShelterMemberInviteNotFound = errors.New("shelter member invite not found")
var ErrShelterMemberInviteDuplicateEmail = errors.New("an active invite for this email already exists")
var ErrShelterMemberInviteExpired = errors.New("invite has expired")
var ErrShelterMemberInviteAlreadyUsed = errors.New("invite has already been used")
var ErrShelterMemberInviteRevoked = errors.New("invite has been revoked")
var ErrShelterTeamFull = errors.New("team is full (20-member limit)")
var ErrShelterLastAdmin = errors.New("cannot leave the shelter without an admin")

// MedicationSweeperRow is the slim payload the server-side reminder loop
// works with: enough to compute "is this dose due right now in the pet's
// timezone?" and route the push to the owner's devices without hauling the
// full pet/owner objects from the DB.
type MedicationSweeperRow struct {
	MedID         string
	PetID         string
	OwnerID       string
	PetName       string
	Name          string
	Dosage        string
	TimeOfDay     string
	DaysOfWeek    []int
	Timezone      string
	StartDate     string
	EndDate       string
	LastPushDate  string // last "YYYY-MM-DD" we already pushed for, in pet TZ
}

// SendGroupMessageInput describes the payload for sending a group chat message.
type SendGroupMessageInput struct {
	Type     string         // "text" | "image" | "pet_share"
	Body     string         // required for text (optional caption on image/pet_share)
	ImageURL string         // required for image
	Metadata map[string]any // pet_share: {petId,petName,petPhotoUrl,speciesLabel,breedLabel}
}

type ListGroupsParams struct {
	UserID  string
	Lat     float64
	Lng     float64
	Search  string
	PetType string
}

// ListPlaydatesParams filters/sorts the playdates discovery hub feed.
type ListPlaydatesParams struct {
	UserID string
	Lat    float64
	Lng    float64
	Search string
	From   string // ISO — inclusive lower bound on playdate.date
	To     string // ISO — exclusive upper bound
	Sort   string // "distance" (default) | "time"
}

// ListAdoptablePetsParams filters the public adoption browse feed.
type ListAdoptablePetsParams struct {
	Species          string // dog|cat|...
	Sex              string // male|female|multi-value "male,female"
	Size             string // small|medium|large|xl|multi "small,medium"
	City             string
	MinAge           int // months; 0 = no lower bound
	MaxAge           int // months; 0 = no upper bound
	SpecialNeedsOnly bool
	Lat              float64
	Lng              float64
	MaxDistanceKm    float64 // 0 = no distance cap
	Search           string
	Limit            int
	Offset           int
}

type Store interface {
	Register(email string, password string) (*domain.AppUser, string, error)
	Login(email string, password string) (*domain.AppUser, error)
	ResetPassword(token string, newPassword string) error
	GetUser(userID string) (*domain.AppUser, error)
	UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error)
	ListPets(userID string) []domain.Pet
	UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error)
	ListTaxonomy(kind string, lang string) []domain.TaxonomyItem
	DiscoveryFeed(userID string) []domain.DiscoveryCard
	DiscoveryFeedForPet(userID string, actorPetID string) []domain.DiscoveryCard
	CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error)
	GetPetOwnerID(petID string) string
	GetPet(petID string) (*domain.Pet, error)
	GetConversationUserIDs(conversationID string) []string
	ListMatches(userID string) []domain.MatchPreview
	ListMatchesByPet(userID string, petID string) []domain.MatchPreview
	ListConversations(userID string) []domain.Conversation
	FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation
	CreateOrFindDirectConversation(userID string, targetUserID string) (*domain.Conversation, error)
	ListMessages(userID string, conversationID string, limit int, before string) ([]domain.Message, error)
	SendMessage(userID string, conversationID string, body string) (domain.Message, error)
	MarkMessagesRead(userID string, conversationID string)
	BlockUser(userID string, targetUserID string) error
	CreateReport(reporterID string, reporterName string, reason string, targetType string, targetID string, targetLabel string) (domain.ReportSummary, error)
	AdminLogin(email string, password string) (*domain.AdminUser, error)
	Dashboard() domain.DashboardSnapshot
	ListUsers() []domain.UserProfile
	SuspendUser(userID string, status string) error
	DeleteUser(userID string) error
	UserDetail(userID string) (domain.AdminUserDetail, error)
	ListAllPets() []domain.Pet
	PetDetail(petID string) (domain.AdminPetDetail, error)
	SetPetVisibility(petID string, hidden bool) error
	UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem
	DeleteTaxonomy(kind string, itemID string) error
	ListReports() []domain.ReportSummary
	ResolveReport(reportID string, notes string) error
	GetReportDetail(reportID string) (*domain.ReportDetail, error)
	ListHomeFeed(userID string) []domain.HomePost
	ListUserPosts(targetUserID string, viewerUserID string) []domain.HomePost
	CreatePost(userID string, input PostInput) (domain.HomePost, error)
	TogglePostLike(userID string, postID string) (domain.HomePost, error)
	ListVenues() []domain.ExploreVenue
	GetVenue(venueID string) (*domain.ExploreVenue, error)
	UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue
	DeleteVenue(venueID string) error
	// Venue photo management (v0.13.7).
	ListVenuePhotoUrls(venueID string) []string
	ListVenuePhotosManage(venueID string) []VenuePhotoEntry
	AddVenueAdminPhoto(venueID string, url string) (VenuePhotoEntry, error)
	DeleteVenueAdminPhoto(venueID string, photoID string) error
	SetVenuePostPhotoHidden(venueID string, postID string, hidden bool) error
	CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error)
	ListEvents() []domain.ExploreEvent
	UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error)
	DeleteEvent(eventID string) error
	RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error)
	ListPostsAdmin() []domain.HomePost
	DeletePost(postID string) error
	ListDiary(petID string) []domain.DiaryEntry
	CreateDiaryEntry(userID string, petID string, body string, imageURL *string, mood string) domain.DiaryEntry
	AddFavorite(userID string, petID string) error
	RemoveFavorite(userID string, petID string) error
	ListFavorites(userID string) []domain.Pet
	// Adoption favorites — separate from social-match favorites; targets
	// are shelter_pets (adoptable listings), not owner pets.
	AddAdoptionFavorite(userID string, shelterPetID string) error
	RemoveAdoptionFavorite(userID string, shelterPetID string) error
	ListAdoptionFavorites(userID string) []domain.ShelterPet
	// Health
	ListHealthRecords(petID string) []domain.HealthRecord
	CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord
	DeleteHealthRecord(petID string, recordID string) error
	// Health profile (allergies + dietary restrictions + emergency notes).
	// Single row per pet; UpsertHealthProfile creates on first save.
	GetHealthProfile(petID string) domain.PetHealthProfile
	UpsertHealthProfile(petID string, profile domain.PetHealthProfile) domain.PetHealthProfile
	// Symptom log (categorised pet symptoms, vet-export-ready timeline).
	ListSymptomLogs(petID string) []domain.SymptomLog
	CreateSymptomLog(petID string, log domain.SymptomLog) domain.SymptomLog
	DeleteSymptomLog(petID string, logID string) error
	// Medications (recurring schedule, pushed by server cron in pet TZ).
	ListMedications(petID string) []domain.PetMedication
	CreateMedication(petID string, med domain.PetMedication) domain.PetMedication
	UpdateMedication(petID string, medID string, med domain.PetMedication) (domain.PetMedication, error)
	DeleteMedication(petID string, medID string) error
	MarkMedicationGiven(petID string, medID string) (domain.PetMedication, error)
	// Sweeper helpers — return medications due to be pushed and record the
	// "already pushed for this scheduled date" state so we don't double-fire.
	ListActiveMedicationsForSweeper() []MedicationSweeperRow
	MarkMedicationPushed(medID string, scheduledDateInTZ string) error
	// Breed care guides (admin-managed, surfaced in the mobile Care tab).
	// Public lookup falls back from breed-specific to species-wide row.
	GetBreedCareGuide(speciesID string, breedID string) (*domain.BreedCareGuide, error)
	ListBreedCareGuides() []domain.BreedCareGuide
	UpsertBreedCareGuide(g domain.BreedCareGuide) (domain.BreedCareGuide, error)
	DeleteBreedCareGuide(id string) error
	// First-aid topics (admin-managed offline handbook).
	ListFirstAidTopics() []domain.FirstAidTopic
	GetFirstAidTopic(id string) (*domain.FirstAidTopic, error)
	UpsertFirstAidTopic(t domain.FirstAidTopic) (domain.FirstAidTopic, error)
	DeleteFirstAidTopic(id string) error
	// Pet documents (vaccine cards, microchip papers, insurance, etc.)
	ListPetDocuments(petID string) []domain.PetDocument
	CreatePetDocument(petID string, doc domain.PetDocument) domain.PetDocument
	DeletePetDocument(petID string, docID string) error
	// Calorie counter — food database (curated + user-added) and meal log.
	ListFoodItems(userID string, search string, species string, limit int) []domain.FoodItem
	GetFoodItem(itemID string) (*domain.FoodItem, error)
	CreateFoodItem(userID string, item domain.FoodItem) domain.FoodItem
	// Admin variants — see all rows regardless of owner; UpsertFoodItem
	// respects is_public so admins can curate the public food database.
	AdminListFoodItems(search string, species string, limit int) []domain.FoodItem
	AdminUpsertFoodItem(item domain.FoodItem) (domain.FoodItem, error)
	AdminDeleteFoodItem(itemID string) error
	ListMealLogs(petID string, fromDate string, toDate string) []domain.MealLog
	CreateMealLog(petID string, log domain.MealLog) domain.MealLog
	DeleteMealLog(petID string, logID string) error
	GetDailyMealSummary(petID string, dateISO string) domain.DailyMealSummary
	// Weekly summary (Sunday push). Counts user-scoped activity in the
	// given UTC half-open window [weekStart, weekEnd).
	GetWeeklyHealthSummaryForUser(userID string, weekStartUTC string, weekEndUTC string) domain.WeeklyHealthSummary
	// Returns user IDs with at least one push token + "haven't sent yet
	// this week" flag, used by the cron loop.
	ListUsersForWeeklySummary(weekStartUTC string) []string
	RecordWeeklySummarySent(userID string, weekStartUTC string)
	// Weight
	ListWeightEntries(petID string) []domain.WeightEntry
	CreateWeightEntry(petID string, entry domain.WeightEntry) domain.WeightEntry
	// Vet contacts
	ListVetContacts(userID string) []domain.VetContact
	CreateVetContact(userID string, contact domain.VetContact) domain.VetContact
	DeleteVetContact(userID string, contactID string) error
	// Feeding
	ListFeedingSchedules(petID string) []domain.FeedingSchedule
	CreateFeedingSchedule(petID string, schedule domain.FeedingSchedule) domain.FeedingSchedule
	DeleteFeedingSchedule(petID string, scheduleID string) error
	// Playdates
	ListPlaydates(params ListPlaydatesParams) []domain.Playdate
	GetPlaydate(playdateID string) (*domain.Playdate, error)
	GetPlaydateForUser(playdateID string, userID string) (*domain.Playdate, error)
	CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate
	JoinPlaydate(userID string, playdateID string) error
	JoinPlaydateWithPets(userID string, playdateID string, petIds []string, note string) error
	LeavePlaydate(userID string, playdateID string) (promoted string, err error)
	LeavePlaydateWithPets(userID string, playdateID string, petIds []string) (promoted []string, err error)
	UpdateAttendeePets(userID string, playdateID string, petIds []string) error
	CancelPlaydate(userID string, playdateID string) error
	UpdatePlaydate(userID string, playdateID string, patch domain.Playdate) (*domain.Playdate, error)
	PostPlaydateAnnouncement(userID string, playdateID string, body string) error
	CreatePlaydateInvites(hostID string, playdateID string, invitedUserIds []string) ([]domain.PlaydateInvite, error)
	ListInvitableUsers(hostID string, playdateID string) ([]domain.InvitableUser, error)
	ListMyPendingPlaydateInvites(userID string) []domain.PlaydateInvite
	RespondToPlaydateInvite(userID string, inviteID string, accept bool) (string, error)
	// ClaimPlaydateShareToken verifies that `token` matches the playdate's
	// share_token and, if valid, upserts a pending playdate_invites row so
	// the caller can pass the GetPlaydateForUser visibility gate.
	ClaimPlaydateShareToken(userID string, playdateID string, token string) error
	// Playdate chat (v0.14.0)
	GetPlaydateByConversation(conversationID string) *domain.Playdate
	SendPlaydateMessageEx(userID string, playdateID string, input SendGroupMessageInput) (domain.Message, error)
	DeleteConversationMessage(actorUserID string, conversationID string, messageID string) error
	SetPlaydateChatMute(hostID string, playdateID string, targetUserID string, until *time.Time) error
	UnsetPlaydateChatMute(hostID string, playdateID string, targetUserID string) error
	GetPlaydateChatMute(userID string, playdateID string) (bool, *time.Time)
	ListPlaydateChatMutedUsers(playdateID string) []string
	MuteConversation(userID string, conversationID string, until *time.Time) error
	UnmuteConversation(userID string, conversationID string) error
	IsConversationMuted(userID string, conversationID string) bool
	GetConversationMuteUntil(userID string, conversationID string) *time.Time
	// My playdates + reminders (v0.15.0)
	ListMyPlaydates(params ListMyPlaydatesParams) []domain.Playdate
	ListDuePlaydateReminders(fromISO string, toISO string, kind string) []PlaydateReminderTarget
	MarkPlaydateReminderSent(playdateID string, userID string, kind string)
	// Host controls (v0.16.0)
	SetPlaydateLock(hostID string, playdateID string, locked bool) error
	KickPlaydateAttendee(hostID string, playdateID string, targetUserID string) ([]string, error)
	TransferPlaydateOwnership(currentHostID string, playdateID string, newOwnerID string) error
	PinConversationMessage(actorUserID string, conversationID string, messageID string, pinned bool) error
	ListConversationPinnedMessages(conversationID string) ([]domain.Message, error)
	// Groups
	ListGroups(params ListGroupsParams) []domain.CommunityGroup
	GetGroupByConversation(conversationID string) *domain.CommunityGroup
	CreateGroup(creatorUserID string, group domain.CommunityGroup) domain.CommunityGroup
	JoinGroup(userID string, groupID string) error
	JoinGroupByCode(userID string, code string) (*domain.CommunityGroup, error)
	// Lost pets
	ListLostPets() []domain.LostPetAlert
	CreateLostPetAlert(alert domain.LostPetAlert) domain.LostPetAlert
	UpdateLostPetStatus(alertID string, status string) error
	// Badges
	ListBadges(userID string) []domain.Badge
	AwardBadge(userID string, badgeType string, title string, description string)
	// Training tips
	ListTrainingTips(petType string) []domain.TrainingTip
	CreateTrainingTip(tip domain.TrainingTip) domain.TrainingTip
	GetTrainingTip(tipID string) (*domain.TrainingTip, error)
	UpdateTrainingTip(tip domain.TrainingTip) (domain.TrainingTip, error)
	BookmarkTip(userID, tipID string) error
	UnbookmarkTip(userID, tipID string) error
	CompleteTip(userID, tipID string) error
	GetTipUserState(userID string) (bookmarks map[string]bool, completed map[string]bool)
	// Vet clinics (admin-managed)
	ListVetClinics() []domain.VetClinic
	CreateVetClinic(clinic domain.VetClinic) domain.VetClinic
	DeleteVetClinic(clinicID string) error
	// Venue reviews
	ListVenueReviews(venueID string) []domain.VenueReview
	CreateVenueReview(review domain.VenueReview) domain.VenueReview
	// Venue detail extras (v0.12)
	GetVenueStats(venueID string) domain.VenueStats
	ListVenueCheckInsScoped(venueID string, mode string, limit int) []domain.VenueCheckIn
	ListVenuePostsWithPhotos(venueID string, limit int) []domain.VenuePhotoFeedItem
	UserHasCheckedIn(venueID string, userID string) bool
	UserHasReviewed(venueID string, userID string) bool
	// Pet sitters
	ListPetSitters(city string) []domain.PetSitter
	CreatePetSitter(sitter domain.PetSitter) domain.PetSitter
	// Push notifications
	SavePushToken(userID string, token string, platform string)
	ListAllPushTokens() []domain.PushToken
	GetUserPushTokens(userID string) []domain.PushToken
	SaveNotification(notification domain.Notification)
	ListNotifications() []domain.Notification
	// Notification preferences — per-user opt-outs gating push fan-out.
	// Categories: "matches", "messages", "playdates", "groups".
	GetNotificationPrefs(userID string) domain.NotificationPreferences
	UpsertNotificationPrefs(userID string, prefs domain.NotificationPreferences) error
	ShouldSendPush(userID string, category string) bool
	// Explore feed — merged admin events + user playdates for Discover.
	ListExploreFeed(params ListPlaydatesParams) (events []domain.ExploreEvent, playdates []domain.Playdate)
	// Walk routes
	ListWalkRoutes(city string) []domain.WalkRoute
	CreateWalkRoute(route domain.WalkRoute) domain.WalkRoute
	DeleteWalkRoute(routeID string) error
	// Shelters & adoption (v0.13)
	CreateShelter(shelter domain.Shelter, passwordHash string) (domain.Shelter, error)
	ListShelters() []domain.Shelter
	GetShelter(shelterID string) (*domain.Shelter, error)
	GetShelterByEmail(email string) (*domain.Shelter, string, error) // returns shelter, passwordHash
	UpdateShelter(shelterID string, patch domain.Shelter) (*domain.Shelter, error)
	UpdateShelterPassword(shelterID string, passwordHash string) error
	DeleteShelter(shelterID string) error
	MarkShelterLoggedIn(shelterID string) error
	GetShelterStats(shelterID string) domain.ShelterStats
	ListShelterPets(shelterID string, statusFilter string) []domain.ShelterPet
	ListPublicAdoptablePets(params ListAdoptablePetsParams) []domain.ShelterPet
	GetShelterPet(petID string) (*domain.ShelterPet, error)
	UpsertShelterPet(shelterID string, pet domain.ShelterPet) (domain.ShelterPet, error)
	UpdateShelterPetStatus(petID string, status string) error
	DeleteShelterPet(petID string) error
	// RestoreShelterPet reverses a soft delete while the 30-day recovery
	// window is still open.
	RestoreShelterPet(petID string) error
	// SetAdoptionOutcome persists the optional metadata captured by the
	// "Mark adopted" dialog: adopter name, adoption date, internal notes.
	SetAdoptionOutcome(petID, adopterName, adoptionDate, notes string) error
	CreateAdoptionApplication(app domain.AdoptionApplication) (domain.AdoptionApplication, error)
	ListShelterApplications(shelterID string, statusFilter string) []domain.AdoptionApplication
	ListUserApplications(userID string) []domain.AdoptionApplication
	GetApplication(appID string) (*domain.AdoptionApplication, error)
	ApproveApplication(appID string, conversationID string) error
	RejectApplication(appID string, reason string) error
	CompleteAdoption(appID string) error
	WithdrawApplication(appID string, userID string) error
	// Shelter onboarding applications (v0.14) — public wizard → admin queue.
	// CreateShelterOnboardingApplication assigns ID + access token + SLA
	// deadline (submitted_at + 48h) and returns the full row. Returns
	// ErrShelterApplicationDuplicateEmail if the email already has an
	// in-flight submission.
	CreateShelterOnboardingApplication(app domain.ShelterApplication) (domain.ShelterApplication, error)
	GetShelterOnboardingApplication(appID string) (*domain.ShelterApplication, error)
	GetShelterOnboardingApplicationByToken(accessToken string) (*domain.ShelterApplication, error)
	ListShelterOnboardingApplications(statusFilter string, limit int, offset int) []domain.ShelterApplication
	ApproveShelterOnboardingApplication(appID string, reviewerID string, passwordHash string) (domain.Shelter, domain.ShelterApplication, error)
	RejectShelterOnboardingApplication(appID string, reviewerID string, reasonCode string, reasonNote string) (domain.ShelterApplication, error)
	// Shelter team members + invites + audit log (v0.15).
	// Multi-user access per shelter with 3 roles (admin/editor/viewer),
	// 72h invite links, append-only audit log. Authentication lookups
	// flow through ListShelterMembers / GetShelterMemberByEmail instead
	// of the single-user Shelter row.
	ListShelterMembers(shelterID string) []domain.ShelterMember
	GetShelterMember(memberID string) (*domain.ShelterMember, error)
	GetShelterMemberByEmailForLogin(email string) (*domain.ShelterMember, string, error) // member, passwordHash
	UpdateShelterMemberRole(memberID string, newRole string) (*domain.ShelterMember, error)
	UpdateShelterMemberPassword(memberID string, passwordHash string) error
	UpdateShelterMemberName(memberID string, name string) error
	RevokeShelterMember(memberID string) error
	MarkShelterMemberLoggedIn(memberID string) error
	CountActiveShelterMembers(shelterID string) int
	CountActiveShelterAdmins(shelterID string) int

	CreateShelterMemberInvite(invite domain.ShelterMemberInvite) (domain.ShelterMemberInvite, error)
	ListShelterMemberInvites(shelterID string) []domain.ShelterMemberInvite
	GetShelterMemberInviteByID(inviteID string) (*domain.ShelterMemberInvite, error)
	GetShelterMemberInviteByToken(token string) (*domain.ShelterMemberInvite, error)
	RevokeShelterMemberInvite(inviteID string) error
	ResendShelterMemberInvite(inviteID string) (domain.ShelterMemberInvite, error)
	AcceptShelterMemberInvite(token string, passwordHash string, name string) (domain.ShelterMember, domain.ShelterMemberInvite, error)

	RecordShelterAudit(entry domain.ShelterAuditEntry) error
	ListShelterAuditLog(shelterID string, limit int, offset int) []domain.ShelterAuditEntry

	// Listing state machine + DSA moderation (v0.17). TransitionListingState
	// validates the (from, to, actor) triple against domain.AllowedListing-
	// Transitions, writes the new state on the listing row, appends a row to
	// listing_state_transitions, and — for `rejected` moves — persists a
	// Statement of Reasons. All inside a single tx so the state, audit
	// trail and SoR stay consistent.
	TransitionListingState(listingID, newState, actorID, actorRole, reasonCode, note string, meta map[string]any) (domain.ShelterPet, error)
	SetListingAutoFlagReasons(listingID string, reasons []string) error
	ListListingTransitions(listingID string) []domain.ListingStateTransition
	ListListingsByState(state string, limit, offset int) ([]domain.ShelterPet, int)
	CreateListingReport(report domain.ListingReport) (domain.ListingReport, error)
	ListListingReports(status string, trustedOnly bool, limit, offset int) ([]domain.ListingReport, int)
	GetListingReport(reportID string) (*domain.ListingReport, error)
	ResolveListingReport(reportID, resolution, note, actorID string) error
	CreateStatementOfReasons(sor domain.ListingStatementOfReasons) (domain.ListingStatementOfReasons, error)
	ListStatementsOfReasons(listingID string) []domain.ListingStatementOfReasons
	CountShelterRejectionsLast90Days(shelterID string) int
	ListShelterRejections(shelterID string, windowDays int) []domain.ListingStateTransition
	SuspendShelter(shelterID string) error

	// Public profile (v0.21). GetShelterBySlug returns nil if unverified
	// or no match; AssignShelterSlug is called on application approval
	// and is idempotent once a slug is set.
	GetShelterBySlug(slug string) (*domain.Shelter, error)
	AssignShelterSlug(shelterID, baseSlug string) (string, error)
	ListRecentlyAdopted(shelterID string, limit int) []domain.ShelterPet

	// Featured shelters rail (v0.24). Admin-curated list surfaced on
	// the fetcht discovery home. Server caps at 10.
	ListFeaturedShelters(limit int) []domain.Shelter
	SetShelterFeatured(shelterID string, featured bool) error

	// DeleteStaleDrafts removes any shelter_pets row in listing_state=
	// 'draft' with updated_at older than `olderThanDays`. Called on an
	// hourly sweeper goroutine started from cmd/api. Returns only fatal
	// errors; the sweeper treats this as best-effort.
	DeleteStaleDrafts(olderThanDays int) error

	// Analytics (v0.22) — shelter-scoped, server-computed aggregates.
	// `interval` is a Postgres INTERVAL literal string (e.g. "30 days"
	// or "12 months"); empty string means no time filter.
	IncrementPetViewCount(petID string) error
	CountPetFavorites(petID string) int
	CountShelterAdoptionsInRange(shelterID, interval string) int
	CountShelterAdoptionsThisMonth(shelterID string) int
	CountShelterAdoptionsThisYear(shelterID string) int
	CountShelterActiveListings(shelterID string) int
	AvgDaysToAdoption(shelterID string) (float64, int)
	TopApplicationListing(shelterID, interval string) (string, string, int)
	ListingPerformance(shelterID, interval string) []domain.ListingPerformanceRow
	ApplicationFunnel(shelterID, interval string) domain.ApplicationFunnel
	// Pet albums
	ListPetAlbums(petID string) []domain.PetAlbum
	CreatePetAlbum(album domain.PetAlbum) domain.PetAlbum
	// Pet milestones
	ListPetMilestones(petID string) []domain.PetMilestone
	AwardMilestone(petID string, milestoneType string, title string, description string)
	// Group messages
	ListGroupMessages(groupID string) ([]domain.Message, error)
	ListGroupMessagesFor(userID string, groupID string) ([]domain.Message, error)
	SendGroupMessage(userID string, groupID string, body string) (domain.Message, error)
	SendGroupMessageEx(userID string, groupID string, input SendGroupMessageInput) (domain.Message, error)
	GetGroupChatPreview(groupID string, limit int) ([]domain.Message, error)
	ListGroupPinnedMessages(groupID string) ([]domain.Message, error)
	DeleteGroupMessage(actorUserID string, groupID string, messageID string) error
	SetGroupMessagePinned(actorUserID string, groupID string, messageID string, pinned bool) error
	MuteGroupMember(actorUserID string, groupID string, targetUserID string, until *time.Time) error
	UnmuteGroupMember(actorUserID string, groupID string, targetUserID string) error
	KickGroupMember(actorUserID string, groupID string, targetUserID string) error
	PromoteGroupAdmin(actorUserID string, groupID string, targetUserID string) error
	DemoteGroupAdmin(actorUserID string, groupID string, targetUserID string) error
	LeaveGroup(userID string, groupID string) (bool, error)
	DeleteGroup(groupID string) error
	IsGroupMember(userID string, groupID string) (bool, error)
	IsGroupAdmin(userID string, groupID string) (bool, error)
	GetGroupMute(userID string, groupID string) (muted bool, until *time.Time)
}

type ClosableStore interface {
	Store
	Close() error
}
