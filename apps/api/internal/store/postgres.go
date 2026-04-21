package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

type snapshotState struct {
	Users              map[string]*domain.AppUser          `json:"users"`
	UsersByEmail       map[string]string                   `json:"usersByEmail"`
	AdminsByEmail      map[string]*domain.AdminUser        `json:"adminsByEmail"`
	Pets               map[string]*domain.Pet              `json:"pets"`
	Swipes             map[string]map[string]string        `json:"swipes"`
	Matches            map[string]*domain.MatchPreview     `json:"matches"`
	Conversations      map[string]*domain.Conversation     `json:"conversations"`
	Posts              map[string]*domain.HomePost         `json:"posts"`
	PostLikes          map[string]map[string]struct{}      `json:"postLikes"`
	Venues             map[string]*domain.ExploreVenue     `json:"venues"`
	Events             map[string]*domain.ExploreEvent     `json:"events"`
	PetCreatedAt       map[string]time.Time                `json:"petCreatedAt"`
	MatchCreatedAt     map[string]time.Time                `json:"matchCreatedAt"`
	PostCreatedAt      map[string]time.Time                `json:"postCreatedAt"`
	EventCreatedAt     map[string]time.Time                `json:"eventCreatedAt"`
	VerificationTokens map[string]string                   `json:"verificationTokens"`
	ResetTokens        map[string]string                   `json:"resetTokens"`
	Taxonomies         map[string][]domain.TaxonomyItem    `json:"taxonomies"`
	Reports            []domain.ReportSummary              `json:"reports"`
	PushTokens         map[string][]domain.PushToken       `json:"pushTokens"`
	Notifications      []domain.Notification               `json:"notifications"`
	Favorites          map[string]map[string]bool           `json:"favorites"`
	DiaryEntries       map[string][]domain.DiaryEntry       `json:"diaryEntries"`
	HealthRecords      map[string][]domain.HealthRecord     `json:"healthRecords"`
	WeightEntries      map[string][]domain.WeightEntry      `json:"weightEntries"`
	VetContacts        map[string][]domain.VetContact       `json:"vetContacts"`
	FeedingSchedules   map[string][]domain.FeedingSchedule  `json:"feedingSchedules"`
	Playdates          map[string]*domain.Playdate          `json:"playdates"`
	Groups             map[string]*domain.CommunityGroup    `json:"groups"`
	LostPetAlerts      map[string]*domain.LostPetAlert      `json:"lostPetAlerts"`
	Badges             map[string][]domain.Badge            `json:"badges"`
	TrainingTips       []domain.TrainingTip                 `json:"trainingTips"`
	PetSitters         map[string]*domain.PetSitter         `json:"petSitters"`
	VetClinics         map[string]*domain.VetClinic         `json:"vetClinics"`
	VenueReviews       map[string][]domain.VenueReview      `json:"venueReviews"`
	TipBookmarks       map[string]map[string]bool           `json:"tipBookmarks"`
	TipCompleted       map[string]map[string]bool           `json:"tipCompleted"`
	WalkRoutes         map[string]*domain.WalkRoute         `json:"walkRoutes"`
	// Adoptions legacy field removed in v0.13; shelter-era state is
	// volatile in PersistentStore (Postgres-only in prod).
	PetAlbums          map[string][]domain.PetAlbum         `json:"petAlbums"`
	PetMilestones      map[string][]domain.PetMilestone     `json:"petMilestones"`
}

type PersistentStore struct {
	*MemoryStore
	pool *pgxpool.Pool
}

