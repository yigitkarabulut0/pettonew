package store

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yigitkarabulut/petto/apps/api/internal/auth"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
	"github.com/yigitkarabulut/petto/apps/api/internal/service"
)

// PostgresStore implements the Store interface using direct SQL queries
// against a PostgreSQL database (Neon) via pgx/v5.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore creates a new PostgresStore connected to the given databaseURL.
func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.ParseConfig: %w", err)
	}
	config.MaxConns = 10
	config.MinConns = 0
	config.MaxConnLifetime = 5 * time.Minute
	config.MaxConnIdleTime = 2 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.NewWithConfig: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pool.Ping: %w", err)
	}
	return &PostgresStore{pool: pool}, nil
}

// Close shuts down the connection pool.
func (s *PostgresStore) Close() error {
	s.pool.Close()
	return nil
}

// ctx returns a background context with a 30-second timeout for queries.
func (s *PostgresStore) ctx() context.Context {
	ctx, _ := context.WithTimeout(context.Background(), 30*time.Second)
	return ctx
}

// ============================================================
// AUTH & USERS
// ============================================================

func (s *PostgresStore) Register(email string, password string) (*domain.AppUser, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	id := newID("user")
	now := time.Now().UTC()

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return nil, "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO app_users (id, email, password_hash, verified, status, created_at)
		 VALUES ($1, $2, $3, TRUE, 'active', $4)`,
		id, email, passwordHash, now)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, "", fmt.Errorf("email already in use")
		}
		return nil, "", fmt.Errorf("insert app_users: %w", err)
	}

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO user_profiles (user_id, created_at)
		 VALUES ($1, $2)`,
		id, now)
	if err != nil {
		return nil, "", fmt.Errorf("insert user_profiles: %w", err)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return nil, "", fmt.Errorf("commit: %w", err)
	}

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
			CreatedAt: now.Format(time.RFC3339),
		},
	}

	return user, "", nil
}

func (s *PostgresStore) Login(email string, password string) (*domain.AppUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user domain.AppUser
	var createdAt time.Time
	var avatarURL, bio *string
	var isVisibleOnMap bool

	err := s.pool.QueryRow(s.ctx(),
		`SELECT u.id, u.email, u.password_hash, u.verified, u.status,
		        p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, p.created_at
		 FROM app_users u
		 JOIN user_profiles p ON p.user_id = u.id
		 WHERE u.email = $1`, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Verified, &user.Status,
		&user.Profile.FirstName, &user.Profile.LastName, &user.Profile.BirthDate,
		&user.Profile.Gender, &user.Profile.CityID, &user.Profile.CityLabel,
		&avatarURL, &bio, &isVisibleOnMap, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if !auth.VerifyPassword(password, user.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}
	if !user.Verified {
		return nil, fmt.Errorf("email not verified")
	}
	if user.Status == "suspended" {
		return nil, fmt.Errorf("account suspended")
	}

	user.Profile.ID = user.ID
	user.Profile.Email = user.Email
	user.Profile.AvatarURL = avatarURL
	user.Profile.Bio = bio
	user.Profile.IsVisibleOnMap = isVisibleOnMap
	user.Profile.Status = user.Status
	user.Profile.CreatedAt = createdAt.Format(time.RFC3339)

	return &user, nil
}

func (s *PostgresStore) ResetPassword(_ string, _ string) error {
	return nil
}

func (s *PostgresStore) GetUser(userID string) (*domain.AppUser, error) {
	var user domain.AppUser
	var createdAt time.Time
	var avatarURL, bio *string
	var isVisibleOnMap bool

	err := s.pool.QueryRow(s.ctx(),
		`SELECT u.id, u.email, u.password_hash, u.verified, u.status,
		        p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, p.created_at
		 FROM app_users u
		 JOIN user_profiles p ON p.user_id = u.id
		 WHERE u.id = $1`, userID).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Verified, &user.Status,
		&user.Profile.FirstName, &user.Profile.LastName, &user.Profile.BirthDate,
		&user.Profile.Gender, &user.Profile.CityID, &user.Profile.CityLabel,
		&avatarURL, &bio, &isVisibleOnMap, &createdAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	user.Profile.ID = user.ID
	user.Profile.Email = user.Email
	user.Profile.AvatarURL = avatarURL
	user.Profile.Bio = bio
	user.Profile.IsVisibleOnMap = isVisibleOnMap
	user.Profile.Status = user.Status
	user.Profile.CreatedAt = createdAt.Format(time.RFC3339)

	return &user, nil
}

func (s *PostgresStore) UpdateProfile(userID string, input UpdateProfileInput) (domain.UserProfile, error) {
	_, err := s.pool.Exec(s.ctx(),
		`UPDATE user_profiles
		 SET first_name = $2, last_name = $3, birth_date = $4, gender = $5,
		     city_id = $6, city_label = $7, avatar_url = $8, bio = $9,
		     is_visible_on_map = COALESCE($10, is_visible_on_map)
		 WHERE user_id = $1`,
		userID, input.FirstName, input.LastName, input.BirthDate, input.Gender,
		input.CityID, input.CityLabel, input.AvatarURL, input.Bio, input.IsVisibleOnMap)
	if err != nil {
		return domain.UserProfile{}, fmt.Errorf("update profile: %w", err)
	}

	user, err := s.GetUser(userID)
	if err != nil {
		return domain.UserProfile{}, err
	}
	return user.Profile, nil
}

func (s *PostgresStore) AdminLogin(email string, password string) (*domain.AdminUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var admin domain.AdminUser
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, email, name, password_hash FROM admin_users WHERE email = $1`, email).
		Scan(&admin.ID, &admin.Email, &admin.Name, &admin.PasswordHash)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if !auth.VerifyPassword(password, admin.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}

	return &admin, nil
}

func (s *PostgresStore) ListUsers() []domain.UserProfile {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.user_id, u.email, p.first_name, p.last_name, p.birth_date, p.gender,
		        p.city_id, p.city_label, p.avatar_url, p.bio, p.is_visible_on_map,
		        u.status, p.created_at
		 FROM user_profiles p
		 JOIN app_users u ON u.id = p.user_id
		 ORDER BY p.created_at DESC`)
	if err != nil {
		return []domain.UserProfile{}
	}
	defer rows.Close()

	profiles := make([]domain.UserProfile, 0)
	for rows.Next() {
		var p domain.UserProfile
		var createdAt time.Time
		if err := rows.Scan(
			&p.ID, &p.Email, &p.FirstName, &p.LastName, &p.BirthDate, &p.Gender,
			&p.CityID, &p.CityLabel, &p.AvatarURL, &p.Bio, &p.IsVisibleOnMap,
			&p.Status, &createdAt,
		); err != nil {
			continue
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		profiles = append(profiles, p)
	}
	return profiles
}

func (s *PostgresStore) UserDetail(userID string) (domain.AdminUserDetail, error) {
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.AdminUserDetail{}, err
	}

	pets := s.ListPets(userID)
	matches := s.ListMatches(userID)
	conversations := s.ListConversations(userID)
	posts := s.userPosts(userID)

	totalLikes := 0
	for _, post := range posts {
		totalLikes += post.LikeCount
	}

	return domain.AdminUserDetail{
		User:               user.Profile,
		Pets:               pets,
		Matches:            matches,
		Conversations:      conversations,
		Posts:              posts,
		TotalLikesReceived: totalLikes,
	}, nil
}

