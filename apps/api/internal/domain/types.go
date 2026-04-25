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
	LastMessageAt         string `json:"lastMessageAt,omitempty"` // ISO 8601; empty = no messages yet
	UnreadCount           int    `json:"unreadCount"`
	CreatedAt             string `json:"createdAt"`
	Status                string `json:"status"`
	ConversationID        string `json:"conversationId"`
}

type Message struct {
	ID              string         `json:"id"`
	ConversationID  string         `json:"conversationId"`
	SenderProfileID string         `json:"senderProfileId"`
	SenderName      string         `json:"senderName"`
	SenderAvatarURL string         `json:"senderAvatarUrl,omitempty"`
	Type            string         `json:"type"`
	Body            string         `json:"body"`
	ImageURL        string         `json:"imageUrl,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
	CreatedAt       string         `json:"createdAt"`
	IsMine          bool           `json:"isMine"`
	ReadAt          *string        `json:"readAt,omitempty"`
	DeletedAt       *string        `json:"deletedAt,omitempty"`
	DeletedBy       string         `json:"deletedBy,omitempty"`
	PinnedAt        *string        `json:"pinnedAt,omitempty"`
	PinnedBy        string         `json:"pinnedBy,omitempty"`
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
	ID                    string         `json:"id"`
	MatchID               string         `json:"matchId"`
	Title                 string         `json:"title"`
	Subtitle              string         `json:"subtitle"`
	UnreadCount           int            `json:"unreadCount"`
	LastMessageAt         string         `json:"lastMessageAt"`
	Messages              []Message      `json:"messages"`
	UserIDs               []string       `json:"userIds"`
	MatchPetPairs         []MatchPetPair `json:"matchPetPairs"`
	// v0.11.8 — the other user's profile avatar so the conversation list
	// and chat header can show the OWNER's face, not the pet's.
	MatchedOwnerAvatarURL string         `json:"matchedOwnerAvatarUrl,omitempty"`
}

type TaxonomyItem struct {
	ID           string            `json:"id"`
	Label        string            `json:"label"`
	Slug         string            `json:"slug"`
	SpeciesID    *string           `json:"speciesId,omitempty"`
	IsActive     bool              `json:"isActive"`
	Icon         string            `json:"icon,omitempty"`
	Color        string            `json:"color,omitempty"`
	Translations map[string]string `json:"translations,omitempty"`
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
	Updated      bool   `json:"updated,omitempty"`
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

// PetHealthProfile is the at-a-glance medical card used by the Care tab.
// Lives on its own row keyed by pet_id so adding more fields later (microchip,
// insurance, etc.) doesn't require touching every Pet SELECT in pgstore.
type PetHealthProfile struct {
	PetID                string   `json:"petId"`
	Allergies            []string `json:"allergies"`
	DietaryRestrictions  []string `json:"dietaryRestrictions"`
	EmergencyNotes       string   `json:"emergencyNotes"`
	UpdatedAt            string   `json:"updatedAt"`
}

// PetMedication is a recurring medication schedule. Server pushes a
// reminder when each scheduled dose comes due in the medication's stored
// timezone; tapping the push (or "Mark given" in-app) updates LastGivenAt.
type PetMedication struct {
	ID          string `json:"id"`
	PetID       string `json:"petId"`
	Name        string `json:"name"`
	Dosage      string `json:"dosage"`
	Notes       string `json:"notes,omitempty"`
	TimeOfDay   string `json:"timeOfDay"`             // "HH:MM" 24h
	DaysOfWeek  []int  `json:"daysOfWeek"`            // 0=Sunday..6=Saturday
	Timezone    string `json:"timezone"`              // IANA, e.g. "Europe/Istanbul"
	StartDate   string `json:"startDate"`             // ISO date (YYYY-MM-DD)
	EndDate     string `json:"endDate,omitempty"`     // ISO date or empty (open-ended)
	LastGivenAt string `json:"lastGivenAt,omitempty"` // ISO timestamp
	Active      bool   `json:"active"`
	CreatedAt   string `json:"createdAt"`
}

// BreedCareGuide is admin-curated, breed-specific (or species-wide) care
// information surfaced in the mobile Care tab. The mobile app looks up by
// breed_id first, falls back to the species-wide row (BreedID="") when the
// breed has no dedicated entry — so admins don't have to write 200 rows for
// "all dogs".
type BreedCareGuide struct {
	ID           string `json:"id"`
	SpeciesID    string `json:"speciesId"`
	SpeciesLabel string `json:"speciesLabel"`
	BreedID      string `json:"breedId,omitempty"`
	BreedLabel   string `json:"breedLabel,omitempty"`
	Title        string `json:"title"`
	Summary      string `json:"summary,omitempty"`
	Body         string `json:"body"`             // long-form, line breaks preserved
	HeroImageURL string `json:"heroImageUrl,omitempty"`
	UpdatedAt    string `json:"updatedAt"`
	CreatedAt    string `json:"createdAt"`
}

// FirstAidTopic is one section of the offline-readable First Aid handbook
// (choking, poisoning, heatstroke, etc.). Mobile downloads the full set on
// first open and caches it in AsyncStorage so it works without network when
// it matters most.
type FirstAidTopic struct {
	ID           string `json:"id"`
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Severity     string `json:"severity"` // emergency | urgent | info
	Summary      string `json:"summary,omitempty"`
	Body         string `json:"body"`
	DisplayOrder int    `json:"displayOrder"`
	UpdatedAt    string `json:"updatedAt"`
	CreatedAt    string `json:"createdAt"`
}

// PetDocument is a saved certificate / record (vaccine card, microchip
// paperwork, insurance card, etc.) attached to a pet. The actual file
// lives in R2; this row keeps the metadata + url.
type PetDocument struct {
	ID        string `json:"id"`
	PetID     string `json:"petId"`
	Kind      string `json:"kind"`            // vaccine | medical | insurance | other
	Title     string `json:"title"`
	FileURL   string `json:"fileUrl"`
	FileKind  string `json:"fileKind"`        // image | pdf
	ExpiresAt string `json:"expiresAt,omitempty"`
	Notes     string `json:"notes,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// FoodItem is one entry in the food database used by the Care → Calorie
// Counter. Public items (IsPublic=true) are visible to every user; private
// items belong to the creating user only.
type FoodItem struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Brand         string  `json:"brand,omitempty"`
	Kind          string  `json:"kind"`              // dry | wet | treat | other
	SpeciesLabel  string  `json:"speciesLabel,omitempty"` // dog | cat | "" = any
	KcalPer100g   float64 `json:"kcalPer100g"`
	IsPublic      bool    `json:"isPublic"`
	CreatedByUser string  `json:"createdByUser,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

// MealLog is one feeding event: which food, how many grams, when.
// Either FoodItemID or CustomName must be set; Kcal is computed at write
// time so historical rows stay correct even if a food item later gets edited.
type MealLog struct {
	ID         string  `json:"id"`
	PetID      string  `json:"petId"`
	FoodItemID string  `json:"foodItemId,omitempty"`
	CustomName string  `json:"customName,omitempty"`
	Grams      float64 `json:"grams"`
	Kcal       float64 `json:"kcal"`
	Notes      string  `json:"notes,omitempty"`
	EatenAt    string  `json:"eatenAt"`
	CreatedAt  string  `json:"createdAt"`
}

// DailyMealSummary aggregates a calendar day's meals. Returned alongside
// the meal list so the screen can show "today: 412 kcal" without doing the
// math client-side.
type DailyMealSummary struct {
	Date       string  `json:"date"` // ISO YYYY-MM-DD
	TotalKcal  float64 `json:"totalKcal"`
	TotalGrams float64 `json:"totalGrams"`
	MealCount  int     `json:"mealCount"`
}

// WeeklyHealthSummary is the aggregate the server sends as a Sunday push.
// Only delivered if at least one count is non-zero — silent weeks stay silent.
type WeeklyHealthSummary struct {
	WeekStart        string `json:"weekStart"` // ISO date for the Monday this summary covers
	WeightEntries    int    `json:"weightEntries"`
	HealthRecords    int    `json:"healthRecords"`
	SymptomLogs      int    `json:"symptomLogs"`
	DiaryEntries     int    `json:"diaryEntries"`
	MedicationsGiven int    `json:"medicationsGiven"`
	HasActivity      bool   `json:"hasActivity"`
}

// SymptomLog is one observation in the Care → Symptom Log timeline.
// Distinct from Diary: categorised, severity-graded, photo-attachable —
// designed to be exported as a vet-ready PDF later.
type SymptomLog struct {
	ID           string   `json:"id"`
	PetID        string   `json:"petId"`
	Categories   []string `json:"categories"`             // e.g. ["vomiting","lethargy"]
	Severity     int      `json:"severity"`               // 1-5
	DurationHours int     `json:"durationHours,omitempty"`
	Notes        string   `json:"notes"`
	PhotoURL     string   `json:"photoUrl,omitempty"`
	OccurredAt   string   `json:"occurredAt"`             // ISO 8601
	CreatedAt    string   `json:"createdAt"`
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

type VenueRatingDistribution struct {
	One   int `json:"1"`
	Two   int `json:"2"`
	Three int `json:"3"`
	Four  int `json:"4"`
	Five  int `json:"5"`
}

type VenueStats struct {
	CheckInCount        int                     `json:"checkInCount"`
	UniqueVisitorCount  int                     `json:"uniqueVisitorCount"`
	ActiveCheckInCount  int                     `json:"activeCheckInCount"`
	AvgRating           float64                 `json:"avgRating"`
	ReviewCount         int                     `json:"reviewCount"`
	RatingDistribution  VenueRatingDistribution `json:"ratingDistribution"`
}

type VenueDetail struct {
	ExploreVenue
	Stats      VenueStats `json:"stats"`
	DistanceKm *float64   `json:"distanceKm,omitempty"`
}

type VenuePhotoFeedItem struct {
	PostID       string `json:"postId"`
	ImageURL     string `json:"imageUrl"`
	AuthorUserID string `json:"authorUserId"`
	AuthorName   string `json:"authorName"`
	CreatedAt    string `json:"createdAt"`
}

type ReviewEligibility struct {
	Eligible bool   `json:"eligible"`
	Reason   string `json:"reason,omitempty"`
}

type Playdate struct {
	ID             string             `json:"id"`
	OrganizerID    string             `json:"organizerId"`
	Title          string             `json:"title"`
	Description    string             `json:"description"`
	Date           string             `json:"date"`
	Location       string             `json:"location"`
	MaxPets        int                `json:"maxPets"`
	Attendees      []string           `json:"attendees"`
	CreatedAt      string             `json:"createdAt"`
	Latitude       float64            `json:"latitude,omitempty"`
	Longitude      float64            `json:"longitude,omitempty"`
	CityLabel      string             `json:"cityLabel,omitempty"`
	// v0.11.1 — optional link back to the Venue the wizard picked. Lets the
	// Discover map highlight venues that currently host a playdate, and lets
	// the venue detail sheet list active playdates directly.
	VenueID        string             `json:"venueId,omitempty"`
	CoverImageURL  string             `json:"coverImageUrl,omitempty"`
	Distance       float64            `json:"distance,omitempty"`
	IsAttending    bool               `json:"isAttending"`
	Rules          []string           `json:"rules"`
	Status         string             `json:"status"` // "active" | "cancelled"
	CancelledAt    string             `json:"cancelledAt,omitempty"`
	ConversationID string             `json:"conversationId,omitempty"`
	Waitlist       []string           `json:"waitlist"`
	AttendeesInfo  []PlaydateAttendee `json:"attendeesInfo,omitempty"`
	HostInfo       *PlaydateHost      `json:"hostInfo,omitempty"`
	IsOrganizer    bool               `json:"isOrganizer"`
	IsWaitlisted   bool               `json:"isWaitlisted"`
	SlotsUsed       int                `json:"slotsUsed"`              // pet-level slot count
	MyPetIds        []string           `json:"myPetIds,omitempty"`     // pets the caller has joined with
	MyWaitlistPets  []string           `json:"myWaitlistPets,omitempty"` // pets the caller has in the waitlist
	Visibility      string             `json:"visibility"`             // "public" | "private"
	// ShareToken is a random per-playdate string the host can paste into a
	// WhatsApp/SMS link to grant access to a private playdate. Only exposed
	// to the host in the API response — non-host callers see "" to avoid
	// leaking the token through the detail payload.
	ShareToken      string             `json:"shareToken,omitempty"`
	CreatorPetIds   []string           `json:"creatorPetIds,omitempty"` // input-only: pets the host brings when creating
	MyInviteStatus   string             `json:"myInviteStatus,omitempty"` // "pending" | "accepted" | "declined"
	MyInviteID       string             `json:"myInviteId,omitempty"`
	PendingInvites   int                `json:"pendingInvites"`         // count of still-pending invites (host only)
	MyChatMuted      bool               `json:"myChatMuted"`            // caller is host-muted in this chat
	MyConvMuted      bool               `json:"myConvMuted"`            // caller has silenced push for this conversation
	MyConvMutedUntil *string            `json:"myConvMutedUntil,omitempty"` // v0.11.5: ISO 8601 expiry (nil = forever)
	ChatMutedUserIDs []string           `json:"chatMutedUserIds,omitempty"` // host-only: list of currently-muted attendees
	Locked           bool               `json:"locked"`                 // host "soft close" — blocks new joins; not surfaced as a user badge
}

type PlaydateInvite struct {
	ID             string `json:"id"`
	PlaydateID     string `json:"playdateId"`
	HostUserID     string `json:"hostUserId"`
	InvitedUserID  string `json:"invitedUserId"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	RespondedAt    string `json:"respondedAt,omitempty"`
	// Denormalised hints so clients can render the inbox without round-trips.
	PlaydateTitle  string `json:"playdateTitle,omitempty"`
	PlaydateDate   string `json:"playdateDate,omitempty"`
	PlaydateCity   string `json:"playdateCity,omitempty"`
	HostFirstName  string `json:"hostFirstName,omitempty"`
	HostAvatarURL  string `json:"hostAvatarUrl,omitempty"`
	InvitedFirstName string `json:"invitedFirstName,omitempty"`
	InvitedAvatarURL string `json:"invitedAvatarUrl,omitempty"`
}

