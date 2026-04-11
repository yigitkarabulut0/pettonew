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
	favorites          map[string]map[string]bool
	diaryEntries       map[string][]domain.DiaryEntry
	healthRecords      map[string][]domain.HealthRecord
	weightEntries      map[string][]domain.WeightEntry
	vetContacts        map[string][]domain.VetContact
	feedingSchedules   map[string][]domain.FeedingSchedule
	playdates          map[string]*domain.Playdate
	groups             map[string]*domain.CommunityGroup
	lostPetAlerts      map[string]*domain.LostPetAlert
	badges             map[string][]domain.Badge
	trainingTips       []domain.TrainingTip
	petSitters         map[string]*domain.PetSitter
	pushTokens         map[string][]domain.PushToken // userId -> tokens
	notifications      []domain.Notification
	vetClinics         map[string]*domain.VetClinic
	venueReviews       map[string][]domain.VenueReview
	tipBookmarks       map[string]map[string]bool
	tipCompleted       map[string]map[string]bool
	walkRoutes         map[string]*domain.WalkRoute
	adoptions          map[string]*domain.AdoptionListing
	petAlbums          map[string][]domain.PetAlbum
	petMilestones      map[string][]domain.PetMilestone
}

type UpdateProfileInput struct {
	FirstName      string  `json:"firstName"`
	LastName       string  `json:"lastName"`
	BirthDate      string  `json:"birthDate"`
	Gender         string  `json:"gender"`
	CityID         string  `json:"cityId"`
	CityLabel      string  `json:"cityLabel"`
	AvatarURL      *string `json:"avatarUrl"`
	Bio            *string `json:"bio"`
	IsVisibleOnMap *bool   `json:"isVisibleOnMap"`
}

type PetInput struct {
	Name          string            `json:"name"`
	AgeYears      int               `json:"ageYears"`
	Gender        string            `json:"gender"`
	BirthDate     string            `json:"birthDate"`
	SpeciesID     string            `json:"speciesId"`
	SpeciesLabel  string            `json:"speciesLabel"`
	BreedID       string            `json:"breedId"`
	BreedLabel    string            `json:"breedLabel"`
	ActivityLevel int               `json:"activityLevel"`
	Hobbies       []string          `json:"hobbies"`
	GoodWith      []string          `json:"goodWith"`
	Characters    []string          `json:"characters"`
	IsNeutered    bool              `json:"isNeutered"`
	Bio           string            `json:"bio"`
	Photos        []domain.PetPhoto `json:"photos"`
	CityLabel     string            `json:"cityLabel"`
	ThemeColor    string            `json:"themeColor"`
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
		favorites:          make(map[string]map[string]bool),
		diaryEntries:       make(map[string][]domain.DiaryEntry),
		healthRecords:      make(map[string][]domain.HealthRecord),
		weightEntries:      make(map[string][]domain.WeightEntry),
		vetContacts:        make(map[string][]domain.VetContact),
		feedingSchedules:   make(map[string][]domain.FeedingSchedule),
		playdates:          make(map[string]*domain.Playdate),
		groups:             make(map[string]*domain.CommunityGroup),
		lostPetAlerts:      make(map[string]*domain.LostPetAlert),
		badges:             make(map[string][]domain.Badge),
		petSitters:         make(map[string]*domain.PetSitter),
		pushTokens:         make(map[string][]domain.PushToken),
		vetClinics:         make(map[string]*domain.VetClinic),
		venueReviews:       make(map[string][]domain.VenueReview),
		tipBookmarks:       make(map[string]map[string]bool),
		tipCompleted:       make(map[string]map[string]bool),
		walkRoutes:         make(map[string]*domain.WalkRoute),
		adoptions:          make(map[string]*domain.AdoptionListing),
		petAlbums:          make(map[string][]domain.PetAlbum),
		petMilestones:      make(map[string][]domain.PetMilestone),
	}

	store.seed()
	return store
}

