package domain

// Canonical list of audit action strings emitted by the shelter side
// of the API. Kept here (not in the server package) so the contract
// can be imported anywhere — including by a future eventing/webhook
// consumer that doesn't need server internals.
//
// Rules of thumb:
//   - Dot-separated `<target>.<verb>` format.
//   - Past-tense verbs avoided; we use the imperative form so UI code
//     can compose "Alice {verb} …".
//   - Only actions recorded — reads aren't audited.
//
// Frontend maps these to human-readable labels in
// apps/shelter-web/lib/audit-log-labels.ts (and the mobile parity).

const (
	AuditMemberInvite         = "member.invite"
	AuditMemberInviteResend   = "member.invite_resend"
	AuditMemberInviteRevoke   = "member.invite_revoke"
	AuditMemberInviteAccept   = "member.invite_accept"
	AuditMemberRoleChange     = "member.role_change"
	AuditMemberRevoke         = "member.revoke"
	AuditMemberPasswordChange = "member.password_change"

	AuditPetCreate       = "pet.create"
	AuditPetUpdate       = "pet.update"
	AuditPetDelete       = "pet.delete"
	AuditPetStatusChange = "pet.status_change"

	AuditApplicationApprove  = "application.approve"
	AuditApplicationReject   = "application.reject"
	AuditApplicationComplete = "application.complete"

	AuditProfileUpdate = "profile.update"

	// Listing lifecycle / DSA moderation (v0.17).
	AuditListingSubmit           = "listing.submit"
	AuditListingAutoFlag         = "listing.auto_flag"
	AuditListingApprove          = "listing.approve"
	AuditListingReject           = "listing.reject"
	AuditListingPause            = "listing.pause"
	AuditListingUnpause          = "listing.unpause"
	AuditListingMarkAdopted      = "listing.mark_adopted"
	AuditListingArchive          = "listing.archive"
	AuditListingRestart          = "listing.restart"
	AuditListingReportReceived   = "listing.report_received"
	AuditListingReportResolved   = "listing.report_resolved"
	AuditListingSuspendShelter   = "shelter.suspend"
)

// ShelterMemberRole weights for ordering the three roles. Higher is
// more privileged. Server-side guards use this to implement
// "requireShelterRole(min)" middleware-style checks.
var shelterRoleWeights = map[string]int{
	"viewer": 1,
	"editor": 2,
	"admin":  3,
}

// ShelterRoleAllows returns true if `have` satisfies the minimum role
// `need`. Unknown roles are treated as 0 (denies everything).
func ShelterRoleAllows(have, need string) bool {
	return shelterRoleWeights[have] >= shelterRoleWeights[need]
}
