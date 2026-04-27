package server

import (
	"net/http"
	"strings"
)

// Country / city / timezone catalogue used by the admin scheduling UI.
//
// We curate this list on the server (not in the frontend) for two reasons:
//   1. It's the same data that has to filter users at fire time. Drift
//      between the picker and the resolver leads to schedules that look
//      valid in the UI but match zero users.
//   2. Free-text input was the original bug — "Londo" instead of "London"
//      silently no-ops the filter. A picklist on a known list eliminates
//      that class of typo.
//
// Cities are stored as the human-friendly form Petto's mobile profile
// asks for (city_label is the user's free-text answer). The scheduler
// matches case-insensitive contains, so minor spelling drift in user
// data still resolves.

type adminCountry struct {
	Code   string   `json:"code"`
	Name   string   `json:"name"`
	Cities []string `json:"cities"`
}

// adminCountries is hand-curated for the markets Petto operates in
// (Turkey-first, then EU + UK + US for cross-border traffic). Add a
// country here when you genuinely need to broadcast to it — keep the
// list lean so the dropdown stays usable.
var adminCountries = []adminCountry{
	{
		Code: "TR", Name: "Türkiye",
		Cities: []string{
			"Adana", "Ankara", "Antalya", "Aydın", "Balıkesir", "Bodrum", "Bursa",
			"Diyarbakır", "Eskişehir", "Gaziantep", "Istanbul", "İstanbul", "İzmir",
			"Kayseri", "Kocaeli", "Konya", "Mersin", "Muğla", "Sakarya", "Samsun",
			"Şanlıurfa", "Tekirdağ", "Trabzon",
		},
	},
	{
		Code: "GB", Name: "United Kingdom",
		Cities: []string{
			"Belfast", "Birmingham", "Brighton", "Bristol", "Cambridge",
			"Cardiff", "Edinburgh", "Glasgow", "Leeds", "Liverpool", "London",
			"Manchester", "Newcastle", "Nottingham", "Oxford", "Sheffield",
		},
	},
	{
		Code: "US", Name: "United States",
		Cities: []string{
			"Atlanta", "Austin", "Boston", "Chicago", "Dallas", "Denver",
			"Houston", "Los Angeles", "Miami", "New York", "Philadelphia",
			"Phoenix", "Portland", "San Diego", "San Francisco", "Seattle",
			"Washington",
		},
	},
	{
		Code: "DE", Name: "Deutschland",
		Cities: []string{
			"Berlin", "Bremen", "Cologne", "Köln", "Dortmund", "Düsseldorf",
			"Essen", "Frankfurt", "Hamburg", "Hannover", "Leipzig", "Munich",
			"München", "Nuremberg", "Stuttgart",
		},
	},
	{
		Code: "FR", Name: "France",
		Cities: []string{
			"Bordeaux", "Lille", "Lyon", "Marseille", "Montpellier", "Nantes",
			"Nice", "Paris", "Rennes", "Strasbourg", "Toulouse",
		},
	},
	{
		Code: "ES", Name: "España",
		Cities: []string{
			"Barcelona", "Bilbao", "Madrid", "Málaga", "Palma", "Seville",
			"Valencia", "Zaragoza",
		},
	},
	{
		Code: "IT", Name: "Italia",
		Cities: []string{
			"Bologna", "Florence", "Genoa", "Milan", "Naples", "Palermo",
			"Rome", "Turin", "Venice", "Verona",
		},
	},
	{
		Code: "NL", Name: "Netherlands",
		Cities: []string{
			"Amsterdam", "Eindhoven", "Groningen", "The Hague", "Rotterdam",
			"Utrecht",
		},
	},
	{
		Code: "PL", Name: "Polska",
		Cities: []string{
			"Gdańsk", "Katowice", "Kraków", "Łódź", "Poznań", "Warsaw",
			"Wrocław",
		},
	},
	{
		Code: "GR", Name: "Greece",
		Cities: []string{
			"Athens", "Heraklion", "Larissa", "Patras", "Thessaloniki",
		},
	},
	{
		Code: "AE", Name: "United Arab Emirates",
		Cities: []string{
			"Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras al-Khaimah",
			"Sharjah",
		},
	},
	{
		Code: "SA", Name: "Saudi Arabia",
		Cities: []string{"Dammam", "Jeddah", "Mecca", "Medina", "Riyadh"},
	},
}

// adminTimezones curated to the IANA zones admins typically pick. The
// frontend can extend this with `Intl.supportedValuesOf("timeZone")` if
// needed; we keep the server-side hint short so the dropdown is fast.
var adminTimezones = []string{
	"Europe/Istanbul",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Europe/Madrid",
	"Europe/Rome",
	"Europe/Amsterdam",
	"Europe/Athens",
	"Europe/Warsaw",
	"Asia/Dubai",
	"Asia/Riyadh",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"UTC",
}

func (s *Server) handleAdminLocations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"countries": adminCountries,
			"timezones": adminTimezones,
		},
	})
}

// citiesForCountry returns the curated city list for a country code, or
// nil when the code is unknown. Used by the scheduler at fire time to
// expand a country filter into the SQL "city_label ILIKE ANY(...)" clause.
func citiesForCountry(code string) []string {
	if code == "" {
		return nil
	}
	for _, c := range adminCountries {
		if strings.EqualFold(c.Code, code) {
			return c.Cities
		}
	}
	return nil
}
