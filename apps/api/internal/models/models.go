package models

import (
	"time"
)

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Phone     *string   `json:"phone,omitempty"`
	Gender    *string   `json:"gender,omitempty"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	Role      string    `json:"role"`
	IsBanned  bool      `json:"is_banned"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserCreate struct {
	Email     string  `json:"email" binding:"required,email"`
	Password  string  `json:"password" binding:"required,min=6"`
	FirstName string  `json:"first_name" binding:"required,min=1"`
	LastName  string  `json:"last_name" binding:"required,min=1"`
	Phone     *string `json:"phone,omitempty"`
	Gender    *string `json:"gender,omitempty"`
}

type UserUpdate struct {
	FirstName *string `json:"first_name,omitempty" binding:"omitempty,min=1"`
	LastName  *string `json:"last_name,omitempty" binding:"omitempty,min=1"`
	Phone     *string `json:"phone,omitempty"`
	Gender    *string `json:"gender,omitempty"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

type UserLogin struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         User   `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type Pet struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	Name          string    `json:"name"`
	SpeciesID     string    `json:"species_id"`
	BreedID       *string   `json:"breed_id,omitempty"`
	Age           *int      `json:"age,omitempty"`
	ActivityLevel int       `json:"activity_level"`
	Neutered      bool      `json:"neutered"`
	AvatarURL     *string   `json:"avatar_url,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type PetCreate struct {
	Name             string   `json:"name" binding:"required,min=1"`
	SpeciesID        string   `json:"species_id" binding:"required,uuid"`
	BreedID          *string  `json:"breed_id,omitempty" binding:"omitempty,uuid"`
	Age              *int     `json:"age,omitempty" binding:"omitempty,gte=0,lte=30"`
	ActivityLevel    int      `json:"activity_level" binding:"required,min=1,max=5"`
	Neutered         bool     `json:"neutered"`
	AvatarURL        *string  `json:"avatar_url,omitempty"`
	CompatibilityIDs []string `json:"compatibility_ids,omitempty"`
	HobbyIDs         []string `json:"hobby_ids,omitempty"`
}

type PetUpdate struct {
	Name             *string  `json:"name,omitempty" binding:"omitempty,min=1"`
	SpeciesID        *string  `json:"species_id,omitempty" binding:"omitempty,uuid"`
	BreedID          *string  `json:"breed_id,omitempty" binding:"omitempty,uuid"`
	Age              *int     `json:"age,omitempty" binding:"omitempty,gte=0,lte=30"`
	ActivityLevel    *int     `json:"activity_level,omitempty" binding:"omitempty,min=1,max=5"`
	Neutered         *bool    `json:"neutered,omitempty"`
	AvatarURL        *string  `json:"avatar_url,omitempty"`
	CompatibilityIDs []string `json:"compatibility_ids,omitempty"`
	HobbyIDs         []string `json:"hobby_ids,omitempty"`
}

type Post struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	Content       string    `json:"content"`
	ImageURLs     []string  `json:"image_urls"`
	LikeCount     int       `json:"like_count"`
	CongratsCount int       `json:"congrats_count"`
	FunnyCount    int       `json:"funny_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type PostCreate struct {
	Content   string   `json:"content" binding:"required,min=1,max=2000"`
	ImageURLs []string `json:"image_urls,omitempty"`
}

type PostReaction struct {
	Type string `json:"type" binding:"required,oneof=like congrats funny"`
}

type Swipe struct {
	ID          string    `json:"id"`
	SwiperPetID string    `json:"swiper_pet_id"`
	SwipedPetID string    `json:"swiped_pet_id"`
	Direction   string    `json:"direction"`
	CreatedAt   time.Time `json:"created_at"`
}

type SwipeRequest struct {
	SwipedPetID string `json:"swiped_pet_id" binding:"required,uuid"`
	Direction   string `json:"direction" binding:"required,oneof=like pass"`
}

type Match struct {
	ID        string    `json:"id"`
	Pet1ID    string    `json:"pet_id_1"`
	Pet2ID    string    `json:"pet_id_2"`
	MatchedAt time.Time `json:"matched_at"`
}

type Conversation struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Name      *string   `json:"name,omitempty"`
	EventID   *string   `json:"event_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	SenderID       string    `json:"sender_id"`
	Type           string    `json:"type"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}

type MessageSend struct {
	ConversationID string `json:"conversation_id" binding:"required,uuid"`
	Content        string `json:"content" binding:"required,min=1"`
	Type           string `json:"type,omitempty"`
}

type Location struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CategoryID  string    `json:"category_id"`
	Lat         float64   `json:"lat"`
	Lng         float64   `json:"lng"`
	Address     *string   `json:"address,omitempty"`
	ImageURL    *string   `json:"image_url,omitempty"`
	CreatedBy   *string   `json:"created_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Event struct {
	ID              string       `json:"id"`
	Title           string       `json:"title"`
	Description     *string      `json:"description,omitempty"`
	LocationID      *string      `json:"location_id,omitempty"`
	Lat             float64      `json:"lat"`
	Lng             float64      `json:"lng"`
	StartTime       time.Time    `json:"start_time"`
	EndTime         time.Time    `json:"end_time"`
	MaxParticipants *int         `json:"max_participants,omitempty"`
	Filters         EventFilters `json:"filters"`
	ImageURL        *string      `json:"image_url,omitempty"`
	CreatedBy       string       `json:"created_by"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

type EventFilters struct {
	Gender  *string `json:"gender,omitempty"`
	PetType *string `json:"pet_type,omitempty"`
	MinAge  *int    `json:"min_age,omitempty"`
	MaxAge  *int    `json:"max_age,omitempty"`
}

type CheckIn struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	LocationID   string     `json:"location_id"`
	CheckedInAt  time.Time  `json:"checked_in_at"`
	CheckedOutAt *time.Time `json:"checked_out_at,omitempty"`
}

type Pagination struct {
	Page     int `form:"page,default=1" binding:"omitempty,min=1"`
	PageSize int `form:"page_size,default=20" binding:"omitempty,min=1,max=100"`
}

type PaginatedResponse struct {
	Data     interface{} `json:"data"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
	HasMore  bool        `json:"has_more"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type DashboardStats struct {
	TotalUsers       int64 `json:"total_users"`
	TotalPets        int64 `json:"total_pets"`
	TotalPosts       int64 `json:"total_posts"`
	TotalMatches     int64 `json:"total_matches"`
	TotalMessages    int64 `json:"total_messages"`
	TotalCheckIns    int64 `json:"total_check_ins"`
	NewUsersToday    int64 `json:"new_users_today"`
	NewPostsToday    int64 `json:"new_posts_today"`
	ActiveUsersToday int64 `json:"active_users_today"`
}
