package server

import (
	"net/http"
	"strconv"
	"strings"
)

// AdminListQuery captures the common query params every admin list endpoint
// accepts. Handlers can ignore any field that does not apply.
type AdminListQuery struct {
	Limit      int
	Offset     int
	Cursor     string
	Search     string
	Status     string
	Sort       string
	From       string
	To         string
	ExtraFlags map[string]string
}

func parseAdminListQuery(r *http.Request) AdminListQuery {
	q := r.URL.Query()
	limit := 20
	if raw := q.Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	offset := 0
	if raw := q.Get("offset"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			offset = n
		}
	}
	extras := map[string]string{}
	for key, values := range q {
		switch key {
		case "limit", "offset", "cursor", "q", "status", "sort", "from", "to":
			continue
		}
		if len(values) > 0 {
			extras[key] = values[0]
		}
	}
	return AdminListQuery{
		Limit:      limit,
		Offset:     offset,
		Cursor:     q.Get("cursor"),
		Search:     strings.TrimSpace(q.Get("q")),
		Status:     q.Get("status"),
		Sort:       q.Get("sort"),
		From:       q.Get("from"),
		To:         q.Get("to"),
		ExtraFlags: extras,
	}
}

// writeAdminList wraps list results in the standard paginated envelope.
func writeAdminList(w http.ResponseWriter, data any, total int, nextCursor string) {
	envelope := map[string]any{
		"data":  data,
		"total": total,
	}
	if nextCursor != "" {
		envelope["nextCursor"] = nextCursor
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": envelope})
}
