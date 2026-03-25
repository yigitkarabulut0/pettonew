package domain

type UserProfile struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	FirstName string  `json:"firstName"`
	LastName  string  `json:"lastName"`
	BirthDate string  `json:"birthDate"`
	Gender    string  `json:"gender"`
	CityID    string  `json:"cityId"`
	CityLabel string  `json:"cityLabel"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
	Bio       *string `json:"bio,omitempty"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"createdAt"`
}

type PetPhoto struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	IsPrimary bool   `json:"isPrimary"`
}

type Pet struct {
	ID            string     `json:"id"`
	OwnerID       string     `json:"ownerId"`
	Name          string     `json:"name"`
	AgeYears      int        `json:"ageYears"`
	SpeciesID     string     `json:"speciesId"`
	SpeciesLabel  string     `json:"speciesLabel"`
	BreedID       string     `json:"breedId"`
	BreedLabel    string     `json:"breedLabel"`
	ActivityLevel int        `json:"activityLevel"`
	Hobbies       []string   `json:"hobbies"`
	GoodWith      []string   `json:"goodWith"`
	IsNeutered    bool       `json:"isNeutered"`
	Bio           string     `json:"bio"`
	Photos        []PetPhoto `json:"photos"`
	CityLabel     string     `json:"cityLabel"`
	IsHidden      bool       `json:"isHidden"`
}

type DiscoveryCard struct {
	Pet           Pet        `json:"pet"`
	Owner         OwnerBrief `json:"owner"`
	DistanceLabel string     `json:"distanceLabel"`
	Prompt        string     `json:"prompt"`
}

type OwnerBrief struct {
	FirstName string `json:"firstName"`
	Gender    string `json:"gender"`
}

type MatchPreview struct {
	ID                    string `json:"id"`
	Pet                   Pet    `json:"pet"`
	MatchedPet            Pet    `json:"matchedPet"`
	MatchedOwnerName      string `json:"matchedOwnerName"`
	MatchedOwnerAvatarURL string `json:"matchedOwnerAvatarUrl,omitempty"`
	LastMessagePreview    string `json:"lastMessagePreview"`
	UnreadCount           int    `json:"unreadCount"`
	CreatedAt             string `json:"createdAt"`
	Status                string `json:"status"`
	ConversationID        string `json:"conversationId"`
}

type Message struct {
	ID              string `json:"id"`
	ConversationID  string `json:"conversationId"`
	SenderProfileID string `json:"senderProfileId"`
	SenderName      string `json:"senderName"`
	Body            string `json:"body"`
	CreatedAt       string `json:"createdAt"`
	IsMine          bool   `json:"isMine"`
}

type MatchPetPair struct {
	MyPetID            string `json:"myPetId"`
	MyPetName          string `json:"myPetName"`
	MyPetPhotoURL      string `json:"myPetPhotoUrl,omitempty"`
	MatchedPetID       string `json:"matchedPetId"`
	MatchedPetName     string `json:"matchedPetName"`
	MatchedPetPhotoURL string `json:"matchedPetPhotoUrl,omitempty"`
}

type Conversation struct {
	ID            string         `json:"id"`
	MatchID       string         `json:"matchId"`
	Title         string         `json:"title"`
	Subtitle      string         `json:"subtitle"`
	UnreadCount   int            `json:"unreadCount"`
	LastMessageAt string         `json:"lastMessageAt"`
	Messages      []Message      `json:"messages"`
	UserIDs       []string       `json:"userIds"`
	MatchPetPairs []MatchPetPair `json:"matchPetPairs"`
}

type TaxonomyItem struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	Slug      string  `json:"slug"`
	SpeciesID *string `json:"speciesId,omitempty"`
	IsActive  bool    `json:"isActive"`
}

type VenueCheckIn struct {
	UserID      string   `json:"userId"`
	UserName    string   `json:"userName"`
	AvatarURL   *string  `json:"avatarUrl,omitempty"`
	PetIDs      []string `json:"petIds"`
	PetNames    []string `json:"petNames"`
	PetCount    int      `json:"petCount"`
	CheckedInAt string   `json:"checkedInAt"`
}

type ExploreVenue struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Category        string         `json:"category"`
	Description     string         `json:"description"`
	CityLabel       string         `json:"cityLabel"`
	Address         string         `json:"address"`
	Latitude        float64        `json:"latitude"`
	Longitude       float64        `json:"longitude"`
	ImageURL        *string        `json:"imageUrl,omitempty"`
	CurrentCheckIns []VenueCheckIn `json:"currentCheckIns"`
}

type ExploreEvent struct {
	ID            string         `json:"id"`
	Title         string         `json:"title"`
	Description   string         `json:"description"`
	CityLabel     string         `json:"cityLabel"`
	VenueID       *string        `json:"venueId,omitempty"`
	VenueName     *string        `json:"venueName,omitempty"`
	StartsAt      string         `json:"startsAt"`
	Audience      string         `json:"audience"`
	PetFocus      string         `json:"petFocus"`
	AttendeeCount int            `json:"attendeeCount"`
	Attendees     []VenueCheckIn `json:"attendees"`
}

type HomePost struct {
	ID         string      `json:"id"`
	Author     UserProfile `json:"author"`
	Body       string      `json:"body"`
	ImageURL   *string     `json:"imageUrl,omitempty"`
	TaggedPets []Pet       `json:"taggedPets"`
	LikeCount  int         `json:"likeCount"`
	LikedByMe  bool        `json:"likedByMe"`
	CreatedAt  string      `json:"createdAt"`
}

type DashboardMetric struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
	Delta string `json:"delta"`
}

type DashboardPoint struct {
	Label   string `json:"label"`
	Users   int    `json:"users"`
	Pets    int    `json:"pets"`
	Matches int    `json:"matches"`
}

type ReportSummary struct {
	ID           string `json:"id"`
	Reason       string `json:"reason"`
	ReporterName string `json:"reporterName"`
	TargetType   string `json:"targetType"`
	TargetLabel  string `json:"targetLabel"`
	Status       string `json:"status"`
	CreatedAt    string `json:"createdAt"`
}

type DashboardSnapshot struct {
	Metrics       []DashboardMetric `json:"metrics"`
	Growth        []DashboardPoint  `json:"growth"`
	RecentReports []ReportSummary   `json:"recentReports"`
	TopPosts      []HomePost        `json:"topPosts"`
}

type AdminUserDetail struct {
	User               UserProfile    `json:"user"`
	Pets               []Pet          `json:"pets"`
	Matches            []MatchPreview `json:"matches"`
	Conversations      []Conversation `json:"conversations"`
	Posts              []HomePost     `json:"posts"`
	TotalLikesReceived int            `json:"totalLikesReceived"`
}

type AdminPetDetail struct {
	Pet     Pet            `json:"pet"`
	Owner   UserProfile    `json:"owner"`
	Matches []MatchPreview `json:"matches"`
}

type AppUser struct {
	ID           string
	Email        string
	PasswordHash string
	Verified     bool
	Status       string
	Profile      UserProfile
}

type AdminUser struct {
	ID           string
	Email        string
	Name         string
	PasswordHash string
}