// userPosts returns all posts authored by the given user.
func (s *PostgresStore) userPosts(userID string) []domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.author_user_id = $1
		 ORDER BY po.created_at DESC`, userID)
	if err != nil {
		return []domain.HomePost{}
	}
	defer rows.Close()

	return s.scanPosts(rows, userID)
}

func (s *PostgresStore) SuspendUser(userID string, status string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE app_users SET status = $2 WHERE id = $1`, userID, status)
	if err != nil {
		return fmt.Errorf("suspend user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *PostgresStore) DeleteUser(userID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM app_users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *PostgresStore) BlockUser(userID string, targetUserID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, userID, targetUserID)
	if err != nil {
		return fmt.Errorf("block user: %w", err)
	}

	// Also mark matches between these users as blocked
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE matches SET status = 'blocked'
		 WHERE id IN (
		   SELECT m.id FROM matches m
		   JOIN pets pa ON pa.id = m.pet_a_id
		   JOIN pets pb ON pb.id = m.pet_b_id
		   WHERE (pa.owner_id = $1 AND pb.owner_id = $2)
		      OR (pa.owner_id = $2 AND pb.owner_id = $1)
		 )`, userID, targetUserID)

	return nil
}

func (s *PostgresStore) Dashboard() domain.DashboardSnapshot {
	now := time.Now().UTC()
	currentWeekStart := startOfDay(now.AddDate(0, 0, -6))
	previousWeekStart := currentWeekStart.AddDate(0, 0, -7)
	previousWeekEnd := currentWeekStart

	totalUsers := s.countRows("app_users", "")
	totalPets := s.countRowsWhere("pets", "is_hidden = false")
	totalMatches := s.countRows("matches", "")
	openReports := s.countRowsWhere("reports", "status != 'resolved'")
	totalPosts := s.countRows("posts", "")
	totalVenues := s.countRows("venues", "")
	totalEvents := s.countRows("events", "")

	usersThisWeek := s.countRowsBetween("app_users", "created_at", currentWeekStart, now.Add(24*time.Hour))
	usersLastWeek := s.countRowsBetween("app_users", "created_at", previousWeekStart, previousWeekEnd)
	petsThisWeek := s.countRowsBetween("pets", "created_at", currentWeekStart, now.Add(24*time.Hour))
	petsLastWeek := s.countRowsBetween("pets", "created_at", previousWeekStart, previousWeekEnd)
	matchesThisWeek := s.countRowsBetween("matches", "created_at", currentWeekStart, now.Add(24*time.Hour))
	matchesLastWeek := s.countRowsBetween("matches", "created_at", previousWeekStart, previousWeekEnd)
	reportsThisWeek := s.countRowsBetweenWhere("reports", "created_at", currentWeekStart, now.Add(24*time.Hour), "status IN ('open','in_review')")
	reportsLastWeek := s.countRowsBetweenWhere("reports", "created_at", previousWeekStart, previousWeekEnd, "status IN ('open','in_review')")
	postsThisWeek := s.countRowsBetween("posts", "created_at", currentWeekStart, now.Add(24*time.Hour))
	postsLastWeek := s.countRowsBetween("posts", "created_at", previousWeekStart, previousWeekEnd)
	eventsThisWeek := s.countRowsBetween("events", "created_at", currentWeekStart, now.Add(24*time.Hour))
	eventsLastWeek := s.countRowsBetween("events", "created_at", previousWeekStart, previousWeekEnd)

	metrics := []domain.DashboardMetric{
		{ID: "users", Label: "Total users", Value: fmt.Sprintf("%d", totalUsers), Delta: formatDelta(usersThisWeek, usersLastWeek)},
		{ID: "pets", Label: "Active pets", Value: fmt.Sprintf("%d", totalPets), Delta: formatDelta(petsThisWeek, petsLastWeek)},
		{ID: "matches", Label: "Weekly matches", Value: fmt.Sprintf("%d", totalMatches), Delta: formatDelta(matchesThisWeek, matchesLastWeek)},
		{ID: "reports", Label: "Open reports", Value: fmt.Sprintf("%d", openReports), Delta: formatDelta(reportsThisWeek, reportsLastWeek)},
		{ID: "posts", Label: "Community posts", Value: fmt.Sprintf("%d", totalPosts), Delta: formatDelta(postsThisWeek, postsLastWeek)},
		{ID: "venues", Label: "Pet-friendly spots", Value: fmt.Sprintf("%d", totalVenues), Delta: "admin curated"},
		{ID: "events", Label: "Upcoming events", Value: fmt.Sprintf("%d", totalEvents), Delta: formatDelta(eventsThisWeek, eventsLastWeek)},
	}

	growth := make([]domain.DashboardPoint, 0, 7)
	for offset := 6; offset >= 0; offset-- {
		dayStart := startOfDay(now.AddDate(0, 0, -offset))
		dayEnd := dayStart.Add(24 * time.Hour)
		growth = append(growth, domain.DashboardPoint{
			Label:   dayStart.Format("Mon"),
			Users:   s.countRowsBetween("app_users", "created_at", dayStart, dayEnd),
			Pets:    s.countRowsBetween("pets", "created_at", dayStart, dayEnd),
			Matches: s.countRowsBetween("matches", "created_at", dayStart, dayEnd),
		})
	}

	// Recent reports
	recentReports := make([]domain.ReportSummary, 0)
	rRows, err := s.pool.Query(s.ctx(),
		`SELECT id, reporter_id, reporter_name, reason, target_type, target_id, target_label,
		        status, COALESCE(notes,''), resolved_at, created_at
		 FROM reports ORDER BY created_at DESC LIMIT 8`)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			r := s.scanReportRow(rRows)
			recentReports = append(recentReports, r)
		}
	}

	// Top posts
	topPosts := s.ListHomeFeed("")
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

// ============================================================
// PETS
// ============================================================

func (s *PostgresStore) ListPets(userID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE owner_id = $1
		 ORDER BY created_at`, userID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

func (s *PostgresStore) UpsertPet(userID string, petID string, input PetInput) (domain.Pet, error) {
	if len(input.Photos) < 1 || len(input.Photos) > 6 {
		return domain.Pet{}, fmt.Errorf("pet must have between 1 and 6 photos")
	}

	isNew := petID == ""
	if isNew {
		petID = newID("pet")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return domain.Pet{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	if isNew {
		_, err = tx.Exec(s.ctx(),
			`INSERT INTO pets (id, owner_id, name, age_years, gender, birth_date,
			     species_id, species_label, breed_id, breed_label,
			     activity_level, hobbies, good_with, characters,
			     is_neutered, bio, city_label, theme_color)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
			petID, userID, input.Name, input.AgeYears, input.Gender, input.BirthDate,
			input.SpeciesID, input.SpeciesLabel, input.BreedID, input.BreedLabel,
			input.ActivityLevel, input.Hobbies, input.GoodWith, input.Characters,
			input.IsNeutered, input.Bio, input.CityLabel, input.ThemeColor)
	} else {
		_, err = tx.Exec(s.ctx(),
			`UPDATE pets SET name=$2, age_years=$3, gender=$4, birth_date=$5,
			     species_id=$6, species_label=$7, breed_id=$8, breed_label=$9,
			     activity_level=$10, hobbies=$11, good_with=$12, characters=$13,
			     is_neutered=$14, bio=$15, city_label=$16, theme_color=$17
			 WHERE id=$1 AND owner_id=$18`,
			petID, input.Name, input.AgeYears, input.Gender, input.BirthDate,
			input.SpeciesID, input.SpeciesLabel, input.BreedID, input.BreedLabel,
			input.ActivityLevel, input.Hobbies, input.GoodWith, input.Characters,
			input.IsNeutered, input.Bio, input.CityLabel, input.ThemeColor, userID)
	}
	if err != nil {
		return domain.Pet{}, fmt.Errorf("upsert pet: %w", err)
	}

	// Replace photos
	_, _ = tx.Exec(s.ctx(), `DELETE FROM pet_photos WHERE pet_id = $1`, petID)
	for i, photo := range input.Photos {
		photoID := photo.ID
		if photoID == "" {
			photoID = newID("photo")
		}
		_, err = tx.Exec(s.ctx(),
			`INSERT INTO pet_photos (id, pet_id, url, is_primary, display_order)
			 VALUES ($1, $2, $3, $4, $5)`,
			photoID, petID, photo.URL, photo.IsPrimary, i)
		if err != nil {
			return domain.Pet{}, fmt.Errorf("insert photo: %w", err)
		}
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return domain.Pet{}, fmt.Errorf("commit: %w", err)
	}

	pet := domain.Pet{
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
	// Make sure photo IDs are set
	for i := range pet.Photos {
		if pet.Photos[i].ID == "" {
			pet.Photos[i].ID = newID("photo")
		}
	}
	return pet, nil
}

func (s *PostgresStore) ListAllPets() []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets ORDER BY created_at DESC`)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

func (s *PostgresStore) PetDetail(petID string) (domain.AdminPetDetail, error) {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE id = $1`, petID)
	if err != nil {
		return domain.AdminPetDetail{}, fmt.Errorf("pet not found")
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	if len(pets) == 0 {
		return domain.AdminPetDetail{}, fmt.Errorf("pet not found")
	}
	s.attachPhotos(pets)
	pet := pets[0]

	owner, err := s.GetUser(pet.OwnerID)
	if err != nil {
		return domain.AdminPetDetail{}, fmt.Errorf("owner not found")
	}

	// Matches for this pet
	matches := s.matchesForPet(petID)

	return domain.AdminPetDetail{
		Pet:     pet,
		Owner:   owner.Profile,
		Matches: matches,
	}, nil
}

func (s *PostgresStore) SetPetVisibility(petID string, hidden bool) error {
	tag, err := s.pool.Exec(s.ctx(),
		`UPDATE pets SET is_hidden = $2 WHERE id = $1`, petID, hidden)
	if err != nil {
		return fmt.Errorf("set pet visibility: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("pet not found")
	}
	return nil
}

func (s *PostgresStore) ListTaxonomy(kind string) []domain.TaxonomyItem {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, label, slug, species_id, is_active, COALESCE(icon,''), COALESCE(color,'')
		 FROM taxonomies WHERE kind = $1 ORDER BY label`, kind)
	if err != nil {
		return []domain.TaxonomyItem{}
	}
	defer rows.Close()

	items := make([]domain.TaxonomyItem, 0)
	for rows.Next() {
		var item domain.TaxonomyItem
		if err := rows.Scan(&item.ID, &item.Label, &item.Slug, &item.SpeciesID,
			&item.IsActive, &item.Icon, &item.Color); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items
}

func (s *PostgresStore) UpsertTaxonomy(kind string, item domain.TaxonomyItem) domain.TaxonomyItem {
	if item.ID == "" {
		item.ID = newID(kind)
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO taxonomies (id, kind, label, slug, species_id, icon, color, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (id) DO UPDATE SET
		   label = EXCLUDED.label, slug = EXCLUDED.slug, species_id = EXCLUDED.species_id,
		   icon = EXCLUDED.icon, color = EXCLUDED.color, is_active = EXCLUDED.is_active`,
		item.ID, kind, item.Label, item.Slug, item.SpeciesID, item.Icon, item.Color, item.IsActive)
	if err != nil {
		// fallback: try update by kind+slug
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE taxonomies SET label=$3, species_id=$4, icon=$5, color=$6, is_active=$7
			 WHERE id=$1 AND kind=$2`,
			item.ID, kind, item.Label, item.SpeciesID, item.Icon, item.Color, item.IsActive)
	}
	return item
}

func (s *PostgresStore) DeleteTaxonomy(kind string, itemID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM taxonomies WHERE id = $1 AND kind = $2`, itemID, kind)
	if err != nil {
		return fmt.Errorf("delete taxonomy: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("taxonomy item not found")
	}
	// If deleting a species, also delete its breeds
	if kind == "species" {
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM taxonomies WHERE kind = 'breeds' AND species_id = $1`, itemID)
	}
	return nil
}

func (s *PostgresStore) AddFavorite(userID string, petID string) error {
	// Verify pet exists
	var exists bool
	_ = s.pool.QueryRow(s.ctx(), `SELECT EXISTS(SELECT 1 FROM pets WHERE id = $1)`, petID).Scan(&exists)
	if !exists {
		return fmt.Errorf("pet not found")
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO favorites (user_id, pet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, petID)
	if err != nil {
		return fmt.Errorf("add favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) RemoveFavorite(userID string, petID string) error {
	_, err := s.pool.Exec(s.ctx(),
		`DELETE FROM favorites WHERE user_id = $1 AND pet_id = $2`, userID, petID)
	if err != nil {
		return fmt.Errorf("remove favorite: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListFavorites(userID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
		        p.species_id, p.species_label, p.breed_id, p.breed_label,
		        p.activity_level, p.hobbies, p.good_with, p.characters,
		        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color
		 FROM pets p
		 JOIN favorites f ON f.pet_id = p.id
		 WHERE f.user_id = $1
		 ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

// ============================================================
// MATCHING
// ============================================================

func (s *PostgresStore) DiscoveryFeed(userID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, "")
}

func (s *PostgresStore) DiscoveryFeedForPet(userID string, actorPetID string) []domain.DiscoveryCard {
	return s.discoveryFeed(userID, actorPetID)
}

func (s *PostgresStore) discoveryFeed(userID string, actorPetID string) []domain.DiscoveryCard {
	// Get all pet IDs owned by the user (for actor pet swipe exclusion)
	userPetIDs := s.getUserPetIDs(userID)
	if len(userPetIDs) == 0 {
		userPetIDs = []string{"__none__"}
	}

	var rows pgx.Rows
	var err error

	if actorPetID != "" {
		rows, err = s.pool.Query(s.ctx(),
			`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
			        p.species_id, p.species_label, p.breed_id, p.breed_label,
			        p.activity_level, p.hobbies, p.good_with, p.characters,
			        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color,
			        up.first_name, up.gender
			 FROM pets p
			 JOIN user_profiles up ON p.owner_id = up.user_id
			 WHERE p.owner_id != $1 AND p.is_hidden = false
			   AND p.species_id = (SELECT species_id FROM pets WHERE id = $2)
			   AND p.id NOT IN (SELECT target_pet_id FROM swipes WHERE actor_pet_id = $2)
			 ORDER BY random() LIMIT 20`, userID, actorPetID)
	} else {
		rows, err = s.pool.Query(s.ctx(),
			`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
			        p.species_id, p.species_label, p.breed_id, p.breed_label,
			        p.activity_level, p.hobbies, p.good_with, p.characters,
			        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color,
			        up.first_name, up.gender
			 FROM pets p
			 JOIN user_profiles up ON p.owner_id = up.user_id
			 WHERE p.owner_id != $1 AND p.is_hidden = false
			   AND p.species_id IN (SELECT species_id FROM pets WHERE owner_id = $1 AND is_hidden = false)
			   AND p.id NOT IN (SELECT target_pet_id FROM swipes WHERE actor_pet_id = ANY($2))
			 ORDER BY random() LIMIT 20`, userID, userPetIDs)
	}
	if err != nil {
		return []domain.DiscoveryCard{}
	}
	defer rows.Close()

	cards := make([]domain.DiscoveryCard, 0)
	petIDs := make([]string, 0)
	for rows.Next() {
		var pet domain.Pet
		var ownerFirstName, ownerGender string
		var themeColor *string
		if err := rows.Scan(
			&pet.ID, &pet.OwnerID, &pet.Name, &pet.AgeYears, &pet.Gender, &pet.BirthDate,
			&pet.SpeciesID, &pet.SpeciesLabel, &pet.BreedID, &pet.BreedLabel,
			&pet.ActivityLevel, &pet.Hobbies, &pet.GoodWith, &pet.Characters,
			&pet.IsNeutered, &pet.Bio, &pet.CityLabel, &pet.IsHidden, &themeColor,
			&ownerFirstName, &ownerGender,
		); err != nil {
			continue
		}
		if themeColor != nil {
			pet.ThemeColor = *themeColor
		}
		if pet.Hobbies == nil {
			pet.Hobbies = []string{}
		}
		if pet.GoodWith == nil {
			pet.GoodWith = []string{}
		}
		if pet.Characters == nil {
			pet.Characters = []string{}
		}

		petIDs = append(petIDs, pet.ID)
		cards = append(cards, domain.DiscoveryCard{
			Pet:           pet,
			Owner:         domain.OwnerBrief{FirstName: ownerFirstName, Gender: ownerGender},
			DistanceLabel: "Nearby",
			Prompt:        fmt.Sprintf("%s is open to friendly pets with balanced energy.", pet.Name),
		})
	}

	// Attach photos in batch
	if len(petIDs) > 0 {
		photoMap := s.fetchPhotosForPets(petIDs)
		for i := range cards {
			if photos, ok := photoMap[cards[i].Pet.ID]; ok {
				cards[i].Pet.Photos = photos
			} else {
				cards[i].Pet.Photos = []domain.PetPhoto{}
			}
		}
	}

	return cards
}

func (s *PostgresStore) GetPetOwnerID(petID string) string {
	var ownerID string
	_ = s.pool.QueryRow(s.ctx(), `SELECT owner_id FROM pets WHERE id = $1`, petID).Scan(&ownerID)
	return ownerID
}

func (s *PostgresStore) CreateSwipe(userID string, actorPetID string, targetPetID string, direction string) (*domain.MatchPreview, error) {
	// Validate actor pet belongs to user
	var actorOwnerID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT owner_id FROM pets WHERE id = $1`, actorPetID).Scan(&actorOwnerID)
	if err != nil || actorOwnerID != userID {
		return nil, fmt.Errorf("invalid actor pet")
	}

	// Validate target pet exists
	var targetOwnerID string
	err = s.pool.QueryRow(s.ctx(),
		`SELECT owner_id FROM pets WHERE id = $1`, targetPetID).Scan(&targetOwnerID)
	if err != nil {
		return nil, fmt.Errorf("target pet not found")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	// Insert swipe
	swipeID := newID("swipe")
	_, err = tx.Exec(s.ctx(),
		`INSERT INTO swipes (id, actor_pet_id, target_pet_id, direction)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (actor_pet_id, target_pet_id) DO UPDATE SET direction = $4`,
		swipeID, actorPetID, targetPetID, direction)
	if err != nil {
		return nil, fmt.Errorf("insert swipe: %w", err)
	}

	// Check for mutual like: does the target pet have a like on the actor pet?
	var reverseDirection string
	err = tx.QueryRow(s.ctx(),
		`SELECT direction FROM swipes WHERE actor_pet_id = $1 AND target_pet_id = $2`,
		targetPetID, actorPetID).Scan(&reverseDirection)
	if err != nil || !service.IsMutualLike(reverseDirection, direction) {
		if commitErr := tx.Commit(s.ctx()); commitErr != nil {
			return nil, fmt.Errorf("commit: %w", commitErr)
		}
		return nil, nil
	}

	// Mutual like! Create match
	matchID := newID("match")
	now := time.Now().UTC()

	// Get pet details for the match
	actorPet := s.getPetByID(actorPetID)
	targetPet := s.getPetByID(targetPetID)
	if actorPet == nil || targetPet == nil {
		if commitErr := tx.Commit(s.ctx()); commitErr != nil {
			return nil, fmt.Errorf("commit: %w", commitErr)
		}
		return nil, nil
	}

	// Get matched owner name
	matchedOwnerName := ""
	var matchedOwnerAvatar *string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name, avatar_url FROM user_profiles WHERE user_id = $1`,
		targetOwnerID).Scan(&matchedOwnerName, &matchedOwnerAvatar)

	matchedAvatarStr := ""
	if matchedOwnerAvatar != nil {
		matchedAvatarStr = *matchedOwnerAvatar
	}

	// Check for existing conversation between these users
	existingConvID := s.findConvIDByUsers(targetOwnerID, actorOwnerID)

	var conversationID string
	if existingConvID != "" {
		conversationID = existingConvID
		// Add the pet pair to existing conversation
		actorPhotoURL := ""
		if len(actorPet.Photos) > 0 {
			actorPhotoURL = actorPet.Photos[0].URL
		}
		targetPhotoURL := ""
		if len(targetPet.Photos) > 0 {
			targetPhotoURL = targetPet.Photos[0].URL
		}
		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO match_pet_pairs (conversation_id, my_pet_id, my_pet_name, my_pet_photo_url,
			     matched_pet_id, matched_pet_name, matched_pet_photo_url)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			conversationID, actorPet.ID, actorPet.Name, actorPhotoURL,
			targetPet.ID, targetPet.Name, targetPhotoURL)
		// Update conversation title with all pet names
		_, _ = tx.Exec(s.ctx(),
			`UPDATE conversations SET match_id = $2 WHERE id = $1`, conversationID, matchID)
	} else {
		conversationID = newID("conversation")
		actorPhotoURL := ""
		if len(actorPet.Photos) > 0 {
			actorPhotoURL = actorPet.Photos[0].URL
		}
		targetPhotoURL := ""
		if len(targetPet.Photos) > 0 {
			targetPhotoURL = targetPet.Photos[0].URL
		}

		title := fmt.Sprintf("%s, %s", actorPet.Name, targetPet.Name)
		subtitle := fmt.Sprintf("Chat with %s", matchedOwnerName)

		_, err = tx.Exec(s.ctx(),
			`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			conversationID, matchID, title, subtitle, now, []string{actorOwnerID, targetOwnerID})
		if err != nil {
			return nil, fmt.Errorf("insert conversation: %w", err)
		}

		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO match_pet_pairs (conversation_id, my_pet_id, my_pet_name, my_pet_photo_url,
			     matched_pet_id, matched_pet_name, matched_pet_photo_url)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			conversationID, actorPet.ID, actorPet.Name, actorPhotoURL,
			targetPet.ID, targetPet.Name, targetPhotoURL)
	}

	// Insert match
	_, err = tx.Exec(s.ctx(),
		`INSERT INTO matches (id, pet_a_id, pet_b_id, matched_owner_name, matched_owner_avatar_url,
		     last_message_preview, status, conversation_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		matchID, actorPetID, targetPetID, matchedOwnerName, matchedAvatarStr,
		"It's a match. Say hello!", "active", conversationID, now)
	if err != nil {
		return nil, fmt.Errorf("insert match: %w", err)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	match := &domain.MatchPreview{
		ID:                    matchID,
		Pet:                   *actorPet,
		MatchedPet:            *targetPet,
		MatchedOwnerName:      matchedOwnerName,
		MatchedOwnerAvatarURL: matchedAvatarStr,
		LastMessagePreview:    "It's a match. Say hello!",
		UnreadCount:           0,
		CreatedAt:             now.Format(time.RFC3339),
		Status:                "active",
		ConversationID:        conversationID,
	}
	return match, nil
}

func (s *PostgresStore) ListMatches(userID string) []domain.MatchPreview {
	userPetIDs := s.getUserPetIDs(userID)
	if len(userPetIDs) == 0 {
		return []domain.MatchPreview{}
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT m.id, m.pet_a_id, m.pet_b_id, m.matched_owner_name,
		        COALESCE(m.matched_owner_avatar_url,''), m.last_message_preview,
		        m.unread_count, m.status, m.conversation_id, m.created_at
		 FROM matches m
		 WHERE m.pet_a_id = ANY($1) OR m.pet_b_id = ANY($1)
		 ORDER BY m.created_at DESC`, userPetIDs)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)

		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}

		// Swap so that Pet = current user's pet, MatchedPet = other user's pet
		if containsStr(userPetIDs, petAID) {
			m.Pet = *petA
			m.MatchedPet = *petB
		} else {
			m.Pet = *petB
			m.MatchedPet = *petA
			// Fix matched owner info — look up petA's owner (the other user)
			ownerName, ownerAvatar := s.getOwnerInfo(petA.OwnerID)
			m.MatchedOwnerName = ownerName
			m.MatchedOwnerAvatarURL = ownerAvatar
		}
		matches = append(matches, m)
	}

	return matches
}

func (s *PostgresStore) ListMatchesByPet(userID string, petID string) []domain.MatchPreview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT m.id, m.pet_a_id, m.pet_b_id, m.matched_owner_name,
		        COALESCE(m.matched_owner_avatar_url,''), m.last_message_preview,
		        m.unread_count, m.status, m.conversation_id, m.created_at
		 FROM matches m
		 WHERE m.pet_a_id = $1 OR m.pet_b_id = $1
		 ORDER BY m.created_at DESC`, petID)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)

		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}

		// Swap so that Pet = requested pet, MatchedPet = other pet
		if petAID == petID {
			m.Pet = *petA
			m.MatchedPet = *petB
		} else {
			m.Pet = *petB
			m.MatchedPet = *petA
			ownerName, ownerAvatar := s.getOwnerInfo(petA.OwnerID)
			m.MatchedOwnerName = ownerName
			m.MatchedOwnerAvatarURL = ownerAvatar
		}
		matches = append(matches, m)
	}
	return matches
}

func (s *PostgresStore) FindConversationByUsers(user1ID string, user2ID string) *domain.Conversation {
	convID := s.findConvIDByUsers(user1ID, user2ID)
	if convID == "" {
		return nil
	}
	conv := s.getConversation(convID, "")
	return conv
}

func (s *PostgresStore) CreateOrFindDirectConversation(userID string, targetUserID string) (*domain.Conversation, error) {
	if userID == targetUserID {
		return nil, fmt.Errorf("cannot message yourself")
	}

	// Check if conversation already exists
	if convID := s.findConvIDByUsers(userID, targetUserID); convID != "" {
		conv := s.getConversation(convID, "")
		if conv != nil {
			return conv, nil
		}
	}

	// Get target user's name for conversation title
	var targetName string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT first_name FROM user_profiles WHERE user_id = $1`, targetUserID).Scan(&targetName)
	if err != nil {
		return nil, fmt.Errorf("target user not found")
	}

	conversationID := newID("conversation")
	now := time.Now().UTC()
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO conversations (id, match_id, title, subtitle, last_message_at, user_ids)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		conversationID, "", targetName, "Adoption inquiry", now, []string{userID, targetUserID})
	if err != nil {
		return nil, fmt.Errorf("insert conversation: %w", err)
	}

	conv := s.getConversation(conversationID, "")
	if conv == nil {
		return nil, fmt.Errorf("failed to read created conversation")
	}
	return conv, nil
}

// ============================================================
// MESSAGING
// ============================================================

func (s *PostgresStore) ListConversations(userID string) []domain.Conversation {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, match_id, title, subtitle, unread_count, last_message_at, user_ids
		 FROM conversations
		 WHERE $1 = ANY(user_ids)
		 ORDER BY last_message_at DESC`, userID)
	if err != nil {
		return []domain.Conversation{}
	}
	defer rows.Close()

	conversations := make([]domain.Conversation, 0)
	for rows.Next() {
		var c domain.Conversation
		var lastMsgAt time.Time
		if err := rows.Scan(&c.ID, &c.MatchID, &c.Title, &c.Subtitle,
			&c.UnreadCount, &lastMsgAt, &c.UserIDs); err != nil {
			continue
		}
		c.LastMessageAt = lastMsgAt.Format(time.RFC3339)
		c.Messages = []domain.Message{}
		c.MatchPetPairs = s.getMatchPetPairs(c.ID)

		// Set title to the OTHER user's name (viewer-relative)
		for _, uid := range c.UserIDs {
			if uid != userID {
				otherName, _ := s.getOwnerInfo(uid)
				if otherName != "" {
					c.Title = otherName
				}
				break
			}
		}

		conversations = append(conversations, c)
	}
	return conversations
}

func (s *PostgresStore) ListMessages(userID string, conversationID string) ([]domain.Message, error) {
	// Verify user is in conversation
	var userIDs []string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)
	if err != nil {
		return nil, fmt.Errorf("conversation not found")
	}
	found := false
	for _, uid := range userIDs {
		if uid == userID {
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("conversation not found")
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at
		 FROM messages
		 WHERE conversation_id = $1
		 ORDER BY created_at`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()

	messages := make([]domain.Message, 0)
	for rows.Next() {
		var m domain.Message
		var createdAt time.Time
		var readAt *time.Time
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderProfileID,
			&m.SenderName, &m.Body, &readAt, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		if readAt != nil {
			t := readAt.Format(time.RFC3339)
			m.ReadAt = &t
		}
		m.IsMine = m.SenderProfileID == userID
		messages = append(messages, m)
	}
	return messages, nil
}

func (s *PostgresStore) SendMessage(userID string, conversationID string, body string) (domain.Message, error) {
	// Verify user is in conversation
	var userIDs []string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)
	if err != nil {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}
	found := false
	for _, uid := range userIDs {
		if uid == userID {
			found = true
			break
		}
	}
	if !found {
		return domain.Message{}, fmt.Errorf("conversation not found")
	}

	// Get sender name
	var senderName string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name FROM user_profiles WHERE user_id = $1`, userID).Scan(&senderName)

	msgID := newID("message")
	now := time.Now().UTC()
	body = strings.TrimSpace(body)

	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, body, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		msgID, conversationID, userID, senderName, body, now)
	if err != nil {
		return domain.Message{}, fmt.Errorf("send message: %w", err)
	}

	// Update conversation last_message_at
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, conversationID, now)

	// Update match last_message_preview
	var matchID string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT match_id FROM conversations WHERE id = $1`, conversationID).Scan(&matchID)
	if matchID != "" {
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE matches SET last_message_preview = $2 WHERE id = $1`, matchID, body)
	}

	return domain.Message{
		ID:              msgID,
		ConversationID:  conversationID,
		SenderProfileID: userID,
		SenderName:      senderName,
		Body:            body,
		CreatedAt:       now.Format(time.RFC3339),
		IsMine:          true,
	}, nil
}

func (s *PostgresStore) MarkMessagesRead(userID string, conversationID string) {
	now := time.Now().UTC()
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE messages SET read_at = $3
		 WHERE conversation_id = $1 AND sender_profile_id != $2 AND read_at IS NULL`,
		conversationID, userID, now)
}

func (s *PostgresStore) ListGroupMessages(groupID string) ([]domain.Message, error) {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil {
		return nil, fmt.Errorf("group not found")
	}
	if convID == "" {
		return []domain.Message{}, nil
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, conversation_id, sender_profile_id, sender_name, body, read_at, created_at
		 FROM messages WHERE conversation_id = $1 ORDER BY created_at`, convID)
	if err != nil {
		return []domain.Message{}, nil
	}
	defer rows.Close()

	messages := make([]domain.Message, 0)
	for rows.Next() {
		var m domain.Message
		var createdAt time.Time
		var readAt *time.Time
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderProfileID,
			&m.SenderName, &m.Body, &readAt, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		if readAt != nil {
			t := readAt.Format(time.RFC3339)
			m.ReadAt = &t
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func (s *PostgresStore) SendGroupMessage(userID string, groupID string, body string) (domain.Message, error) {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT COALESCE(conversation_id,'') FROM community_groups WHERE id = $1`, groupID).Scan(&convID)
	if err != nil {
		return domain.Message{}, fmt.Errorf("group not found")
	}
	if convID == "" {
		return domain.Message{}, fmt.Errorf("group has no conversation")
	}

	var senderName string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name FROM user_profiles WHERE user_id = $1`, userID).Scan(&senderName)

	msgID := newID("message")
	now := time.Now().UTC()
	body = strings.TrimSpace(body)

	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO messages (id, conversation_id, sender_profile_id, sender_name, body, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		msgID, convID, userID, senderName, body, now)
	if err != nil {
		return domain.Message{}, fmt.Errorf("send group message: %w", err)
	}

	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, convID, now)

	return domain.Message{
		ID:              msgID,
		ConversationID:  convID,
		SenderProfileID: userID,
		SenderName:      senderName,
		Body:            body,
		CreatedAt:       now.Format(time.RFC3339),
		IsMine:          true,
	}, nil
}

// ============================================================
// FEED & POSTS
// ============================================================

func (s *PostgresStore) ListHomeFeed(userID string) []domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 ORDER BY po.created_at DESC`)
	if err != nil {
		return []domain.HomePost{}
	}
	defer rows.Close()

	return s.scanPosts(rows, userID)
}

func (s *PostgresStore) CreatePost(userID string, input PostInput) (domain.HomePost, error) {
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("user not found")
	}

	body := strings.TrimSpace(input.Body)
	if body == "" && input.ImageURL == nil {
		return domain.HomePost{}, fmt.Errorf("add some text or a photo before posting")
	}

	tx, err := s.pool.Begin(s.ctx())
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(s.ctx())

	postID := newID("post")
	now := time.Now().UTC()

	// Lookup venue name if venueId provided but name missing
	venueName := input.VenueName
	if input.VenueID != nil && *input.VenueID != "" && (venueName == nil || *venueName == "") {
		var name string
		nameErr := s.pool.QueryRow(s.ctx(),
			`SELECT name FROM venues WHERE id = $1`, *input.VenueID).Scan(&name)
		if nameErr == nil {
			venueName = &name
		}
	}

	_, err = tx.Exec(s.ctx(),
		`INSERT INTO posts (id, author_user_id, body, image_url, venue_id, venue_name,
		     event_id, event_name, like_count, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9)`,
		postID, userID, body, input.ImageURL, input.VenueID, venueName,
		input.EventID, input.EventName, now)
	if err != nil {
		return domain.HomePost{}, fmt.Errorf("insert post: %w", err)
	}

	// Tag pets
	taggedPets := make([]domain.Pet, 0, len(input.TaggedPetIDs))
	for _, petID := range input.TaggedPetIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		_, _ = tx.Exec(s.ctx(),
			`INSERT INTO post_tagged_pets (post_id, pet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			postID, petID)
		taggedPets = append(taggedPets, *pet)
	}

	if err := tx.Commit(s.ctx()); err != nil {
		return domain.HomePost{}, fmt.Errorf("commit: %w", err)
	}

	return domain.HomePost{
		ID:         postID,
		Author:     user.Profile,
		Body:       body,
		ImageURL:   input.ImageURL,
		TaggedPets: taggedPets,
		LikeCount:  0,
		LikedByMe:  false,
		CreatedAt:  now.Format(time.RFC3339),
		VenueID:    input.VenueID,
		VenueName:  venueName,
		EventID:    input.EventID,
		EventName:  input.EventName,
	}, nil
}