func NewPersistentStore(ctx context.Context, databaseURL string) (*PersistentStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	store := &PersistentStore{
		MemoryStore: NewMemoryStore(),
		pool:        pool,
	}

	if err := store.ensureSchema(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	if err := store.load(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	if err := store.persist(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return store, nil
}

func (s *PersistentStore) Close() error {
	if s.pool != nil {
		s.pool.Close()
	}
	return nil
}

func (s *PersistentStore) ensureSchema(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		create table if not exists app_state (
			id boolean primary key default true,
			snapshot jsonb not null,
			updated_at timestamptz not null default now()
		)
	`)
	return err
}

func (s *PersistentStore) load(ctx context.Context) error {
	var payload []byte
	err := s.pool.QueryRow(ctx, `select snapshot from app_state where id = true`).Scan(&payload)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil
		}
		return err
	}

	var state snapshotState
	if err := json.Unmarshal(payload, &state); err != nil {
		return err
	}
	s.applyState(state)
	return nil
}

func (s *PersistentStore) persist(ctx context.Context) error {
	state := s.captureState()
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		insert into app_state (id, snapshot, updated_at)
		values (true, $1, now())
		on conflict (id) do update
		set snapshot = excluded.snapshot,
		    updated_at = excluded.updated_at
	`, payload)
	return err
}

func (s *PersistentStore) captureState() snapshotState {
	s.MemoryStore.mu.RLock()
	defer s.MemoryStore.mu.RUnlock()

	return snapshotState{
		Users:              s.users,
		UsersByEmail:       s.usersByEmail,
		AdminsByEmail:      s.adminsByEmail,
		Pets:               s.pets,
		Swipes:             s.swipes,
		Matches:            s.matches,
		Conversations:      s.conversations,
		Posts:              s.posts,
		PostLikes:          s.postLikes,
		Venues:             s.venues,
		Events:             s.events,
		PetCreatedAt:       s.petCreatedAt,
		MatchCreatedAt:     s.matchCreatedAt,
		PostCreatedAt:      s.postCreatedAt,
		EventCreatedAt:     s.eventCreatedAt,
		VerificationTokens: s.verificationTokens,
		ResetTokens:        s.resetTokens,
		Taxonomies:         s.taxonomies,
		Reports:            s.reports,
		PushTokens:         s.pushTokens,
		Notifications:      s.notifications,
		Favorites:          s.favorites,
		DiaryEntries:       s.diaryEntries,
		HealthRecords:      s.healthRecords,
		WeightEntries:      s.weightEntries,
		VetContacts:        s.vetContacts,
		FeedingSchedules:   s.feedingSchedules,
		Playdates:          s.playdates,
		Groups:             s.groups,
		LostPetAlerts:      s.lostPetAlerts,
		Badges:             s.badges,
		TrainingTips:       s.trainingTips,
		PetSitters:         s.petSitters,
		VetClinics:         s.vetClinics,
		VenueReviews:       s.venueReviews,
		TipBookmarks:       s.tipBookmarks,
		TipCompleted:       s.tipCompleted,
		WalkRoutes:         s.walkRoutes,
		// (legacy adoptions snapshot dropped in v0.13)
		PetAlbums:          s.petAlbums,
		PetMilestones:      s.petMilestones,
	}
}

func (s *PersistentStore) applyState(state snapshotState) {
	s.MemoryStore.mu.Lock()
	defer s.MemoryStore.mu.Unlock()

	s.users = defaultUsers(state.Users)
	s.usersByEmail = defaultStringMap(state.UsersByEmail)
	s.adminsByEmail = defaultAdmins(state.AdminsByEmail)
	s.pets = defaultPets(state.Pets)
	s.swipes = defaultSwipes(state.Swipes)
	s.matches = defaultMatches(state.Matches)
	s.conversations = defaultConversations(state.Conversations)
	s.posts = defaultPosts(state.Posts)
	s.postLikes = defaultPostLikes(state.PostLikes)
	s.venues = defaultVenues(state.Venues)
	s.events = defaultEvents(state.Events)
	s.petCreatedAt = defaultTimes(state.PetCreatedAt)
	s.matchCreatedAt = defaultTimes(state.MatchCreatedAt)
	s.postCreatedAt = defaultTimes(state.PostCreatedAt)
	s.eventCreatedAt = defaultTimes(state.EventCreatedAt)
	s.verificationTokens = defaultStringMap(state.VerificationTokens)
	s.resetTokens = defaultStringMap(state.ResetTokens)
	s.taxonomies = defaultTaxonomies(state.Taxonomies)
	s.reports = defaultReports(state.Reports)
	if state.PushTokens != nil {
		s.pushTokens = state.PushTokens
	}
	if state.Notifications != nil {
		s.notifications = state.Notifications
	}
	if state.Favorites != nil {
		s.favorites = state.Favorites
	}
	if state.DiaryEntries != nil {
		s.diaryEntries = state.DiaryEntries
	}
	if state.HealthRecords != nil {
		s.healthRecords = state.HealthRecords
	}
	if state.WeightEntries != nil {
		s.weightEntries = state.WeightEntries
	}
	if state.VetContacts != nil {
		s.vetContacts = state.VetContacts
	}
	if state.FeedingSchedules != nil {
		s.feedingSchedules = state.FeedingSchedules
	}
	if state.Playdates != nil {
		s.playdates = state.Playdates
	}
	if state.Groups != nil {
		s.groups = state.Groups
	}
	if state.LostPetAlerts != nil {
		s.lostPetAlerts = state.LostPetAlerts
	}
	if state.Badges != nil {
		s.badges = state.Badges
	}
	if state.TrainingTips != nil {
		s.trainingTips = state.TrainingTips
	}
	if state.PetSitters != nil {
		s.petSitters = state.PetSitters
	}
	if state.VetClinics != nil {
		s.vetClinics = state.VetClinics
	}
	if state.VenueReviews != nil {
		s.venueReviews = state.VenueReviews
	}
	if state.TipBookmarks != nil {
		s.tipBookmarks = state.TipBookmarks
	}
	if state.TipCompleted != nil {
		s.tipCompleted = state.TipCompleted
	}
	if state.WalkRoutes != nil {
		s.walkRoutes = state.WalkRoutes
	}
	// (legacy adoptions snapshot dropped in v0.13)
	if state.PetAlbums != nil {
		s.petAlbums = state.PetAlbums
	}
	if state.PetMilestones != nil {
		s.petMilestones = state.PetMilestones
	}
}

func (s *PersistentStore) persistAfter(err error) error {
	if err != nil {
		return err
	}
	return s.persist(context.Background())
}

func (s *PersistentStore) Register(email string, password string) (*domain.AppUser, string, error) {
	user, token, err := s.MemoryStore.Register(email, password)
	return user, token, s.persistAfter(err)
}

func (s *PersistentStore) ResetPassword(token string, newPassword string) error {
	return s.persistAfter(s.MemoryStore.ResetPassword(token, newPassword))
}

func (s *PersistentStore) UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error) {
	profile, err := s.MemoryStore.UpdateProfile(userID, input)
	return profile, s.persistAfter(err)
}

func (s *PersistentStore) UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error) {
	pet, err := s.MemoryStore.UpsertPet(userID, petID, input)
	return pet, s.persistAfter(err)
}

