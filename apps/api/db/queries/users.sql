-- name: CreateUser :one
INSERT INTO users (email, password_hash, first_name, last_name, phone, gender)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: UpdateUser :one
UPDATE users
SET
  first_name = COALESCE(sqlc.narg('first_name'), first_name),
  last_name = COALESCE(sqlc.narg('last_name'), last_name),
  phone = COALESCE(sqlc.narg('phone'), phone),
  gender = COALESCE(sqlc.narg('gender'), gender),
  avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url)
WHERE id = $1
RETURNING *;

-- name: UpdateUserRole :exec
UPDATE users SET role = $2 WHERE id = $1;

-- name: UpdateUserBan :exec
UPDATE users SET is_banned = $2 WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: ListUsers :many
SELECT * FROM users
WHERE ($1::text IS NULL OR email ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL OR role = $2)
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: CountUsers :one
SELECT COUNT(*) FROM users
WHERE ($1::text IS NULL OR email ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL OR role = $2);

-- name: StoreRefreshToken :one
INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE token_hash = $1;

-- name: DeleteRefreshToken :exec
DELETE FROM refresh_tokens WHERE token_hash = $1;

-- name: DeleteUserRefreshTokens :exec
DELETE FROM refresh_tokens WHERE user_id = $1;

-- name: GetUserPostStats :one
SELECT
  COUNT(*) as total_posts,
  COALESCE(SUM(like_count), 0) as total_likes,
  COALESCE(SUM(congrats_count), 0) as total_congrats,
  COALESCE(SUM(funny_count), 0) as total_funny
FROM posts WHERE user_id = $1;

-- name: CountUsersCreatedAfter :one
SELECT COUNT(*) FROM users WHERE created_at > $1;

-- name: CountActiveUsersAfter :one
SELECT COUNT(DISTINCT user_id) FROM post_reactions WHERE created_at > $1;