func (s *MemoryStore) seed() {
	adminHash, _ := auth.HashPassword("Admin123!")

	admin := &domain.AdminUser{
		ID:           "admin-1",
		Email:        "owner@petto.app",
		Name:         "Fetcht Admin",
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
	s.taxonomies["characters"] = []domain.TaxonomyItem{
		{ID: "char-energetic", Label: "Energetic", Slug: "energetic", IsActive: true},
		{ID: "char-shy", Label: "Shy", Slug: "shy", IsActive: true},
		{ID: "char-lively", Label: "Lively", Slug: "lively", IsActive: true},
		{ID: "char-calm", Label: "Calm", Slug: "calm", IsActive: true},
		{ID: "char-playful", Label: "Playful", Slug: "playful", IsActive: true},
		{ID: "char-curious", Label: "Curious", Slug: "curious", IsActive: true},
		{ID: "char-friendly", Label: "Friendly", Slug: "friendly", IsActive: true},
		{ID: "char-independent", Label: "Independent", Slug: "independent", IsActive: true},
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

	s.trainingTips = []domain.TrainingTip{
		{ID: "tip-1", Title: "Sit Command", Summary: "Teach your dog to sit on command.", Body: "Start by holding a treat close to your pet's nose...", Category: "basic-commands", PetType: "dog", Difficulty: "easy", Steps: []domain.TrainingTipStep{}},
		{ID: "tip-2", Title: "Potty Training", Summary: "House-train your puppy effectively.", Body: "Take your puppy out frequently, especially after meals...", Category: "potty-training", PetType: "dog", Difficulty: "medium", Steps: []domain.TrainingTipStep{}},
		{ID: "tip-3", Title: "Litter Box Basics", Summary: "Set up and train your cat to use a litter box.", Body: "Place the litter box in a quiet, accessible location...", Category: "potty-training", PetType: "cat", Difficulty: "easy", Steps: []domain.TrainingTipStep{}},
	}
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
	if input.IsVisibleOnMap != nil {
		user.Profile.IsVisibleOnMap = *input.IsVisibleOnMap
	}

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
		Gender:        input.Gender,
		BirthDate:     input.BirthDate,
		SpeciesID:     input.SpeciesID,
		SpeciesLabel:  input.SpeciesLabel,
		BreedID:       input.BreedID,
		BreedLabel:    input.BreedLabel,
		ActivityLevel: input.ActivityLevel,
		Hobbies:       input.Hobbies,
		GoodWith:      input.GoodWith,
		Characters:    input.Characters,
		IsNeutered:    input.IsNeutered,
		Bio:           input.Bio,
		Photos:        input.Photos,
		CityLabel:     input.CityLabel,
		ThemeColor:    input.ThemeColor,
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

	// Collect allowed species for same-species matching
	allowedSpecies := make(map[string]bool)
	if actorPetID != "" {
		if actorPet, ok := s.pets[actorPetID]; ok {
			allowedSpecies[actorPet.SpeciesID] = true
		}
	} else {
		for _, pet := range s.pets {
			if pet.OwnerID == userID && !pet.IsHidden {
				allowedSpecies[pet.SpeciesID] = true
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
		if !allowedSpecies[pet.SpeciesID] {
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

func (s *MemoryStore) CreateOrFindDirectConversation(userID string, targetUserID string) (*domain.Conversation, error) {
	if userID == targetUserID {
		return nil, fmt.Errorf("cannot message yourself")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing := s.findConversationByUsersLocked(userID, targetUserID); existing != nil {
		return existing, nil
	}

	targetUser, ok := s.users[targetUserID]
	if !ok {
		return nil, fmt.Errorf("user not found")
	}

	conversationID := newID("conversation")
	conv := &domain.Conversation{
		ID:            conversationID,
		MatchID:       "",
		Title:         targetUser.Profile.FirstName,
		Subtitle:      "Adoption inquiry",
		UnreadCount:   0,
		LastMessageAt: time.Now().UTC().Format(time.RFC3339),
		Messages:      []domain.Message{},
		UserIDs:       []string{userID, targetUserID},
		MatchPetPairs: []domain.MatchPetPair{},
	}
	s.conversations[conversationID] = conv
	return conv, nil
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

func (s *MemoryStore) MarkMessagesRead(userID string, conversationID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	conversation, ok := s.conversations[conversationID]
	if !ok {
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	for i := range conversation.Messages {
		msg := &conversation.Messages[i]
		if msg.SenderProfileID != userID && msg.ReadAt == nil {
			msg.ReadAt = &now
		}
	}
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

func (s *MemoryStore) CreateReport(reporterID string, reporterName string, reason string, targetType string, targetID string, targetLabel string) domain.ReportSummary {
	s.mu.Lock()
	defer s.mu.Unlock()

	report := domain.ReportSummary{
		ID:           newID("report"),
		Reason:       reason,
		ReporterID:   reporterID,
		ReporterName: reporterName,
		TargetType:   targetType,
		TargetID:     targetID,
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

func (s *MemoryStore) ListDiary(petID string) []domain.DiaryEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries := s.diaryEntries[petID]
	if entries == nil {
		return []domain.DiaryEntry{}
	}
	result := make([]domain.DiaryEntry, len(entries))
	copy(result, entries)
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func (s *MemoryStore) CreateDiaryEntry(userID string, petID string, body string, imageURL *string, mood string) domain.DiaryEntry {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := domain.DiaryEntry{
		ID:        newID("diary"),
		PetID:     petID,
		UserID:    userID,
		Body:      body,
		ImageURL:  imageURL,
		Mood:      mood,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	s.diaryEntries[petID] = append(s.diaryEntries[petID], entry)
	return entry
}

func (s *MemoryStore) AddFavorite(userID string, petID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.pets[petID]; !ok {
		return fmt.Errorf("pet not found")
	}

	if s.favorites[userID] == nil {
		s.favorites[userID] = make(map[string]bool)
	}
	s.favorites[userID][petID] = true
	return nil
}

func (s *MemoryStore) RemoveFavorite(userID string, petID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.favorites[userID] != nil {
		delete(s.favorites[userID], petID)
	}
	return nil
}

func (s *MemoryStore) ListFavorites(userID string) []domain.Pet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := []domain.Pet{}
	if favs, ok := s.favorites[userID]; ok {
		for petID := range favs {
			if pet, ok := s.pets[petID]; ok {
				result = append(result, *pet)
			}
		}
	}
	return result
}

// ── Health Records ──────────────────────────────────────────────────

func (s *MemoryStore) ListHealthRecords(petID string) []domain.HealthRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	records := s.healthRecords[petID]
	if records == nil {
		return []domain.HealthRecord{}
	}
	return records
}

func (s *MemoryStore) CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	record.ID = newID("hr")
	record.PetID = petID
	record.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.healthRecords[petID] = append(s.healthRecords[petID], record)
	return record
}

func (s *MemoryStore) DeleteHealthRecord(petID string, recordID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	records := s.healthRecords[petID]
	for i, r := range records {
		if r.ID == recordID {
			s.healthRecords[petID] = slices.Delete(records, i, i+1)
			return nil
		}
	}
	return fmt.Errorf("health record not found")
}

// ── Weight Entries ──────────────────────────────────────────────────

func (s *MemoryStore) ListWeightEntries(petID string) []domain.WeightEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entries := s.weightEntries[petID]
	if entries == nil {
		return []domain.WeightEntry{}
	}
	return entries
}

func (s *MemoryStore) CreateWeightEntry(petID string, entry domain.WeightEntry) domain.WeightEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry.ID = newID("we")
	entry.PetID = petID
	if entry.Date == "" {
		entry.Date = time.Now().UTC().Format(time.RFC3339)
	}
	s.weightEntries[petID] = append(s.weightEntries[petID], entry)
	return entry
}

// ── Vet Contacts ────────────────────────────────────────────────────

func (s *MemoryStore) ListVetContacts(userID string) []domain.VetContact {
	s.mu.RLock()
	defer s.mu.RUnlock()
	contacts := s.vetContacts[userID]
	if contacts == nil {
		return []domain.VetContact{}
	}
	return contacts
}

func (s *MemoryStore) CreateVetContact(userID string, contact domain.VetContact) domain.VetContact {
	s.mu.Lock()
	defer s.mu.Unlock()
	contact.ID = newID("vet")
	contact.UserID = userID
	s.vetContacts[userID] = append(s.vetContacts[userID], contact)
	return contact
}

func (s *MemoryStore) DeleteVetContact(userID string, contactID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	contacts := s.vetContacts[userID]
	for i, c := range contacts {
		if c.ID == contactID {
			s.vetContacts[userID] = slices.Delete(contacts, i, i+1)
			return nil
		}
	}
	return fmt.Errorf("vet contact not found")
}

// ── Feeding Schedules ───────────────────────────────────────────────

func (s *MemoryStore) ListFeedingSchedules(petID string) []domain.FeedingSchedule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	schedules := s.feedingSchedules[petID]
	if schedules == nil {
		return []domain.FeedingSchedule{}
	}
	return schedules
}

func (s *MemoryStore) CreateFeedingSchedule(petID string, schedule domain.FeedingSchedule) domain.FeedingSchedule {
	s.mu.Lock()
	defer s.mu.Unlock()
	schedule.ID = newID("feed")
	schedule.PetID = petID
	schedule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.feedingSchedules[petID] = append(s.feedingSchedules[petID], schedule)
	return schedule
}

func (s *MemoryStore) DeleteFeedingSchedule(petID string, scheduleID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	schedules := s.feedingSchedules[petID]
	for i, fs := range schedules {
		if fs.ID == scheduleID {
			s.feedingSchedules[petID] = slices.Delete(schedules, i, i+1)
			return nil
		}
	}
	return fmt.Errorf("feeding schedule not found")
}

// ── Playdates ───────────────────────────────────────────────────────

func (s *MemoryStore) ListPlaydates() []domain.Playdate {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.Playdate{}
	for _, p := range s.playdates {
		result = append(result, *p)
	}
	return result
}

func (s *MemoryStore) CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate {
	s.mu.Lock()
	defer s.mu.Unlock()
	playdate.ID = newID("pd")
	playdate.OrganizerID = userID
	playdate.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	if playdate.Attendees == nil {
		playdate.Attendees = []string{}
	}
	s.playdates[playdate.ID] = &playdate
	return playdate
}

func (s *MemoryStore) JoinPlaydate(userID string, playdateID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	pd, ok := s.playdates[playdateID]
	if !ok {
		return fmt.Errorf("playdate not found")
	}
	for _, a := range pd.Attendees {
		if a == userID {
			return fmt.Errorf("already joined")
		}
	}
	pd.Attendees = append(pd.Attendees, userID)
	return nil
}

// ── Community Groups ────────────────────────────────────────────────

func (s *MemoryStore) ListGroups() []domain.CommunityGroup {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.CommunityGroup{}
	for _, g := range s.groups {
		result = append(result, *g)
	}
	return result
}

func (s *MemoryStore) CreateGroup(group domain.CommunityGroup) domain.CommunityGroup {
	s.mu.Lock()
	defer s.mu.Unlock()
	group.ID = newID("grp")
	group.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	// Create a conversation for the group so members can chat
	convID := newID("conv")
	conv := &domain.Conversation{
		ID:            convID,
		MatchID:       "",
		Title:         group.Name,
		Subtitle:      "Group chat",
		UnreadCount:   0,
		LastMessageAt: group.CreatedAt,
		Messages:      []domain.Message{},
		UserIDs:       []string{},
		MatchPetPairs: []domain.MatchPetPair{},
	}
	s.conversations[convID] = conv
	group.ConversationID = convID

	s.groups[group.ID] = &group
	return group
}

func (s *MemoryStore) JoinGroup(userID string, groupID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.groups[groupID]
	if !ok {
		return fmt.Errorf("group not found")
	}
	g.MemberCount++

	// Add user to the group conversation so they can send/receive messages
	if g.ConversationID != "" {
		if conv, ok := s.conversations[g.ConversationID]; ok {
			alreadyIn := false
			for _, uid := range conv.UserIDs {
				if uid == userID {
					alreadyIn = true
					break
				}
			}
			if !alreadyIn {
				conv.UserIDs = append(conv.UserIDs, userID)
			}
		}
	}
	return nil
}

// ── Lost Pet Alerts ─────────────────────────────────────────────────

func (s *MemoryStore) ListLostPets() []domain.LostPetAlert {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.LostPetAlert{}
	for _, a := range s.lostPetAlerts {
		result = append(result, *a)
	}
	return result
}

func (s *MemoryStore) CreateLostPetAlert(alert domain.LostPetAlert) domain.LostPetAlert {
	s.mu.Lock()
	defer s.mu.Unlock()
	alert.ID = newID("lost")
	alert.Status = "active"
	alert.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.lostPetAlerts[alert.ID] = &alert
	return alert
}

func (s *MemoryStore) UpdateLostPetStatus(alertID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.lostPetAlerts[alertID]
	if !ok {
		return fmt.Errorf("lost pet alert not found")
	}
	a.Status = status
	return nil
}

// ── Badges ──────────────────────────────────────────────────────────

func (s *MemoryStore) ListBadges(userID string) []domain.Badge {
	s.mu.RLock()
	defer s.mu.RUnlock()
	badges := s.badges[userID]
	if badges == nil {
		return []domain.Badge{}
	}
	return badges
}

func (s *MemoryStore) AwardBadge(userID string, badgeType string, title string, description string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	badge := domain.Badge{
		ID:          newID("badge"),
		UserID:      userID,
		Type:        badgeType,
		Title:       title,
		Description: description,
		EarnedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	s.badges[userID] = append(s.badges[userID], badge)
}

// ── Training Tips ───────────────────────────────────────────────────

func (s *MemoryStore) ListTrainingTips(petType string) []domain.TrainingTip {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if petType == "" {
		if s.trainingTips == nil {
			return []domain.TrainingTip{}
		}
		return s.trainingTips
	}
	result := []domain.TrainingTip{}
	for _, t := range s.trainingTips {
		if t.PetType == petType {
			result = append(result, t)
		}
	}
	return result
}

func (s *MemoryStore) CreateTrainingTip(tip domain.TrainingTip) domain.TrainingTip {
	s.mu.Lock()
	defer s.mu.Unlock()
	tip.ID = newID("tip")
	if tip.Steps == nil {
		tip.Steps = []domain.TrainingTipStep{}
	}
	s.trainingTips = append(s.trainingTips, tip)
	return tip
}

func (s *MemoryStore) GetTrainingTip(tipID string) (*domain.TrainingTip, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.trainingTips {
		if s.trainingTips[i].ID == tipID {
			tip := s.trainingTips[i]
			return &tip, nil
		}
	}
	return nil, fmt.Errorf("training tip not found")
}

func (s *MemoryStore) UpdateTrainingTip(tip domain.TrainingTip) (domain.TrainingTip, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.trainingTips {
		if s.trainingTips[i].ID == tip.ID {
			if tip.Steps == nil {
				tip.Steps = []domain.TrainingTipStep{}
			}
			s.trainingTips[i] = tip
			return tip, nil
		}
	}
	return domain.TrainingTip{}, fmt.Errorf("training tip not found")
}

func (s *MemoryStore) BookmarkTip(userID, tipID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tipBookmarks[userID] == nil {
		s.tipBookmarks[userID] = make(map[string]bool)
	}
	s.tipBookmarks[userID][tipID] = true
	return nil
}

func (s *MemoryStore) UnbookmarkTip(userID, tipID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tipBookmarks[userID] != nil {
		delete(s.tipBookmarks[userID], tipID)
	}
	return nil
}

func (s *MemoryStore) CompleteTip(userID, tipID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tipCompleted[userID] == nil {
		s.tipCompleted[userID] = make(map[string]bool)
	}
	s.tipCompleted[userID][tipID] = true
	return nil
}

func (s *MemoryStore) GetTipUserState(userID string) (bookmarks map[string]bool, completed map[string]bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	bookmarks = make(map[string]bool)
	completed = make(map[string]bool)
	if bm, ok := s.tipBookmarks[userID]; ok {
		for k, v := range bm {
			bookmarks[k] = v
		}
	}
	if cm, ok := s.tipCompleted[userID]; ok {
		for k, v := range cm {
			completed[k] = v
		}
	}
	return
}

// ── Vet Clinics ─────────────────────────────────────────────────────

func (s *MemoryStore) ListVetClinics() []domain.VetClinic {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.VetClinic{}
	for _, c := range s.vetClinics {
		result = append(result, *c)
	}
	return result
}

func (s *MemoryStore) CreateVetClinic(clinic domain.VetClinic) domain.VetClinic {
	s.mu.Lock()
	defer s.mu.Unlock()
	clinic.ID = newID("clinic")
	s.vetClinics[clinic.ID] = &clinic
	return clinic
}

func (s *MemoryStore) DeleteVetClinic(clinicID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.vetClinics[clinicID]; !ok {
		return fmt.Errorf("vet clinic not found")
	}
	delete(s.vetClinics, clinicID)
	return nil
}

// ── Venue Reviews ───────────────────────────────────────────────────

func (s *MemoryStore) ListVenueReviews(venueID string) []domain.VenueReview {
	s.mu.RLock()
	defer s.mu.RUnlock()
	reviews := s.venueReviews[venueID]
	if reviews == nil {
		return []domain.VenueReview{}
	}
	result := make([]domain.VenueReview, len(reviews))
	copy(result, reviews)
	return result
}

func (s *MemoryStore) CreateVenueReview(review domain.VenueReview) domain.VenueReview {
	s.mu.Lock()
	defer s.mu.Unlock()
	review.ID = newID("review")
	review.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.venueReviews[review.VenueID] = append(s.venueReviews[review.VenueID], review)
	return review
}

// ── Pet Sitters ─────────────────────────────────────────────────────

func (s *MemoryStore) ListPetSitters(city string) []domain.PetSitter {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.PetSitter{}
	for _, ps := range s.petSitters {
		if city == "" || ps.CityLabel == city {
			result = append(result, *ps)
		}
	}
	return result
}

func (s *MemoryStore) CreatePetSitter(sitter domain.PetSitter) domain.PetSitter {
	s.mu.Lock()
	defer s.mu.Unlock()
	sitter.ID = newID("sitter")
	s.petSitters[sitter.ID] = &sitter
	return sitter
}

func (s *MemoryStore) SavePushToken(userID string, token string, platform string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Remove existing token for this user (prevent duplicates)
	tokens := s.pushTokens[userID]
	for i, t := range tokens {
		if t.Token == token {
			tokens = append(tokens[:i], tokens[i+1:]...)
			break
		}
	}
	s.pushTokens[userID] = append(tokens, domain.PushToken{
		UserID: userID, Token: token, Platform: platform, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *MemoryStore) ListAllPushTokens() []domain.PushToken {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var all []domain.PushToken
	for _, tokens := range s.pushTokens {
		all = append(all, tokens...)
	}
	return all
}

func (s *MemoryStore) GetUserPushTokens(userID string) []domain.PushToken {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.pushTokens[userID]
}

func (s *MemoryStore) SaveNotification(notification domain.Notification) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notifications = append(s.notifications, notification)
}

func (s *MemoryStore) ListNotifications() []domain.Notification {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]domain.Notification, len(s.notifications))
	copy(result, s.notifications)
	// Reverse for newest first
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
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

func (s *MemoryStore) ResolveReport(reportID string, notes string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index := range s.reports {
		if s.reports[index].ID == reportID {
			s.reports[index].Status = "resolved"
			s.reports[index].Notes = notes
			s.reports[index].ResolvedAt = time.Now().UTC().Format(time.RFC3339)
			return nil
		}
	}

	return fmt.Errorf("report not found")
}

func (s *MemoryStore) GetReportDetail(reportID string) (*domain.ReportDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var report domain.ReportSummary
	found := false
	for _, r := range s.reports {
		if r.ID == reportID {
			report = r
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("report not found")
	}

	detail := domain.ReportDetail{ReportSummary: report}

	switch report.TargetType {
	case "chat":
		convID := report.TargetID
		if convID == "" {
			for _, conv := range s.conversations {
				if conv.Title == report.TargetLabel || conv.ID == report.TargetID {
					convID = conv.ID
					break
				}
			}
		}
		if convID != "" {
			if conv, ok := s.conversations[convID]; ok {
				for _, msg := range conv.Messages {
					detail.ChatMessages = append(detail.ChatMessages, domain.ReportMessage{
						ID:              msg.ID,
						SenderProfileID: msg.SenderProfileID,
						SenderName:      msg.SenderName,
						Body:            msg.Body,
						CreatedAt:       msg.CreatedAt,
					})
				}
				for _, uid := range conv.UserIDs {
					if user, ok := s.users[uid]; ok {
						detail.ChatUsers = append(detail.ChatUsers, domain.ReportUserBrief{
							ID:        user.Profile.ID,
							FirstName: user.Profile.FirstName,
							LastName:  user.Profile.LastName,
							AvatarURL: user.Profile.AvatarURL,
						})
					}
				}
			}
		}

	case "pet":
		if pet, ok := s.pets[report.TargetID]; ok {
			brief := domain.ReportPetBrief{
				ID:           pet.ID,
				Name:         pet.Name,
				SpeciesLabel: pet.SpeciesLabel,
				BreedLabel:   pet.BreedLabel,
				IsHidden:     pet.IsHidden,
				Photos:       pet.Photos,
				OwnerID:      pet.OwnerID,
			}
			if owner, ok := s.users[pet.OwnerID]; ok {
				brief.OwnerName = owner.Profile.FirstName + " " + owner.Profile.LastName
				brief.OwnerAvatarURL = owner.Profile.AvatarURL
			}
			detail.Pet = &brief
		}

	case "post":
		for _, post := range s.posts {
			if post.ID == report.TargetID {
				brief := domain.ReportPostBrief{
					ID:         post.ID,
					Body:       post.Body,
					ImageURL:   post.ImageURL,
					AuthorID:   post.Author.ID,
					AuthorName: post.Author.FirstName + " " + post.Author.LastName,
					LikeCount:  post.LikeCount,
					CreatedAt:  post.CreatedAt,
				}
				detail.Post = &brief
				break
			}
		}
	}

	return &detail, nil
}

// ── Walk Routes ─────────────────────────────────────────────────────

func (s *MemoryStore) ListWalkRoutes(city string) []domain.WalkRoute {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.WalkRoute{}
	for _, r := range s.walkRoutes {
		if city == "" || r.CityLabel == city {
			result = append(result, *r)
		}
	}
	return result
}

func (s *MemoryStore) CreateWalkRoute(route domain.WalkRoute) domain.WalkRoute {
	s.mu.Lock()
	defer s.mu.Unlock()
	route.ID = newID("walkroute")
	route.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.walkRoutes[route.ID] = &route
	return route
}

func (s *MemoryStore) DeleteWalkRoute(routeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.walkRoutes[routeID]; !ok {
		return fmt.Errorf("walk route not found")
	}
	delete(s.walkRoutes, routeID)
	return nil
}

// ── Adoptions ───────────────────────────────────────────────────────

func (s *MemoryStore) ListAdoptions() []domain.AdoptionListing {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []domain.AdoptionListing{}
	for _, a := range s.adoptions {
		result = append(result, *a)
	}
	return result
}

func (s *MemoryStore) CreateAdoption(listing domain.AdoptionListing) domain.AdoptionListing {
	s.mu.Lock()
	defer s.mu.Unlock()
	listing.ID = newID("adoption")
	listing.Status = "active"
	listing.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.adoptions[listing.ID] = &listing
	return listing
}

func (s *MemoryStore) UpdateAdoptionStatus(listingID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.adoptions[listingID]
	if !ok {
		return fmt.Errorf("adoption listing not found")
	}
	a.Status = status
	return nil
}

func (s *MemoryStore) DeleteAdoption(listingID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.adoptions[listingID]; !ok {
		return fmt.Errorf("adoption listing not found")
	}
	delete(s.adoptions, listingID)
	return nil
}

func (s *MemoryStore) GetAdoption(listingID string) (*domain.AdoptionListing, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.adoptions[listingID]
	if !ok {
		return nil, fmt.Errorf("adoption listing not found")
	}
	return a, nil
}

// ── Pet Albums ──────────────────────────────────────────────────────

func (s *MemoryStore) ListPetAlbums(petID string) []domain.PetAlbum {
	s.mu.RLock()
	defer s.mu.RUnlock()
	albums := s.petAlbums[petID]
	if albums == nil {
		return []domain.PetAlbum{}
	}
	return albums
}

func (s *MemoryStore) CreatePetAlbum(album domain.PetAlbum) domain.PetAlbum {
	s.mu.Lock()
	defer s.mu.Unlock()
	album.ID = newID("album")
	album.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.petAlbums[album.PetID] = append(s.petAlbums[album.PetID], album)
	return album
}

// ── Pet Milestones ──────────────────────────────────────────────────

func (s *MemoryStore) ListPetMilestones(petID string) []domain.PetMilestone {
	s.mu.RLock()
	defer s.mu.RUnlock()
	milestones := s.petMilestones[petID]
	if milestones == nil {
		return []domain.PetMilestone{}
	}
	return milestones
}

func (s *MemoryStore) AwardMilestone(petID string, milestoneType string, title string, description string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Dedup: don't award the same type twice for the same pet
	for _, m := range s.petMilestones[petID] {
		if m.Type == milestoneType {
			return
		}
	}
	milestone := domain.PetMilestone{
		ID:          newID("milestone"),
		PetID:       petID,
		Type:        milestoneType,
		Title:       title,
		Description: description,
		AchievedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	s.petMilestones[petID] = append(s.petMilestones[petID], milestone)
}

// ── Group Messages ──────────────────────────────────────────────────

func (s *MemoryStore) ListGroupMessages(groupID string) ([]domain.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.groups[groupID]
	if !ok {
		return nil, fmt.Errorf("group not found")
	}
	if g.ConversationID == "" {
		return []domain.Message{}, nil
	}
	conv, ok := s.conversations[g.ConversationID]
	if !ok {
		return []domain.Message{}, nil
	}
	messages := make([]domain.Message, len(conv.Messages))
	copy(messages, conv.Messages)
	return messages, nil
}

func (s *MemoryStore) SendGroupMessage(userID string, groupID string, body string) (domain.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.groups[groupID]
	if !ok {
		return domain.Message{}, fmt.Errorf("group not found")
	}
	if g.ConversationID == "" {
		return domain.Message{}, fmt.Errorf("group has no conversation")
	}
	conv, ok := s.conversations[g.ConversationID]
	if !ok {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}
	user := s.users[userID]
	senderName := ""
	if user != nil {
		senderName = user.Profile.FirstName
	}
	message := domain.Message{
		ID:              newID("message"),
		ConversationID:  g.ConversationID,
		SenderProfileID: userID,
		SenderName:      senderName,
		Body:            strings.TrimSpace(body),
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
		IsMine:          true,
	}
	conv.Messages = append(conv.Messages, message)
	conv.LastMessageAt = message.CreatedAt
	return message, nil
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