func (s *PostgresStore) TogglePostLike(userID string, postID string) (domain.HomePost, error) {
	// Check if already liked
	var exists bool
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2)`,
		postID, userID).Scan(&exists)

	if exists {
		_, _ = s.pool.Exec(s.ctx(),
			`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, postID, userID)
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, postID)
	} else {
		_, _ = s.pool.Exec(s.ctx(),
			`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			postID, userID)
		_, _ = s.pool.Exec(s.ctx(),
			`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, postID)
	}

	// Return updated post
	post := s.getPostByID(postID, userID)
	if post == nil {
		return domain.HomePost{}, fmt.Errorf("post not found")
	}
	return *post, nil
}

func (s *PostgresStore) ListPostsAdmin() []domain.HomePost {
	return s.ListHomeFeed("")
}

func (s *PostgresStore) DeletePost(postID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM posts WHERE id = $1`, postID)
	if err != nil {
		return fmt.Errorf("delete post: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("post not found")
	}
	return nil
}

// ============================================================
// EXPLORE: Venues & Events
// ============================================================

func (s *PostgresStore) ListVenues() []domain.ExploreVenue {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, name, category, description, city_label, address,
		        latitude, longitude, image_url, COALESCE(hours,'')
		 FROM venues ORDER BY name`)
	if err != nil {
		return []domain.ExploreVenue{}
	}
	defer rows.Close()

	venues := make([]domain.ExploreVenue, 0)
	for rows.Next() {
		var v domain.ExploreVenue
		if err := rows.Scan(&v.ID, &v.Name, &v.Category, &v.Description,
			&v.CityLabel, &v.Address, &v.Latitude, &v.Longitude,
			&v.ImageURL, &v.Hours); err != nil {
			continue
		}
		v.CurrentCheckIns = s.getVenueCheckIns(v.ID)
		venues = append(venues, v)
	}
	return venues
}