type InvitableUser struct {
	UserID    string `json:"userId"`
	FirstName string `json:"firstName"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	// Short label explaining where you know them from (e.g. "Match", "Group").
	ContextLabel string `json:"contextLabel,omitempty"`
}

type PlaydateHost struct {
	UserID     string `json:"userId"`
	FirstName  string `json:"firstName"`
	AvatarURL  string `json:"avatarUrl,omitempty"`
	IsVerified bool   `json:"isVerified"`
}

type PlaydateAttendee struct {
	UserID    string      `json:"userId"`
	FirstName string      `json:"firstName"`
	AvatarURL string      `json:"avatarUrl,omitempty"`
	Pets      []MemberPet `json:"pets"`
}

type MemberPet struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	PhotoURL string `json:"photoUrl,omitempty"`
}

type GroupMember struct {
	UserID     string      `json:"userId"`
	FirstName  string      `json:"firstName"`
	AvatarURL  string      `json:"avatarUrl,omitempty"`
	Pets       []MemberPet `json:"pets"`
	IsMuted    bool        `json:"isMuted"`
	MutedUntil *string     `json:"mutedUntil,omitempty"`
}

type CommunityGroup struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	PetType        string        `json:"petType"`
	Category       string        `json:"category,omitempty"`
	MemberCount    int           `json:"memberCount"`
	ImageURL       string        `json:"imageUrl,omitempty"`
	ConversationID string        `json:"conversationId,omitempty"`
	IsMember       bool          `json:"isMember"`
	Members        []GroupMember `json:"members"`
	Latitude       float64       `json:"latitude,omitempty"`
	Longitude      float64       `json:"longitude,omitempty"`
	CityLabel      string        `json:"cityLabel,omitempty"`
	Code           string        `json:"code,omitempty"`
	IsPrivate      bool          `json:"isPrivate"`
	Distance       float64       `json:"distance,omitempty"`
	Hashtags       []string      `json:"hashtags"`
	Rules          []string      `json:"rules"`
	OwnerUserID    string        `json:"ownerUserId,omitempty"`
	IsOwner        bool          `json:"isOwner"`
	IsAdmin        bool          `json:"isAdmin"`
	Muted          bool          `json:"muted"`
	MutedUntil     *string       `json:"mutedUntil,omitempty"`
	AdminUserIDs   []string      `json:"adminUserIds,omitempty"`
	// MyConvMuted is the caller's personal push-notification mute toggle for
	// this group's conversation. Different from the host-level `Muted` which
	// silences outgoing messages — this one silences incoming push.
	MyConvMuted      bool    `json:"myConvMuted"`
	MyConvMutedUntil *string `json:"myConvMutedUntil,omitempty"`
	CreatedAt        string  `json:"createdAt"`
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

// Shelter is a shelter-organisation account. Can be created by an admin
// directly (legacy flow, VerifiedAt set immediately) or via an approved
// ShelterApplication (wizard flow, VerifiedAt set at approval time).
type Shelter struct {
	ID                 string  `json:"id"`
	Email              string  `json:"email"`
	Name               string  `json:"name"`
	About              string  `json:"about"`
	Phone              string  `json:"phone"`
	Website            string  `json:"website"`
	LogoURL            *string `json:"logoUrl,omitempty"`
	HeroURL            *string `json:"heroUrl,omitempty"`
	Address            string  `json:"address"`
	CityLabel          string  `json:"cityLabel"`
	Latitude           float64 `json:"latitude"`
	Longitude          float64 `json:"longitude"`
	Hours              string  `json:"hours"`
	Status             string  `json:"status"`
	MustChangePassword bool    `json:"mustChangePassword"`
	CreatedAt          string  `json:"createdAt"`
	LastLoginAt        string  `json:"lastLoginAt,omitempty"`
	VerifiedAt         string  `json:"verifiedAt,omitempty"`
	// OperatingCountry is the shelter's operating-region country (ISO).
	// Populated from the approved ShelterApplication; admin-created
	// shelters have this derived from CityLabel or left empty. Used by
	// compliance rules (breed blocks, microchip requirement).
	OperatingCountry string `json:"operatingCountry,omitempty"`
	// Public profile (v0.21) — only exposed when VerifiedAt is set.
	// Slug is assigned on approval and permanent thereafter; the other
	// fields are shelter-editable via PUT /shelter/v1/me.
	Slug                string `json:"slug,omitempty"`
	AdoptionProcess     string `json:"adoptionProcess,omitempty"`
	DonationURL         string `json:"donationUrl,omitempty"`
	ShowRecentlyAdopted bool   `json:"showRecentlyAdopted"`
	SpeciesFocus        []string `json:"speciesFocus,omitempty"`
	// Discovery-home curated rail flag (v0.24). Admin-editable only.
	IsFeatured          bool   `json:"isFeatured"`
}

// ShelterApplication is a public onboarding submission from a would-be
// shelter. Lands in an admin review queue; on approval a full Shelter
// row is minted and `CreatedShelterID` is set.
type ShelterApplication struct {
	ID        string `json:"id"`
	Status    string `json:"status"` // submitted|under_review|approved|rejected
	SubmittedAt string `json:"submittedAt"`
	ReviewedAt  string `json:"reviewedAt,omitempty"`
	ReviewedBy  string `json:"reviewedBy,omitempty"`
	// SLADeadline = SubmittedAt + 48h (RFC3339). Pre-computed on insert
	// so the admin queue can sort/colour without re-deriving.
	SLADeadline string `json:"slaDeadline"`

	// Entity
	EntityType                 string `json:"entityType"`
	Country                    string `json:"country"`
	RegistrationNumber         string `json:"registrationNumber"`
	RegistrationCertificateURL string `json:"registrationCertificateUrl"`

	// Organisation
	OrgName                string   `json:"orgName"`
	OrgAddress             string   `json:"orgAddress,omitempty"`
	OperatingRegionCountry string   `json:"operatingRegionCountry"`
	OperatingRegionCity    string   `json:"operatingRegionCity"`
	SpeciesFocus           []string `json:"speciesFocus"`
	DonationURL            string   `json:"donationUrl,omitempty"`

	// Primary contact
	PrimaryContactName  string `json:"primaryContactName"`
	PrimaryContactEmail string `json:"primaryContactEmail"`
	PrimaryContactPhone string `json:"primaryContactPhone,omitempty"`

	// Decision
	RejectionReasonCode string `json:"rejectionReasonCode,omitempty"`
	RejectionReasonNote string `json:"rejectionReasonNote,omitempty"`
	CreatedShelterID    string `json:"createdShelterId,omitempty"`

	// Opaque public-lookup token. Included in submit responses so the
	// applicant can poll /v1/public/shelter-applications/{token}. NEVER
	// included in admin list responses that go to unrelated parties.
	AccessToken string `json:"accessToken,omitempty"`
}

// ShelterEntityType is a country-specific legal entity classification
// the wizard offers as its first choice.
type ShelterEntityType struct {
	Slug    string `json:"slug"`    // stable id, e.g. "tr_dernek"
	Label   string `json:"label"`   // human-readable, e.g. "Dernek"
	Country string `json:"country"` // ISO, e.g. "TR"
}

// ── Shelter team accounts (v0.15) ───────────────────────────────
// Multi-user access per shelter with 3 roles. Each shelter gets one
// auto-created "admin" member on creation (or back-filled from the
// single-user row). Future logins bind to a ShelterMember, not the
// raw Shelter row.

// ShelterMember is one person with access to a shelter, with a role
// that gates write operations. Authentication lookups hit this
// table — the `shelters.email`/`shelters.password_hash` columns are
// retained for back-compat but no longer read at login time.
type ShelterMember struct {
	ID                 string `json:"id"`
	ShelterID          string `json:"shelterId"`
	Email              string `json:"email"`
	Name               string `json:"name,omitempty"`
	Role               string `json:"role"`   // admin|editor|viewer
	Status             string `json:"status"` // active|pending|revoked
	MustChangePassword bool   `json:"mustChangePassword"`
	InvitedByMemberID  string `json:"invitedByMemberId,omitempty"`
	InvitedAt          string `json:"invitedAt,omitempty"`
	JoinedAt           string `json:"joinedAt"`
	LastLoginAt        string `json:"lastLoginAt,omitempty"`
}

// ShelterMemberInvite is a one-time opaque token that lets an
// invitee accept and create a ShelterMember in the target shelter.
// `Token` is populated on create/resend responses only — list
// endpoints scrub it so admins can't snoop other invitees' links.
type ShelterMemberInvite struct {
	ID                string `json:"id"`
	ShelterID         string `json:"shelterId"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	InvitedByMemberID string `json:"invitedByMemberId,omitempty"`
	Token             string `json:"token,omitempty"`
	CreatedAt         string `json:"createdAt"`
	ExpiresAt         string `json:"expiresAt"`
	AcceptedAt        string `json:"acceptedAt,omitempty"`
	AcceptedMemberID  string `json:"acceptedMemberId,omitempty"`
	RevokedAt         string `json:"revokedAt,omitempty"`
}

