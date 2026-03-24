-- name: CreateSwipe :one
INSERT INTO swipes (swiper_pet_id, swiped_pet_id, direction)
VALUES ($1, $2, $3)
ON CONFLICT (swiper_pet_id, swiped_pet_id) DO NOTHING
RETURNING *;

-- name: HasSwiped :one
SELECT EXISTS(SELECT 1 FROM swipes WHERE swiper_pet_id = $1 AND swiped_pet_id = $2);

-- name: HasLikedBack :one
SELECT EXISTS(SELECT 1 FROM swipes WHERE swiper_pet_id = $1 AND swiped_pet_id = $2 AND direction = 'like');

-- name: CheckForMatch :one
SELECT EXISTS(
  SELECT 1 FROM swipes s1
  JOIN swipes s2 ON s1.swiper_pet_id = s2.swiped_pet_id AND s1.swiped_pet_id = s2.swiper_pet_id
  WHERE s1.swiper_pet_id = $1 AND s2.direction = 'like'
);

-- name: CreateMatch :one
INSERT INTO matches (pet_id_1, pet_id_2)
VALUES (
  LEAST($1, $2),
  GREATEST($1, $2)
)
ON CONFLICT (pet_id_1, pet_id_2) DO NOTHING
RETURNING *;

-- name: ListMatchesByUserID :many
SELECT m.*, p1.name as pet1_name, p1.avatar_url as pet1_avatar,
       p2.name as pet2_name, p2.avatar_url as pet2_avatar,
       u1.first_name || ' ' || u1.last_name as pet1_owner_name,
       u2.first_name || ' ' || u2.last_name as pet2_owner_name
FROM matches m
JOIN pets p1 ON m.pet_id_1 = p1.id
JOIN pets p2 ON m.pet_id_2 = p2.id
JOIN users u1 ON p1.user_id = u1.id
JOIN users u2 ON p2.user_id = u2.id
WHERE p1.user_id = $1 OR p2.user_id = $1
ORDER BY m.matched_at DESC
LIMIT $2 OFFSET $3;

-- name: CountMatchesByUserID :one
SELECT COUNT(*) FROM matches m
JOIN pets p1 ON m.pet_id_1 = p1.id
JOIN pets p2 ON m.pet_id_2 = p2.id
WHERE p1.user_id = $1 OR p2.user_id = $1;

-- name: ListMatchesByPetIDs :many
SELECT m.*, p1.name as pet1_name, p1.avatar_url as pet1_avatar,
       p2.name as pet2_name, p2.avatar_url as pet2_avatar
FROM matches m
JOIN pets p1 ON m.pet_id_1 = p1.id
JOIN pets p2 ON m.pet_id_2 = p2.id
WHERE m.pet_id_1 = ANY($1::uuid[]) OR m.pet_id_2 = ANY($1::uuid[]);

-- name: CountMatches :one
SELECT COUNT(*) FROM matches;

-- name: GetPetSwipeStats :one
SELECT
  COUNT(*) FILTER (WHERE direction = 'like') as total_likes,
  COUNT(*) FILTER (WHERE direction = 'pass') as total_passes
FROM swipes WHERE swiper_pet_id = $1;

-- name: CountUserMatches :one
SELECT COUNT(*) FROM matches m
JOIN pets p ON (p.id = m.pet_id_1 OR p.id = m.pet_id_2)
WHERE p.user_id = $1;
