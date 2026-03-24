-- 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "earthdistance";
CREATE EXTENSION IF NOT EXISTS "cube";

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    gender VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Pet Species (Admin managed)
CREATE TABLE pet_species (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pet Breeds (Admin managed)
CREATE TABLE pet_breeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    species_id UUID NOT NULL REFERENCES pet_species(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(species_id, name)
);

CREATE INDEX idx_pet_breeds_species ON pet_breeds(species_id);

-- Pet Compatibility Options (Admin managed: cats, dogs, children, etc.)
CREATE TABLE pet_compatibility_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pet Hobby Options (Admin managed)
CREATE TABLE pet_hobby_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pets
CREATE TABLE pets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    species_id UUID NOT NULL REFERENCES pet_species(id),
    breed_id UUID REFERENCES pet_breeds(id),
    age INTEGER,
    activity_level SMALLINT NOT NULL DEFAULT 3 CHECK (activity_level BETWEEN 1 AND 5),
    neutered BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pets_user ON pets(user_id);
CREATE INDEX idx_pets_species ON pets(species_id);

-- Pet Compatibilities (Junction)
CREATE TABLE pet_compatibilities (
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    compatibility_id UUID NOT NULL REFERENCES pet_compatibility_options(id) ON DELETE CASCADE,
    PRIMARY KEY (pet_id, compatibility_id)
);

-- Pet Hobbies (Junction)
CREATE TABLE pet_hobbies (
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    hobby_id UUID NOT NULL REFERENCES pet_hobby_options(id) ON DELETE CASCADE,
    PRIMARY KEY (pet_id, hobby_id)
);

-- Posts
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    like_count INTEGER NOT NULL DEFAULT 0,
    congrats_count INTEGER NOT NULL DEFAULT 0,
    funny_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);

-- Full-text search index for posts
ALTER TABLE posts ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(content, '')), 'A')
    ) STORED;

CREATE INDEX idx_posts_search ON posts USING GIN(search_vector);

-- Post Reactions
CREATE TABLE post_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('like', 'congrats', 'funny')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_reactions_user ON post_reactions(user_id);

-- Swipes (for matching)
CREATE TABLE swipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swiper_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    swiped_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('like', 'pass')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(swiper_pet_id, swiped_pet_id)
);

CREATE INDEX idx_swipes_swiper ON swipes(swiper_pet_id);
CREATE INDEX idx_swipes_swiped ON swipes(swiped_pet_id);

-- Matches
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id_1 UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    pet_id_2 UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pet_id_1, pet_id_2),
    CHECK (pet_id_1 < pet_id_2)
);

CREATE INDEX idx_matches_pet1 ON matches(pet_id_1);
CREATE INDEX idx_matches_pet2 ON matches(pet_id_2);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('dm', 'group')),
    name VARCHAR(255),
    event_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation Members
CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pet_id UUID REFERENCES pets(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user ON conversation_members(user_id);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Location Categories (Admin managed)
CREATE TABLE location_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Locations (Admin managed)
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES location_categories(id),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    address TEXT,
    image_url TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_category ON locations(category_id);

-- Events
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    location_id UUID REFERENCES locations(id),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    max_participants INTEGER,
    filters JSONB NOT NULL DEFAULT '{}',
    image_url TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_created_by ON events(created_by);

-- Event Participants
CREATE TABLE event_participants (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

-- Check-ins
CREATE TABLE check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_out_at TIMESTAMPTZ
);

CREATE INDEX idx_checkins_location ON check_ins(location_id);
CREATE INDEX idx_checkins_user ON check_ins(user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pets_updated_at BEFORE UPDATE ON pets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reaction count maintenance functions
CREATE OR REPLACE FUNCTION increment_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'like' THEN
        UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.type = 'congrats' THEN
        UPDATE posts SET congrats_count = congrats_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.type = 'funny' THEN
        UPDATE posts SET funny_count = funny_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER on_reaction_insert AFTER INSERT ON post_reactions
    FOR EACH ROW EXECUTE FUNCTION increment_post_reaction_count();

CREATE OR REPLACE FUNCTION decrement_and_increment_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.type = 'like' THEN
        UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
    ELSIF OLD.type = 'congrats' THEN
        UPDATE posts SET congrats_count = congrats_count - 1 WHERE id = OLD.post_id;
    ELSIF OLD.type = 'funny' THEN
        UPDATE posts SET funny_count = funny_count - 1 WHERE id = OLD.post_id;
    END IF;

    IF NEW.type = 'like' THEN
        UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.type = 'congrats' THEN
        UPDATE posts SET congrats_count = congrats_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.type = 'funny' THEN
        UPDATE posts SET funny_count = funny_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER on_reaction_update AFTER UPDATE ON post_reactions
    FOR EACH ROW EXECUTE FUNCTION decrement_and_increment_post_reaction_count();

CREATE OR REPLACE FUNCTION decrement_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.type = 'like' THEN
        UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
    ELSIF OLD.type = 'congrats' THEN
        UPDATE posts SET congrats_count = congrats_count - 1 WHERE id = OLD.post_id;
    ELSIF OLD.type = 'funny' THEN
        UPDATE posts SET funny_count = funny_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
END;
$$ language 'plpgsql';

CREATE TRIGGER on_reaction_delete AFTER DELETE ON post_reactions
    FOR EACH ROW EXECUTE FUNCTION decrement_post_reaction_count();

-- Seed location categories
INSERT INTO location_categories (name) VALUES
    ('park'), ('cafe'), ('restaurant'), ('pub'), ('vet'), ('grooming'), ('other');

-- Seed pet species
INSERT INTO pet_species (name) VALUES
    ('Dog'), ('Cat'), ('Bird'), ('Rabbit'), ('Hamster'), ('Fish'), ('Other');

-- Seed pet compatibility options
INSERT INTO pet_compatibility_options (name) VALUES
    ('Dogs'), ('Cats'), ('Children'), ('Adults'), ('Seniors'), ('Other Pets');

-- Seed pet hobby options
INSERT INTO pet_hobby_options (name) VALUES
    ('Walking'), ('Running'), ('Playing Fetch'), ('Swimming'), ('Agility Training'),
    ('Cuddling'), ('Grooming'), ('Sleeping'), ('Exploring'), ('Socializing');
