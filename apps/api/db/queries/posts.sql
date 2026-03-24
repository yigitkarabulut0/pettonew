-- name: CreatePost :one
INSERT INTO posts (user_id, content, image_urls)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetPostByID :one
SELECT * FROM posts WHERE id = $1;

-- name: ListPosts :many
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: ListPostsByUser :many
SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: DeletePost :exec
DELETE FROM posts WHERE id = $1 AND user_id = $2;

-- name: CountPosts :one
SELECT COUNT(*) FROM posts;

-- name: CountPostsCreatedAfter :one
SELECT COUNT(*) FROM posts WHERE created_at > $1;

-- name: SearchPosts :many
SELECT * FROM posts
WHERE search_vector @@ plainto_tsquery('english', $1)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
LIMIT $2 OFFSET $3;

-- name: CountSearchPosts :one
SELECT COUNT(*) FROM posts
WHERE search_vector @@ plainto_tsquery('english', $1);

-- name: ListMatchedUserPosts :many
SELECT DISTINCT posts.* FROM posts
JOIN matches ON (
  (matches.pet_id_1 = ANY($2::uuid[]) AND posts.user_id IN (
    SELECT user_id FROM pets WHERE id = matches.pet_id_2
  )) OR
  (matches.pet_id_2 = ANY($2::uuid[]) AND posts.user_id IN (
    SELECT user_id FROM pets WHERE id = matches.pet_id_1
  ))
)
WHERE posts.user_id != $1
ORDER BY posts.created_at DESC
LIMIT $3 OFFSET $4;

-- name: CountMatchedUserPosts :one
SELECT COUNT(DISTINCT posts.id) FROM posts
JOIN matches ON (
  (matches.pet_id_1 = ANY($2::uuid[]) AND posts.user_id IN (
    SELECT user_id FROM pets WHERE id = matches.pet_id_2
  )) OR
  (matches.pet_id_2 = ANY($2::uuid[]) AND posts.user_id IN (
    SELECT user_id FROM pets WHERE id = matches.pet_id_1
  ))
)
WHERE posts.user_id != $1;

-- name: SetReaction :one
INSERT INTO post_reactions (post_id, user_id, type)
VALUES ($1, $2, $3)
ON CONFLICT (post_id, user_id) DO UPDATE SET type = $3
RETURNING *;

-- name: RemoveReaction :exec
DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2;

-- name: GetReaction :one
SELECT * FROM post_reactions WHERE post_id = $1 AND user_id = $2;

-- name: ListPostsAdmin :many
SELECT posts.*, users.email, users.first_name, users.last_name FROM posts
JOIN users ON posts.user_id = users.id
WHERE ($1::text IS NULL OR posts.content ILIKE '%' || $1 || '%')
  AND ($2::uuid IS NULL OR posts.user_id = $2)
ORDER BY posts.created_at DESC
LIMIT $3 OFFSET $4;

-- name: CountPostsAdmin :one
SELECT COUNT(*) FROM posts
WHERE ($1::text IS NULL OR posts.content ILIKE '%' || $1 || '%')
  AND ($2::uuid IS NULL OR posts.user_id = $2);

-- name: DeletePostAdmin :exec
DELETE FROM posts WHERE id = $1;