func (s *PersistentStore) CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error) {
	match, err := s.MemoryStore.CreateSwipe(userID, actorPetID, targetPetID, direction)
	return match, s.persistAfter(err)
}

func (s *PersistentStore) SendMessage(userID string, conversationID string, body string) (domain.Message, error) {
	message, err := s.MemoryStore.SendMessage(userID, conversationID, body)
	return message, s.persistAfter(err)
}

func (s *PersistentStore) BlockUser(userID string, targetUserID string) error {
	return s.persistAfter(s.MemoryStore.BlockUser(userID, targetUserID))
}

func (s *PersistentStore) CreateReport(reporterID string, reporterName string, reason string, targetType string, targetID string, targetLabel string) (domain.ReportSummary, error) {
	report, err := s.MemoryStore.CreateReport(reporterID, reporterName, reason, targetType, targetID, targetLabel)
	if err != nil {
		return report, err
	}
	_ = s.persist(context.Background())
	return report, nil
}

func (s *PersistentStore) SuspendUser(userID string, status string) error {
	return s.persistAfter(s.MemoryStore.SuspendUser(userID, status))
}

func (s *PersistentStore) DeleteUser(userID string) error {
	return s.persistAfter(s.MemoryStore.DeleteUser(userID))
}

func (s *PersistentStore) SetPetVisibility(petID string, hidden bool) error {
	return s.persistAfter(s.MemoryStore.SetPetVisibility(petID, hidden))
}

func (s *PersistentStore) PetDetail(petID string) (domain.AdminPetDetail, error) {
	return s.MemoryStore.PetDetail(petID)
}

func (s *PersistentStore) UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem {
	next := s.MemoryStore.UpsertTaxonomy(kind, item)
	_ = s.persist(context.Background())
	return next
}

func (s *PersistentStore) DeleteTaxonomy(kind string, itemID string) error {
	return s.persistAfter(s.MemoryStore.DeleteTaxonomy(kind, itemID))
}

func (s *PersistentStore) ResolveReport(reportID string, notes string) error {
	return s.persistAfter(s.MemoryStore.ResolveReport(reportID, notes))
}

func (s *PersistentStore) GetReportDetail(reportID string) (*domain.ReportDetail, error) {
	return s.MemoryStore.GetReportDetail(reportID)
}

func (s *PersistentStore) CreatePost(userID string, input PostInput) (domain.HomePost, error) {
	post, err := s.MemoryStore.CreatePost(userID, input)
	return post, s.persistAfter(err)
}