// ShelterAuditEntry is one append-only record of a state change
// inside a shelter. Actor fields are denormalised at write time so
// revoked/renamed members still render correctly in history.
type ShelterAuditEntry struct {
	ID            string         `json:"id"`
	ShelterID     string         `json:"shelterId"`
	ActorMemberID string         `json:"actorMemberId,omitempty"`
	ActorName     string         `json:"actorName"`
	ActorEmail    string         `json:"actorEmail"`
	Action        string         `json:"action"`
	TargetType    string         `json:"targetType,omitempty"`
	TargetID      string         `json:"targetId,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	CreatedAt     string         `json:"createdAt"`
}

// VaccineRecord is a single vaccination entry on a shelter pet.
type VaccineRecord struct {
	Name  string `json:"name"`
	Date  string `json:"date"`
	Notes string `json:"notes,omitempty"`
}

// ShelterPet is a pet owned by a shelter and listed for adoption.
// Lifecycle: available → reserved → adopted. `hidden` takes it off
// the public feed without deleting.
type ShelterPet struct {
	ID            string          `json:"id"`
	ShelterID     string          `json:"shelterId"`
	ShelterName   string          `json:"shelterName,omitempty"`
	ShelterCity   string          `json:"shelterCity,omitempty"`
	Name          string          `json:"name"`
	Species       string          `json:"species"`
	Breed         string          `json:"breed"`
	Sex           string          `json:"sex"`
	Size          string          `json:"size"`
	Color         string          `json:"color"`
	BirthDate     string          `json:"birthDate,omitempty"`
	AgeMonths     *int            `json:"ageMonths,omitempty"`
	Description   string          `json:"description"`
	Photos        []string        `json:"photos"`
	Vaccines      []VaccineRecord `json:"vaccines"`
	IsNeutered    bool            `json:"isNeutered"`
	MicrochipID   string          `json:"microchipId,omitempty"`
	SpecialNeeds  string          `json:"specialNeeds,omitempty"`
	CharacterTags []string        `json:"characterTags"`
	IntakeDate    string          `json:"intakeDate,omitempty"`
	Status        string          `json:"status"`
	// ListingState is the DSA-aligned moderation/publishing lifecycle,
	// orthogonal to availability `Status`. One of: draft, pending_review,
	// published, paused, adopted, archived, rejected. See
	// AllowedListingTransitions for legal moves.
	ListingState       string `json:"listingState"`
	LastRejectionCode  string `json:"lastRejectionCode,omitempty"`
	LastRejectionNote  string `json:"lastRejectionNote,omitempty"`
	AutoFlagReasons    []string `json:"autoFlagReasons,omitempty"`
	DeletedAt          string `json:"deletedAt,omitempty"`
	AdopterName        string `json:"adopterName,omitempty"`
	AdoptionDate       string `json:"adoptionDate,omitempty"`
	AdoptionNotes      string `json:"adoptionNotes,omitempty"`
	ViewCount          int    `json:"viewCount"`
	IsUrgent           bool   `json:"isUrgent"`
	// PublishedAt is the earliest `published` transition time — used
	// client-side to render the "New" badge (< 7 days). Populated by
	// the public feed query; empty elsewhere.
	PublishedAt        string `json:"publishedAt,omitempty"`
	// DistanceKm is nil unless the caller passed a lat/lng.
	DistanceKm         *float64 `json:"distanceKm,omitempty"`
	// ShelterVerified mirrors the shelter's verifiedAt for card rendering
	// without requiring a separate fetch. Public feed only.
	ShelterVerified    bool   `json:"shelterVerified,omitempty"`
	CreatedAt     string          `json:"createdAt"`
	UpdatedAt     string          `json:"updatedAt"`
}

// Listing lifecycle (DSA Art. 16/17/22/23). Kept as constants so server,
// stores and contracts speak the same vocabulary. Public feeds must only
// expose `ListingStatePublished` rows.
const (
	ListingStateDraft         = "draft"
	ListingStatePendingReview = "pending_review"
	ListingStatePublished     = "published"
	ListingStatePaused        = "paused"
	ListingStateAdopted       = "adopted"
	ListingStateArchived      = "archived"
	ListingStateRejected      = "rejected"
)

// ListingTransitionActor is the role recorded against each state change
// in `listing_state_transitions`. "system" covers auto-flag + sweeps;
// "shelter" covers shelter-initiated moves; "admin" covers moderator
// decisions.
const (
	ListingActorShelter = "shelter"
	ListingActorAdmin   = "admin"
	ListingActorSystem  = "system"
)

// AllowedListingTransitions enumerates every legal (fromState, actor) →
// [toStates...] move. The server validates every transition against this
// map and rejects anything else with a 422. Shelter and admin sets
// intentionally diverge — e.g. only admins can reject; shelters cannot
// leave `rejected` except by moving back to `draft`.
var AllowedListingTransitions = map[string]map[string][]string{
	ListingStateDraft: {
		ListingActorShelter: {ListingStatePendingReview, ListingStatePublished},
		ListingActorSystem:  {ListingStatePendingReview, ListingStatePublished},
	},
	ListingStatePendingReview: {
		ListingActorAdmin: {ListingStatePublished, ListingStateRejected},
	},
	ListingStatePublished: {
		ListingActorShelter: {ListingStatePaused, ListingStateAdopted, ListingStateArchived},
		ListingActorAdmin:   {ListingStatePaused, ListingStateRejected, ListingStateArchived},
	},
	ListingStatePaused: {
		ListingActorShelter: {ListingStatePublished, ListingStateArchived},
		ListingActorAdmin:   {ListingStatePublished, ListingStateArchived, ListingStateRejected},
	},
	ListingStateAdopted: {
		ListingActorShelter: {ListingStateArchived},
		ListingActorAdmin:   {ListingStateArchived},
	},
	ListingStateRejected: {
		ListingActorShelter: {ListingStateDraft},
	},
}

// ListingTransitionAllowed reports whether an actor may move a listing
// from→to. Unknown states or actors are treated as disallowed.
func ListingTransitionAllowed(from, to, actor string) bool {
	targets, ok := AllowedListingTransitions[from][actor]
	if !ok {
		return false
	}
	for _, t := range targets {
		if t == to {
			return true
		}
	}
	return false
}

// ListingStateTransition is one append-only row in the listing audit
// trail. Covers every move — auto-flag, approve, reject, pause, adopt,
// archive, restart — and stores the actor identity frozen at write time
// so renames don't rewrite history. Per DSA Art. 17 the `reason_code` +
// `note` are the machine-readable and human-readable parts of the
// statement of reasons.
type ListingStateTransition struct {
	ID         string         `json:"id"`
	ListingID  string         `json:"listingId"`
	ShelterID  string         `json:"shelterId"`
	ActorID    string         `json:"actorId,omitempty"`
	ActorName  string         `json:"actorName,omitempty"`
	ActorRole  string         `json:"actorRole"` // shelter|admin|system
	PrevState  string         `json:"prevState"`
	NewState   string         `json:"newState"`
	ReasonCode string         `json:"reasonCode,omitempty"`
	Note       string         `json:"note,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	CreatedAt  string         `json:"createdAt"`
}

