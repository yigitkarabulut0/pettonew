package store

import "github.com/yigitkarabulut/petto/apps/api/internal/domain"

type Store interface {
	Register(email string, password string) (*domain.AppUser, string, error)
	Login(email string, password string) (*domain.AppUser, error)
	ResetPassword(token string, newPassword string) error
	GetUser(userID string) (*domain.AppUser, error)
	UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error)
	ListPets(userID string) []domain.Pet
	UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error)
	ListTaxonomy(kind string) []domain.TaxonomyItem
	DiscoveryFeed(userID string) []domain.DiscoveryCard
	DiscoveryFeedForPet(userID string, actorPetID string) []domain.DiscoveryCard
	CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error)
	GetPetOwnerID(petID string) string
	GetConversationUserIDs(conversationID string) []string
	ListMatches(userID string) []domain.MatchPreview
	ListMatchesByPet(userID string, petID string) []domain.MatchPreview
	ListConversations(userID string) []domain.Conversation
	FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation
	CreateOrFindDirectConversation(userID string, targetUserID string) (*domain.Conversation, error)
	ListMessages(userID string, conversationID string) ([]domain.Message, error)
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
	ListUserPosts(targetUserID string) []domain.HomePost
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
	ListPlaydates() []domain.Playdate
	CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate
	JoinPlaydate(userID string, playdateID string) error
	// Groups
	ListGroups(userID string) []domain.CommunityGroup
	GetGroupByConversation(conversationID string) *domain.CommunityGroup
	CreateGroup(group domain.CommunityGroup) domain.CommunityGroup
	JoinGroup(userID string, groupID string) error
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
	SendGroupMessage(userID string, groupID string, body string) (domain.Message, error)
}

type ClosableStore interface {
	Store
	Close() error
}
