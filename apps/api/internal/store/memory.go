package store

import (
	"fmt"
	"math/rand"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
)

type MemoryStore struct {
	mu                 sync.RWMutex
	users              map[string]*domain.AppUser
	usersByEmail       map[string]string
	adminsByEmail      map[string]*domain.AdminUser
	pets               map[string]*domain.Pet
	swipes             map[string]map[string]string
	matches            map[string]*domain.MatchPreview
	conversations      map[string]*domain.Conversation
	posts              map[string]*domain.HomePost
	postLikes          map[string]map[string]struct{}
	venues             map[string]*domain.ExploreVenue
	events             map[string]*domain.ExploreEvent
	petCreatedAt       map[string]time.Time
	matchCreatedAt     map[string]time.Time
	postCreatedAt      map[string]time.Time
	eventCreatedAt     map[string]time.Time
	verificationTokens map[string]string
	resetTokens        map[string]string
	taxonomies         map[string][]domain.TaxonomyItem
	reports            []domain.ReportSummary
}

type UpdateProfileInput struct {
	FirstName string  `json:"firstName"`
	LastName  string  `json:"lastName"`
	BirthDate string  `json:"birthDate"`
	Gender    string  `json:"gender"`
	CityID    string  `json:"cityId"`
	CityLabel string  `json:"cityLabel"`
	AvatarURL *string `json:"avatarUrl"`
	Bio       *string `json:"bio"`
}

type PetInput struct {
	Name          string            `json:"name"`
	AgeYears      int               `json:"ageYears"`
	SpeciesID     string            `json:"speciesId"`
	SpeciesLabel  string            `json:"speciesLabel"`
	BreedID       string            `json:"breedId"`
	BreedLabel    string            `json:"breedLabel"`
	ActivityLevel int               `json:"activityLevel"`
	Hobbies       []string          `json:"hobbies"`
	GoodWith      []string          `json:"goodWith"`
	IsNeutered    bool              `json:"isNeutered"`
	Bio           string            `json:"bio"`
	Photos        []domain.PetPhoto `json:"photos"`
	CityLabel     string            `json:"cityLabel"`
}

func NewMemoryStore() *MemoryStore {
	store := &MemoryStore{
		users:              make(map[string]*domain.AppUser),
		usersByEmail:       make(map[string]string),
		adminsByEmail:      make(map[string]*domain.AdminUser),
		pets:               make(map[string]*domain.Pet),
		swipes:             make(map[string]map[string]string),
		matches:            make(map[string]*domain.MatchPreview),
		conversations:      make(map[string]*domain.Conversation),
		posts:              make(map[string]*domain.HomePost),
		postLikes:          make(map[string]map[string]struct{}),
		venues:             make(map[string]*domain.ExploreVenue),
		events:             make(map[string]*domain.ExploreEvent),
		petCreatedAt:       make(map[string]time.Time),
		matchCreatedAt:     make(map[string]time.Time),
		postCreatedAt:      make(map[string]time.Time),
		eventCreatedAt:     make(map[string]time.Time),
		verificationTokens: make(map[string]string),
		resetTokens:        make(map[string]string),
		taxonomies:         make(map[string][]domain.TaxonomyItem),
	}

	store.seed()
	return store
}

