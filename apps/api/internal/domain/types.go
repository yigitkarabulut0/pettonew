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
	AvatarURL      *string `json:"avatarUrl,omitempty"`
	Bio            *string `json:"bio,omitempty"`
	IsVisibleOnMap bool    `json:"isVisibleOnMap"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"createdAt"`
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
	Gender        string     `json:"gender"`
	BirthDate     string     `json:"birthDate,omitempty"`
	SpeciesID     string     `json:"speciesId"`
	SpeciesLabel  string     `json:"speciesLabel"`
	BreedID       string     `json:"breedId"`
	BreedLabel    string     `json:"breedLabel"`
	ActivityLevel int        `json:"activityLevel"`
	Hobbies       []string   `json:"hobbies"`
	GoodWith      []string   `json:"goodWith"`
	Characters    []string   `json:"characters"`
	IsNeutered    bool       `json:"isNeutered"`
	Bio           string     `json:"bio"`
	Photos        []PetPhoto `json:"photos"`
	CityLabel     string     `json:"cityLabel"`
	IsHidden      bool       `json:"isHidden"`
	ThemeColor    string     `json:"themeColor,omitempty"`
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
	ID              string  `json:"id"`
	ConversationID  string  `json:"conversationId"`
	SenderProfileID string  `json:"senderProfileId"`
	SenderName      string  `json:"senderName"`
	Body            string  `json:"body"`
	CreatedAt       string  `json:"createdAt"`
	IsMine          bool    `json:"isMine"`
	ReadAt          *string `json:"readAt,omitempty"`
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
	Icon      string  `json:"icon,omitempty"`
	Color     string  `json:"color,omitempty"`
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
	Hours           string         `json:"hours,omitempty"`
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
	EndsAt        string         `json:"endsAt,omitempty"`
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
	VenueID    *string     `json:"venueId,omitempty"`
	VenueName  *string     `json:"venueName,omitempty"`
	EventID    *string     `json:"eventId,omitempty"`
	EventName  *string     `json:"eventName,omitempty"`
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
	ReporterID   string `json:"reporterID"`
	ReporterName string `json:"reporterName"`
	TargetType   string `json:"targetType"`
	TargetID     string `json:"targetID"`
	TargetLabel  string `json:"targetLabel"`
	Status       string `json:"status"`
	Notes        string `json:"notes,omitempty"`
	ResolvedAt   string `json:"resolvedAt,omitempty"`
	CreatedAt    string `json:"createdAt"`
}

type ReportMessage struct {
	ID              string `json:"id"`
	SenderProfileID string `json:"senderProfileID"`
	SenderName      string `json:"senderName"`
	Body            string `json:"body"`
	CreatedAt       string `json:"createdAt"`
}

type ReportUserBrief struct {
	ID        string  `json:"id"`
	FirstName string  `json:"firstName"`
	LastName  string  `json:"lastName"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type ReportPetBrief struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	SpeciesLabel   string     `json:"speciesLabel"`
	BreedLabel     string     `json:"breedLabel"`
	IsHidden       bool       `json:"isHidden"`
	Photos         []PetPhoto `json:"photos"`
	OwnerID        string     `json:"ownerID"`
	OwnerName      string     `json:"ownerName"`
	OwnerAvatarURL *string    `json:"ownerAvatarUrl,omitempty"`
}

type ReportPostBrief struct {
	ID              string  `json:"id"`
	Body            string  `json:"body"`
	ImageURL        *string `json:"imageUrl,omitempty"`
	AuthorID        string  `json:"authorID"`
	AuthorName      string  `json:"authorName"`
	AuthorAvatarURL *string `json:"authorAvatarUrl,omitempty"`
	LikeCount       int     `json:"likeCount"`
	CreatedAt       string  `json:"createdAt"`
}

type ReportDetail struct {
	ReportSummary
	ChatMessages []ReportMessage   `json:"chatMessages,omitempty"`
	ChatUsers    []ReportUserBrief `json:"chatUsers,omitempty"`
	Pet          *ReportPetBrief   `json:"pet,omitempty"`
	Post         *ReportPostBrief  `json:"post,omitempty"`
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

type DiaryEntry struct {
	ID        string  `json:"id"`
	PetID     string  `json:"petId"`
	UserID    string  `json:"userId"`
	Body      string  `json:"body"`
	ImageURL  *string `json:"imageUrl,omitempty"`
	Mood      string  `json:"mood"`
	CreatedAt string  `json:"createdAt"`
}

type HealthRecord struct {
	ID          string `json:"id"`
	PetID       string `json:"petId"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Date        string `json:"date"`
	Notes       string `json:"notes"`
	NextDueDate string `json:"nextDueDate,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

type WeightEntry struct {
	ID     string  `json:"id"`
	PetID  string  `json:"petId"`
	Weight float64 `json:"weight"`
	Unit   string  `json:"unit"`
	Date   string  `json:"date"`
}

type VetContact struct {
	ID          string `json:"id"`
	UserID      string `json:"userId"`
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	IsEmergency bool   `json:"isEmergency"`
}

type VetClinic struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Phone       string  `json:"phone"`
	Address     string  `json:"address"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	City        string  `json:"city"`
	IsEmergency bool    `json:"isEmergency"`
	Website     string  `json:"website,omitempty"`
	Hours       string  `json:"hours,omitempty"`
	Distance    float64 `json:"distance,omitempty"`
}

