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
	Users              map[string]*domain.AppUser               `json:"users"`
	UsersByEmail       map[string]string                        `json:"usersByEmail"`
	AdminsByEmail      map[string]*domain.AdminUser             `json:"adminsByEmail"`
	Pets               map[string]*domain.Pet                   `json:"pets"`
	Swipes             map[string]map[string]string             `json:"swipes"`
	Matches            map[string]*domain.MatchPreview          `json:"matches"`
	Conversations      map[string]*domain.Conversation          `json:"conversations"`
	Posts              map[string]*domain.HomePost              `json:"posts"`
	PostLikes          map[string]map[string]struct{}           `json:"postLikes"`
	Venues             map[string]*domain.ExploreVenue          `json:"venues"`
	Events             map[string]*domain.ExploreEvent          `json:"events"`
	PetCreatedAt       map[string]time.Time                     `json:"petCreatedAt"`
	MatchCreatedAt     map[string]time.Time                     `json:"matchCreatedAt"`
	PostCreatedAt      map[string]time.Time                     `json:"postCreatedAt"`
	EventCreatedAt     map[string]time.Time                     `json:"eventCreatedAt"`
	VerificationTokens map[string]string                        `json:"verificationTokens"`
	ResetTokens        map[string]string                        `json:"resetTokens"`
	Taxonomies         map[string][]domain.TaxonomyItem         `json:"taxonomies"`
	Reports            []domain.ReportSummary                   `json:"reports"`
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

func (s *PersistentStore) CreateReport(reporterName string, reason string, targetType string, targetLabel string) domain.ReportSummary {
	report := s.MemoryStore.CreateReport(reporterName, reason, targetType, targetLabel)
	_ = s.persist(context.Background())
	return report
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

func (s *PersistentStore) UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem {
	next := s.MemoryStore.UpsertTaxonomy(kind, item)
	_ = s.persist(context.Background())
	return next
}

func (s *PersistentStore) DeleteTaxonomy(kind string, itemID string) error {
	return s.persistAfter(s.MemoryStore.DeleteTaxonomy(kind, itemID))
}

func (s *PersistentStore) ResolveReport(reportID string) error {
	return s.persistAfter(s.MemoryStore.ResolveReport(reportID))
}

func (s *PersistentStore) CreatePost(userID string, input PostInput) (domain.HomePost, error) {
	post, err := s.MemoryStore.CreatePost(userID, input)
	return post, s.persistAfter(err)
}

func (s *PersistentStore) TogglePostLike(userID string, postID string) (domain.HomePost, error) {
	post, err := s.MemoryStore.TogglePostLike(userID, postID)
	return post, s.persistAfter(err)
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