func (s *MemoryStore) seed() {
	adminHash, _ := auth.HashPassword("Admin123!")

	admin := &domain.AdminUser{
		ID:           "admin-1",
		Email:        "owner@petto.app",
		Name:         "Petto Admin",
		PasswordHash: adminHash,
	}
	s.adminsByEmail[strings.ToLower(admin.Email)] = admin

	dogID := "species-dog"
	catID := "species-cat"
	s.taxonomies["species"] = []domain.TaxonomyItem{
		{ID: "species-dog", Label: "Dog", Slug: "dog", IsActive: true},
		{ID: "species-cat", Label: "Cat", Slug: "cat", IsActive: true},
		{ID: "species-rabbit", Label: "Rabbit", Slug: "rabbit", IsActive: true},
	}
	s.taxonomies["breeds"] = []domain.TaxonomyItem{
		{ID: "breed-golden", Label: "Golden Retriever", Slug: "golden-retriever", SpeciesID: &dogID, IsActive: true},
		{ID: "breed-corgi", Label: "Corgi", Slug: "corgi", SpeciesID: &dogID, IsActive: true},
		{ID: "breed-british-shorthair", Label: "British Shorthair", Slug: "british-shorthair", SpeciesID: &catID, IsActive: true},
	}
	s.taxonomies["hobbies"] = []domain.TaxonomyItem{
		{ID: "hobby-fetch", Label: "Fetch", Slug: "fetch", IsActive: true},
		{ID: "hobby-walks", Label: "Walks", Slug: "walks", IsActive: true},
		{ID: "hobby-sun-naps", Label: "Sun naps", Slug: "sun-naps", IsActive: true},
	}
	s.taxonomies["compatibility"] = []domain.TaxonomyItem{
		{ID: "compat-children", Label: "Children", Slug: "children", IsActive: true},
		{ID: "compat-dogs", Label: "Dogs", Slug: "dogs", IsActive: true},
		{ID: "compat-cats", Label: "Cats", Slug: "cats", IsActive: true},
	}
	s.taxonomies["cities"] = []domain.TaxonomyItem{
		{ID: "city-london", Label: "London", Slug: "london", IsActive: true},
		{ID: "city-manchester", Label: "Manchester", Slug: "manchester", IsActive: true},
		{ID: "city-istanbul", Label: "Istanbul", Slug: "istanbul", IsActive: true},
	}

	venueImage := "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80"
	venue := &domain.ExploreVenue{
		ID:              "venue-hyde-park",
		Name:            "Hyde Park Dog Meadow",
		Category:        "park",
		Description:     "A relaxed green space for dog walks, coffee chats, and easy afternoon meetups.",
		CityLabel:       "London",
		Address:         "Hyde Park, London",
		Latitude:        51.5074,
		Longitude:       -0.1657,
		ImageURL:        &venueImage,
		CurrentCheckIns: []domain.VenueCheckIn{},
	}
	s.venues[venue.ID] = venue

	eventVenueName := venue.Name
	eventVenueID := venue.ID
	event := &domain.ExploreEvent{
		ID:            "event-hyde-park-sunday",
		Title:         "Sunday Dog Social",
		Description:   "A gentle park meetup for pet parents who want a low-pressure morning walk together.",
		CityLabel:     "London",
		VenueID:       &eventVenueID,
		VenueName:     &eventVenueName,
		StartsAt:      time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339),
		Audience:      "everyone",
		PetFocus:      "dogs-only",
		AttendeeCount: 0,
		Attendees:     []domain.VenueCheckIn{},
	}
	s.events[event.ID] = event
	s.eventCreatedAt[event.ID] = time.Now().UTC()
}

func (s *MemoryStore) Register(email string, password string) (*domain.AppUser, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))
	if _, exists := s.usersByEmail[email]; exists {
		return nil, "", fmt.Errorf("email already in use")
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	id := newID("user")
	user := &domain.AppUser{
		ID:           id,
		Email:        email,
		PasswordHash: passwordHash,
		Verified:     true,
		Status:       "active",
		Profile: domain.UserProfile{
			ID:        id,
			Email:     email,
			Status:    "active",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		},
	}

	s.users[id] = user
	s.usersByEmail[email] = id

	return user, "", nil
}

func (s *MemoryStore) VerifyEmail(token string) (*domain.AppUser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID, ok := s.verificationTokens[token]
	if !ok {
		return nil, fmt.Errorf("invalid verification token")
	}

	user := s.users[userID]
	user.Verified = true
	user.Status = "active"
	user.Profile.Status = "active"
	delete(s.verificationTokens, token)

	return user, nil
}

func (s *MemoryStore) RequestVerification(email string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID, ok := s.usersByEmail[strings.ToLower(strings.TrimSpace(email))]
	if !ok {
		return ""
	}

	token := newID("verify")
	s.verificationTokens[token] = userID
	return token
}

func (s *MemoryStore) Login(email string, password string) (*domain.AppUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	userID, ok := s.usersByEmail[strings.ToLower(strings.TrimSpace(email))]
	if !ok {
		return nil, fmt.Errorf("invalid credentials")
	}

	user := s.users[userID]
	if !auth.VerifyPassword(password, user.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}
	if !user.Verified {
		return nil, fmt.Errorf("email not verified")
	}
	if user.Status == "suspended" {
		return nil, fmt.Errorf("account suspended")
	}

	return user, nil
}

func (s *MemoryStore) RequestPasswordReset(email string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID, ok := s.usersByEmail[strings.ToLower(strings.TrimSpace(email))]
	if !ok {
		return ""
	}

	token := newID("reset")
	s.resetTokens[token] = userID
	return token
}