func (s *PersistentStore) TogglePostLike(userID string, postID string) (domain.HomePost, error) {
	post, err := s.MemoryStore.TogglePostLike(userID, postID)
	return post, s.persistAfter(err)
}

func (s *PersistentStore) DeletePost(postID string) error {
	return s.persistAfter(s.MemoryStore.DeletePost(postID))
}

func (s *PersistentStore) UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue {
	venue := s.MemoryStore.UpsertVenue(venueID, input)
	_ = s.persist(context.Background())
	return venue
}

func (s *PersistentStore) DeleteVenue(venueID string) error {
	return s.persistAfter(s.MemoryStore.DeleteVenue(venueID))
}

func (s *PersistentStore) CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error) {
	venue, err := s.MemoryStore.CheckInVenue(userID, input)
	return venue, s.persistAfter(err)
}

func (s *PersistentStore) UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error) {
	event, err := s.MemoryStore.UpsertEvent(eventID, input)
	return event, s.persistAfter(err)
}

func (s *PersistentStore) DeleteEvent(eventID string) error {
	return s.persistAfter(s.MemoryStore.DeleteEvent(eventID))
}

func (s *PersistentStore) RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error) {
	event, err := s.MemoryStore.RSVPEvent(userID, eventID, petIDs)
	return event, s.persistAfter(err)
}

func (s *PersistentStore) UpdateTrainingTip(tip domain.TrainingTip) (domain.TrainingTip, error) {
	result, err := s.MemoryStore.UpdateTrainingTip(tip)
	return result, s.persistAfter(err)
}

func (s *PersistentStore) BookmarkTip(userID, tipID string) error {
	return s.persistAfter(s.MemoryStore.BookmarkTip(userID, tipID))
}

func (s *PersistentStore) UnbookmarkTip(userID, tipID string) error {
	return s.persistAfter(s.MemoryStore.UnbookmarkTip(userID, tipID))
}

func (s *PersistentStore) CompleteTip(userID, tipID string) error {
	return s.persistAfter(s.MemoryStore.CompleteTip(userID, tipID))
}

func (s *PersistentStore) CreateVetClinic(clinic domain.VetClinic) domain.VetClinic {
	result := s.MemoryStore.CreateVetClinic(clinic)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) DeleteVetClinic(clinicID string) error {
	return s.persistAfter(s.MemoryStore.DeleteVetClinic(clinicID))
}

func (s *PersistentStore) CreateVenueReview(review domain.VenueReview) domain.VenueReview {
	result := s.MemoryStore.CreateVenueReview(review)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) SavePushToken(userID string, token string, platform string) {
	s.MemoryStore.SavePushToken(userID, token, platform)
	_ = s.persist(context.Background())
}

func (s *PersistentStore) SaveNotification(notification domain.Notification) {
	s.MemoryStore.SaveNotification(notification)
	_ = s.persist(context.Background())
}

func (s *PersistentStore) AddFavorite(userID string, petID string) error {
	return s.persistAfter(s.MemoryStore.AddFavorite(userID, petID))
}

func (s *PersistentStore) RemoveFavorite(userID string, petID string) error {
	return s.persistAfter(s.MemoryStore.RemoveFavorite(userID, petID))
}

func (s *PersistentStore) CreateDiaryEntry(userID string, petID string, body string, imageURL *string, mood string) domain.DiaryEntry {
	entry := s.MemoryStore.CreateDiaryEntry(userID, petID, body, imageURL, mood)
	_ = s.persist(context.Background())
	return entry
}

func (s *PersistentStore) CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord {
	result := s.MemoryStore.CreateHealthRecord(petID, record)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) DeleteHealthRecord(petID string, recordID string) error {
	return s.persistAfter(s.MemoryStore.DeleteHealthRecord(petID, recordID))
}

func (s *PersistentStore) CreateWeightEntry(petID string, entry domain.WeightEntry) domain.WeightEntry {
	result := s.MemoryStore.CreateWeightEntry(petID, entry)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) CreateVetContact(userID string, contact domain.VetContact) domain.VetContact {
	result := s.MemoryStore.CreateVetContact(userID, contact)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) DeleteVetContact(userID string, contactID string) error {
	return s.persistAfter(s.MemoryStore.DeleteVetContact(userID, contactID))
}