func (s *PostgresStore) GetVenue(venueID string) (*domain.ExploreVenue, error) {
	var v domain.ExploreVenue
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, name, category, description, city_label, address,
		        latitude, longitude, image_url, COALESCE(hours,'')
		 FROM venues WHERE id = $1`, venueID).
		Scan(&v.ID, &v.Name, &v.Category, &v.Description,
			&v.CityLabel, &v.Address, &v.Latitude, &v.Longitude,
			&v.ImageURL, &v.Hours)
	if err != nil {
		return nil, fmt.Errorf("venue not found")
	}
	v.CurrentCheckIns = s.getVenueCheckIns(v.ID)
	return &v, nil
}

func (s *PostgresStore) UpsertVenue(venueID string, input VenueInput) domain.ExploreVenue {
	if venueID == "" {
		venueID = newID("venue")
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO venues (id, name, category, description, city_label, address,
		     latitude, longitude, image_url, hours)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   name=EXCLUDED.name, category=EXCLUDED.category, description=EXCLUDED.description,
		   city_label=EXCLUDED.city_label, address=EXCLUDED.address,
		   latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
		   image_url=EXCLUDED.image_url, hours=EXCLUDED.hours`,
		venueID, input.Name, input.Category, input.Description,
		input.CityLabel, input.Address, input.Latitude, input.Longitude,
		input.ImageURL, input.Hours)
	if err != nil {
		// Return with whatever we can
		return domain.ExploreVenue{ID: venueID, Name: input.Name}
	}

	venue := domain.ExploreVenue{
		ID:              venueID,
		Name:            input.Name,
		Category:        input.Category,
		Description:     input.Description,
		CityLabel:       input.CityLabel,
		Address:         input.Address,
		Latitude:        input.Latitude,
		Longitude:       input.Longitude,
		ImageURL:        input.ImageURL,
		Hours:           input.Hours,
		CurrentCheckIns: s.getVenueCheckIns(venueID),
	}
	return venue
}

func (s *PostgresStore) DeleteVenue(venueID string) error {
	// Also delete events at this venue
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM events WHERE venue_id = $1`, venueID)

	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM venues WHERE id = $1`, venueID)
	if err != nil {
		return fmt.Errorf("delete venue: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("venue not found")
	}
	return nil
}

func (s *PostgresStore) CheckInVenue(userID string, input VenueCheckInInput) (domain.ExploreVenue, error) {
	// Verify venue exists
	venue, err := s.GetVenue(input.VenueID)
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("venue not found")
	}

	// Get user profile
	user, err := s.GetUser(userID)
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("user not found")
	}

	// Validate pet IDs
	petNames := make([]string, 0, len(input.PetIDs))
	validPetIDs := make([]string, 0, len(input.PetIDs))
	for _, petID := range input.PetIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreVenue{}, fmt.Errorf("select at least one of your pets")
	}

	// Delete old check-in for this user at this venue
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM venue_check_ins WHERE venue_id = $1 AND user_id = $2`,
		input.VenueID, userID)

	// Insert new check-in
	userName := strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName)
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO venue_check_ins (venue_id, user_id, user_name, avatar_url, pet_ids, pet_names, pet_count)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		input.VenueID, userID, userName, user.Profile.AvatarURL,
		validPetIDs, petNames, len(validPetIDs))
	if err != nil {
		return domain.ExploreVenue{}, fmt.Errorf("check in: %w", err)
	}

	// Return updated venue
	venue.CurrentCheckIns = s.getVenueCheckIns(input.VenueID)
	return *venue, nil
}

func (s *PostgresStore) ListEvents() []domain.ExploreEvent {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, title, description, city_label, venue_id, venue_name,
		        starts_at, COALESCE(ends_at, starts_at), audience, pet_focus,
		        attendee_count
		 FROM events ORDER BY starts_at`)
	if err != nil {
		return []domain.ExploreEvent{}
	}
	defer rows.Close()

	events := make([]domain.ExploreEvent, 0)
	for rows.Next() {
		var e domain.ExploreEvent
		var startsAt, endsAt time.Time
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.CityLabel,
			&e.VenueID, &e.VenueName, &startsAt, &endsAt,
			&e.Audience, &e.PetFocus, &e.AttendeeCount); err != nil {
			continue
		}
		e.StartsAt = startsAt.Format(time.RFC3339)
		e.EndsAt = endsAt.Format(time.RFC3339)
		e.Attendees = s.getEventAttendees(e.ID)
		events = append(events, e)
	}
	return events
}

func (s *PostgresStore) UpsertEvent(eventID string, input EventInput) (domain.ExploreEvent, error) {
	if eventID == "" {
		eventID = newID("event")
	}

	var venueName *string
	if input.VenueID != nil {
		var name string
		nameErr := s.pool.QueryRow(s.ctx(),
			`SELECT name FROM venues WHERE id = $1`, *input.VenueID).Scan(&name)
		if nameErr == nil {
			venueName = &name
		}
	}

	startsAt := time.Now().UTC()
	if input.StartsAt != "" {
		if t, err := time.Parse(time.RFC3339, input.StartsAt); err == nil {
			startsAt = t
		}
	}

	var endsAt *time.Time
	if input.EndsAt != "" {
		if t, err := time.Parse(time.RFC3339, input.EndsAt); err == nil {
			endsAt = &t
		}
	}

	_, err := s.pool.Exec(s.ctx(),
		`INSERT INTO events (id, title, description, city_label, venue_id, venue_name,
		     starts_at, ends_at, audience, pet_focus)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   title=EXCLUDED.title, description=EXCLUDED.description, city_label=EXCLUDED.city_label,
		   venue_id=EXCLUDED.venue_id, venue_name=EXCLUDED.venue_name,
		   starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
		   audience=EXCLUDED.audience, pet_focus=EXCLUDED.pet_focus`,
		eventID, input.Title, input.Description, input.CityLabel,
		input.VenueID, venueName, startsAt, endsAt, input.Audience, input.PetFocus)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("upsert event: %w", err)
	}

	event := domain.ExploreEvent{
		ID:          eventID,
		Title:       input.Title,
		Description: input.Description,
		CityLabel:   input.CityLabel,
		VenueID:     input.VenueID,
		VenueName:   venueName,
		StartsAt:    startsAt.Format(time.RFC3339),
		Audience:    input.Audience,
		PetFocus:    input.PetFocus,
		Attendees:   s.getEventAttendees(eventID),
	}
	if endsAt != nil {
		event.EndsAt = endsAt.Format(time.RFC3339)
	}
	event.AttendeeCount = len(event.Attendees)
	return event, nil
}

func (s *PostgresStore) DeleteEvent(eventID string) error {
	tag, err := s.pool.Exec(s.ctx(),
		`DELETE FROM events WHERE id = $1`, eventID)
	if err != nil {
		return fmt.Errorf("delete event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("event not found")
	}
	return nil
}

func (s *PostgresStore) RSVPEvent(userID string, eventID string, petIDs []string) (domain.ExploreEvent, error) {
	// Get event
	var e domain.ExploreEvent
	var startsAt time.Time
	var endsAt *time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, title, description, city_label, venue_id, venue_name,
		        starts_at, ends_at, audience, pet_focus, attendee_count
		 FROM events WHERE id = $1`, eventID).
		Scan(&e.ID, &e.Title, &e.Description, &e.CityLabel,
			&e.VenueID, &e.VenueName, &startsAt, &endsAt,
			&e.Audience, &e.PetFocus, &e.AttendeeCount)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("event not found")
	}
	e.StartsAt = startsAt.Format(time.RFC3339)
	if endsAt != nil {
		e.EndsAt = endsAt.Format(time.RFC3339)
	}

	user, err := s.GetUser(userID)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("user not found")
	}
	if e.Audience == "women-only" && user.Profile.Gender != "woman" {
		return domain.ExploreEvent{}, fmt.Errorf("this event is reserved for women")
	}

	// Validate pets
	petNames := make([]string, 0, len(petIDs))
	validPetIDs := make([]string, 0, len(petIDs))
	for _, petID := range petIDs {
		pet := s.getPetByID(petID)
		if pet == nil || pet.OwnerID != userID {
			continue
		}
		if e.PetFocus == "dogs-only" && pet.SpeciesLabel != "Dog" {
			continue
		}
		if e.PetFocus == "cats-only" && pet.SpeciesLabel != "Cat" {
			continue
		}
		validPetIDs = append(validPetIDs, petID)
		petNames = append(petNames, pet.Name)
	}
	if len(validPetIDs) == 0 {
		return domain.ExploreEvent{}, fmt.Errorf("select pets that match this event")
	}

	// Remove existing RSVP and add new one
	_, _ = s.pool.Exec(s.ctx(),
		`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, eventID, userID)

	userName := strings.TrimSpace(user.Profile.FirstName + " " + user.Profile.LastName)
	_, err = s.pool.Exec(s.ctx(),
		`INSERT INTO event_rsvps (event_id, user_id, user_name, avatar_url, pet_ids, pet_names)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		eventID, userID, userName, user.Profile.AvatarURL, validPetIDs, petNames)
	if err != nil {
		return domain.ExploreEvent{}, fmt.Errorf("rsvp event: %w", err)
	}

	// Update attendee count
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT COUNT(*) FROM event_rsvps WHERE event_id = $1`, eventID).Scan(&count)
	_, _ = s.pool.Exec(s.ctx(),
		`UPDATE events SET attendee_count = $2 WHERE id = $1`, eventID, count)

	e.Attendees = s.getEventAttendees(eventID)
	e.AttendeeCount = len(e.Attendees)
	return e, nil
}