func (s *MemoryStore) ResetPassword(token string, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID, ok := s.resetTokens[token]
	if !ok {
		return fmt.Errorf("invalid reset token")
	}

	passwordHash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}

	s.users[userID].PasswordHash = passwordHash
	delete(s.resetTokens, token)
	return nil
}

func (s *MemoryStore) GetUser(userID string) (*domain.AppUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.users[userID]
	if !ok {
		return nil, fmt.Errorf("user not found")
	}

	return user, nil
}

func (s *MemoryStore) UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok {
		return domain.UserProfile{}, fmt.Errorf("user not found")
	}

	user.Profile.FirstName = input.FirstName
	user.Profile.LastName = input.LastName
	user.Profile.BirthDate = input.BirthDate
	user.Profile.Gender = input.Gender
	user.Profile.CityID = input.CityID
	user.Profile.CityLabel = input.CityLabel
	user.Profile.AvatarURL = input.AvatarURL
	user.Profile.Bio = input.Bio

	return user.Profile, nil
}

func (s *MemoryStore) ListPets(userID string) []domain.Pet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pets := make([]domain.Pet, 0)
	for _, pet := range s.pets {
		if pet.OwnerID == userID {
			pets = append(pets, *pet)
		}
	}

	return pets
}

func (s *MemoryStore) UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(input.Photos) < 1 || len(input.Photos) > 6 {
		return domain.Pet{}, fmt.Errorf("pet must have between 1 and 6 photos")
	}

	if petID == "" {
		petID = newID("pet")
		s.petCreatedAt[petID] = time.Now().UTC()
	} else if _, exists := s.petCreatedAt[petID]; !exists {
		s.petCreatedAt[petID] = time.Now().UTC()
	}

	pet := &domain.Pet{
		ID:            petID,
		OwnerID:       userID,
		Name:          input.Name,
		AgeYears:      input.AgeYears,
		SpeciesID:     input.SpeciesID,
		SpeciesLabel:  input.SpeciesLabel,
		BreedID:       input.BreedID,
		BreedLabel:    input.BreedLabel,
		ActivityLevel: input.ActivityLevel,
		Hobbies:       input.Hobbies,
		GoodWith:      input.GoodWith,
		IsNeutered:    input.IsNeutered,
		Bio:           input.Bio,
		Photos:        input.Photos,
		CityLabel:     input.CityLabel,
	}

	s.pets[petID] = pet
	return *pet, nil
}

func (s *MemoryStore) DiscoveryFeed(userID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, "")
}

func (s *MemoryStore) DiscoveryFeedForPet(userID string, actorPetID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, actorPetID)
}

func (s *MemoryStore) discoveryFeed(userID string, actorPetID string) []domain.DiscoveryCard {
	s.mu.RLock()
	defer s.mu.RUnlock()

	swipedByPet := make(map[string]bool)
	if actorPetID != "" {
		if targets, ok := s.swipes[actorPetID]; ok {
			for targetID, direction := range targets {
				if direction == "like" || direction == "super-like" {
					swipedByPet[targetID] = true
				}
			}
		}
	}

	cards := make([]domain.DiscoveryCard, 0)
	for _, pet := range s.pets {
		if pet.OwnerID == userID || pet.IsHidden {
			continue
		}
		if swipedByPet[pet.ID] {
			continue
		}

		owner := s.users[pet.OwnerID]
		cards = append(cards, domain.DiscoveryCard{
			Pet:           *pet,
			Owner:         domain.OwnerBrief{FirstName: owner.Profile.FirstName, Gender: owner.Profile.Gender},
			DistanceLabel: "Nearby",
			Prompt:        fmt.Sprintf("%s is open to friendly pets with balanced energy.", pet.Name),
		})
	}

	rand.Shuffle(len(cards), func(i, j int) {
		cards[i], cards[j] = cards[j], cards[i]
	})

	return cards
}