// ListingReport is a DSA Art. 16 notice-and-action entry. Trusted
// flaggers (Art. 22) surface at the top of the queue. Resolution is
// one of: dismiss|warn|remove|suspend.
type ListingReport struct {
	ID              string `json:"id"`
	ListingID       string `json:"listingId"`
	ShelterID       string `json:"shelterId"`
	ReporterID      string `json:"reporterId,omitempty"`
	ReporterName    string `json:"reporterName,omitempty"`
	TrustedFlagger  bool   `json:"trustedFlagger"`
	Reason          string `json:"reason"`
	Description     string `json:"description,omitempty"`
	Status          string `json:"status"` // open|dismissed|warned|removed|suspended
	CreatedAt       string `json:"createdAt"`
	ResolvedAt      string `json:"resolvedAt,omitempty"`
	ResolvedBy      string `json:"resolvedBy,omitempty"`
	Resolution      string `json:"resolution,omitempty"`
	ResolutionNote  string `json:"resolutionNote,omitempty"`
	// Denormalised listing preview fields for the admin queue UI.
	ListingName        string `json:"listingName,omitempty"`
	ListingPhotoURL    string `json:"listingPhotoUrl,omitempty"`
	ListingCurrentState string `json:"listingCurrentState,omitempty"`
	ShelterName        string `json:"shelterName,omitempty"`
}

