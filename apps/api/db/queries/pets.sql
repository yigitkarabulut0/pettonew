-- name: CreatePet :one
INSERT INTO pets (user_id, name, species_id, breed_id, age, activity_level, neutered, avatar_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetPetByID :one
SELECT * FROM pets WHERE id = $1;

-- name: ListPetsByUserID :many
SELECT * FROM pets WHERE user_id = $1 ORDER BY created_at DESC;

-- name: UpdatePet :one
UPDATE pets
SET
  name = COALESCE(sqlc.narg('name'), name),
  species_id = COALESCE(sqlc.narg('species_id'), species_id),
  breed_id = COALESCE(sqlc.narg('breed_id'), breed_id),
  age = COALESCE(sqlc.narg('age'), age),
  activity_level = COALESCE(sqlc.narg('activity_level'), activity_level),
  neutered = COALESCE(sqlc.narg('neutered'), neutered),
  avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url)
WHERE id = $1
RETURNING *;

-- name: DeletePet :exec
DELETE FROM pets WHERE id = $1 AND user_id = $2;

-- name: ListAllPets :many
SELECT pets.* FROM pets
JOIN users ON pets.user_id = users.id
WHERE ($1::text IS NULL OR pets.name ILIKE '%' || $1 || '%')
ORDER BY pets.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountAllPets :one
SELECT COUNT(*) FROM pets
WHERE ($1::text IS NULL OR pets.name ILIKE '%' || $1 || '%');

-- name: SetPetCompatibilities :exec
DELETE FROM pet_compatibilities WHERE pet_id = $1;

-- name: InsertPetCompatibility :exec
INSERT INTO pet_compatibilities (pet_id, compatibility_id) VALUES ($1, $2);

-- name: SetPetHobbies :exec
DELETE FROM pet_hobbies WHERE pet_id = $1;

-- name: InsertPetHobby :exec
INSERT INTO pet_hobbies (pet_id, hobby_id) VALUES ($1, $2);

-- name: GetPetCompatibilities :many
SELECT pet_compatibility_options.* FROM pet_compatibilities
JOIN pet_compatibility_options ON pet_compatibilities.compatibility_id = pet_compatibility_options.id
WHERE pet_compatibilities.pet_id = $1;

-- name: GetPetHobbies :many
SELECT pet_hobby_options.* FROM pet_hobbies
JOIN pet_hobby_options ON pet_hobbies.hobby_id = pet_hobby_options.id
WHERE pet_hobbies.pet_id = $1;

-- name: CountPets :one
SELECT COUNT(*) FROM pets;

-- name: ListPetsForMatching :many
SELECT DISTINCT p.* FROM pets p
WHERE p.user_id != $1
  AND p.id NOT IN (
    SELECT swiped_pet_id FROM swipes WHERE swiper_pet_id = ANY($2::uuid[])
  )
  AND p.id NOT IN (
    SELECT CASE
      WHEN pet_id_1 = ANY($2::uuid[]) THEN pet_id_2
      ELSE pet_id_1
    END FROM matches
    WHERE pet_id_1 = ANY($2::uuid[]) OR pet_id_2 = ANY($2::uuid[])
  )
ORDER BY p.created_at DESC
LIMIT $3 OFFSET $4;