func (s *MemoryStore) CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	actorPet, ok := s.pets[actorPetID]
	if !ok || actorPet.OwnerID != userID {
		return nil, fmt.Errorf("invalid actor pet")
	}

	targetPet, ok := s.pets[targetPetID]
	if !ok {
		return nil, fmt.Errorf("target pet not found")
	}

	if _, ok := s.swipes[actorPetID]; !ok {
		s.swipes[actorPetID] = make(map[string]string)
	}
	s.swipes[actorPetID][targetPetID] = direction

	existingDirection := s.swipes[targetPetID][actorPetID]
	if !service.IsMutualLike(existingDirection, direction) {
		return nil, nil
	}

	actorOwnerID := actorPet.OwnerID
	targetOwnerID := targetPet.OwnerID

	matchID := newID("match")
	match := &domain.MatchPreview{
		ID:                    matchID,
		Pet:                   *actorPet,
		MatchedPet:            *targetPet,
		MatchedOwnerName:      s.users[targetOwnerID].Profile.FirstName,
		MatchedOwnerAvatarURL: "",
		LastMessagePreview:    "It's a match. Say hello!",
		UnreadCount:           0,
		CreatedAt:             time.Now().UTC().Format(time.RFC3339),
		Status:                "active",
		ConversationID:        "",
	}
	s.matches[matchID] = match
	s.matchCreatedAt[matchID] = time.Now().UTC()

	existingConv := s.findConversationByUsersLocked(actorOwnerID, targetOwnerID)
	if existingConv != nil {
		match.ConversationID = existingConv.ID
		pair := domain.MatchPetPair{
			MyPetID:        actorPet.ID,
			MyPetName:      actorPet.Name,
			MatchedPetID:   targetPet.ID,
			MatchedPetName: targetPet.Name,
		}
		if len(actorPet.Photos) > 0 {
			pair.MyPetPhotoURL = actorPet.Photos[0].URL
		}
		if len(targetPet.Photos) > 0 {
			pair.MatchedPetPhotoURL = targetPet.Photos[0].URL
		}
		existingConv.MatchPetPairs = append(existingConv.MatchPetPairs, pair)
		existingConv.MatchID = matchID

		allPetNames := make(map[string]bool)
		for _, p := range existingConv.MatchPetPairs {
			allPetNames[p.MyPetName] = true
			allPetNames[p.MatchedPetName] = true
		}
		names := make([]string, 0, len(allPetNames))
		for n := range allPetNames {
			names = append(names, n)
		}
		sort.Strings(names)
		existingConv.Title = strings.Join(names, ", ")
	} else {
		conversationID := newID("conversation")
		actorPhotoURL := ""
		if len(actorPet.Photos) > 0 {
			actorPhotoURL = actorPet.Photos[0].URL
		}
		targetPhotoURL := ""
		if len(targetPet.Photos) > 0 {
			targetPhotoURL = targetPet.Photos[0].URL
		}
		s.conversations[conversationID] = &domain.Conversation{
			ID:            conversationID,
			MatchID:       matchID,
			Title:         fmt.Sprintf("%s, %s", actorPet.Name, targetPet.Name),
			Subtitle:      fmt.Sprintf("Chat with %s", s.users[targetOwnerID].Profile.FirstName),
			UnreadCount:   0,
			LastMessageAt: time.Now().UTC().Format(time.RFC3339),
			Messages:      []domain.Message{},
			UserIDs:       []string{actorOwnerID, targetOwnerID},
			MatchPetPairs: []domain.MatchPetPair{
				{
					MyPetID:            actorPet.ID,
					MyPetName:          actorPet.Name,
					MyPetPhotoURL:      actorPhotoURL,
					MatchedPetID:       targetPet.ID,
					MatchedPetName:     targetPet.Name,
					MatchedPetPhotoURL: targetPhotoURL,
				},
			},
		}
		match.ConversationID = conversationID
	}

	return match, nil
}

func (s *MemoryStore) findConversationByUsersLocked(user1ID string, user2ID string) *domain.Conversation {
	for _, conv := range s.conversations {
		if len(conv.UserIDs) == 2 {
			has1 := (conv.UserIDs[0] == user1ID && conv.UserIDs[1] == user2ID) ||
				(conv.UserIDs[0] == user2ID && conv.UserIDs[1] == user1ID)
			if has1 {
				return conv
			}
		}
	}
	return nil
}

func (s *MemoryStore) ListMatches(userID string) []domain.MatchPreview {
	s.mu.RLock()
	defer s.mu.RUnlock()

	matches := make([]domain.MatchPreview, 0)
	for _, match := range s.matches {
		if match.Pet.OwnerID == userID || match.MatchedPet.OwnerID == userID {
			matches = append(matches, *match)
		}
	}

	sort.Slice(matches, func(i, j int) bool {
		return matches[i].CreatedAt > matches[j].CreatedAt
	})

	return matches
}