func (s *PersistentStore) CreateFeedingSchedule(petID string, schedule domain.FeedingSchedule) domain.FeedingSchedule {
	result := s.MemoryStore.CreateFeedingSchedule(petID, schedule)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) DeleteFeedingSchedule(petID string, scheduleID string) error {
	return s.persistAfter(s.MemoryStore.DeleteFeedingSchedule(petID, scheduleID))
}

func (s *PersistentStore) CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate {
	result := s.MemoryStore.CreatePlaydate(userID, playdate)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) JoinPlaydate(userID string, playdateID string) error {
	return s.persistAfter(s.MemoryStore.JoinPlaydate(userID, playdateID))
}

func (s *PersistentStore) LeavePlaydate(userID string, playdateID string) (string, error) {
	promoted, err := s.MemoryStore.LeavePlaydate(userID, playdateID)
	_ = s.persist(context.Background())
	return promoted, err
}

func (s *PersistentStore) CancelPlaydate(userID string, playdateID string) error {
	return s.persistAfter(s.MemoryStore.CancelPlaydate(userID, playdateID))
}

func (s *PersistentStore) UpdatePlaydate(userID string, playdateID string, patch domain.Playdate) (*domain.Playdate, error) {
	result, err := s.MemoryStore.UpdatePlaydate(userID, playdateID, patch)
	if err != nil {
		return nil, err
	}
	_ = s.persist(context.Background())
	return result, nil
}

func (s *PersistentStore) CreateGroup(creatorUserID string, group domain.CommunityGroup) domain.CommunityGroup {
	result := s.MemoryStore.CreateGroup(creatorUserID, group)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) JoinGroup(userID string, groupID string) error {
	return s.persistAfter(s.MemoryStore.JoinGroup(userID, groupID))
}

func (s *PersistentStore) JoinGroupByCode(userID string, code string) (*domain.CommunityGroup, error) {
	result, err := s.MemoryStore.JoinGroupByCode(userID, code)
	if err != nil {
		return nil, err
	}
	_ = s.persist(context.Background())
	return result, nil
}

func (s *PersistentStore) CreateLostPetAlert(alert domain.LostPetAlert) domain.LostPetAlert {
	result := s.MemoryStore.CreateLostPetAlert(alert)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) UpdateLostPetStatus(alertID string, status string) error {
	return s.persistAfter(s.MemoryStore.UpdateLostPetStatus(alertID, status))
}

func (s *PersistentStore) AwardBadge(userID string, badgeType string, title string, description string) {
	s.MemoryStore.AwardBadge(userID, badgeType, title, description)
	_ = s.persist(context.Background())
}

func (s *PersistentStore) CreateTrainingTip(tip domain.TrainingTip) domain.TrainingTip {
	result := s.MemoryStore.CreateTrainingTip(tip)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) CreatePetSitter(sitter domain.PetSitter) domain.PetSitter {
	result := s.MemoryStore.CreatePetSitter(sitter)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) MarkMessagesRead(userID string, conversationID string) {
	s.MemoryStore.MarkMessagesRead(userID, conversationID)
	_ = s.persist(context.Background())
}

func (s *PersistentStore) CreateWalkRoute(route domain.WalkRoute) domain.WalkRoute {
	result := s.MemoryStore.CreateWalkRoute(route)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) DeleteWalkRoute(routeID string) error {
	return s.persistAfter(s.MemoryStore.DeleteWalkRoute(routeID))
}

// Shelter + adoption wrappers (v0.13). PersistentStore is mostly retired
// in production (PostgresStore carries all real state), but these keep the
// Store interface satisfied and persist the JSON snapshot used in dev.

func (s *PersistentStore) CreateShelter(shelter domain.Shelter, hash string) (domain.Shelter, error) {
	out, err := s.MemoryStore.CreateShelter(shelter, hash)
	_ = s.persist(context.Background())
	return out, err
}

func (s *PersistentStore) UpdateShelter(id string, patch domain.Shelter) (*domain.Shelter, error) {
	out, err := s.MemoryStore.UpdateShelter(id, patch)
	_ = s.persist(context.Background())
	return out, err
}

func (s *PersistentStore) UpdateShelterPassword(id, hash string) error {
	return s.persistAfter(s.MemoryStore.UpdateShelterPassword(id, hash))
}

func (s *PersistentStore) DeleteShelter(id string) error {
	return s.persistAfter(s.MemoryStore.DeleteShelter(id))
}

