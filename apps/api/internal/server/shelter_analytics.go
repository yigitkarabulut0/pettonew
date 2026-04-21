package server

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yigitkarabulut/petto/apps/api/internal/domain"
)

// Shelter analytics handlers — per-shelter dashboard data. All four
// query endpoints accept a `range` param in { 30d, 90d, 12m, all }
// and default to 30d when omitted. All are scoped to the authed
// shelter and gated on the editor role by the router.

// rangeToInterval maps the UI range-tab value onto the Postgres
// INTERVAL literal the store layer uses. Unknown values collapse to
// the 30-day default — never let user input leak to SQL.
func rangeToInterval(r string) (interval string, label string) {
	switch r {
	case "90d":
		return "90 days", "90d"
	case "12m":
		return "12 months", "12m"
	case "all":
		return "", "all"
	default:
		return "30 days", "30d"
	}
}

func (s *Server) handleShelterAnalyticsOverview(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	interval, label := rangeToInterval(r.URL.Query().Get("range"))

	active := s.store.CountShelterActiveListings(shelterID)
	month := s.store.CountShelterAdoptionsThisMonth(shelterID)
	year := s.store.CountShelterAdoptionsThisYear(shelterID)
	avg, sample := s.store.AvgDaysToAdoption(shelterID)
	topID, topName, topCount := s.store.TopApplicationListing(shelterID, interval)

	out := domain.AnalyticsOverview{
		Range:              label,
		ActiveListings:     active,
		AdoptionsThisMonth: month,
		AdoptionsThisYear:  year,
		AvgDaysToAdoption:  avg,
		AvgSampleSize:      sample,
	}
	if topID != "" {
		out.TopListing = &struct {
			ID               string `json:"id"`
			Name             string `json:"name"`
			ApplicationCount int    `json:"applicationCount"`
		}{ID: topID, Name: topName, ApplicationCount: topCount}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (s *Server) handleShelterAnalyticsListings(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	interval, _ := rangeToInterval(r.URL.Query().Get("range"))
	rows := s.store.ListingPerformance(shelterID, interval)
	writeJSON(w, http.StatusOK, map[string]any{"data": rows})
}

func (s *Server) handleShelterAnalyticsFunnel(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	interval, _ := rangeToInterval(r.URL.Query().Get("range"))
	writeJSON(w, http.StatusOK, map[string]any{
		"data": s.store.ApplicationFunnel(shelterID, interval),
	})
}

// handleShelterAnalyticsExport streams the current listings table as
// CSV. Content-Disposition triggers the browser download. Never
// returns JSON — errors go through as HTTP status codes.
func (s *Server) handleShelterAnalyticsExport(w http.ResponseWriter, r *http.Request) {
	shelterID := currentShelterID(r)
	interval, label := rangeToInterval(r.URL.Query().Get("range"))
	rows := s.store.ListingPerformance(shelterID, interval)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="petto-analytics-%s-%s.csv"`, shelterID, label))

	// Hand-rolled CSV — one header row + one row per listing. Escape
	// any commas or quotes in name/species by wrapping in quotes and
	// doubling embedded quotes (RFC 4180).
	fmt.Fprintf(w, "listing_id,name,species,listing_state,views,saves,applications,adoptions,days_listed\r\n")
	for _, row := range rows {
		fmt.Fprintf(w, "%s,%s,%s,%s,%d,%d,%d,%d,%d\r\n",
			csvField(row.ListingID),
			csvField(row.Name),
			csvField(row.Species),
			csvField(row.ListingState),
			row.Views,
			row.Saves,
			row.Applications,
			row.Adoptions,
			row.DaysListed,
		)
	}
}

// csvField quotes a value if it contains any CSV-problematic char
// (comma, quote, newline). Empty strings pass through unquoted.
func csvField(v string) string {
	if v == "" {
		return ""
	}
	if strings.ContainsAny(v, ",\"\r\n") {
		return `"` + strings.ReplaceAll(v, `"`, `""`) + `"`
	}
	return v
}

// handlePublicPetView is the anonymous view-tracking endpoint hit by
// the public profile's pet detail page. Idempotent from the client's
// perspective — we just bump a counter. No body expected.
func (s *Server) handlePublicPetView(w http.ResponseWriter, r *http.Request) {
	petID := chi.URLParam(r, "petID")
	if petID == "" {
		writeError(w, http.StatusBadRequest, "petID required")
		return
	}
	if err := s.store.IncrementPetViewCount(petID); err != nil {
		// Don't leak missing-pet as 404 — this is anonymous and should
		// behave the same whether the id exists or not so it can't be
		// used as an enumerator.
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
