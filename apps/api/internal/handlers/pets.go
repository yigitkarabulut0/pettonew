package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func ListMyPets(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		ctx := c.Request.Context()
		pets, err := q.ListPetsByUserID(ctx, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to list pets"})
			return
		}

		var result []gin.H
		for _, p := range pets {
			petMap := gin.H{
				"id":             p.ID,
				"user_id":        p.UserID,
				"name":           p.Name,
				"species_id":     p.SpeciesID,
				"breed_id":       fromNullUUID(p.BreedID),
				"age":            fromNullInt32(p.Age),
				"activity_level": int(p.ActivityLevel),
				"neutered":       p.Neutered,
				"avatar_url":     fromNullString(p.AvatarUrl),
				"created_at":     p.CreatedAt,
				"updated_at":     p.UpdatedAt,
			}

			compatibilities, _ := q.GetPetCompatibilities(ctx, p.ID)
			var compList []gin.H
			for _, comp := range compatibilities {
				compList = append(compList, gin.H{"id": comp.ID, "name": comp.Name})
			}
			petMap["compatibilities"] = compList

			hobbies, _ := q.GetPetHobbies(ctx, p.ID)
			var hobbyList []gin.H
			for _, h := range hobbies {
				hobbyList = append(hobbyList, gin.H{"id": h.ID, "name": h.Name})
			}
			petMap["hobbies"] = hobbyList

			result = append(result, petMap)
		}

		c.JSON(http.StatusOK, result)
	}
}

func CreatePet(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		var req models.PetCreate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()
		pet, err := q.CreatePet(ctx, sqlcgen.CreatePetParams{
			UserID:        userID,
			Name:          req.Name,
			SpeciesID:     req.SpeciesID,
			BreedID:       toNullUUID(req.BreedID),
			Age:           toNullInt32(req.Age),
			ActivityLevel: int16(req.ActivityLevel),
			Neutered:      req.Neutered,
			AvatarUrl:     toNullString(req.AvatarURL),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to create pet"})
			return
		}

		if len(req.CompatibilityIDs) > 0 {
			for _, compID := range req.CompatibilityIDs {
				q.InsertPetCompatibility(ctx, sqlcgen.InsertPetCompatibilityParams{
					PetID:           pet.ID,
					CompatibilityID: compID,
				})
			}
		}

		if len(req.HobbyIDs) > 0 {
			for _, hID := range req.HobbyIDs {
				q.InsertPetHobby(ctx, sqlcgen.InsertPetHobbyParams{
					PetID:   pet.ID,
					HobbyID: hID,
				})
			}
		}

		c.JSON(http.StatusCreated, petToModel(pet))
	}
}

func GetPet(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		pet, err := q.GetPetByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": "not_found", "message": "pet not found"})
			return
		}
		c.JSON(http.StatusOK, petToModel(pet))
	}
}

func UpdatePet(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		var req models.PetUpdate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}

		ctx := c.Request.Context()

		pet, err := q.UpdatePet(ctx, sqlcgen.UpdatePetParams{
			ID:            id,
			Name:          toNullString(req.Name),
			SpeciesID:     toNullUUID(req.SpeciesID),
			BreedID:       toNullUUID(req.BreedID),
			Age:           toNullInt32(req.Age),
			ActivityLevel: toNullInt16(req.ActivityLevel),
			Neutered:      toNullBool(req.Neutered),
			AvatarUrl:     toNullString(req.AvatarURL),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to update pet"})
			return
		}

		if req.CompatibilityIDs != nil {
			q.SetPetCompatibilities(ctx, id)
			for _, compID := range req.CompatibilityIDs {
				q.InsertPetCompatibility(ctx, sqlcgen.InsertPetCompatibilityParams{
					PetID:           id,
					CompatibilityID: compID,
				})
			}
		}

		if req.HobbyIDs != nil {
			q.SetPetHobbies(ctx, id)
			for _, hID := range req.HobbyIDs {
				q.InsertPetHobby(ctx, sqlcgen.InsertPetHobbyParams{
					PetID:   id,
					HobbyID: hID,
				})
			}
		}

		c.JSON(http.StatusOK, petToModel(pet))
	}
}

func DeletePet(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		id := c.Param("id")
		if err := q.DeletePet(c.Request.Context(), sqlcgen.DeletePetParams{
			ID:     id,
			UserID: userID,
		}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "failed to delete pet"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "pet deleted"})
	}
}

