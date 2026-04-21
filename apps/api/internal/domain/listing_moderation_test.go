package domain

import (
	"testing"
)

func TestAutoFlagListing_Clean(t *testing.T) {
	pet := ShelterPet{
		Name: "Luna", Species: "dog", Breed: "labrador",
		Description: "Friendly lab looking for a home.",
	}
	triggered, rules := AutoFlagListing(pet, "TR")
	if triggered || len(rules) != 0 {
		t.Fatalf("clean listing should not auto-flag, got rules=%v", rules)
	}
}

func TestAutoFlagListing_BannedBreedInCountry(t *testing.T) {
	pet := ShelterPet{Name: "Rex", Species: "dog", Breed: "Pitbull", Description: "looking for a home"}
	triggered, rules := AutoFlagListing(pet, "TR")
	if !triggered || !contains(rules, AutoFlagRuleBannedBreed) {
		t.Fatalf("expected banned_breed to fire, got %v", rules)
	}
}

func TestAutoFlagListing_ProhibitedSpecies(t *testing.T) {
	pet := ShelterPet{Name: "Slink", Species: "snake", Breed: ""}
	triggered, rules := AutoFlagListing(pet, "GB")
	if !triggered || !contains(rules, AutoFlagRuleProhibitedSpecies) {
		t.Fatalf("expected prohibited_species, got %v", rules)
	}
}

func TestAutoFlagListing_UnderAge(t *testing.T) {
	age := 1 // 1 month ~ 4 weeks, below 8
	pet := ShelterPet{Name: "Pup", Species: "dog", Breed: "mixed", AgeMonths: &age}
	triggered, rules := AutoFlagListing(pet, "GB")
	if !triggered || !contains(rules, AutoFlagRuleUnderAge) {
		t.Fatalf("expected under_age, got %v", rules)
	}
}

func TestAutoFlagListing_BannedBreedKeyword(t *testing.T) {
	// Breed field is clean, but description mentions banned breed.
	pet := ShelterPet{
		Name: "Buddy", Species: "dog", Breed: "mixed",
		Description: "Sweet boy — looks a bit like a Pit Bull.",
	}
	triggered, rules := AutoFlagListing(pet, "US")
	if !triggered || !contains(rules, AutoFlagRuleBannedBreedKeyword) {
		t.Fatalf("expected banned_breed_keyword, got %v", rules)
	}
}

func TestAutoFlagListing_Pregnancy(t *testing.T) {
	pet := ShelterPet{
		Name: "Mama", Species: "cat", Breed: "mixed",
		Description: "She is pregnant and needs a quiet home.",
	}
	triggered, rules := AutoFlagListing(pet, "GB")
	if !triggered || !contains(rules, AutoFlagRulePregnancyKeyword) {
		t.Fatalf("expected pregnancy_keyword, got %v", rules)
	}
}

func TestListingTransitionAllowed_HappyPath(t *testing.T) {
	cases := []struct {
		from, to, actor string
		ok              bool
	}{
		{ListingStateDraft, ListingStatePendingReview, ListingActorShelter, true},
		{ListingStateDraft, ListingStatePublished, ListingActorShelter, true},
		{ListingStatePendingReview, ListingStatePublished, ListingActorAdmin, true},
		{ListingStatePendingReview, ListingStateRejected, ListingActorAdmin, true},
		{ListingStatePublished, ListingStatePaused, ListingActorShelter, true},
		{ListingStatePublished, ListingStateAdopted, ListingActorShelter, true},
		{ListingStatePaused, ListingStatePublished, ListingActorShelter, true},
		{ListingStateRejected, ListingStateDraft, ListingActorShelter, true},
	}
	for _, c := range cases {
		if got := ListingTransitionAllowed(c.from, c.to, c.actor); got != c.ok {
			t.Errorf("%s → %s by %s: want %v got %v", c.from, c.to, c.actor, c.ok, got)
		}
	}
}

func TestListingTransitionAllowed_Rejected(t *testing.T) {
	// Illegal transitions must be rejected.
	cases := []struct{ from, to, actor string }{
		{ListingStateDraft, ListingStateRejected, ListingActorShelter}, // shelter cannot reject
		{ListingStatePendingReview, ListingStatePublished, ListingActorShelter}, // only admin can approve from queue
		{ListingStateAdopted, ListingStatePublished, ListingActorShelter},       // cannot un-adopt
		{ListingStateRejected, ListingStatePublished, ListingActorShelter},      // must go through draft first
		{ListingStatePublished, ListingStatePendingReview, ListingActorShelter}, // no shelter path back into queue
		{ListingStateArchived, ListingStatePublished, ListingActorShelter},      // archive is terminal
	}
	for _, c := range cases {
		if ListingTransitionAllowed(c.from, c.to, c.actor) {
			t.Errorf("%s → %s by %s should NOT be allowed but was", c.from, c.to, c.actor)
		}
	}
}

func TestIsValidRejectionCode(t *testing.T) {
	if !IsValidRejectionCode("banned_breed") {
		t.Fatal("banned_breed should be valid")
	}
	if IsValidRejectionCode("nope") {
		t.Fatal("nope should be invalid")
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