func (s *PersistentStore) UpsertShelterPet(shelterID string, pet domain.ShelterPet) (domain.ShelterPet, error) {
	out, err := s.MemoryStore.UpsertShelterPet(shelterID, pet)
	_ = s.persist(context.Background())
	return out, err
}

func (s *PersistentStore) UpdateShelterPetStatus(id, status string) error {
	return s.persistAfter(s.MemoryStore.UpdateShelterPetStatus(id, status))
}

func (s *PersistentStore) DeleteShelterPet(id string) error {
	return s.persistAfter(s.MemoryStore.DeleteShelterPet(id))
}

func (s *PersistentStore) CreateAdoptionApplication(app domain.AdoptionApplication) (domain.AdoptionApplication, error) {
	out, err := s.MemoryStore.CreateAdoptionApplication(app)
	_ = s.persist(context.Background())
	return out, err
}

func (s *PersistentStore) ApproveApplication(id, convID string) error {
	return s.persistAfter(s.MemoryStore.ApproveApplication(id, convID))
}

func (s *PersistentStore) RejectApplication(id, reason string) error {
	return s.persistAfter(s.MemoryStore.RejectApplication(id, reason))
}

func (s *PersistentStore) CompleteAdoption(id string) error {
	return s.persistAfter(s.MemoryStore.CompleteAdoption(id))
}

func (s *PersistentStore) WithdrawApplication(id, userID string) error {
	return s.persistAfter(s.MemoryStore.WithdrawApplication(id, userID))
}

func (s *PersistentStore) CreatePetAlbum(album domain.PetAlbum) domain.PetAlbum {
	result := s.MemoryStore.CreatePetAlbum(album)
	_ = s.persist(context.Background())
	return result
}

func (s *PersistentStore) AwardMilestone(petID string, milestoneType string, title string, description string) {
	s.MemoryStore.AwardMilestone(petID, milestoneType, title, description)
	_ = s.persist(context.Background())
}

func (s *PersistentStore) SendGroupMessage(userID string, groupID string, body string) (domain.Message, error) {
	msg, err := s.MemoryStore.SendGroupMessage(userID, groupID, body)
	return msg, s.persistAfter(err)
}

func defaultUsers(value map[string]*domain.AppUser) map[string]*domain.AppUser {
	if value == nil {
		return map[string]*domain.AppUser{}
	}
	return value
}

func defaultAdmins(value map[string]*domain.AdminUser) map[string]*domain.AdminUser {
	if value == nil {
		return map[string]*domain.AdminUser{}
	}
	return value
}

func defaultPets(value map[string]*domain.Pet) map[string]*domain.Pet {
	if value == nil {
		return map[string]*domain.Pet{}
	}
	return value
}

func defaultSwipes(value map[string]map[string]string) map[string]map[string]string {
	if value == nil {
		return map[string]map[string]string{}
	}
	return value
}

func defaultMatches(value map[string]*domain.MatchPreview) map[string]*domain.MatchPreview {
	if value == nil {
		return map[string]*domain.MatchPreview{}
	}
	return value
}

func defaultConversations(value map[string]*domain.Conversation) map[string]*domain.Conversation {
	if value == nil {
		return map[string]*domain.Conversation{}
	}
	return value
}

func defaultPosts(value map[string]*domain.HomePost) map[string]*domain.HomePost {
	if value == nil {
		return map[string]*domain.HomePost{}
	}
	return value
}

func defaultPostLikes(value map[string]map[string]struct{}) map[string]map[string]struct{} {
	if value == nil {
		return map[string]map[string]struct{}{}
	}
	return value
}

func defaultVenues(value map[string]*domain.ExploreVenue) map[string]*domain.ExploreVenue {
	if value == nil {
		return map[string]*domain.ExploreVenue{}
	}
	return value
}

func defaultEvents(value map[string]*domain.ExploreEvent) map[string]*domain.ExploreEvent {
	if value == nil {
		return map[string]*domain.ExploreEvent{}
	}
	return value
}

func defaultTimes(value map[string]time.Time) map[string]time.Time {
	if value == nil {
		return map[string]time.Time{}
	}
	return value
}

func defaultStringMap(value map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	return value
}

func defaultTaxonomies(value map[string][]domain.TaxonomyItem) map[string][]domain.TaxonomyItem {
	if value == nil {
		return map[string][]domain.TaxonomyItem{}
	}
	return value
}

func defaultReports(value []domain.ReportSummary) []domain.ReportSummary {
	if value == nil {
		return []domain.ReportSummary{}
	}
	return value
}
