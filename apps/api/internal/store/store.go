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
	ListMatches(userID string) []domain.MatchPreview
	ListMatchesByPet(userID string, petID string) []domain.MatchPreview
	ListConversations(userID string) []domain.Conversation
	FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation
	ListMessages(userID string, conversationID string) ([]domain.Message, error)
	SendMessage(userID string, conversationID string, body string) (domain.Message, error)
	BlockUser(userID string, targetUserID string) error
	CreateReport(reporterName string, reason string, targetType string, targetLabel string) domain.ReportSummary
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
	ResolveReport(reportID string) error
	ListHomeFeed(userID string) []domain.HomePost
	CreatePost(userID string, input PostInput) (domain.HomePost, error)
	TogglePostLike(userID string, postID string) (domain.HomePost, error)
	ListVenues() []domain.ExploreVenue
	UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue
	DeleteVenue(venueID string) error
	CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error)
	ListEvents() []domain.ExploreEvent
	UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error)
	DeleteEvent(eventID string) error
	RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error)
	ListPostsAdmin() []domain.HomePost
	DeletePost(postID string) error
}

type ClosableStore interface {
	Store
	Close() error
}