func (s *PostgresStore) ListVenueReviews(venueID string) []domain.VenueReview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, venue_id, user_id, user_name, rating, comment, created_at
		 FROM venue_reviews WHERE venue_id = $1 ORDER BY created_at DESC`, venueID)
	if err != nil {
		return []domain.VenueReview{}
	}
	defer rows.Close()

	reviews := make([]domain.VenueReview, 0)
	for rows.Next() {
		var r domain.VenueReview
		var createdAt time.Time
		if err := rows.Scan(&r.ID, &r.VenueID, &r.UserID, &r.UserName,
			&r.Rating, &r.Comment, &createdAt); err != nil {
			continue
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		reviews = append(reviews, r)
	}
	return reviews
}

func (s *PostgresStore) CreateVenueReview(review domain.VenueReview) domain.VenueReview {
	review.ID = newID("review")
	review.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO venue_reviews (id, venue_id, user_id, user_name, rating, comment, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		review.ID, review.VenueID, review.UserID, review.UserName,
		review.Rating, review.Comment, time.Now().UTC())
	return review
}

func (s *PostgresStore) CreateReport(reporterID string, reporterName string, reason string, targetType string, targetID string, targetLabel string) domain.ReportSummary {
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

	_, _ = s.pool.Exec(s.ctx(),
		`INSERT INTO reports (id, reporter_id, reporter_name, reason, target_type, target_id, target_label, status, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		report.ID, reporterID, reporterName, reason, targetType, targetID, targetLabel, "open", time.Now().UTC())

	return report
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

// scanPetRows scans pet rows and returns a slice (without photos).
func (s *PostgresStore) scanPetRows(rows pgx.Rows) []domain.Pet {
	pets := make([]domain.Pet, 0)
	for rows.Next() {
		var p domain.Pet
		var themeColor *string
		if err := rows.Scan(
			&p.ID, &p.OwnerID, &p.Name, &p.AgeYears, &p.Gender, &p.BirthDate,
			&p.SpeciesID, &p.SpeciesLabel, &p.BreedID, &p.BreedLabel,
			&p.ActivityLevel, &p.Hobbies, &p.GoodWith, &p.Characters,
			&p.IsNeutered, &p.Bio, &p.CityLabel, &p.IsHidden, &themeColor,
		); err != nil {
			continue
		}
		if themeColor != nil {
			p.ThemeColor = *themeColor
		}
		if p.Hobbies == nil {
			p.Hobbies = []string{}
		}
		if p.GoodWith == nil {
			p.GoodWith = []string{}
		}
		if p.Characters == nil {
			p.Characters = []string{}
		}
		p.Photos = []domain.PetPhoto{}
		pets = append(pets, p)
	}
	return pets
}

// attachPhotos fetches and attaches photos to a slice of pets.
func (s *PostgresStore) attachPhotos(pets []domain.Pet) {
	if len(pets) == 0 {
		return
	}
	ids := make([]string, len(pets))
	for i, p := range pets {
		ids[i] = p.ID
	}
	photoMap := s.fetchPhotosForPets(ids)
	for i := range pets {
		if photos, ok := photoMap[pets[i].ID]; ok {
			pets[i].Photos = photos
		}
	}
}

// fetchPhotosForPets returns a map of petID -> photos for the given pet IDs.
func (s *PostgresStore) fetchPhotosForPets(petIDs []string) map[string][]domain.PetPhoto {
	result := make(map[string][]domain.PetPhoto)
	if len(petIDs) == 0 {
		return result
	}

	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, pet_id, url, is_primary
		 FROM pet_photos
		 WHERE pet_id = ANY($1)
		 ORDER BY display_order`, petIDs)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var photo domain.PetPhoto
		var petID string
		if err := rows.Scan(&photo.ID, &petID, &photo.URL, &photo.IsPrimary); err != nil {
			continue
		}
		result[petID] = append(result[petID], photo)
	}
	return result
}

// getPetByID returns a single pet with photos, or nil.
func (s *PostgresStore) getPetByID(petID string) *domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, owner_id, name, age_years, gender, birth_date,
		        species_id, species_label, breed_id, breed_label,
		        activity_level, hobbies, good_with, characters,
		        is_neutered, bio, city_label, is_hidden, theme_color
		 FROM pets WHERE id = $1`, petID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	if len(pets) == 0 {
		return nil
	}
	s.attachPhotos(pets)
	return &pets[0]
}

// getUserPetIDs returns all pet IDs owned by the given user.
func (s *PostgresStore) getUserPetIDs(userID string) []string {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id FROM pets WHERE owner_id = $1`, userID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids
}

// containsStr checks if a string slice contains a given string.
func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

// getOwnerInfo returns the first_name and avatar_url for a given user.
func (s *PostgresStore) getOwnerInfo(userID string) (string, string) {
	var name string
	var avatar *string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT first_name, avatar_url FROM user_profiles WHERE user_id = $1`, userID).Scan(&name, &avatar)
	avatarStr := ""
	if avatar != nil {
		avatarStr = *avatar
	}
	return name, avatarStr
}

// findConvIDByUsers finds an existing conversation between two users.
func (s *PostgresStore) findConvIDByUsers(user1ID string, user2ID string) string {
	var convID string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id FROM conversations
		 WHERE user_ids @> $1::text[] AND user_ids @> $2::text[]
		 LIMIT 1`,
		[]string{user1ID}, []string{user2ID}).Scan(&convID)
	if err != nil {
		return ""
	}
	return convID
}

// getConversation returns a full conversation with messages and pet pairs.
func (s *PostgresStore) getConversation(convID string, viewerUserID string) *domain.Conversation {
	var c domain.Conversation
	var lastMsgAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, match_id, title, subtitle, unread_count, last_message_at, user_ids
		 FROM conversations WHERE id = $1`, convID).
		Scan(&c.ID, &c.MatchID, &c.Title, &c.Subtitle, &c.UnreadCount, &lastMsgAt, &c.UserIDs)
	if err != nil {
		return nil
	}
	c.LastMessageAt = lastMsgAt.Format(time.RFC3339)
	c.MatchPetPairs = s.getMatchPetPairs(convID)
	c.Messages = []domain.Message{}
	return &c
}

// getMatchPetPairs returns pet pairs for a conversation.
func (s *PostgresStore) getMatchPetPairs(conversationID string) []domain.MatchPetPair {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT my_pet_id, COALESCE(my_pet_name,''), COALESCE(my_pet_photo_url,''),
		        matched_pet_id, COALESCE(matched_pet_name,''), COALESCE(matched_pet_photo_url,'')
		 FROM match_pet_pairs WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return []domain.MatchPetPair{}
	}
	defer rows.Close()

	pairs := make([]domain.MatchPetPair, 0)
	for rows.Next() {
		var p domain.MatchPetPair
		if err := rows.Scan(&p.MyPetID, &p.MyPetName, &p.MyPetPhotoURL,
			&p.MatchedPetID, &p.MatchedPetName, &p.MatchedPetPhotoURL); err != nil {
			continue
		}
		pairs = append(pairs, p)
	}
	return pairs
}

// matchesForPet returns matches involving a given pet.
func (s *PostgresStore) matchesForPet(petID string) []domain.MatchPreview {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT id, pet_a_id, pet_b_id, matched_owner_name,
		        COALESCE(matched_owner_avatar_url,''), last_message_preview,
		        unread_count, status, conversation_id, created_at
		 FROM matches
		 WHERE pet_a_id = $1 OR pet_b_id = $1
		 ORDER BY created_at DESC`, petID)
	if err != nil {
		return []domain.MatchPreview{}
	}
	defer rows.Close()

	matches := make([]domain.MatchPreview, 0)
	for rows.Next() {
		var m domain.MatchPreview
		var petAID, petBID string
		var createdAt time.Time
		if err := rows.Scan(&m.ID, &petAID, &petBID, &m.MatchedOwnerName,
			&m.MatchedOwnerAvatarURL, &m.LastMessagePreview,
			&m.UnreadCount, &m.Status, &m.ConversationID, &createdAt); err != nil {
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		petA := s.getPetByID(petAID)
		petB := s.getPetByID(petBID)
		if petA == nil || petB == nil {
			continue
		}
		m.Pet = *petA
		m.MatchedPet = *petB
		matches = append(matches, m)
	}
	return matches
}

// getVenueCheckIns returns current check-ins for a venue.
func (s *PostgresStore) getVenueCheckIns(venueID string) []domain.VenueCheckIn {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT user_id, user_name, avatar_url, pet_ids, pet_names, pet_count, checked_in_at
		 FROM venue_check_ins WHERE venue_id = $1
		 ORDER BY checked_in_at DESC`, venueID)
	if err != nil {
		return []domain.VenueCheckIn{}
	}
	defer rows.Close()

	checkIns := make([]domain.VenueCheckIn, 0)
	for rows.Next() {
		var ci domain.VenueCheckIn
		var checkedInAt time.Time
		if err := rows.Scan(&ci.UserID, &ci.UserName, &ci.AvatarURL,
			&ci.PetIDs, &ci.PetNames, &ci.PetCount, &checkedInAt); err != nil {
			continue
		}
		ci.CheckedInAt = checkedInAt.Format(time.RFC3339)
		if ci.PetIDs == nil {
			ci.PetIDs = []string{}
		}
		if ci.PetNames == nil {
			ci.PetNames = []string{}
		}
		checkIns = append(checkIns, ci)
	}
	return checkIns
}

// getEventAttendees returns attendees for an event.
func (s *PostgresStore) getEventAttendees(eventID string) []domain.VenueCheckIn {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT user_id, user_name, avatar_url, pet_ids, pet_names, rsvp_at
		 FROM event_rsvps WHERE event_id = $1
		 ORDER BY rsvp_at`, eventID)
	if err != nil {
		return []domain.VenueCheckIn{}
	}
	defer rows.Close()

	attendees := make([]domain.VenueCheckIn, 0)
	for rows.Next() {
		var a domain.VenueCheckIn
		var rsvpAt time.Time
		if err := rows.Scan(&a.UserID, &a.UserName, &a.AvatarURL,
			&a.PetIDs, &a.PetNames, &rsvpAt); err != nil {
			continue
		}
		a.PetCount = len(a.PetIDs)
		a.CheckedInAt = rsvpAt.Format(time.RFC3339)
		if a.PetIDs == nil {
			a.PetIDs = []string{}
		}
		if a.PetNames == nil {
			a.PetNames = []string{}
		}
		attendees = append(attendees, a)
	}
	return attendees
}

// scanPosts scans a set of post rows and enriches them with tagged pets and like state.
func (s *PostgresStore) scanPosts(rows pgx.Rows, viewerUserID string) []domain.HomePost {
	posts := make([]domain.HomePost, 0)
	for rows.Next() {
		var post domain.HomePost
		var profileCreatedAt, postCreatedAt time.Time
		if err := rows.Scan(
			&post.ID, &post.Body, &post.ImageURL, &post.VenueID, &post.VenueName,
			&post.EventID, &post.EventName, &post.LikeCount, &postCreatedAt,
			&post.Author.ID, &post.Author.Email, &post.Author.FirstName,
			&post.Author.LastName, &post.Author.BirthDate, &post.Author.Gender,
			&post.Author.CityID, &post.Author.CityLabel, &post.Author.AvatarURL,
			&post.Author.Bio, &post.Author.IsVisibleOnMap, &post.Author.Status,
			&profileCreatedAt,
		); err != nil {
			continue
		}
		post.CreatedAt = postCreatedAt.Format(time.RFC3339)
		post.Author.CreatedAt = profileCreatedAt.Format(time.RFC3339)
		post.TaggedPets = s.getTaggedPets(post.ID)
		if viewerUserID != "" {
			var liked bool
			_ = s.pool.QueryRow(s.ctx(),
				`SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2)`,
				post.ID, viewerUserID).Scan(&liked)
			post.LikedByMe = liked
		}
		posts = append(posts, post)
	}
	return posts
}

// getTaggedPets returns pets tagged in a post.
func (s *PostgresStore) getTaggedPets(postID string) []domain.Pet {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT p.id, p.owner_id, p.name, p.age_years, p.gender, p.birth_date,
		        p.species_id, p.species_label, p.breed_id, p.breed_label,
		        p.activity_level, p.hobbies, p.good_with, p.characters,
		        p.is_neutered, p.bio, p.city_label, p.is_hidden, p.theme_color
		 FROM pets p
		 JOIN post_tagged_pets t ON t.pet_id = p.id
		 WHERE t.post_id = $1`, postID)
	if err != nil {
		return []domain.Pet{}
	}
	defer rows.Close()

	pets := s.scanPetRows(rows)
	s.attachPhotos(pets)
	return pets
}

