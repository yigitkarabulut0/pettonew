package domain

import "strings"

// Compliance rules tied to the shelter's operating country.
// These are intentionally baked into the binary as a starting point:
// they're small, slow-moving, and admin-editable UI can come later.
//
// Country codes follow ISO-3166-1 alpha-2 upper-case (TR, GB, US, …).
// The special value "other_eu" is used by the wizard when the operating
// country isn't one of the explicit entries; it falls back to permissive
// defaults (no breed blocks, microchip not enforced).

// BreedBlocksByCountry lists breed slugs that are legally restricted or
// banned for adoption in the country's jurisdiction. The slugs match the
// lower-cased `breed` value shelters enter when creating a pet — we do
// a case-insensitive substring match so variants like "american pitbull
// terrier" still hit "pitbull".
var BreedBlocksByCountry = map[string][]string{
	"TR": {
		"pitbull", "pit bull",
		"american staffordshire terrier",
		"dogo argentino",
		"fila brasileiro",
		"tosa", "tosa inu",
		"american bully xl", "xl bully",
	},
	"GB": {
		"pitbull", "pit bull",
		"xl bully", "american bully xl",
		"tosa", "tosa inu",
		"dogo argentino",
		"fila brasileiro",
	},
	"IE": {
		// Ireland's restricted-breed list (muzzle + lead in public)
		// — we choose to block adoption listings for these breeds
		// until more nuanced UX exists.
		"american pit bull terrier", "pitbull", "pit bull",
		"bull mastiff",
		"doberman pinscher",
		"english bull terrier",
		"german shepherd", "alsatian",
		"japanese akita", "japanese tosa", "tosa",
		"rhodesian ridgeback",
		"rottweiler",
		"staffordshire bull terrier",
	},
}

// MicrochipRequiredByCountry is TRUE for jurisdictions where dogs (and
// in some cases cats) must be microchipped before rehoming. The pet
// create/update handlers refuse to persist a shelter pet without a
// microchip id when the shelter's operating country appears here.
var MicrochipRequiredByCountry = map[string]bool{
	"GB": true, // UK Dogs (Compulsory Microchipping) Regulations 2015
	"IE": true, // Microchipping of Dogs Regulations 2015
	"FR": true, // Chiens: obligatoire (ICAD)
	"IT": true, // SINAC anagrafe canina
	"ES": true, // REIAC
	"DE": true, // Tasso / FINDEFIX
	"NL": true, // Verplichte chip sinds 2013
}

// MicrochipAdvisoryByCountry is TRUE for jurisdictions where a future
// mandate exists but is not yet in force. UI shows an advisory banner
// but does not block listing submission. TR (Türkiye) moves to HAYBİS
// in 2026 — advisory copy until the mandate flips live.
var MicrochipAdvisoryByCountry = map[string]bool{
	"TR": true,
}

// AllowedSpeciesForAdoption is the whitelist of species slugs a shelter
// may list for adoption. Anything else (reptiles, exotics, farm, horses)
// is auto-blocked by the listing wizard at step 1 and by server-side
// validation on every submit.
var AllowedSpeciesForAdoption = []string{
	"dog",
	"cat",
	"rabbit",
	"ferret",
	"small_mammal", // hamsters, guinea pigs, mice, rats, gerbils
}

// IsAllowedSpecies reports whether a species slug may be listed. Match
// is case-insensitive with a substring relaxation so taxonomy labels
// like "Dogs" or "small-mammal" still pass.
func IsAllowedSpecies(speciesSlug string) bool {
	s := strings.ToLower(strings.TrimSpace(speciesSlug))
	if s == "" {
		return false
	}
	for _, allowed := range AllowedSpeciesForAdoption {
		if s == allowed || strings.Contains(s, allowed) || strings.Contains(allowed, s) {
			return true
		}
	}
	return false
}

// BreedBlockedInCountry reports whether `breed` is on the country's
// restricted list. `countryISO` is the operating-region country (e.g.
// the shelter's `operating_region_country`, not the country it's
// registered in). Empty `countryISO` or `breed` = not blocked.
func BreedBlockedInCountry(countryISO string, breed string) bool {
	country := strings.ToUpper(strings.TrimSpace(countryISO))
	normalised := strings.ToLower(strings.TrimSpace(breed))
	if country == "" || normalised == "" {
		return false
	}
	blocks, ok := BreedBlocksByCountry[country]
	if !ok {
		return false
	}
	for _, b := range blocks {
		if strings.Contains(normalised, b) {
			return true
		}
	}
	return false
}