func AdminListPets(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var p models.Pagination
		if err := c.ShouldBindQuery(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		if p.PageSize == 0 {
			p.PageSize = 20
		}

		search := c.Query("search")
		offset := (p.Page - 1) * p.PageSize
		ctx := c.Request.Context()

		total, _ := q.CountAllPets(ctx, search)
		pets, _ := q.ListAllPets(ctx, sqlcgen.ListAllPetsParams{
			Column1: search,
			Limit:   int32(p.PageSize),
			Offset:  int32(offset),
		})

		var result []models.Pet
		for _, p := range pets {
			result = append(result, petToModel(p))
		}

		c.JSON(http.StatusOK, models.PaginatedResponse{
			Data:     result,
			Total:    total,
			Page:     p.Page,
			PageSize: p.PageSize,
			HasMore:  int64(offset+p.PageSize) < total,
		})
	}
}

func GetSpecies(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		species, _ := q.GetSpecies(c.Request.Context())
		var result []gin.H
		for _, s := range species {
			result = append(result, gin.H{"id": s.ID, "name": s.Name, "created_at": s.CreatedAt})
		}
		c.JSON(http.StatusOK, result)
	}
}

func GetBreedsBySpecies(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		speciesID := c.Param("speciesId")
		breeds, _ := q.GetBreedsBySpecies(c.Request.Context(), speciesID)
		var result []gin.H
		for _, b := range breeds {
			result = append(result, gin.H{
				"id": b.ID, "species_id": b.SpeciesID, "name": b.Name, "created_at": b.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, result)
	}
}

func GetCompatibilities(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		compatibilities, _ := q.GetCompatibilityOptions(c.Request.Context())
		var result []gin.H
		for _, c := range compatibilities {
			result = append(result, gin.H{"id": c.ID, "name": c.Name, "created_at": c.CreatedAt})
		}
		c.JSON(http.StatusOK, result)
	}
}

func GetHobbies(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		hobbies, _ := q.GetHobbyOptions(c.Request.Context())
		var result []gin.H
		for _, h := range hobbies {
			result = append(result, gin.H{"id": h.ID, "name": h.Name, "created_at": h.CreatedAt})
		}
		c.JSON(http.StatusOK, result)
	}
}

func AdminCreateSpecies(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req struct {
			Name string `json:"name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		species, err := q.CreateSpecies(c.Request.Context(), req.Name)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"code": "conflict", "message": "species already exists"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": species.ID, "name": species.Name, "created_at": species.CreatedAt})
	}
}

func AdminDeleteSpecies(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteSpecies(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "species deleted"})
	}
}

func AdminGetAllBreeds(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		breeds, _ := q.GetAllBreeds(c.Request.Context())
		var result []gin.H
		for _, b := range breeds {
			result = append(result, gin.H{
				"id": b.ID, "species_id": b.SpeciesID, "name": b.Name,
				"species_name": b.SpeciesName, "created_at": b.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, result)
	}
}

func AdminCreateBreed(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req struct {
			SpeciesID string `json:"species_id" binding:"required,uuid"`
			Name      string `json:"name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		breed, err := q.CreateBreed(c.Request.Context(), sqlcgen.CreateBreedParams{
			SpeciesID: req.SpeciesID,
			Name:      req.Name,
		})
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"code": "conflict", "message": "breed already exists for this species"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"id": breed.ID, "species_id": breed.SpeciesID, "name": breed.Name, "created_at": breed.CreatedAt,
		})
	}
}

func AdminDeleteBreed(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteBreed(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "breed deleted"})
	}
}

func AdminCreateCompatibility(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req struct {
			Name string `json:"name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		comp, err := q.CreateCompatibilityOption(c.Request.Context(), req.Name)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"code": "conflict", "message": "compatibility option already exists"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": comp.ID, "name": comp.Name, "created_at": comp.CreatedAt})
	}
}

func AdminDeleteCompatibility(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteCompatibilityOption(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "compatibility option deleted"})
	}
}

func AdminCreateHobby(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		var req struct {
			Name string `json:"name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": "invalid_input", "message": err.Error()})
			return
		}
		hobby, err := q.CreateHobbyOption(c.Request.Context(), req.Name)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"code": "conflict", "message": "hobby option already exists"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": hobby.ID, "name": hobby.Name, "created_at": hobby.CreatedAt})
	}
}

func AdminDeleteHobby(db *sql.DB) gin.HandlerFunc {
	q := sqlcgen.New(db)
	return func(c *gin.Context) {
		id := c.Param("id")
		q.DeleteHobbyOption(c.Request.Context(), id)
		c.JSON(http.StatusOK, gin.H{"message": "hobby option deleted"})
	}
}