// getPostByID fetches a single post with full enrichment.
func (s *PostgresStore) getPostByID(postID string, viewerUserID string) *domain.HomePost {
	rows, err := s.pool.Query(s.ctx(),
		`SELECT po.id, po.body, po.image_url, po.venue_id, po.venue_name,
		        po.event_id, po.event_name, po.like_count, po.created_at,
		        p.user_id, u.email, p.first_name, p.last_name, p.birth_date,
		        p.gender, p.city_id, p.city_label, p.avatar_url, p.bio,
		        p.is_visible_on_map, au.status, p.created_at
		 FROM posts po
		 JOIN user_profiles p ON p.user_id = po.author_user_id
		 JOIN app_users au ON au.id = po.author_user_id
		 JOIN app_users u ON u.id = po.author_user_id
		 WHERE po.id = $1`, postID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	posts := s.scanPosts(rows, viewerUserID)
	if len(posts) == 0 {
		return nil
	}
	return &posts[0]
}

// scanReportRow scans a single report row from the given Rows iterator.
func (s *PostgresStore) scanReportRow(rows pgx.Rows) domain.ReportSummary {
	var r domain.ReportSummary
	var resolvedAt *time.Time
	var createdAt time.Time
	var notes *string
	_ = rows.Scan(&r.ID, &r.ReporterID, &r.ReporterName, &r.Reason,
		&r.TargetType, &r.TargetID, &r.TargetLabel,
		&r.Status, &notes, &resolvedAt, &createdAt)
	r.CreatedAt = createdAt.Format(time.RFC3339)
	if notes != nil {
		r.Notes = *notes
	}
	if resolvedAt != nil {
		r.ResolvedAt = resolvedAt.Format(time.RFC3339)
	}
	return r
}

// countRows returns count of all rows in a table.
func (s *PostgresStore) countRows(table string, _ string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s`, table)).Scan(&count)
	return count
}

// countRowsWhere returns count of rows matching a condition.
func (s *PostgresStore) countRowsWhere(table string, where string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s`, table, where)).Scan(&count)
	return count
}

// countRowsBetween returns count of rows with col between start and end.
func (s *PostgresStore) countRowsBetween(table string, col string, start, end time.Time) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s >= $1 AND %s < $2`, table, col, col),
		start, end).Scan(&count)
	return count
}

// countRowsBetweenWhere returns count of rows with col between start and end with extra where.
func (s *PostgresStore) countRowsBetweenWhere(table string, col string, start, end time.Time, extraWhere string) int {
	var count int
	_ = s.pool.QueryRow(s.ctx(),
		fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s >= $1 AND %s < $2 AND %s`, table, col, col, extraWhere),
		start, end).Scan(&count)
	return count
}

// ================================================================
// Health & Wellness
// ================================================================

func (s *PostgresStore) ListHealthRecords(petID string) []domain.HealthRecord {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, type, title, date, notes, next_due_date, created_at FROM health_records WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.HealthRecord
	for rows.Next() {
		var r domain.HealthRecord
		var ndd *string
		rows.Scan(&r.ID, &r.PetID, &r.Type, &r.Title, &r.Date, &r.Notes, &ndd, &r.CreatedAt)
		if ndd != nil { r.NextDueDate = *ndd }
		out = append(out, r)
	}
	if out == nil { return []domain.HealthRecord{} }
	return out
}

func (s *PostgresStore) CreateHealthRecord(petID string, record domain.HealthRecord) domain.HealthRecord {
	record.ID = newID("hr")
	record.PetID = petID
	if record.CreatedAt == "" { record.CreatedAt = time.Now().UTC().Format(time.RFC3339) }
	s.pool.Exec(s.ctx(), `INSERT INTO health_records(id,pet_id,type,title,date,notes,next_due_date,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		record.ID, record.PetID, record.Type, record.Title, record.Date, record.Notes, nilIfEmpty(record.NextDueDate), record.CreatedAt)
	return record
}

func (s *PostgresStore) DeleteHealthRecord(petID string, recordID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM health_records WHERE id=$1 AND pet_id=$2`, recordID, petID)
	return err
}

func (s *PostgresStore) ListWeightEntries(petID string) []domain.WeightEntry {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, weight, unit, date FROM weight_entries WHERE pet_id=$1 ORDER BY date DESC`, petID)
	defer rows.Close()
	var out []domain.WeightEntry
	for rows.Next() {
		var w domain.WeightEntry
		rows.Scan(&w.ID, &w.PetID, &w.Weight, &w.Unit, &w.Date)
		out = append(out, w)
	}
	if out == nil { return []domain.WeightEntry{} }
	return out
}

func (s *PostgresStore) CreateWeightEntry(petID string, entry domain.WeightEntry) domain.WeightEntry {
	entry.ID = newID("we")
	entry.PetID = petID
	s.pool.Exec(s.ctx(), `INSERT INTO weight_entries(id,pet_id,weight,unit,date) VALUES($1,$2,$3,$4,$5)`,
		entry.ID, entry.PetID, entry.Weight, entry.Unit, entry.Date)
	return entry
}

func (s *PostgresStore) ListVetContacts(userID string) []domain.VetContact {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, name, phone, address, is_emergency FROM vet_contacts WHERE user_id=$1`, userID)
	defer rows.Close()
	var out []domain.VetContact
	for rows.Next() {
		var v domain.VetContact
		rows.Scan(&v.ID, &v.UserID, &v.Name, &v.Phone, &v.Address, &v.IsEmergency)
		out = append(out, v)
	}
	if out == nil { return []domain.VetContact{} }
	return out
}

func (s *PostgresStore) CreateVetContact(userID string, contact domain.VetContact) domain.VetContact {
	contact.ID = newID("vc")
	contact.UserID = userID
	s.pool.Exec(s.ctx(), `INSERT INTO vet_contacts(id,user_id,name,phone,address,is_emergency) VALUES($1,$2,$3,$4,$5,$6)`,
		contact.ID, contact.UserID, contact.Name, contact.Phone, contact.Address, contact.IsEmergency)
	return contact
}

func (s *PostgresStore) DeleteVetContact(userID string, contactID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM vet_contacts WHERE id=$1 AND user_id=$2`, contactID, userID)
	return err
}

func (s *PostgresStore) ListFeedingSchedules(petID string) []domain.FeedingSchedule {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, meal_name, time, food_type, amount, notes FROM feeding_schedules WHERE pet_id=$1`, petID)
	defer rows.Close()
	var out []domain.FeedingSchedule
	for rows.Next() {
		var f domain.FeedingSchedule
		rows.Scan(&f.ID, &f.PetID, &f.MealName, &f.Time, &f.FoodType, &f.Amount, &f.Notes)
		out = append(out, f)
	}
	if out == nil { return []domain.FeedingSchedule{} }
	return out
}

func (s *PostgresStore) CreateFeedingSchedule(petID string, schedule domain.FeedingSchedule) domain.FeedingSchedule {
	schedule.ID = newID("fs")
	schedule.PetID = petID
	schedule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO feeding_schedules(id,pet_id,meal_name,time,food_type,amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,
		schedule.ID, schedule.PetID, schedule.MealName, schedule.Time, schedule.FoodType, schedule.Amount, schedule.Notes)
	return schedule
}

func (s *PostgresStore) DeleteFeedingSchedule(petID string, scheduleID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM feeding_schedules WHERE id=$1 AND pet_id=$2`, scheduleID, petID)
	return err
}

// ================================================================
// Diary
// ================================================================

func (s *PostgresStore) ListDiary(petID string) []domain.DiaryEntry {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, user_id, body, image_url, mood, created_at FROM diary_entries WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.DiaryEntry
	for rows.Next() {
		var d domain.DiaryEntry
		var img *string
		var createdAt time.Time
		rows.Scan(&d.ID, &d.PetID, &d.UserID, &d.Body, &img, &d.Mood, &createdAt)
		d.ImageURL = img
		d.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, d)
	}
	if out == nil { return []domain.DiaryEntry{} }
	return out
}

func (s *PostgresStore) CreateDiaryEntry(userID string, petID string, body string, imageURL *string, mood string) domain.DiaryEntry {
	entry := domain.DiaryEntry{ID: newID("diary"), PetID: petID, UserID: userID, Body: body, ImageURL: imageURL, Mood: mood, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	s.pool.Exec(s.ctx(), `INSERT INTO diary_entries(id,pet_id,user_id,body,image_url,mood,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
		entry.ID, entry.PetID, entry.UserID, entry.Body, entry.ImageURL, entry.Mood, entry.CreatedAt)
	return entry
}

// ================================================================
// Playdates & Groups
// ================================================================

func (s *PostgresStore) ListPlaydates() []domain.Playdate {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, organizer_id, title, description, date, location, max_pets, attendees, created_at FROM playdates ORDER BY date`)
	defer rows.Close()
	var out []domain.Playdate
	for rows.Next() {
		var p domain.Playdate
		rows.Scan(&p.ID, &p.OrganizerID, &p.Title, &p.Description, &p.Date, &p.Location, &p.MaxPets, &p.Attendees, &p.CreatedAt)
		if p.Attendees == nil { p.Attendees = []string{} }
		out = append(out, p)
	}
	if out == nil { return []domain.Playdate{} }
	return out
}

func (s *PostgresStore) CreatePlaydate(userID string, playdate domain.Playdate) domain.Playdate {
	playdate.ID = newID("pd")
	playdate.OrganizerID = userID
	playdate.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	if playdate.Attendees == nil { playdate.Attendees = []string{} }
	s.pool.Exec(s.ctx(), `INSERT INTO playdates(id,organizer_id,title,description,date,location,max_pets,attendees,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		playdate.ID, playdate.OrganizerID, playdate.Title, playdate.Description, playdate.Date, playdate.Location, playdate.MaxPets, playdate.Attendees, playdate.CreatedAt)
	return playdate
}

func (s *PostgresStore) JoinPlaydate(userID string, playdateID string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE playdates SET attendees = array_append(attendees, $1) WHERE id=$2 AND NOT ($1 = ANY(attendees))`, userID, playdateID)
	return err
}

func (s *PostgresStore) ListGroups(userID string) []domain.CommunityGroup {
	rows, _ := s.pool.Query(s.ctx(),
		`SELECT g.id, g.name, g.description, g.pet_type, g.member_count,
		        g.image_url, g.conversation_id, g.created_at,
		        COALESCE(c.user_ids, '{}')
		 FROM community_groups g
		 LEFT JOIN conversations c ON g.conversation_id = c.id
		 ORDER BY g.created_at DESC`)
	defer rows.Close()
	var out []domain.CommunityGroup
	for rows.Next() {
		var g domain.CommunityGroup
		var img, convID *string
		var convUserIDs []string
		var createdAt time.Time
		if err := rows.Scan(&g.ID, &g.Name, &g.Description, &g.PetType, &g.MemberCount,
			&img, &convID, &createdAt, &convUserIDs); err != nil {
			continue
		}
		g.CreatedAt = createdAt.Format(time.RFC3339)
		if img != nil {
			g.ImageURL = *img
		}
		if convID != nil {
			g.ConversationID = *convID
		}

		// Check membership
		g.IsMember = false
		for _, uid := range convUserIDs {
			if uid == userID {
				g.IsMember = true
				break
			}
		}

		// Fetch member profiles
		g.Members = []domain.GroupMember{}
		if len(convUserIDs) > 0 {
			memberRows, err := s.pool.Query(s.ctx(),
				`SELECT user_id, first_name, COALESCE(avatar_url,'')
				 FROM user_profiles WHERE user_id = ANY($1)`, convUserIDs)
			if err == nil {
				for memberRows.Next() {
					var m domain.GroupMember
					memberRows.Scan(&m.UserID, &m.FirstName, &m.AvatarURL)
					m.Pets = []domain.MemberPet{}
					g.Members = append(g.Members, m)
				}
				memberRows.Close()
			}
		}

		out = append(out, g)
	}
	if out == nil {
		return []domain.CommunityGroup{}
	}
	return out
}

func (s *PostgresStore) GetGroupByConversation(conversationID string) *domain.CommunityGroup {
	var g domain.CommunityGroup
	var img, convID *string
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, name, description, pet_type, member_count, image_url, conversation_id, created_at
		 FROM community_groups WHERE conversation_id = $1`, conversationID).Scan(
		&g.ID, &g.Name, &g.Description, &g.PetType, &g.MemberCount, &img, &convID, &g.CreatedAt)
	if err != nil {
		return nil
	}
	if img != nil {
		g.ImageURL = *img
	}
	if convID != nil {
		g.ConversationID = *convID
	}

	// Get conversation user_ids for members
	var userIDs []string
	_ = s.pool.QueryRow(s.ctx(),
		`SELECT user_ids FROM conversations WHERE id = $1`, conversationID).Scan(&userIDs)

	g.Members = []domain.GroupMember{}
	if len(userIDs) > 0 {
		// Fetch member profiles
		memberRows, err := s.pool.Query(s.ctx(),
			`SELECT user_id, first_name, COALESCE(avatar_url,'')
			 FROM user_profiles WHERE user_id = ANY($1)`, userIDs)
		if err == nil {
			for memberRows.Next() {
				var m domain.GroupMember
				memberRows.Scan(&m.UserID, &m.FirstName, &m.AvatarURL)
				m.Pets = []domain.MemberPet{}
				g.Members = append(g.Members, m)
			}
			memberRows.Close()
		}

		// Fetch pets for each member, filtered by group petType
		for i, member := range g.Members {
			var petQuery string
			var petArgs []any
			if g.PetType != "" && g.PetType != "all" {
				petQuery = `SELECT p.id, p.name, COALESCE((SELECT url FROM pet_photos WHERE pet_id = p.id ORDER BY display_order LIMIT 1),'')
					FROM pets p WHERE p.owner_id = $1 AND p.is_hidden = false AND LOWER(p.species_label) = LOWER($2)`
				petArgs = []any{member.UserID, g.PetType}
			} else {
				petQuery = `SELECT p.id, p.name, COALESCE((SELECT url FROM pet_photos WHERE pet_id = p.id ORDER BY display_order LIMIT 1),'')
					FROM pets p WHERE p.owner_id = $1 AND p.is_hidden = false`
				petArgs = []any{member.UserID}
			}
			petRows, err := s.pool.Query(s.ctx(), petQuery, petArgs...)
			if err == nil {
				for petRows.Next() {
					var pet domain.MemberPet
					petRows.Scan(&pet.ID, &pet.Name, &pet.PhotoURL)
					g.Members[i].Pets = append(g.Members[i].Pets, pet)
				}
				petRows.Close()
			}
		}
	}

	return &g
}