func (s *MemoryStore) ListMatchesByPet(userID string, petID string) []domain.MatchPreview {
	s.mu.RLock()
	defer s.mu.RUnlock()

	matches := make([]domain.MatchPreview, 0)
	for _, match := range s.matches {
		if (match.Pet.OwnerID == userID || match.MatchedPet.OwnerID == userID) &&
			(match.Pet.ID == petID || match.MatchedPet.ID == petID) {
			matches = append(matches, *match)
		}
	}

	sort.Slice(matches, func(i, j int) bool {
		return matches[i].CreatedAt > matches[j].CreatedAt
	})

	return matches
}

func (s *MemoryStore) FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.findConversationByUsersLocked(user1ID, user2ID)
}

func (s *MemoryStore) ListConversations(userID string) []domain.Conversation {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conversations := make([]domain.Conversation, 0)
	for _, conversation := range s.conversations {
		userInConv := false
		for _, uid := range conversation.UserIDs {
			if uid == userID {
				userInConv = true
				break
			}
		}
		if userInConv {
			conversations = append(conversations, *conversation)
		}
	}

	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].LastMessageAt > conversations[j].LastMessageAt
	})

	return conversations
}

func (s *MemoryStore) ListMessages(userID string, conversationID string) ([]domain.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conversation, ok := s.conversations[conversationID]
	if !ok {
		return nil, fmt.Errorf("conversation not found")
	}

	if !s.isUserInConversation(conversation, userID) {
		return nil, fmt.Errorf("conversation not found")
	}

	messages := make([]domain.Message, 0, len(conversation.Messages))
	for _, message := range conversation.Messages {
		message.IsMine = message.SenderProfileID == userID
		messages = append(messages, message)
	}

	return messages, nil
}

func (s *MemoryStore) isUserInConversation(conv *domain.Conversation, userID string) bool {
	for _, uid := range conv.UserIDs {
		if uid == userID {
			return true
		}
	}
	return false
}

func (s *MemoryStore) SendMessage(userID string, conversationID string, body string) (domain.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	conversation, ok := s.conversations[conversationID]
	if !ok {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}

	if !s.isUserInConversation(conversation, userID) {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}

	user := s.users[userID]
	message := domain.Message{
		ID:              newID("message"),
		ConversationID:  conversationID,
		SenderProfileID: userID,
		SenderName:      user.Profile.FirstName,
		Body:            strings.TrimSpace(body),
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
		IsMine:          true,
	}

	conversation.Messages = append(conversation.Messages, message)
	conversation.LastMessageAt = message.CreatedAt

	if match, ok := s.matches[conversation.MatchID]; ok {
		match.LastMessagePreview = message.Body
	}

	return message, nil
}

func (s *MemoryStore) BlockUser(userID string, targetUserID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, match := range s.matches {
		if (match.Pet.OwnerID == userID && match.MatchedPet.OwnerID == targetUserID) ||
			(match.Pet.OwnerID == targetUserID && match.MatchedPet.OwnerID == userID) {
			match.Status = "blocked"
		}
	}

	return nil
}

