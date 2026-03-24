package service

import "testing"

func TestIsMutualLike(t *testing.T) {
	if !IsMutualLike("like", "super-like") {
		t.Fatal("expected mutual like to be true")
	}

	if IsMutualLike("pass", "like") {
		t.Fatal("expected pass not to create a match")
	}
}