func (s *PostgresStore) CreateGroup(group domain.CommunityGroup) domain.CommunityGroup {
	group.ID = newID("grp")
	group.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	convID := newID("conv")
	group.ConversationID = convID
	s.pool.Exec(s.ctx(), `INSERT INTO conversations(id,match_id,title,subtitle,user_ids,last_message_at) VALUES($1,'',$2,'',$3,NOW())`, convID, group.Name, []string{})
	s.pool.Exec(s.ctx(), `INSERT INTO community_groups(id,name,description,pet_type,member_count,image_url,conversation_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		group.ID, group.Name, group.Description, group.PetType, group.MemberCount, nilIfEmpty(group.ImageURL), group.ConversationID, group.CreatedAt)
	return group
}

func (s *PostgresStore) JoinGroup(userID string, groupID string) error {
	var convID string
	s.pool.QueryRow(s.ctx(), `SELECT conversation_id FROM community_groups WHERE id=$1`, groupID).Scan(&convID)
	if convID == "" {
		return fmt.Errorf("group not found")
	}

	// Check if user is already a member
	var userIDs []string
	s.pool.QueryRow(s.ctx(), `SELECT user_ids FROM conversations WHERE id=$1`, convID).Scan(&userIDs)
	for _, uid := range userIDs {
		if uid == userID {
			return nil // Already a member, do nothing
		}
	}

	// Add user and sync member count from actual user_ids length
	s.pool.Exec(s.ctx(), `UPDATE conversations SET user_ids = array_append(user_ids, $1) WHERE id=$2`, userID, convID)
	s.pool.Exec(s.ctx(),
		`UPDATE community_groups SET member_count = (
			SELECT COALESCE(array_length(user_ids, 1), 0) FROM conversations WHERE id = $2
		) WHERE id = $1`, groupID, convID)
	return nil
}

// ================================================================
// Lost Pets
// ================================================================

func (s *PostgresStore) ListLostPets() []domain.LostPetAlert {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, user_id, description, last_seen_location, last_seen_date, status, contact_phone, image_url, created_at FROM lost_pet_alerts ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.LostPetAlert
	for rows.Next() {
		var a domain.LostPetAlert
		var img *string
		rows.Scan(&a.ID, &a.PetID, &a.UserID, &a.Description, &a.LastSeenLocation, &a.LastSeenDate, &a.Status, &a.ContactPhone, &img, &a.CreatedAt)
		a.ImageURL = img
		out = append(out, a)
	}
	if out == nil { return []domain.LostPetAlert{} }
	return out
}

func (s *PostgresStore) CreateLostPetAlert(alert domain.LostPetAlert) domain.LostPetAlert {
	alert.ID = newID("lost")
	alert.Status = "active"
	alert.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO lost_pet_alerts(id,pet_id,user_id,description,last_seen_location,last_seen_date,status,contact_phone,image_url,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		alert.ID, alert.PetID, alert.UserID, alert.Description, alert.LastSeenLocation, alert.LastSeenDate, alert.Status, alert.ContactPhone, alert.ImageURL, alert.CreatedAt)
	return alert
}

func (s *PostgresStore) UpdateLostPetStatus(alertID string, status string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE lost_pet_alerts SET status=$1 WHERE id=$2`, status, alertID)
	return err
}

// ================================================================
// Badges
// ================================================================

func (s *PostgresStore) ListBadges(userID string) []domain.Badge {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, type, title, description, earned_at FROM badges WHERE user_id=$1 ORDER BY earned_at DESC`, userID)
	defer rows.Close()
	var out []domain.Badge
	for rows.Next() {
		var b domain.Badge
		rows.Scan(&b.ID, &b.UserID, &b.Type, &b.Title, &b.Description, &b.EarnedAt)
		out = append(out, b)
	}
	if out == nil { return []domain.Badge{} }
	return out
}

func (s *PostgresStore) AwardBadge(userID string, badgeType string, title string, description string) {
	s.pool.Exec(s.ctx(), `INSERT INTO badges(id,user_id,type,title,description,earned_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id,type) DO NOTHING`,
		newID("badge"), userID, badgeType, title, description)
}

// ================================================================
// Training Tips
// ================================================================

func (s *PostgresStore) ListTrainingTips(petType string) []domain.TrainingTip {
	var rows pgx.Rows
	if petType != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips WHERE pet_type=$1 OR pet_type='all' ORDER BY title`, petType)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips ORDER BY title`)
	}
	defer rows.Close()
	var out []domain.TrainingTip
	for rows.Next() {
		var t domain.TrainingTip
		var vu *string
		rows.Scan(&t.ID, &t.Title, &t.Summary, &t.Body, &t.Category, &t.PetType, &t.Difficulty, &vu)
		if vu != nil { t.VideoURL = *vu }
		t.Steps = s.fetchTipSteps(t.ID)
		out = append(out, t)
	}
	if out == nil { return []domain.TrainingTip{} }
	return out
}

func (s *PostgresStore) fetchTipSteps(tipID string) []domain.TrainingTipStep {
	rows, _ := s.pool.Query(s.ctx(), `SELECT step_order, title, description, video_url FROM training_tip_steps WHERE tip_id=$1 ORDER BY step_order`, tipID)
	defer rows.Close()
	var out []domain.TrainingTipStep
	for rows.Next() {
		var st domain.TrainingTipStep
		var vu *string
		rows.Scan(&st.Order, &st.Title, &st.Description, &vu)
		if vu != nil { st.VideoURL = *vu }
		out = append(out, st)
	}
	if out == nil { return []domain.TrainingTipStep{} }
	return out
}

func (s *PostgresStore) CreateTrainingTip(tip domain.TrainingTip) domain.TrainingTip {
	tip.ID = newID("tip")
	s.pool.Exec(s.ctx(), `INSERT INTO training_tips(id,title,summary,body,category,pet_type,difficulty,video_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		tip.ID, tip.Title, tip.Summary, tip.Body, tip.Category, tip.PetType, tip.Difficulty, nilIfEmpty(tip.VideoURL))
	for i, step := range tip.Steps {
		s.pool.Exec(s.ctx(), `INSERT INTO training_tip_steps(id,tip_id,step_order,title,description,video_url) VALUES($1,$2,$3,$4,$5,$6)`,
			newID("step"), tip.ID, i+1, step.Title, step.Description, nilIfEmpty(step.VideoURL))
	}
	return tip
}

func (s *PostgresStore) GetTrainingTip(tipID string) (*domain.TrainingTip, error) {
	var t domain.TrainingTip
	var vu *string
	err := s.pool.QueryRow(s.ctx(), `SELECT id, title, summary, body, category, pet_type, difficulty, video_url FROM training_tips WHERE id=$1`, tipID).
		Scan(&t.ID, &t.Title, &t.Summary, &t.Body, &t.Category, &t.PetType, &t.Difficulty, &vu)
	if err != nil { return nil, fmt.Errorf("tip not found") }
	if vu != nil { t.VideoURL = *vu }
	t.Steps = s.fetchTipSteps(tipID)
	return &t, nil
}

func (s *PostgresStore) UpdateTrainingTip(tip domain.TrainingTip) (domain.TrainingTip, error) {
	s.pool.Exec(s.ctx(), `UPDATE training_tips SET title=$1,summary=$2,body=$3,category=$4,pet_type=$5,difficulty=$6,video_url=$7 WHERE id=$8`,
		tip.Title, tip.Summary, tip.Body, tip.Category, tip.PetType, tip.Difficulty, nilIfEmpty(tip.VideoURL), tip.ID)
	s.pool.Exec(s.ctx(), `DELETE FROM training_tip_steps WHERE tip_id=$1`, tip.ID)
	for i, step := range tip.Steps {
		s.pool.Exec(s.ctx(), `INSERT INTO training_tip_steps(id,tip_id,step_order,title,description,video_url) VALUES($1,$2,$3,$4,$5,$6)`,
			newID("step"), tip.ID, i+1, step.Title, step.Description, nilIfEmpty(step.VideoURL))
	}
	return tip, nil
}

func (s *PostgresStore) BookmarkTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `INSERT INTO user_tip_bookmarks(user_id,tip_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, tipID)
	return err
}

func (s *PostgresStore) UnbookmarkTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM user_tip_bookmarks WHERE user_id=$1 AND tip_id=$2`, userID, tipID)
	return err
}

func (s *PostgresStore) CompleteTip(userID, tipID string) error {
	_, err := s.pool.Exec(s.ctx(), `INSERT INTO user_tip_completions(user_id,tip_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, tipID)
	return err
}

func (s *PostgresStore) GetTipUserState(userID string) (map[string]bool, map[string]bool) {
	bookmarks := make(map[string]bool)
	completed := make(map[string]bool)
	rows, _ := s.pool.Query(s.ctx(), `SELECT tip_id FROM user_tip_bookmarks WHERE user_id=$1`, userID)
	for rows.Next() { var id string; rows.Scan(&id); bookmarks[id] = true }
	rows.Close()
	rows2, _ := s.pool.Query(s.ctx(), `SELECT tip_id FROM user_tip_completions WHERE user_id=$1`, userID)
	for rows2.Next() { var id string; rows2.Scan(&id); completed[id] = true }
	rows2.Close()
	return bookmarks, completed
}

// ================================================================
// Vet Clinics
// ================================================================

func (s *PostgresStore) ListVetClinics() []domain.VetClinic {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, name, phone, address, latitude, longitude, city, is_emergency, website, hours FROM vet_clinics`)
	defer rows.Close()
	var out []domain.VetClinic
	for rows.Next() {
		var c domain.VetClinic
		var web, hrs *string
		rows.Scan(&c.ID, &c.Name, &c.Phone, &c.Address, &c.Latitude, &c.Longitude, &c.City, &c.IsEmergency, &web, &hrs)
		if web != nil { c.Website = *web }
		if hrs != nil { c.Hours = *hrs }
		out = append(out, c)
	}
	if out == nil { return []domain.VetClinic{} }
	return out
}

func (s *PostgresStore) CreateVetClinic(clinic domain.VetClinic) domain.VetClinic {
	clinic.ID = newID("vet")
	s.pool.Exec(s.ctx(), `INSERT INTO vet_clinics(id,name,phone,address,latitude,longitude,city,is_emergency,website,hours) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		clinic.ID, clinic.Name, clinic.Phone, clinic.Address, clinic.Latitude, clinic.Longitude, clinic.City, clinic.IsEmergency, nilIfEmpty(clinic.Website), nilIfEmpty(clinic.Hours))
	return clinic
}

func (s *PostgresStore) DeleteVetClinic(clinicID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM vet_clinics WHERE id=$1`, clinicID)
	return err
}

// ================================================================
// Pet Sitters
// ================================================================

func (s *PostgresStore) ListPetSitters(city string) []domain.PetSitter {
	var rows pgx.Rows
	if city != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude FROM pet_sitters WHERE city_label=$1`, city)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude FROM pet_sitters`)
	}
	defer rows.Close()
	var out []domain.PetSitter
	for rows.Next() {
		var p domain.PetSitter
		var av *string
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Bio, &p.HourlyRate, &p.Currency, &p.Phone, &p.Rating, &p.ReviewCount, &p.Services, &p.CityLabel, &av, &p.Latitude, &p.Longitude)
		p.AvatarURL = av
		if p.Services == nil { p.Services = []string{} }
		out = append(out, p)
	}
	if out == nil { return []domain.PetSitter{} }
	return out
}