func (s *MemoryStore) CreateReport(reporterName string, reason string, targetType string, targetLabel string) domain.ReportSummary {
	s.mu.Lock()
	defer s.mu.Unlock()

	report := domain.ReportSummary{
		ID:           newID("report"),
		Reason:       reason,
		ReporterName: reporterName,
		TargetType:   targetType,
		TargetLabel:  targetLabel,
		Status:       "open",
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	s.reports = append([]domain.ReportSummary{report}, s.reports...)
	return report
}

func (s *MemoryStore) AdminLogin(email string, password string) (*domain.AdminUser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	admin, ok := s.adminsByEmail[strings.ToLower(strings.TrimSpace(email))]
	if !ok || !auth.VerifyPassword(password, admin.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}

	return admin, nil
}

func (s *MemoryStore) Dashboard() domain.DashboardSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	currentWeekStart := startOfDay(now.AddDate(0, 0, -6))
	previousWeekStart := currentWeekStart.AddDate(0, 0, -7)
	previousWeekEnd := currentWeekStart

	visiblePets := 0
	for _, pet := range s.pets {
		if !pet.IsHidden {
			visiblePets++
		}
	}

	openReports := 0
	for _, report := range s.reports {
		if report.Status != "resolved" {
			openReports++
		}
	}

	metrics := []domain.DashboardMetric{
		{
			ID:    "users",
			Label: "Total users",
			Value: fmt.Sprintf("%d", len(s.users)),
			Delta: formatDelta(
				countUsersBetween(s.users, currentWeekStart, now.Add(24*time.Hour)),
				countUsersBetween(s.users, previousWeekStart, previousWeekEnd),
			),
		},
		{
			ID:    "pets",
			Label: "Active pets",
			Value: fmt.Sprintf("%d", visiblePets),
			Delta: formatDelta(
				countTimesBetween(s.petCreatedAt, currentWeekStart, now.Add(24*time.Hour)),
				countTimesBetween(s.petCreatedAt, previousWeekStart, previousWeekEnd),
			),
		},
		{
			ID:    "matches",
			Label: "Weekly matches",
			Value: fmt.Sprintf("%d", len(s.matches)),
			Delta: formatDelta(
				countTimesBetween(s.matchCreatedAt, currentWeekStart, now.Add(24*time.Hour)),
				countTimesBetween(s.matchCreatedAt, previousWeekStart, previousWeekEnd),
			),
		},
		{
			ID:    "reports",
			Label: "Open reports",
			Value: fmt.Sprintf("%d", openReports),
			Delta: formatDelta(
				countReportsByStatusBetween(s.reports, currentWeekStart, now.Add(24*time.Hour), "open", "in_review"),
				countReportsByStatusBetween(s.reports, previousWeekStart, previousWeekEnd, "open", "in_review"),
			),
		},
		{
			ID:    "posts",
			Label: "Community posts",
			Value: fmt.Sprintf("%d", len(s.posts)),
			Delta: formatDelta(
				countTimesBetween(s.postCreatedAt, currentWeekStart, now.Add(24*time.Hour)),
				countTimesBetween(s.postCreatedAt, previousWeekStart, previousWeekEnd),
			),
		},
		{
			ID:    "venues",
			Label: "Pet-friendly spots",
			Value: fmt.Sprintf("%d", len(s.venues)),
			Delta: "admin curated",
		},
		{
			ID:    "events",
			Label: "Upcoming events",
			Value: fmt.Sprintf("%d", len(s.events)),
			Delta: formatDelta(
				countTimesBetween(s.eventCreatedAt, currentWeekStart, now.Add(24*time.Hour)),
				countTimesBetween(s.eventCreatedAt, previousWeekStart, previousWeekEnd),
			),
		},
	}

	growth := make([]domain.DashboardPoint, 0, 7)
	for offset := 6; offset >= 0; offset-- {
		dayStart := startOfDay(now.AddDate(0, 0, -offset))
		dayEnd := dayStart.Add(24 * time.Hour)
		growth = append(growth, domain.DashboardPoint{
			Label:   dayStart.Format("Mon"),
			Users:   countUsersBetween(s.users, dayStart, dayEnd),
			Pets:    countTimesBetween(s.petCreatedAt, dayStart, dayEnd),
			Matches: countTimesBetween(s.matchCreatedAt, dayStart, dayEnd),
		})
	}

	recentReports := append([]domain.ReportSummary{}, s.reports...)
	sort.Slice(recentReports, func(i, j int) bool {
		return recentReports[i].CreatedAt > recentReports[j].CreatedAt
	})
	if len(recentReports) > 8 {
		recentReports = recentReports[:8]
	}

	topPosts := make([]domain.HomePost, 0, len(s.posts))
	for _, post := range s.posts {
		topPosts = append(topPosts, s.postForViewer(post, ""))
	}
	sort.Slice(topPosts, func(i, j int) bool {
		if topPosts[i].LikeCount == topPosts[j].LikeCount {
			return topPosts[i].CreatedAt > topPosts[j].CreatedAt
		}
		return topPosts[i].LikeCount > topPosts[j].LikeCount
	})
	if len(topPosts) > 5 {
		topPosts = topPosts[:5]
	}

	return domain.DashboardSnapshot{
		Metrics:       metrics,
		Growth:        growth,
		RecentReports: recentReports,
		TopPosts:      topPosts,
	}
}

func (s *MemoryStore) ListUsers() []domain.UserProfile {
	s.mu.RLock()
	defer s.mu.RUnlock()

	profiles := make([]domain.UserProfile, 0, len(s.users))
	for _, user := range s.users {
		profiles = append(profiles, user.Profile)
	}
	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].CreatedAt > profiles[j].CreatedAt
	})

	return profiles
}

