-- name: CreateLocation :one
INSERT INTO locations (name, description, category_id, lat, lng, address, image_url, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetLocationByID :one
SELECT * FROM locations WHERE id = $1;

-- name: ListLocations :many
SELECT l.*, lc.name as category_name FROM locations l
JOIN location_categories lc ON l.category_id = lc.id
WHERE ($1::uuid IS NULL OR l.category_id = $1)
ORDER BY l.name
LIMIT $2 OFFSET $3;

-- name: CountLocations :one
SELECT COUNT(*) FROM locations
WHERE ($1::uuid IS NULL OR category_id = $1);

-- name: UpdateLocation :one
UPDATE locations
SET
  name = COALESCE(sqlc.narg('name'), name),
  description = COALESCE(sqlc.narg('description'), description),
  category_id = COALESCE(sqlc.narg('category_id'), category_id),
  lat = COALESCE(sqlc.narg('lat'), lat),
  lng = COALESCE(sqlc.narg('lng'), lng),
  address = COALESCE(sqlc.narg('address'), address),
  image_url = COALESCE(sqlc.narg('image_url'), image_url)
WHERE id = $1
RETURNING *;

-- name: DeleteLocation :exec
DELETE FROM locations WHERE id = $1;

-- name: GetLocationCategories :many
SELECT * FROM location_categories ORDER BY name;

-- name: CreateLocationCategory :one
INSERT INTO location_categories (name) VALUES ($1) RETURNING *;

-- name: DeleteLocationCategory :exec
DELETE FROM location_categories WHERE id = $1;

-- name: CreateCheckIn :one
INSERT INTO check_ins (user_id, location_id)
VALUES ($1, $2)
RETURNING *;

-- name: GetActiveCheckIn :one
SELECT * FROM check_ins
WHERE user_id = $1 AND checked_out_at IS NULL
LIMIT 1;

-- name: Checkout :exec
UPDATE check_ins SET checked_out_at = NOW()
WHERE user_id = $1 AND checked_out_at IS NULL;

-- name: GetActiveCheckInsByLocation :many
SELECT c.*, u.first_name, u.last_name, u.avatar_url as user_avatar
FROM check_ins c
JOIN users u ON c.user_id = u.id
WHERE c.location_id = $1 AND c.checked_out_at IS NULL;

-- name: CountCheckIns :one
SELECT COUNT(*) FROM check_ins;

-- name: GetNearbyLocations :many
SELECT l.*, lc.name as category_name,
  earth_distance(
    ll_to_earth(l.lat, l.lng),
    ll_to_earth($1, $2)
  ) as distance_meters
FROM locations l
JOIN location_categories lc ON l.category_id = lc.id
WHERE earth_distance(
    ll_to_earth(l.lat, l.lng),
    ll_to_earth($1, $2)
  ) <= $3
ORDER BY distance_meters;

-- name: CreateEvent :one
INSERT INTO events (title, description, location_id, lat, lng, start_time, end_time, max_participants, filters, image_url, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetEventByID :one
SELECT * FROM events WHERE id = $1;

-- name: ListEvents :many
SELECT * FROM events
WHERE start_time > NOW()
ORDER BY start_time ASC
LIMIT $1 OFFSET $2;

-- name: CountUpcomingEvents :one
SELECT COUNT(*) FROM events WHERE start_time > NOW();

-- name: UpdateEvent :one
UPDATE events
SET
  title = COALESCE(sqlc.narg('title'), title),
  description = COALESCE(sqlc.narg('description'), description),
  lat = COALESCE(sqlc.narg('lat'), lat),
  lng = COALESCE(sqlc.narg('lng'), lng),
  start_time = COALESCE(sqlc.narg('start_time'), start_time),
  end_time = COALESCE(sqlc.narg('end_time'), end_time),
  max_participants = COALESCE(sqlc.narg('max_participants'), max_participants),
  filters = COALESCE(sqlc.narg('filters'), filters),
  image_url = COALESCE(sqlc.narg('image_url'), image_url)
WHERE id = $1
RETURNING *;

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;

-- name: JoinEvent :one
INSERT INTO event_participants (event_id, user_id, status)
VALUES ($1, $2, $3)
ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3
RETURNING *;

-- name: LeaveEvent :exec
DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2;

-- name: GetEventParticipants :many
SELECT ep.*, u.first_name, u.last_name, u.avatar_url as user_avatar
FROM event_participants ep
JOIN users u ON ep.user_id = u.id
WHERE ep.event_id = $1;

-- name: CountEventParticipants :one
SELECT COUNT(*) FROM event_participants WHERE event_id = $1;

-- name: IsEventParticipant :one
SELECT EXISTS(SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2);

-- name: ListAllEventsAdmin :many
SELECT * FROM events ORDER BY created_at DESC LIMIT $1 OFFSET $2;

-- name: CountAllEvents :one
SELECT COUNT(*) FROM events;