// MicrochipRequired reports whether pets in `countryISO` must have a
// microchip id recorded.
func MicrochipRequired(countryISO string) bool {
	return MicrochipRequiredByCountry[strings.ToUpper(strings.TrimSpace(countryISO))]
}

// ── DSA listing moderation ─────────────────────────────────────────
// Everything below powers the 7-state listing lifecycle (draft →
// pending_review → published/rejected …) and the notice-and-action
// queues. Rules here are evaluated server-side on every submit; clients
// cannot bypass them.

// MinAgeWeeks is the welfare floor for listing a pet for adoption.
// Below this, the listing is auto-flagged under the `under_age` rule.
const MinAgeWeeks = 8

// ProhibitedSpecies lists species slugs that we never allow through
// the adoption channel — species outside the platform's scope (farm,
// equine, exotic/reptile). Match is case-insensitive on the pet's
// Species field; a substring match suffices.
var ProhibitedSpecies = []string{
	"reptile", "snake", "lizard", "iguana", "gecko", "tortoise", "turtle",
	"horse", "pony", "donkey",
	"cow", "cattle", "sheep", "pig", "goat",
	"ferret", "primate", "monkey",
	"exotic",
}

// PregnancyKeywords are substrings (case-insensitive) in the listing
// title or description that indicate a pregnant animal is being rehomed.
// We hold these listings for human review rather than auto-publishing.
var PregnancyKeywords = []string{
	"pregnant", "pregnancy",
	"hamile", "gebe", "gebelik",
	"expecting puppies", "expecting kittens",
	"carrying puppies", "carrying kittens",
	"with litter", "litter inside",
}

// BannedBreedKeywords is the flat union of every country-specific
// banned breed slug, used for a title/description substring check that
// runs regardless of the shelter's operating country — a belt-and-
// braces guard against mis-typed breed fields.
var BannedBreedKeywords = func() []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, list := range BreedBlocksByCountry {
		for _, b := range list {
			if _, ok := seen[b]; ok {
				continue
			}
			seen[b] = struct{}{}
			out = append(out, b)
		}
	}
	return out
}()

// RejectionReasonCodes is the admin-facing rejection enum. The map
// value is the human label; the key is the stable machine code stored
// in listing_state_transitions.reason_code and used by clients to
// render localised copy. Frozen at launch — adding a code requires a
// deploy.
var RejectionReasonCodes = map[string]string{
	"banned_breed":       "Banned breed",
	"prohibited_species": "Prohibited species",
	"under_age":          "Under 8 weeks",
	"welfare_concern":    "Animal welfare concern",
	"inaccurate_info":    "False or misleading info",
	"fraud_suspected":    "Suspected fraud",
	"duplicate":          "Duplicate listing",
	"policy_violation":   "Other policy violation",
}

// IsValidRejectionCode reports whether a caller-supplied code is one
// of the allowed rejection reasons. Admin reject handler calls this
// before persisting to keep the enum airtight.
func IsValidRejectionCode(code string) bool {
	_, ok := RejectionReasonCodes[code]
	return ok
}

// TrustedFlaggerUserIDs maps an app-user ID → organisation label for
// DSA Art. 22 trusted flaggers. Hardcoded at launch per product spec:
// "requires a deploy to update". Populate with real IDs after
// on-boarding HAYTAP / RSPCA / Eurogroup representatives.
var TrustedFlaggerUserIDs = map[string]string{
	// "user_<id>": "HAYTAP",
	// "user_<id>": "RSPCA",
	// "user_<id>": "Eurogroup for Animals",
}

// IsTrustedFlagger reports whether a reporter ID belongs to the
// hardcoded trusted-flagger list. Used to prioritise their reports in
// the admin queue.
func IsTrustedFlagger(userID string) bool {
	if userID == "" {
		return false
	}
	_, ok := TrustedFlaggerUserIDs[userID]
	return ok
}

// Auto-flag rule identifiers. Stored verbatim in
// listing_state_transitions.reason_code when a listing is moved to
// pending_review, and surfaced in the admin queue as badges.
const (
	AutoFlagRuleBannedBreed        = "banned_breed"
	AutoFlagRuleProhibitedSpecies  = "prohibited_species"
	AutoFlagRuleUnderAge           = "under_age"
	AutoFlagRuleBannedBreedKeyword = "banned_breed_keyword"
	AutoFlagRulePregnancyKeyword   = "pregnancy_keyword"
)

