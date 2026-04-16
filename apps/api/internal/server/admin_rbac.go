package server

import (
	"context"
	"net/http"
)

type adminCtxKey string

const adminIDCtxKey adminCtxKey = "adminID"
const adminRoleCtxKey adminCtxKey = "adminRole"

func adminIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(adminIDCtxKey).(string); ok {
		return v
	}
	return ""
}

func adminRoleFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(adminRoleCtxKey).(string); ok {
		return v
	}
	return "superadmin" // fail-open for legacy admins
}

// requireRole gates handlers to a minimum role level.
// Order: support (1) < moderator (2) < superadmin (3).
func (s *Server) requireRole(minimum string) func(http.Handler) http.Handler {
	weights := map[string]int{"support": 1, "moderator": 2, "superadmin": 3}
	needed := weights[minimum]
	if needed == 0 {
		needed = 1
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := weights[adminRoleFromContext(r.Context())]
			if got < needed {
				writeError(w, http.StatusForbidden, "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
