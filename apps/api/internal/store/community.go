package store

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

type PostInput struct {
	Body         string   `json:"body"`
	ImageURL     *string  `json:"imageUrl"`
	TaggedPetIDs []string `json:"taggedPetIds"`
}

type VenueInput struct {
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	CityLabel   string  `json:"cityLabel"`
	Address     string  `json:"address"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	ImageURL    *string `json:"imageUrl"`
}

type EventInput struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CityLabel   string  `json:"cityLabel"`
	VenueID     *string `json:"venueId"`
	StartsAt    string  `json:"startsAt"`
	Audience    string  `json:"audience"`
	PetFocus    string  `json:"petFocus"`
}

type VenueCheckInInput struct {
	VenueID string   `json:"venueId"`
	PetIDs  []string `json:"petIds"`
}

func (s *MemoryStore) ListHomeFeed(userID string) []domain.HomePost {
	s.mu.RLock()
	defer s.mu.RUnlock()

	posts := make([]domain.HomePost, 0, len(s.posts))
	for _, post := range s.posts {
		posts = append(posts, s.postForViewer(post, userID))
	}
	sort.Slice(posts, func(i, j int) bool {
		return posts[i].CreatedAt > posts[j].CreatedAt
	})
	return posts
}

func (s *MemoryStore) CreatePost(userID string, input PostInput) (domain.HomePost, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok {
		return domain.HomePost{}, fmt.Errorf("user not found")
	}

	body := strings.TrimSpace(input.Body)
	if body == "" && input.ImageURL == nil {
		return domain.HomePost{}, fmt.Errorf("add some text or a photo before posting")
	}

	taggedPets := make([]domain.Pet, 0, len(input.TaggedPetIDs))
	for _, petID := range input.TaggedPetIDs {
		pet, exists := s.pets[petID]
		if !exists || pet.OwnerID != userID {
			continue
		}
		taggedPets = append(taggedPets, *pet)
	}

	postID := newID("post")
	post := &domain.HomePost{
		ID:         postID,
		Author:     user.Profile,
		Body:       body,
		ImageURL:   input.ImageURL,
		TaggedPets: taggedPets,
		LikeCount:  0,
		LikedByMe:  false,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	s.posts[postID] = post
	s.postCreatedAt[postID] = time.Now().UTC()
	return *post, nil
}

func (s *MemoryStore) TogglePostLike(userID string, postID string) (domain.HomePost, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	post, ok := s.posts[postID]
	if !ok {
		return domain.HomePost{}, fmt.Errorf("post not found")
	}

	if _, exists := s.postLikes[postID]; !exists {
		s.postLikes[postID] = make(map[string]struct{})
	}

	if _, liked := s.postLikes[postID][userID]; liked {
		delete(s.postLikes[postID], userID)
	} else {
		s.postLikes[postID][userID] = struct{}{}
	}
	post.LikeCount = len(s.postLikes[postID])
	post.LikedByMe = false

	return s.postForViewer(post, userID), nil
}

func (s *MemoryStore) HomeInsight(userID string) (domain.DashboardMetric, domain.DashboardMetric) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	totalLikes := 0
	totalPosts := 0
	for _, post := range s.posts {
		if post.Author.ID == userID {
			totalPosts++
			totalLikes += len(s.postLikes[post.ID])
		}
	}

	return domain.DashboardMetric{ID: "my-posts", Label: "Your posts", Value: fmt.Sprintf("%d", totalPosts), Delta: "live"},
		domain.DashboardMetric{ID: "my-likes", Label: "Likes received", Value: fmt.Sprintf("%d", totalLikes), Delta: "live"}
}

func (s *MemoryStore) ListVenues() []domain.ExploreVenue {
	s.mu.RLock()
	defer s.mu.RUnlock()

	venues := make([]domain.ExploreVenue, 0, len(s.venues))
	for _, venue := range s.venues {
		venues = append(venues, *venue)
	}
	sort.Slice(venues, func(i, j int) bool {
		return venues[i].Name < venues[j].Name
	})
	return venues
}

func (s *MemoryStore) UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue {
	s.mu.Lock()
	defer s.mu.Unlock()

	if venueID == "" {
		venueID = newID("venue")
	}

	currentCheckIns := []domain.VenueCheckIn{}
	if existing, ok := s.venues[venueID]; ok {
		currentCheckIns = existing.CurrentCheckIns
	}

	venue := &domain.ExploreVenue{
		ID:              venueID,
		Name:            input.Name,
		Category:        input.Category,
		Description:     input.Description,
		CityLabel:       input.CityLabel,
		Address:         input.Address,
		Latitude:        input.Latitude,
		Longitude:       input.Longitude,
		ImageURL:        input.ImageURL,
		CurrentCheckIns: currentCheckIns,
	}
	s.venues[venueID] = venue
	return *venue
}

func (s *MemoryStore) DeleteVenue(venueID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.venues[venueID]; !ok {
		return fmt.Errorf("venue not found")
	}
	delete(s.venues, venueID)
	for eventID, event := range s.events {
		if event.VenueID != nil && *event.VenueID == venueID {
			delete(s.events, eventID)
			delete(s.eventCreatedAt, eventID)
		}
	}
	return nil
}

func (s *MemoryStore) CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	venue, ok := s.venues[input.VenueID]
	if !ok {
		return domain.ExploreVenue{}, fmt.Errorf("venue not found")
	}
	user, ok := s.users[userID]
	if !ok {
		return domain.ExploreVenue{}, fmt.Errorf("user not found")
	}

	petNames := make([]string, 0, len(input.PetIDs))
	validPetIDs := make([]string, 0, len(input.PetIDs))
	for _, petID := range input.PetIDs {
		pet, exists := s.pets[petID]
		if !exists || pet.OwnerID != userID {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreVenue{}, fmt.Errorf("select at least one of your pets")
	}

	filtered := make([]domain.VenueCheckIn, 0, len(venue.CurrentCheckIns))
	for _, checkIn := range venue.CurrentCheckIns {
		if checkIn.UserID != userID {
			filtered = append(filtered, checkIn)
		}
	}

	venue.CurrentCheckIns = append([]domain.VenueCheckIn{{
		UserID:      userID,
		UserName:    strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName),
		AvatarURL:   user.Profile.AvatarURL,
		PetIDs:      validPetIDs,
		PetNames:    petNames,
		PetCount:    len(validPetIDs),
		CheckedInAt: time.Now().UTC().Format(time.RFC3339),
	}}, filtered...)

	return *venue, nil
}

func (s *MemoryStore) ListEvents() []domain.ExploreEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	events := make([]domain.ExploreEvent, 0, len(s.events))
	for _, event := range s.events {
		events = append(events, *event)
	}
	sort.Slice(events, func(i, j int) bool {
		return events[i].StartsAt < events[j].StartsAt
	})
	return events
}

func (s *MemoryStore) UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if eventID == "" {
		eventID = newID("event")
	}

	var venueName *string
	if input.VenueID != nil {
		if venue, ok := s.venues[*input.VenueID]; ok {
			venueName = &venue.Name
		}
	}

	attendees := []domain.VenueCheckIn{}
	if existing, ok := s.events[eventID]; ok {
		attendees = existing.Attendees
	}

	event := &domain.ExploreEvent{
		ID:            eventID,
		Title:         input.Title,
		Description:   input.Description,
		CityLabel:     input.CityLabel,
		VenueID:       input.VenueID,
		VenueName:     venueName,
		StartsAt:      input.StartsAt,
		Audience:      input.Audience,
		PetFocus:      input.PetFocus,
		AttendeeCount: len(attendees),
		Attendees:     attendees,
	}
	s.events[eventID] = event
	s.eventCreatedAt[eventID] = time.Now().UTC()
	return *event, nil
}

func (s *MemoryStore) DeleteEvent(eventID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.events[eventID]; !ok {
		return fmt.Errorf("event not found")
	}
	delete(s.events, eventID)
	delete(s.eventCreatedAt, eventID)
	return nil
}

func (s *MemoryStore) RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	event, ok := s.events[eventID]
	if !ok {
		return domain.ExploreEvent{}, fmt.Errorf("event not found")
	}
	user, ok := s.users[userID]
	if !ok {
		return domain.ExploreEvent{}, fmt.Errorf("user not found")
	}
	if event.Audience == "women-only" && user.Profile.Gender != "woman" {
		return domain.ExploreEvent{}, fmt.Errorf("this event is reserved for women")
	}

	petNames := make([]string, 0, len(petIDs))
	validPetIDs := make([]string, 0, len(petIDs))
	for _, petID := range petIDs {
		pet, exists := s.pets[petID]
		if !exists || pet.OwnerID != userID {
			continue
		}
		if event.PetFocus == "dogs-only" && pet.SpeciesLabel != "Dog" {
			continue
		}
		if event.PetFocus == "cats-only" && pet.SpeciesLabel != "Cat" {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreEvent{}, fmt.Errorf("select pets that match this event")
	}

	filtered := make([]domain.VenueCheckIn, 0, len(event.Attendees))
	for _, attendee := range event.Attendees {
		if attendee.UserID != userID {
			filtered = append(filtered, attendee)
		}
	}
	event.Attendees = append(filtered, domain.VenueCheckIn{
		UserID:      userID,
		UserName:    strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName),
		AvatarURL:   user.Profile.AvatarURL,
		PetIDs:      validPetIDs,
		PetNames:    petNames,
		PetCount:    len(validPetIDs),
		CheckedInAt: time.Now().UTC().Format(time.RFC3339),
	})
	event.AttendeeCount = len(event.Attendees)

	return *event, nil
}

func (s *MemoryStore) ListPostsAdmin() []domain.HomePost {
	return s.ListHomeFeed("")
}

func (s *MemoryStore) likesReceivedForUser(userID string) int {
	total := 0
	for postID, post := range s.posts {
		if post.Author.ID == userID {
			total += len(s.postLikes[postID])
		}
	}
	return total
}

func (s *MemoryStore) postForViewer(post *domain.HomePost, viewerID string) domain.HomePost {
	if post == nil {
		return domain.HomePost{}
	}

	copyPost := *post
	copyPost.LikeCount = len(s.postLikes[post.ID])
	_, copyPost.LikedByMe = s.postLikes[post.ID][viewerID]
	return copyPost
}