func (s *MemoryStore) SuspendUser(userID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok {
		return fmt.Errorf("user not found")
	}

	user.Status = status
	user.Profile.Status = status
	return nil
}

func (s *MemoryStore) DeleteUser(userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok {
		return fmt.Errorf("user not found")
	}

	delete(s.usersByEmail, strings.ToLower(user.Email))
	delete(s.users, userID)

	for petID, pet := range s.pets {
		if pet.OwnerID == userID {
			delete(s.pets, petID)
			delete(s.petCreatedAt, petID)
			delete(s.swipes, petID)
		}
	}

	for actorPetID, targets := range s.swipes {
		for targetPetID := range targets {
			targetPet, exists := s.pets[targetPetID]
			if !exists || targetPet.OwnerID == userID {
				delete(targets, targetPetID)
			}
		}
		if len(targets) == 0 {
			delete(s.swipes, actorPetID)
		}
	}

	for matchID, match := range s.matches {
		if match.Pet.OwnerID == userID || match.MatchedPet.OwnerID == userID {
			delete(s.matches, matchID)
			delete(s.matchCreatedAt, matchID)
			for conversationID, conversation := range s.conversations {
				if conversation.MatchID == matchID {
					delete(s.conversations, conversationID)
				}
			}
		}
	}

	return nil
}

func (s *MemoryStore) UserDetail(userID string) (domain.AdminUserDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.users[userID]
	if !ok {
		return domain.AdminUserDetail{}, fmt.Errorf("user not found")
	}

	pets := make([]domain.Pet, 0)
	for _, pet := range s.pets {
		if pet.OwnerID == userID {
			pets = append(pets, *pet)
		}
	}
	sort.Slice(pets, func(i, j int) bool {
		return pets[i].ID > pets[j].ID
	})

	matches := make([]domain.MatchPreview, 0)
	for _, match := range s.matches {
		if match.Pet.OwnerID == userID || match.MatchedPet.OwnerID == userID {
			matches = append(matches, *match)
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].CreatedAt > matches[j].CreatedAt
	})

	conversations := make([]domain.Conversation, 0)
	for _, conversation := range s.conversations {
		match := s.matches[conversation.MatchID]
		if match != nil && (match.Pet.OwnerID == userID || match.MatchedPet.OwnerID == userID) {
			copiedMessages := append([]domain.Message{}, conversation.Messages...)
			for index := range copiedMessages {
				copiedMessages[index].IsMine = copiedMessages[index].SenderProfileID == userID
			}
			conversations = append(conversations, domain.Conversation{
				ID:            conversation.ID,
				MatchID:       conversation.MatchID,
				Title:         conversation.Title,
				Subtitle:      conversation.Subtitle,
				UnreadCount:   conversation.UnreadCount,
				LastMessageAt: conversation.LastMessageAt,
				Messages:      copiedMessages,
			})
		}
	}
	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].LastMessageAt > conversations[j].LastMessageAt
	})

	posts := make([]domain.HomePost, 0)
	for _, post := range s.posts {
		if post.Author.ID == userID {
			posts = append(posts, s.postForViewer(post, userID))
		}
	}
	sort.Slice(posts, func(i, j int) bool {
		return posts[i].CreatedAt > posts[j].CreatedAt
	})

	return domain.AdminUserDetail{
		User:               user.Profile,
		Pets:               pets,
		Matches:            matches,
		Conversations:      conversations,
		Posts:              posts,
		TotalLikesReceived: s.likesReceivedForUser(userID),
	}, nil
}

func (s *MemoryStore) ListAllPets() []domain.Pet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pets := make([]domain.Pet, 0, len(s.pets))
	for _, pet := range s.pets {
		pets = append(pets, *pet)
	}
	sort.Slice(pets, func(i, j int) bool {
		return pets[i].ID > pets[j].ID
	})

	return pets
}

func (s *MemoryStore) PetDetail(petID string) (domain.AdminPetDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pet, ok := s.pets[petID]
	if !ok {
		return domain.AdminPetDetail{}, fmt.Errorf("pet not found")
	}

	owner := s.users[pet.OwnerID]
	if owner == nil {
		return domain.AdminPetDetail{}, fmt.Errorf("owner not found")
	}

	matches := make([]domain.MatchPreview, 0)
	for _, match := range s.matches {
		if match.Pet.ID == petID || match.MatchedPet.ID == petID {
			matches = append(matches, *match)
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].CreatedAt > matches[j].CreatedAt
	})

	return domain.AdminPetDetail{
		Pet:     *pet,
		Owner:   owner.Profile,
		Matches: matches,
	}, nil
}