// ListingStatementOfReasons is the persisted DSA Art. 17 statement
// generated on every listing removal (rejection or report-driven
// takedown). All five Art. 17 fields are captured and human-readable;
// the `redress_options` text points to the appeal email.
type ListingStatementOfReasons struct {
	ID                 string `json:"id"`
	ListingID          string `json:"listingId"`
	ShelterID          string `json:"shelterId"`
	ContentDescription string `json:"contentDescription"`
	LegalGround        string `json:"legalGround"`
	FactsReliedOn      string `json:"factsReliedOn"`
	Scope              string `json:"scope"`
	RedressOptions     string `json:"redressOptions"`
	IssuedAt           string `json:"issuedAt"`
	IssuedBy           string `json:"issuedBy,omitempty"`
}

// ListingStrikeSummary powers the repeat-offender (DSA Art. 23) panel
// on the admin shelter detail page. `Count` is rejections within the
// last 90 days; `Rejections` is the list for drill-down.
type ListingStrikeSummary struct {
	ShelterID        string                   `json:"shelterId"`
	Count            int                      `json:"count"`
	WindowDays       int                      `json:"windowDays"`
	Threshold        int                      `json:"threshold"`
	Triggered        bool                     `json:"triggered"`
	Rejections       []ListingStateTransition `json:"rejections"`
}