func (s *PostgresStore) CreatePetSitter(sitter domain.PetSitter) domain.PetSitter {
	sitter.ID = newID("sitter")
	if sitter.Services == nil { sitter.Services = []string{} }
	s.pool.Exec(s.ctx(), `INSERT INTO pet_sitters(id,user_id,name,bio,hourly_rate,currency,phone,rating,review_count,services,city_label,avatar_url,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		sitter.ID, sitter.UserID, sitter.Name, sitter.Bio, sitter.HourlyRate, sitter.Currency, sitter.Phone, sitter.Rating, sitter.ReviewCount, sitter.Services, sitter.CityLabel, sitter.AvatarURL, sitter.Latitude, sitter.Longitude)
	return sitter
}

// ================================================================
// Push Notifications
// ================================================================

func (s *PostgresStore) SavePushToken(userID string, token string, platform string) {
	s.pool.Exec(s.ctx(), `INSERT INTO push_tokens(id,user_id,token,platform) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,token) DO NOTHING`,
		newID("pt"), userID, token, platform)
}

func (s *PostgresStore) ListAllPushTokens() []domain.PushToken {
	rows, _ := s.pool.Query(s.ctx(), `SELECT user_id, token, platform, created_at FROM push_tokens`)
	defer rows.Close()
	var out []domain.PushToken
	for rows.Next() {
		var t domain.PushToken
		rows.Scan(&t.UserID, &t.Token, &t.Platform, &t.CreatedAt)
		out = append(out, t)
	}
	if out == nil { return []domain.PushToken{} }
	return out
}

func (s *PostgresStore) GetUserPushTokens(userID string) []domain.PushToken {
	rows, _ := s.pool.Query(s.ctx(), `SELECT user_id, token, platform, created_at FROM push_tokens WHERE user_id=$1`, userID)
	defer rows.Close()
	var out []domain.PushToken
	for rows.Next() {
		var t domain.PushToken
		rows.Scan(&t.UserID, &t.Token, &t.Platform, &t.CreatedAt)
		out = append(out, t)
	}
	if out == nil { return []domain.PushToken{} }
	return out
}

func (s *PostgresStore) SaveNotification(notification domain.Notification) {
	if notification.ID == "" { notification.ID = newID("notif") }
	if notification.SentAt == "" { notification.SentAt = time.Now().UTC().Format(time.RFC3339) }
	s.pool.Exec(s.ctx(), `INSERT INTO notifications(id,title,body,target,sent_at,sent_by) VALUES($1,$2,$3,$4,$5,$6)`,
		notification.ID, notification.Title, notification.Body, notification.Target, notification.SentAt, notification.SentBy)
}

func (s *PostgresStore) ListNotifications() []domain.Notification {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, title, body, target, sent_at, sent_by FROM notifications ORDER BY sent_at DESC`)
	defer rows.Close()
	var out []domain.Notification
	for rows.Next() {
		var n domain.Notification
		var sentAt time.Time
		rows.Scan(&n.ID, &n.Title, &n.Body, &n.Target, &sentAt, &n.SentBy)
		n.SentAt = sentAt.Format(time.RFC3339)
		out = append(out, n)
	}
	if out == nil { return []domain.Notification{} }
	return out
}

// ================================================================
// Reports (remaining)
// ================================================================

func (s *PostgresStore) ListReports() []domain.ReportSummary {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, reason, reporter_id, reporter_name, target_type, target_id, target_label, status, notes, resolved_at, created_at FROM reports ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.ReportSummary
	for rows.Next() {
		var r domain.ReportSummary
		var notes, resolvedAt *string
		rows.Scan(&r.ID, &r.Reason, &r.ReporterID, &r.ReporterName, &r.TargetType, &r.TargetID, &r.TargetLabel, &r.Status, &notes, &resolvedAt, &r.CreatedAt)
		if notes != nil { r.Notes = *notes }
		if resolvedAt != nil { r.ResolvedAt = *resolvedAt }
		out = append(out, r)
	}
	if out == nil { return []domain.ReportSummary{} }
	return out
}

func (s *PostgresStore) ResolveReport(reportID string, notes string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE reports SET status='resolved', notes=$1, resolved_at=NOW() WHERE id=$2`, notes, reportID)
	return err
}

func (s *PostgresStore) GetReportDetail(reportID string) (*domain.ReportDetail, error) {
	var r domain.ReportSummary
	var notes, resolvedAt *string
	err := s.pool.QueryRow(s.ctx(), `SELECT id, reason, reporter_id, reporter_name, target_type, target_id, target_label, status, notes, resolved_at, created_at FROM reports WHERE id=$1`, reportID).
		Scan(&r.ID, &r.Reason, &r.ReporterID, &r.ReporterName, &r.TargetType, &r.TargetID, &r.TargetLabel, &r.Status, &notes, &resolvedAt, &r.CreatedAt)
	if err != nil { return nil, fmt.Errorf("report not found") }
	if notes != nil { r.Notes = *notes }
	if resolvedAt != nil { r.ResolvedAt = *resolvedAt }
	detail := &domain.ReportDetail{ReportSummary: r}
	return detail, nil
}

// ================================================================
// Walk Routes
// ================================================================

func (s *PostgresStore) ListWalkRoutes(city string) []domain.WalkRoute {
	var rows pgx.Rows
	if city != "" {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, name, description, distance, estimated_time, difficulty, city_label, created_at FROM walk_routes WHERE city_label=$1 ORDER BY name`, city)
	} else {
		rows, _ = s.pool.Query(s.ctx(), `SELECT id, name, description, distance, estimated_time, difficulty, city_label, created_at FROM walk_routes ORDER BY name`)
	}
	defer rows.Close()
	var out []domain.WalkRoute
	for rows.Next() {
		var w domain.WalkRoute
		rows.Scan(&w.ID, &w.Name, &w.Description, &w.Distance, &w.EstimatedTime, &w.Difficulty, &w.CityLabel, &w.CreatedAt)
		w.Coordinates = s.fetchRouteCoords(w.ID)
		out = append(out, w)
	}
	if out == nil { return []domain.WalkRoute{} }
	return out
}

func (s *PostgresStore) fetchRouteCoords(routeID string) []domain.WalkRouteCoord {
	rows, _ := s.pool.Query(s.ctx(), `SELECT latitude, longitude FROM walk_route_coords WHERE route_id=$1 ORDER BY display_order`, routeID)
	defer rows.Close()
	var out []domain.WalkRouteCoord
	for rows.Next() {
		var c domain.WalkRouteCoord
		rows.Scan(&c.Lat, &c.Lng)
		out = append(out, c)
	}
	if out == nil { return []domain.WalkRouteCoord{} }
	return out
}

func (s *PostgresStore) CreateWalkRoute(route domain.WalkRoute) domain.WalkRoute {
	route.ID = newID("route")
	route.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO walk_routes(id,name,description,distance,estimated_time,difficulty,city_label,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		route.ID, route.Name, route.Description, route.Distance, route.EstimatedTime, route.Difficulty, route.CityLabel, route.CreatedAt)
	for i, c := range route.Coordinates {
		s.pool.Exec(s.ctx(), `INSERT INTO walk_route_coords(id,route_id,latitude,longitude,display_order) VALUES($1,$2,$3,$4,$5)`,
			newID("wrc"), route.ID, c.Lat, c.Lng, i)
	}
	return route
}

func (s *PostgresStore) DeleteWalkRoute(routeID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM walk_routes WHERE id=$1`, routeID)
	return err
}

// ================================================================
// Adoptions
// ================================================================

func (s *PostgresStore) ListAdoptions() []domain.AdoptionListing {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, user_id, pet_name, pet_age, pet_species, pet_breed, description, contact_phone, contact_email, location, image_url, status, created_at FROM adoption_listings ORDER BY created_at DESC`)
	defer rows.Close()
	var out []domain.AdoptionListing
	for rows.Next() {
		var a domain.AdoptionListing
		var img *string
		rows.Scan(&a.ID, &a.UserID, &a.PetName, &a.PetAge, &a.PetSpecies, &a.PetBreed, &a.Description, &a.ContactPhone, &a.ContactEmail, &a.Location, &img, &a.Status, &a.CreatedAt)
		a.ImageURL = img
		out = append(out, a)
	}
	if out == nil { return []domain.AdoptionListing{} }
	return out
}

func (s *PostgresStore) CreateAdoption(listing domain.AdoptionListing) domain.AdoptionListing {
	listing.ID = newID("adopt")
	listing.Status = "active"
	listing.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO adoption_listings(id,user_id,pet_name,pet_age,pet_species,pet_breed,description,contact_phone,contact_email,location,image_url,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		listing.ID, listing.UserID, listing.PetName, listing.PetAge, listing.PetSpecies, listing.PetBreed, listing.Description, listing.ContactPhone, listing.ContactEmail, listing.Location, listing.ImageURL, listing.Status, listing.CreatedAt)
	return listing
}

func (s *PostgresStore) UpdateAdoptionStatus(listingID string, status string) error {
	_, err := s.pool.Exec(s.ctx(), `UPDATE adoption_listings SET status=$1 WHERE id=$2`, status, listingID)
	return err
}

func (s *PostgresStore) DeleteAdoption(listingID string) error {
	_, err := s.pool.Exec(s.ctx(), `DELETE FROM adoption_listings WHERE id=$1`, listingID)
	return err
}

func (s *PostgresStore) GetAdoption(listingID string) (*domain.AdoptionListing, error) {
	var a domain.AdoptionListing
	var createdAt time.Time
	err := s.pool.QueryRow(s.ctx(),
		`SELECT id, user_id, pet_name, pet_age, pet_species, pet_breed, description,
		        contact_phone, contact_email, location, image_url, status, created_at
		 FROM adoption_listings WHERE id=$1`, listingID).
		Scan(&a.ID, &a.UserID, &a.PetName, &a.PetAge, &a.PetSpecies, &a.PetBreed,
			&a.Description, &a.ContactPhone, &a.ContactEmail, &a.Location, &a.ImageURL,
			&a.Status, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("adoption listing not found")
	}
	a.CreatedAt = createdAt.Format(time.RFC3339)
	return &a, nil
}

// ================================================================
// Pet Albums & Milestones
// ================================================================

func (s *PostgresStore) ListPetAlbums(petID string) []domain.PetAlbum {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, title, created_at FROM pet_albums WHERE pet_id=$1 ORDER BY created_at DESC`, petID)
	defer rows.Close()
	var out []domain.PetAlbum
	for rows.Next() {
		var a domain.PetAlbum
		rows.Scan(&a.ID, &a.PetID, &a.Title, &a.CreatedAt)
		a.Photos = s.fetchAlbumPhotos(a.ID)
		out = append(out, a)
	}
	if out == nil { return []domain.PetAlbum{} }
	return out
}

func (s *PostgresStore) fetchAlbumPhotos(albumID string) []domain.PetPhoto {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, url, is_primary FROM pet_album_photos WHERE album_id=$1 ORDER BY display_order`, albumID)
	defer rows.Close()
	var out []domain.PetPhoto
	for rows.Next() {
		var p domain.PetPhoto
		rows.Scan(&p.ID, &p.URL, &p.IsPrimary)
		out = append(out, p)
	}
	if out == nil { return []domain.PetPhoto{} }
	return out
}

func (s *PostgresStore) CreatePetAlbum(album domain.PetAlbum) domain.PetAlbum {
	album.ID = newID("album")
	album.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	s.pool.Exec(s.ctx(), `INSERT INTO pet_albums(id,pet_id,title,created_at) VALUES($1,$2,$3,$4)`, album.ID, album.PetID, album.Title, album.CreatedAt)
	for i, photo := range album.Photos {
		s.pool.Exec(s.ctx(), `INSERT INTO pet_album_photos(id,album_id,url,is_primary,display_order) VALUES($1,$2,$3,$4,$5)`,
			newID("ap"), album.ID, photo.URL, photo.IsPrimary, i)
	}
	if album.Photos == nil { album.Photos = []domain.PetPhoto{} }
	return album
}

func (s *PostgresStore) ListPetMilestones(petID string) []domain.PetMilestone {
	rows, _ := s.pool.Query(s.ctx(), `SELECT id, pet_id, type, title, description, achieved_at FROM pet_milestones WHERE pet_id=$1 ORDER BY achieved_at DESC`, petID)
	defer rows.Close()
	var out []domain.PetMilestone
	for rows.Next() {
		var m domain.PetMilestone
		rows.Scan(&m.ID, &m.PetID, &m.Type, &m.Title, &m.Description, &m.AchievedAt)
		out = append(out, m)
	}
	if out == nil { return []domain.PetMilestone{} }
	return out
}

func (s *PostgresStore) AwardMilestone(petID string, milestoneType string, title string, description string) {
	s.pool.Exec(s.ctx(), `INSERT INTO pet_milestones(id,pet_id,type,title,description,achieved_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(pet_id,type) DO NOTHING`,
		newID("ms"), petID, milestoneType, title, description)
}

// helper
func nilIfEmpty(s string) *string {
	if s == "" { return nil }
	return &s
}

// Ensure unused imports compile
var (
	_ = rand.Intn
	_ = sort.Strings
)
