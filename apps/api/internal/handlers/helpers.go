package handlers

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/petto/api/db/sqlcgen"
	"github.com/petto/api/internal/models"
)

func toNullString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func fromNullString(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func toNullInt32(i *int) sql.NullInt32 {
	if i == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(*i), Valid: true}
}

func fromNullInt32(ni sql.NullInt32) *int {
	if !ni.Valid {
		return nil
	}
	v := int(ni.Int32)
	return &v
}

func toNullInt16(i *int) sql.NullInt16 {
	if i == nil {
		return sql.NullInt16{}
	}
	return sql.NullInt16{Int16: int16(*i), Valid: true}
}

func toNullBool(b *bool) sql.NullBool {
	if b == nil {
		return sql.NullBool{}
	}
	return sql.NullBool{Bool: *b, Valid: true}
}

func fromNullBool(nb sql.NullBool) *bool {
	if !nb.Valid {
		return nil
	}
	return &nb.Bool
}

func toNullFloat64(f *float64) sql.NullFloat64 {
	if f == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *f, Valid: true}
}

func fromNullFloat64(nf sql.NullFloat64) *float64 {
	if !nf.Valid {
		return nil
	}
	return &nf.Float64
}

func toNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func fromNullTime(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	return &nt.Time
}

func toNullTimeIfNonZero(t time.Time) sql.NullTime {
	if t.IsZero() {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: t, Valid: true}
}

func toNullUUID(s *string) uuid.NullUUID {
	if s == nil {
		return uuid.NullUUID{}
	}
	parsed, err := uuid.Parse(*s)
	if err != nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: parsed, Valid: true}
}

func fromNullUUID(u uuid.NullUUID) *string {
	if !u.Valid {
		return nil
	}
	s := u.UUID.String()
	return &s
}

func userToModel(u sqlcgen.User) models.User {
	return models.User{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Phone:     fromNullString(u.Phone),
		Gender:    fromNullString(u.Gender),
		AvatarURL: fromNullString(u.AvatarUrl),
		Role:      u.Role,
		IsBanned:  u.IsBanned,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

func petToModel(p sqlcgen.Pet) models.Pet {
	return models.Pet{
		ID:            p.ID,
		UserID:        p.UserID,
		Name:          p.Name,
		SpeciesID:     p.SpeciesID,
		BreedID:       fromNullUUID(p.BreedID),
		Age:           fromNullInt32(p.Age),
		ActivityLevel: int(p.ActivityLevel),
		Neutered:      p.Neutered,
		AvatarURL:     fromNullString(p.AvatarUrl),
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
	}
}