// AutoFlagListing runs the five launch-time auto-flag rules against a
// listing and returns every rule that fired. An empty slice means the
// listing is clean and may auto-publish. `shelterCountry` is the
// shelter's operating-region ISO; empty disables the country-specific
// breed check but leaves every other rule active.
func AutoFlagListing(pet ShelterPet, shelterCountry string) (triggered bool, rules []string) {
	// Rule 1 — banned breed in the shelter's jurisdiction.
	if BreedBlockedInCountry(shelterCountry, pet.Breed) {
		rules = append(rules, AutoFlagRuleBannedBreed)
	}
	// Rule 2 — prohibited species (species out of scope for adoption).
	if species := strings.ToLower(strings.TrimSpace(pet.Species)); species != "" {
		for _, blocked := range ProhibitedSpecies {
			if strings.Contains(species, blocked) {
				rules = append(rules, AutoFlagRuleProhibitedSpecies)
				break
			}
		}
	}
	// Rule 3 — under-age (< 8 weeks). `AgeMonths` is nullable; only
	// fire when we have a numeric value to compare against.
	if pet.AgeMonths != nil && *pet.AgeMonths*4 < MinAgeWeeks {
		rules = append(rules, AutoFlagRuleUnderAge)
	}
	// Rule 4 — banned breed keyword in name/description (catches
	// shelters who put the breed in the wrong field).
	haystack := strings.ToLower(pet.Name + " " + pet.Description)
	for _, kw := range BannedBreedKeywords {
		if kw == "" {
			continue
		}
		if strings.Contains(haystack, kw) {
			rules = append(rules, AutoFlagRuleBannedBreedKeyword)
			break
		}
	}
	// Rule 5 — pregnancy keywords in description.
	desc := strings.ToLower(pet.Description)
	for _, kw := range PregnancyKeywords {
		if kw == "" {
			continue
		}
		if strings.Contains(desc, kw) {
			rules = append(rules, AutoFlagRulePregnancyKeyword)
			break
		}
	}
	return len(rules) > 0, rules
}

// JurisdictionDisclosure is a short legal/regulatory notice rendered
// on public listing pages. Triggered purely by the shelter's operating
// region — shelters never author these directly. Kept as a typed
// struct so the client can style the banner per severity.
type JurisdictionDisclosure struct {
	Country string `json:"country"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	LinkURL string `json:"linkUrl,omitempty"`
}

// DisclosureForCountry returns the public-page disclosure for a
// country, or nil when the jurisdiction has no requirement. Spec:
//   - FR → ICAD chip number confirmation label
//   - GB → Microchipping Regulations 2023 compliance note
//   - TR → HAYBİS registration note (from 2026)
//   - Other → no disclosure
func DisclosureForCountry(countryISO string) *JurisdictionDisclosure {
	switch strings.ToUpper(strings.TrimSpace(countryISO)) {
	case "FR":
		return &JurisdictionDisclosure{
			Country: "FR",
			Title:   "ICAD microchip confirmation",
			Body:    "In France, adopted dogs and cats must be registered with the Identification des Carnivores Domestiques (ICAD). The shelter will provide the ICAD chip number on handover.",
			LinkURL: "https://www.i-cad.fr/",
		}
	case "GB":
		return &JurisdictionDisclosure{
			Country: "GB",
			Title:   "UK Microchipping Regulations 2023",
			Body:    "Dogs and cats in the UK must be microchipped and the keeper's details registered on a government-approved database before rehoming. The shelter will transfer the chip record to your name at adoption.",
			LinkURL: "https://www.gov.uk/get-your-dog-microchipped",
		}
	case "TR":
		return &JurisdictionDisclosure{
			Country: "TR",
			Title:   "HAYBİS kaydı",
			Body:    "2026'dan itibaren sahiplendirilen köpek ve kedilerin HAYBİS sistemine kaydı zorunludur. Barınak, sahiplenme teslimatında kayıt bilgilerini sizinle paylaşır.",
		}
	}
	return nil
}

// ListingStatementOfReasonsText renders the human-readable DSA Art. 17
// statement of reasons body from a rejection code + admin note + the
// listing identity. Kept here so both the rejection handler and the
// report-resolution handler produce identical wording.
func ListingStatementOfReasonsText(petName, breed, reasonCode, note string) (legalGround, facts string) {
	label, ok := RejectionReasonCodes[reasonCode]
	if !ok {
		label = "Policy violation"
	}
	legalGround = "Petto Terms of Service — Adoption Listing Policy; and Digital Services Act (Regulation (EU) 2022/2065) Article 16 notice-and-action."
	facts = "Listing \"" + petName + "\" (" + breed + ") was removed under reason: " + label + "."
	if note != "" {
		facts += " Reviewer note: " + note
	}
	return legalGround, facts
}
