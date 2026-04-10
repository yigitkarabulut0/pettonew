-- Petto Relational Schema Migration
-- Migrates from JSON blob (app_state) to proper relational tables
-- All PKs are TEXT to preserve existing string IDs (user-xxx, pet-xxx, etc.)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================
-- CORE: Users & Auth
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  city_id TEXT NOT NULL DEFAULT '',
  city_label TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT,
  is_visible_on_map BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL
);

-- ============================================================
-- TAXONOMIES (species, breeds, hobbies, compatibility, characters, cities, venue-categories)
-- ============================================================

CREATE TABLE IF NOT EXISTS taxonomies (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  slug TEXT NOT NULL,
  species_id TEXT,
  icon TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_taxonomies_kind ON taxonomies(kind);

-- ============================================================
-- PETS
-- ============================================================

CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age_years INT NOT NULL DEFAULT 0,
  gender TEXT NOT NULL DEFAULT 'male',
  birth_date TEXT,
  species_id TEXT NOT NULL DEFAULT '',
  species_label TEXT NOT NULL DEFAULT '',
  breed_id TEXT NOT NULL DEFAULT '',
  breed_label TEXT NOT NULL DEFAULT '',
  activity_level INT NOT NULL DEFAULT 3 CHECK (activity_level BETWEEN 1 AND 5),
  hobbies TEXT[] NOT NULL DEFAULT '{}',
  good_with TEXT[] NOT NULL DEFAULT '{}',
  characters TEXT[] NOT NULL DEFAULT '{}',
  is_neutered BOOLEAN NOT NULL DEFAULT FALSE,
  bio TEXT NOT NULL DEFAULT '',
  city_label TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  theme_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

CREATE TABLE IF NOT EXISTS pet_photos (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pet_photos_pet ON pet_photos(pet_id);

-- ============================================================
-- MATCHING & SOCIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS swipes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  actor_pet_id TEXT NOT NULL,
  target_pet_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_pet_id, target_pet_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_actor ON swipes(actor_pet_id);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  pet_a_id TEXT NOT NULL,
  pet_b_id TEXT NOT NULL,
  matched_owner_name TEXT NOT NULL DEFAULT '',
  matched_owner_avatar_url TEXT,
  last_message_preview TEXT NOT NULL DEFAULT '',
  unread_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  conversation_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  unread_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_pet_pairs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  my_pet_id TEXT NOT NULL,
  my_pet_name TEXT NOT NULL DEFAULT '',
  my_pet_photo_url TEXT,
  matched_pet_id TEXT NOT NULL,
  matched_pet_name TEXT NOT NULL DEFAULT '',
  matched_pet_photo_url TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_profile_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_user_id, blocked_user_id)
);

-- ============================================================
-- POSTS & FEED
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  venue_id TEXT,
  venue_name TEXT,
  event_id TEXT,
  event_name TEXT,
  like_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_tagged_pets (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pet_id TEXT NOT NULL,
  PRIMARY KEY(post_id, pet_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, pet_id)
);

-- ============================================================
-- EXPLORE: Venues & Events
-- ============================================================

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  city_label TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  image_url TEXT,
  hours TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_check_ins (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  pet_ids TEXT[] NOT NULL DEFAULT '{}',
  pet_names TEXT[] NOT NULL DEFAULT '{}',
  pet_count INT NOT NULL DEFAULT 0,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkins_venue ON venue_check_ins(venue_id);

CREATE TABLE IF NOT EXISTS venue_reviews (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city_label TEXT NOT NULL DEFAULT '',
  venue_id TEXT,
  venue_name TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  audience TEXT NOT NULL DEFAULT 'everyone',
  pet_focus TEXT NOT NULL DEFAULT 'all-pets',
  attendee_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  pet_ids TEXT[] NOT NULL DEFAULT '{}',
  pet_names TEXT[] NOT NULL DEFAULT '{}',
  rsvp_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HEALTH & PET CARE
-- ============================================================

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  mood TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diary_pet ON diary_entries(pet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health_records (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  next_due_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_pet ON health_records(pet_id);

CREATE TABLE IF NOT EXISTS weight_entries (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vet_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS vet_clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  city TEXT NOT NULL DEFAULT '',
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  website TEXT,
  hours TEXT
);

CREATE TABLE IF NOT EXISTS feeding_schedules (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  meal_name TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  food_type TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

-- ============================================================
-- COMMUNITY
-- ============================================================

CREATE TABLE IF NOT EXISTS playdates (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  max_pets INT NOT NULL DEFAULT 10,
  attendees TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  pet_type TEXT NOT NULL DEFAULT 'all',
  member_count INT NOT NULL DEFAULT 0,
  image_url TEXT,
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lost_pet_alerts (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  last_seen_location TEXT NOT NULL DEFAULT '',
  last_seen_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  contact_phone TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lost_status ON lost_pet_alerts(status);

-- ============================================================
-- TRAINING & GAMIFICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS training_tips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  pet_type TEXT NOT NULL DEFAULT 'all',
  difficulty TEXT NOT NULL DEFAULT 'easy',
  video_url TEXT
);

CREATE TABLE IF NOT EXISTS training_tip_steps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tip_id TEXT NOT NULL REFERENCES training_tips(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  video_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_tip_steps ON training_tip_steps(tip_id, step_order);

CREATE TABLE IF NOT EXISTS user_tip_bookmarks (
  user_id TEXT NOT NULL,
  tip_id TEXT NOT NULL,
  PRIMARY KEY(user_id, tip_id)
);

CREATE TABLE IF NOT EXISTS user_tip_completions (
  user_id TEXT NOT NULL,
  tip_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, tip_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);
CREATE INDEX IF NOT EXISTS idx_badges_user ON badges(user_id);

-- ============================================================
-- SERVICES
-- ============================================================

CREATE TABLE IF NOT EXISTS pet_sitters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  hourly_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  phone TEXT NOT NULL DEFAULT '',
  rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  review_count INT NOT NULL DEFAULT 0,
  services TEXT[] NOT NULL DEFAULT '{}',
  city_label TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS walk_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  distance TEXT NOT NULL DEFAULT '',
  estimated_time TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'easy',
  city_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS walk_route_coords (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  route_id TEXT NOT NULL REFERENCES walk_routes(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adoption_listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  pet_name TEXT NOT NULL DEFAULT '',
  pet_age INT NOT NULL DEFAULT 0,
  pet_species TEXT NOT NULL DEFAULT '',
  pet_breed TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_albums (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_album_photos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  album_id TEXT NOT NULL REFERENCES pet_albums(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pet_milestones (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pet_id, type)
);

-- ============================================================
-- SYSTEM: Push Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT 'all',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by TEXT NOT NULL DEFAULT 'system'
);

-- ============================================================
-- MODERATION
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL DEFAULT '',
  reporter_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  target_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