// AdoptionApplication is a user's request to adopt a specific shelter pet.
type AdoptionApplication struct {
	ID              string  `json:"id"`
	PetID           string  `json:"petId"`
	PetName         string  `json:"petName,omitempty"`
	PetPhoto        string  `json:"petPhoto,omitempty"`
	ShelterID       string  `json:"shelterId"`
	ShelterName     string  `json:"shelterName,omitempty"`
	UserID          string  `json:"userId"`
	UserName        string  `json:"userName"`
	UserAvatarURL   *string `json:"userAvatarUrl,omitempty"`
	HousingType     string  `json:"housingType"`
	HasOtherPets    bool    `json:"hasOtherPets"`
	OtherPetsDetail string  `json:"otherPetsDetail"`
	Experience      string  `json:"experience"`
	Message         string  `json:"message"`
	Status          string  `json:"status"`
	RejectionReason string  `json:"rejectionReason,omitempty"`
	ConversationID  *string `json:"conversationId,omitempty"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
}

// ListingPerformanceRow is a single row of the shelter analytics
// table: every non-soft-deleted listing the shelter owns, enriched
// with view / save / application / adoption counters for the selected
// date range.
type ListingPerformanceRow struct {
	ListingID    string `json:"listingId"`
	Name         string `json:"name"`
	Species      string `json:"species"`
	ListingState string `json:"listingState"`
	Views        int    `json:"views"`
	Saves        int    `json:"saves"`
	Applications int    `json:"applications"`
	Adoptions    int    `json:"adoptions"`
	DaysListed   int    `json:"daysListed"`
}

// ApplicationFunnel is the four-stage adoption-funnel snapshot used
// by the analytics page. Stages are strict subsets so each count is
// ≤ the one above it.
type ApplicationFunnel struct {
	Submitted   int `json:"submitted"`
	UnderReview int `json:"underReview"`
	Approved    int `json:"approved"`
	Adopted     int `json:"adopted"`
}

// AnalyticsOverview is the header payload for the shelter analytics
// dashboard — aggregate stats + the top-listing highlight over the
// requested date range.
type AnalyticsOverview struct {
	Range              string  `json:"range"`
	ActiveListings     int     `json:"activeListings"`
	AdoptionsThisMonth int     `json:"adoptionsThisMonth"`
	AdoptionsThisYear  int     `json:"adoptionsThisYear"`
	AvgDaysToAdoption  float64 `json:"avgDaysToAdoption"`
	AvgSampleSize      int     `json:"avgSampleSize"`
	TopListing         *struct {
		ID               string `json:"id"`
		Name             string `json:"name"`
		ApplicationCount int    `json:"applicationCount"`
	} `json:"topListing,omitempty"`
}

// ShelterStats powers the shelter dashboard and admin list rows.
type ShelterStats struct {
	TotalPets         int `json:"totalPets"`
	AvailablePets     int `json:"availablePets"`
	ReservedPets      int `json:"reservedPets"`
	AdoptedPets       int `json:"adoptedPets"`
	PendingApps       int `json:"pendingApplications"`
	ActiveChats       int `json:"activeChats"`
	TotalApplications int `json:"totalApplications"`
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

// NotificationPreferences captures per-user opt-outs for push fan-out.
// Missing row = all categories enabled (the default for legacy users).
// Categories mirror the mobile settings page: matches (new mutual match),
// messages (DM / group / playdate chat), playdates (invites + detail changes
// + 1h reminder), groups (new member, moderator action).
type NotificationPreferences struct {
	Matches   bool `json:"matches"`
	Messages  bool `json:"messages"`
	Playdates bool `json:"playdates"`
	Groups    bool `json:"groups"`
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