func (s *MemoryStore) SetPetVisibility(petID string, hidden bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	pet, ok := s.pets[petID]
	if !ok {
		return fmt.Errorf("pet not found")
	}

	pet.IsHidden = hidden
	return nil
}

func (s *MemoryStore) ListTaxonomy(kind string) []domain.TaxonomyItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := append([]domain.TaxonomyItem{}, s.taxonomies[kind]...)
	if items == nil {
		items = make([]domain.TaxonomyItem, 0)
	}
	slices.SortFunc(items, func(a domain.TaxonomyItem, b domain.TaxonomyItem) int {
		return strings.Compare(a.Label, b.Label)
	})

	return items
}

func (s *MemoryStore) UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem {
	s.mu.Lock()
	defer s.mu.Unlock()

	if item.ID == "" {
		item.ID = newID(kind)
	}

	items := s.taxonomies[kind]
	for index := range items {
		if items[index].ID == item.ID {
			items[index] = item
			s.taxonomies[kind] = items
			return item
		}
	}

	s.taxonomies[kind] = append(items, item)
	return item
}

func (s *MemoryStore) DeleteTaxonomy(kind string, itemID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	items := s.taxonomies[kind]
	filtered := make([]domain.TaxonomyItem, 0, len(items))
	removed := false
	for _, item := range items {
		if item.ID == itemID {
			removed = true
			continue
		}
		filtered = append(filtered, item)
	}
	if !removed {
		return fmt.Errorf("taxonomy item not found")
	}

	s.taxonomies[kind] = filtered
	if kind == "species" {
		breeds := s.taxonomies["breeds"]
		nextBreeds := make([]domain.TaxonomyItem, 0, len(breeds))
		for _, breed := range breeds {
			if breed.SpeciesID != nil && *breed.SpeciesID == itemID {
				continue
			}
			nextBreeds = append(nextBreeds, breed)
		}
		s.taxonomies["breeds"] = nextBreeds
	}

	return nil
}

func (s *MemoryStore) ListReports() []domain.ReportSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	reports := append([]domain.ReportSummary{}, s.reports...)
	if reports == nil {
		reports = make([]domain.ReportSummary, 0)
	}

	return reports
}

func (s *MemoryStore) ResolveReport(reportID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.reports {
		if s.reports[index].ID == reportID {
			s.reports[index].Status = "resolved"
			return nil
		}
	}

	return fmt.Errorf("report not found")
}

func newID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

func startOfDay(value time.Time) time.Time {
	year, month, day := value.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func countUsersBetween(users map[string]*domain.AppUser, start time.Time, end time.Time) int {
	count := 0
	for _, user := range users {
		createdAt, err := time.Parse(time.RFC3339, user.Profile.CreatedAt)
		if err != nil {
			continue
		}
		if !createdAt.Before(start) && createdAt.Before(end) {
			count++
		}
	}

	return count
}

func countTimesBetween(values map[string]time.Time, start time.Time, end time.Time) int {
	count := 0
	for _, createdAt := range values {
		if !createdAt.Before(start) && createdAt.Before(end) {
			count++
		}
	}

	return count
}

func countReportsByStatusBetween(reports []domain.ReportSummary, start time.Time, end time.Time, statuses ...string) int {
	allowed := make(map[string]struct{}, len(statuses))
	for _, status := range statuses {
		allowed[status] = struct{}{}
	}

	count := 0
	for _, report := range reports {
		createdAt, err := time.Parse(time.RFC3339, report.CreatedAt)
		if err != nil {
			continue
		}
		if !createdAt.Before(start) && createdAt.Before(end) {
			if _, ok := allowed[report.Status]; ok {
				count++
			}
		}
	}

	return count
}

func formatDelta(current int, previous int) string {
	if current == 0 && previous == 0 {
		return "+0.0%"
	}
	if previous == 0 {
		return "+100.0%"
	}

	delta := ((float64(current) - float64(previous)) / float64(previous)) * 100
	if delta >= 0 {
		return fmt.Sprintf("+%.1f%%", delta)
	}

	return fmt.Sprintf("%.1f%%", delta)
}
