package store

import (
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

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
	// Health
	ListHealthRecords(petID string) []domain.HealthRecord
	CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord
	DeleteHealthRecord(petID string, recordID string) error
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
	// Adoptions
	ListAdoptions() []domain.AdoptionListing
	CreateAdoption(listing domain.AdoptionListing) domain.AdoptionListing
	UpdateAdoptionStatus(listingID string, status string) error
	DeleteAdoption(listingID string) error
	GetAdoption(listingID string) (*domain.AdoptionListing, error)
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
