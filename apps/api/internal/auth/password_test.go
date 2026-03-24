package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("Petto123!")
	if err != nil {
		t.Fatalf("expected hash, got error: %v", err)
	}

	if !VerifyPassword("Petto123!", hash) {
		t.Fatal("expected password to verify")
	}

	if VerifyPassword("wrong", hash) {
		t.Fatal("expected wrong password to fail")
	}
}