type FeedingSchedule struct {
	ID        string `json:"id"`
	PetID     string `json:"petId"`
	MealName  string `json:"mealName"`
	Time      string `json:"time"`
	FoodType  string `json:"foodType"`
	Amount    string `json:"amount"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"createdAt"`
}

type VenueReview struct {
	ID        string `json:"id"`
	VenueID   string `json:"venueId"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Rating    int    `json:"rating"`
	Comment   string `json:"comment"`
	CreatedAt string `json:"createdAt"`
}

type Playdate struct {
	ID          string   `json:"id"`
	OrganizerID string   `json:"organizerId"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Date        string   `json:"date"`
	Location    string   `json:"location"`
	MaxPets     int      `json:"maxPets"`
	Attendees   []string `json:"attendees"`
	CreatedAt   string   `json:"createdAt"`
}

type GroupMember struct {
	UserID    string `json:"userId"`
	FirstName string `json:"firstName"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

type CommunityGroup struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	PetType        string        `json:"petType"`
	MemberCount    int           `json:"memberCount"`
	ImageURL       string        `json:"imageUrl,omitempty"`
	ConversationID string        `json:"conversationId,omitempty"`
	IsMember       bool          `json:"isMember"`
	Members        []GroupMember `json:"members"`
	CreatedAt      string        `json:"createdAt"`
}

type LostPetAlert struct {
	ID               string  `json:"id"`
	PetID            string  `json:"petId"`
	UserID           string  `json:"userId"`
	Description      string  `json:"description"`
	LastSeenLocation string  `json:"lastSeenLocation"`
	LastSeenDate     string  `json:"lastSeenDate"`
	Status           string  `json:"status"`
	ContactPhone     string  `json:"contactPhone"`
	ImageURL         *string `json:"imageUrl,omitempty"`
	CreatedAt        string  `json:"createdAt"`
}

type Badge struct {
	ID          string `json:"id"`
	UserID      string `json:"userId"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
	EarnedAt    string `json:"earnedAt"`
}

type TrainingTipStep struct {
	Order       int    `json:"order"`
	Title       string `json:"title"`
	Description string `json:"description"`
	VideoURL    string `json:"videoUrl,omitempty"`
}

type TrainingTip struct {
	ID         string            `json:"id"`
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	Body       string            `json:"body"`
	Category   string            `json:"category"`
	PetType    string            `json:"petType"`
	Difficulty string            `json:"difficulty"`
	Steps      []TrainingTipStep `json:"steps"`
	VideoURL   string            `json:"videoUrl,omitempty"`
}

type PetSitter struct {
	ID          string   `json:"id"`
	UserID      string   `json:"userId"`
	Name        string   `json:"name"`
	Bio         string   `json:"bio"`
	HourlyRate  float64  `json:"hourlyRate"`
	Currency    string   `json:"currency"`
	Phone       string   `json:"phone"`
	Rating      float64  `json:"rating"`
	ReviewCount int      `json:"reviewCount"`
	Services    []string `json:"services"`
	CityLabel   string   `json:"cityLabel"`
	AvatarURL   *string  `json:"avatarUrl,omitempty"`
	Latitude    float64  `json:"latitude,omitempty"`
	Longitude   float64  `json:"longitude,omitempty"`
	Distance    float64  `json:"distance,omitempty"`
}

type WalkRouteCoord struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type WalkRoute struct {
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	Description   string           `json:"description"`
	Distance      string           `json:"distance"`
	EstimatedTime string           `json:"estimatedTime"`
	Difficulty    string           `json:"difficulty"`
	Coordinates   []WalkRouteCoord `json:"coordinates"`
	CityLabel     string           `json:"cityLabel"`
	CreatedAt     string           `json:"createdAt"`
}

type AdoptionListing struct {
	ID              string     `json:"id"`
	PetName         string     `json:"petName"`
	PetAge          int        `json:"petAge"`
	PetSpecies      string     `json:"petSpecies"`
	PetBreed        string     `json:"petBreed"`
	Gender          string     `json:"gender"`
	Description     string     `json:"description"`
	ContactPhone    string     `json:"contactPhone"`
	ContactEmail    string     `json:"contactEmail"`
	Location        string     `json:"location"`
	Photos          []PetPhoto `json:"photos"`
	CharacterTraits []string   `json:"characterTraits"`
	IsNeutered      bool       `json:"isNeutered"`
	ActivityLevel   int        `json:"activityLevel"`
	ImageURL        *string    `json:"imageUrl,omitempty"`
	Status          string     `json:"status"`
	UserID          string     `json:"userId"`
	UserName        string     `json:"userName,omitempty"`
	CreatedAt       string     `json:"createdAt"`
}

type PetAlbum struct {
	ID        string     `json:"id"`
	PetID     string     `json:"petId"`
	Title     string     `json:"title"`
	Photos    []PetPhoto `json:"photos"`
	CreatedAt string     `json:"createdAt"`
}

type PetMilestone struct {
	ID          string `json:"id"`
	PetID       string `json:"petId"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Description string `json:"description"`
	AchievedAt  string `json:"achievedAt"`
}

type PushToken struct {
	UserID    string `json:"userId"`
	Token     string `json:"token"`
	Platform  string `json:"platform"`
	CreatedAt string `json:"createdAt"`
}

type Notification struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Target    string `json:"target"`
	SentAt    string `json:"sentAt"`
	SentBy    string `json:"sentBy"`
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
