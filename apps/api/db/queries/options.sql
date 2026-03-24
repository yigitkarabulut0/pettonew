-- name: GetSpecies :many
SELECT * FROM pet_species ORDER BY name;

-- name: CreateSpecies :one
INSERT INTO pet_species (name) VALUES ($1) RETURNING *;

-- name: DeleteSpecies :exec
DELETE FROM pet_species WHERE id = $1;

-- name: GetBreedsBySpecies :many
SELECT * FROM pet_breeds WHERE species_id = $1 ORDER BY name;

-- name: GetAllBreeds :many
SELECT b.*, s.name as species_name FROM pet_breeds b
JOIN pet_species s ON b.species_id = s.id
ORDER BY s.name, b.name;

-- name: CreateBreed :one
INSERT INTO pet_breeds (species_id, name) VALUES ($1, $2) RETURNING *;

-- name: DeleteBreed :exec
DELETE FROM pet_breeds WHERE id = $1;

-- name: GetCompatibilityOptions :many
SELECT * FROM pet_compatibility_options ORDER BY name;

-- name: CreateCompatibilityOption :one
INSERT INTO pet_compatibility_options (name) VALUES ($1) RETURNING *;

-- name: DeleteCompatibilityOption :exec
DELETE FROM pet_compatibility_options WHERE id = $1;

-- name: GetHobbyOptions :many
SELECT * FROM pet_hobby_options ORDER BY name;

-- name: CreateHobbyOption :one
INSERT INTO pet_hobby_options (name) VALUES ($1) RETURNING *;

-- name: DeleteHobbyOption :exec
DELETE FROM pet_hobby_options WHERE id = $1;
