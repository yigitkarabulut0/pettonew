export type Gender = "woman" | "man" | "non-binary" | "prefer-not-to-say";
export type PetSpecies = "dog" | "cat" | "bird" | "rabbit" | "other";
export type SwipeDirection = "like" | "pass" | "super-like";
export type MatchStatus = "active" | "blocked" | "archived";
export type ReportStatus = "open" | "in_review" | "resolved";
export type UserStatus = "active" | "suspended" | "pending_verification";
export type TaxonomyKind =
  | "species"
  | "breeds"
  | "hobbies"
  | "compatibility"
  | "cities"
  | "characters";
export type VenueCategory =
  | "park"
  | "cafe"
  | "bar"
  | "beach"
  | "trail"
  | "other";
export type EventAudience = "everyone" | "women-only" | "men-only";
export type EventPetFocus = "all-pets" | "dogs-only" | "cats-only";

export interface City {
  id: string;
  name: string;
  countryCode: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: Gender;
  cityId: string;
  cityLabel: string;
  avatarUrl?: string;
  bio?: string;
  isVisibleOnMap?: boolean;
  status: UserStatus;
  createdAt: string;
}

export interface PetPhoto {
  id: string;
  url: string;
  isPrimary: boolean;
}

export type PetGender = "male" | "female";

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  ageYears: number;
  gender: PetGender;
  birthDate?: string;
  speciesId: string;
  speciesLabel: string;
  breedId: string;
  breedLabel: string;
  activityLevel: 1 | 2 | 3 | 4 | 5;
  hobbies: string[];
  goodWith: string[];
  characters: string[];
  isNeutered: boolean;
  bio: string;
  photos: PetPhoto[];
  cityLabel: string;
  isHidden?: boolean;
  themeColor?: string;
}

export interface DiscoveryCard {
  pet: Pet;
  owner: Pick<UserProfile, "firstName" | "gender">;
  distanceLabel: string;
  prompt: string;
}

export interface MatchPreview {
  id: string;
  pet: Pet;
  matchedPet: Pet;
  matchedOwnerName: string;
  matchedOwnerAvatarUrl?: string;
  lastMessagePreview: string;
  /** ISO 8601 timestamp of the last message. Empty = no messages yet. */
  lastMessageAt?: string;
  unreadCount: number;
  createdAt: string;
  status: MatchStatus;
  conversationId: string;
}

export type MessageType = "text" | "image" | "pet_share" | "system";

export interface PetShareMeta {
  petId: string;
  petName: string;
  petPhotoUrl?: string;
  speciesLabel?: string;
  breedLabel?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderProfileId: string;
  senderName: string;
  senderAvatarUrl?: string;
  type: MessageType;
  body: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  isMine: boolean;
  readAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  pinnedAt?: string;
  pinnedBy?: string;
}

export interface MatchPetPair {
  myPetId: string;
  myPetName: string;
  myPetPhotoUrl?: string;
  matchedPetId: string;
  matchedPetName: string;
  matchedPetPhotoUrl?: string;
}

export interface Conversation {
  id: string;
  matchId: string;
  title: string;
  subtitle: string;
  unreadCount: number;
  lastMessageAt: string;
  messages: Message[];
  userIds: string[];
  matchPetPairs: MatchPetPair[];
  /** v0.11.8 — the other user's profile avatar (not the pet's). */
  matchedOwnerAvatarUrl?: string;
}

export interface TaxonomyItem {
  id: string;
  label: string;
  slug: string;
  speciesId?: string;
  isActive: boolean;
  icon?: string;
  color?: string;
  translations?: Record<string, string>;
}

export interface VenueCheckIn {
  userId: string;
  userName: string;
  avatarUrl?: string;
  petIds: string[];
  petNames: string[];
  petCount: number;
  checkedInAt: string;
}

export interface ExploreVenue {
  id: string;
  name: string;
  category: VenueCategory;
  description: string;
  cityLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  hours?: string;
  currentCheckIns: VenueCheckIn[];
}

export interface VenueStats {
  checkInCount: number;
  uniqueVisitorCount: number;
  activeCheckInCount: number;
  avgRating: number;
  reviewCount: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface VenueDetail extends ExploreVenue {
  stats: VenueStats;
  distanceKm?: number;
}

export interface VenuePhotoFeedItem {
  postId: string;
  imageUrl: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
}

export interface ReviewEligibility {
  eligible: boolean;
  reason?: "no_check_in" | "already_reviewed";
}

export interface ExploreEvent {
  id: string;
  title: string;
  description: string;
  cityLabel: string;
  venueId?: string;
  venueName?: string;
  startsAt: string;
  endsAt?: string;
  audience: EventAudience;
  petFocus: EventPetFocus;
  attendeeCount: number;
  attendees: VenueCheckIn[];
}

/**
 * v0.11.0 — Unified Discover feed response.
 * Mobile Discover → Events tab hits /v1/explore/feed which returns both
 * admin-created events and user-created playdates so the client can merge
 * them into a single date-sorted list.
 */
export interface ExploreFeed {
  events: ExploreEvent[];
  playdates: Playdate[];
}

/**
 * v0.11.0 — Per-user global notification opt-outs.
 * These gate push fan-out on the server. A missing row (or a user who has
 * never opened the notification-settings page) defaults to everything enabled.
 */
export interface NotificationPreferences {
  matches: boolean;
  messages: boolean;
  playdates: boolean;
  groups: boolean;
}

export interface HomePost {
  id: string;
  author: Pick<
    UserProfile,
    "id" | "firstName" | "lastName" | "avatarUrl" | "cityLabel"
  >;
  body: string;
  imageUrl?: string;
  taggedPets: Pet[];
  venueId?: string;
  venueName?: string;
  eventId?: string;
  eventName?: string;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface HomeInsight {
  totalLikesReceived: number;
  totalPosts: number;
  topPostId?: string;
  topPostLikes: number;
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
}

export interface DashboardSeriesPoint {
  label: string;
  users: number;
  pets: number;
  matches: number;
}

export interface DashboardSnapshot {
  metrics: DashboardMetric[];
  growth: DashboardSeriesPoint[];
  recentReports: ReportSummary[];
  topPosts: HomePost[];
}

export interface AdminUserDetail {
  user: UserProfile;
  pets: Pet[];
  matches: MatchPreview[];
  conversations: Conversation[];
  posts: HomePost[];
  totalLikesReceived: number;
}

export interface AdminPetDetail {
  pet: Pet;
  owner: UserProfile;
  matches: MatchPreview[];
}

export interface ReportSummary {
  id: string;
  reason: string;
  reporterID: string;
  reporterName: string;
  targetType: "chat" | "pet" | "post";
  targetID: string;
  targetLabel: string;
  status: ReportStatus;
  notes?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ReportDetail extends ReportSummary {
  targetType: "chat" | "pet" | "post";
  chatMessages?: Array<{
    id: string;
    senderProfileID: string;
    senderName: string;
    body: string;
    createdAt: string;
  }>;
  chatUsers?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  }>;
  pet?: {
    id: string;
    name: string;
    speciesLabel: string;
    breedLabel: string;
    isHidden: boolean;
    photos: Array<{ id: string; url: string }>;
    ownerID: string;
    ownerName: string;
    ownerAvatarUrl?: string;
  };
  post?: {
    id: string;
    body: string;
    imageUrl?: string;
    authorID: string;
    authorName: string;
    authorAvatarUrl?: string;
    likeCount: number;
    createdAt: string;
  };
}

export interface UploadedAsset {
  id: string;
  url: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface SessionPayload {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface DiaryEntry {
  id: string;
  petId: string;
  userId: string;
  body: string;
  imageUrl?: string;
  mood: string;
  createdAt: string;
}

export interface HealthRecord {
  id: string;
  petId: string;
  type: "vaccine" | "checkup" | "surgery" | "other";
  title: string;
  date: string;
  notes: string;
  nextDueDate?: string;
  createdAt: string;
}

export interface WeightEntry {
  id: string;
  petId: string;
  weight: number;
  unit: string;
  date: string;
}

export interface VetContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  address: string;
  isEmergency: boolean;
}

export interface FeedingSchedule {
  id: string;
  petId: string;
  mealName: string;
  time: string;
  foodType: string;
  amount: string;
  notes: string;
  createdAt?: string;
}

export interface PlaydateHost {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  isVerified: boolean;
}

export interface PlaydateAttendee {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  pets: MemberPet[];
}

export interface Playdate {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  date: string;
  location: string;
  maxPets: number;
  attendees: string[];
  createdAt: string;
  latitude?: number;
  longitude?: number;
  cityLabel?: string;
  /** v0.11.1 — optional Venue link. Populated when the playdate was created
      from the venue picker; lets Discover highlight the venue pin. */
  venueId?: string;
  coverImageUrl?: string;
  distance?: number;
  isAttending?: boolean;
  rules?: string[];
  status?: "active" | "cancelled";
  cancelledAt?: string;
  conversationId?: string;
  waitlist?: string[];
  attendeesInfo?: PlaydateAttendee[];
  hostInfo?: PlaydateHost;
  isOrganizer?: boolean;
  isWaitlisted?: boolean;
  slotsUsed?: number;
  myPetIds?: string[];
  myWaitlistPets?: string[];
  visibility?: "public" | "private";
  /** v0.13.5 — share token for private-playdate WhatsApp/SMS links. Only
   *  populated in responses where the caller is the host. */
  shareToken?: string;
  creatorPetIds?: string[];
  myInviteStatus?: "pending" | "accepted" | "declined";
  myInviteId?: string;
  pendingInvites?: number;
  myChatMuted?: boolean;
  myConvMuted?: boolean;
  chatMutedUserIds?: string[];
  locked?: boolean;
}

export interface PlaydateInvite {
  id: string;
  playdateId: string;
  hostUserId: string;
  invitedUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt?: string;
  playdateTitle?: string;
  playdateDate?: string;
  playdateCity?: string;
  hostFirstName?: string;
  hostAvatarUrl?: string;
}

export interface InvitableUser {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  contextLabel?: string;
}

export interface MemberPet {
  id: string;
  name: string;
  photoUrl?: string;
}

export interface GroupMember {
  userId: string;
  firstName: string;
  avatarUrl?: string;
  pets: MemberPet[];
  isMuted?: boolean;
  mutedUntil?: string | null;
}

export interface CommunityGroup {
  id: string;
  name: string;
  description: string;
  petType: string;
  category?: string;
  memberCount: number;
  imageUrl?: string;
  conversationId?: string;
  isMember: boolean;
  members: GroupMember[];
  latitude?: number;
  longitude?: number;
  cityLabel?: string;
  code?: string;
  isPrivate?: boolean;
  distance?: number;
  hashtags: string[];
  rules: string[];
  ownerUserId?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  muted?: boolean;
  mutedUntil?: string;
  adminUserIds?: string[];
  /** Caller's personal push-notification mute on the group conversation. */
  myConvMuted?: boolean;
  createdAt: string;
}

export interface LostPetAlert {
  id: string;
  petId: string;
  userId: string;
  description: string;
  lastSeenLocation: string;
  lastSeenDate: string;
  status: "active" | "found";
  contactPhone: string;
  imageUrl?: string;
  createdAt: string;
}

export interface Badge {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  earnedAt: string;
}

export interface TrainingTipStep {
  order: number;
  title: string;
  description: string;
  videoUrl?: string;
}

export interface TrainingTip {
  id: string;
  title: string;
  body: string;
  summary: string;
  steps: TrainingTipStep[];
  videoUrl?: string;
  category: string;
  petType: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface VetClinic {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string;
  isEmergency: boolean;
  website?: string;
  hours?: string;
  distance?: number;
}

export interface VenueReview {
  id: string;
  venueId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PetSitter {
  id: string;
  userId: string;
  name: string;
  bio: string;
  hourlyRate: number;
  currency: string;
  phone: string;
  rating: number;
  reviewCount: number;
  services: string[];
  cityLabel: string;
  avatarUrl?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
}

export interface WalkRouteCoord {
  lat: number;
  lng: number;
}

export interface WalkRoute {
  id: string;
  name: string;
  description: string;
  distance: string;
  estimatedTime: string;
  difficulty: string;
  coordinates: WalkRouteCoord[];
  cityLabel: string;
  createdAt: string;
}

// ── Shelters & adoption workflow (v0.13) ───────────────────────────
// Adoption listings are no longer user-created. Shelter accounts own
// the pets; app users submit applications that the shelter approves
// or rejects. Chat opens automatically on approval.

// Public profile fields (v0.21). `slug` is permanent, assigned on
// verification; the other three are shelter-editable via PUT /me.
export interface ShelterPublicProfile {
  slug?: string;
  adoptionProcess?: string;
  donationUrl?: string;
  showRecentlyAdopted?: boolean;
  speciesFocus?: string[];
  isFeatured?: boolean;
}

export interface Shelter extends ShelterPublicProfile {
  id: string;
  email: string;
  name: string;
  about: string;
  phone: string;
  website: string;
  logoUrl?: string;
  heroUrl?: string;
  address: string;
  cityLabel: string;
  latitude: number;
  longitude: number;
  hours: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
  /**
   * ISO-8601 timestamp the shelter was verified (either by admin-direct
   * creation or after an approved onboarding application). Absent/null
   * for unverified accounts — those cannot create listings.
   */
  verifiedAt?: string | null;
  /**
   * ISO-3166-1 alpha-2 country code driving jurisdiction-specific
   * compliance rules (breed blocks, microchip requirement).
   */
  operatingCountry?: string;
}

export interface VaccineRecord {
  name: string;
  date: string;
  notes?: string;
}

export type ShelterPetStatus = "available" | "reserved" | "adopted" | "hidden";

// 7-state listing lifecycle (DSA Art. 16/17/22/23). Orthogonal to
// `ShelterPetStatus` (availability) — status tracks "is this pet still
// offered?", listingState tracks "is this listing published?".
export type ListingState =
  | "draft"
  | "pending_review"
  | "published"
  | "paused"
  | "adopted"
  | "archived"
  | "rejected";

export type ListingRejectionCode =
  | "banned_breed"
  | "prohibited_species"
  | "under_age"
  | "welfare_concern"
  | "inaccurate_info"
  | "fraud_suspected"
  | "duplicate"
  | "policy_violation";

export type ListingReportResolution =
  | "dismiss"
  | "warn"
  | "remove"
  | "suspend";

export type ListingReportStatus =
  | "open"
  | "dismissed"
  | "warned"
  | "removed"
  | "suspended";

export interface ShelterPet {
  id: string;
  shelterId: string;
  shelterName?: string;
  shelterCity?: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  size: string;
  color: string;
  birthDate?: string;
  ageMonths?: number;
  description: string;
  photos: string[];
  vaccines: VaccineRecord[];
  isNeutered: boolean;
  microchipId?: string;
  specialNeeds?: string;
  characterTags: string[];
  intakeDate?: string;
  status: ShelterPetStatus;
  listingState: ListingState;
  lastRejectionCode?: ListingRejectionCode | "";
  lastRejectionNote?: string;
  autoFlagReasons?: string[];
  deletedAt?: string;
  adopterName?: string;
  adoptionDate?: string;
  adoptionNotes?: string;
  viewCount?: number;
  // Card-specific enrichments (v0.23). Populated by the public feed.
  isUrgent?: boolean;
  publishedAt?: string;
  distanceKm?: number;
  shelterVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Shelter analytics (v0.22) ─────────────────────────────────────
export type AnalyticsRange = "30d" | "90d" | "12m" | "all";

export interface ListingPerformanceRow {
  listingId: string;
  name: string;
  species: string;
  listingState: ListingState;
  views: number;
  saves: number;
  applications: number;
  adoptions: number;
  daysListed: number;
}

export interface ApplicationFunnel {
  submitted: number;
  underReview: number;
  approved: number;
  adopted: number;
}

export interface AnalyticsOverview {
  range: AnalyticsRange;
  activeListings: number;
  adoptionsThisMonth: number;
  adoptionsThisYear: number;
  avgDaysToAdoption: number;
  avgSampleSize: number;
  topListing?: {
    id: string;
    name: string;
    applicationCount: number;
  } | null;
}

export interface ListingStateTransition {
  id: string;
  listingId: string;
  shelterId: string;
  actorId?: string;
  actorName?: string;
  actorRole: "shelter" | "admin" | "system";
  prevState: ListingState;
  newState: ListingState;
  reasonCode?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ListingReport {
  id: string;
  listingId: string;
  shelterId: string;
  reporterId?: string;
  reporterName?: string;
  trustedFlagger: boolean;
  reason: string;
  description?: string;
  status: ListingReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: ListingReportResolution | "";
  resolutionNote?: string;
  listingName?: string;
  listingPhotoUrl?: string;
  listingCurrentState?: ListingState | "";
  shelterName?: string;
}

export interface ListingStatementOfReasons {
  id: string;
  listingId: string;
  shelterId: string;
  contentDescription: string;
  legalGround: string;
  factsReliedOn: string;
  scope: string;
  redressOptions: string;
  issuedAt: string;
  issuedBy?: string;
}

// Jurisdiction disclosure rendered on the public listing detail page.
// Server decides what (if anything) to send based on the shelter's
// operating_country; the client renders the banner verbatim.
export interface JurisdictionDisclosure {
  country: string;
  title: string;
  body: string;
  linkUrl?: string;
}

// Bundled response for the public listing detail page. Contains the
// pet, a `microchipPresent` boolean (ID itself is never shipped), the
// shelter mini-card, and an optional jurisdiction disclosure.
export interface PublicListingDetail {
  pet: ShelterPet;
  microchipPresent: boolean;
  shelter: Shelter;
  disclosure: JurisdictionDisclosure | null;
}

export interface ListingStrikeSummary {
  shelterId: string;
  count: number;
  windowDays: number;
  threshold: number;
  triggered: boolean;
  rejections: ListingStateTransition[];
}

export type AdoptionApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "chat_open"
  | "adopted"
  | "withdrawn";

export interface AdoptionApplication {
  id: string;
  petId: string;
  petName?: string;
  petPhoto?: string;
  shelterId: string;
  shelterName?: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  housingType: string;
  hasOtherPets: boolean;
  otherPetsDetail: string;
  experience: string;
  message: string;
  status: AdoptionApplicationStatus;
  rejectionReason?: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShelterStats {
  totalPets: number;
  availablePets: number;
  reservedPets: number;
  adoptedPets: number;
  pendingApplications: number;
  activeChats: number;
  totalApplications: number;
}

// NOTE: ShelterSession is defined below in the v0.15 team section so it
// carries the new `member` field. The two types share the same name on
// purpose — anything that imported `ShelterSession` before transparently
// gets the extended shape.

export interface CreateShelterResult {
  shelter: Shelter;
  tempPassword: string;
  passwordNotice: string;
}

// ── Shelter onboarding (v0.14) ──────────────────────────────────────
// Public wizard → admin review queue → approval mints a Shelter row
// with the same temp-password flow as admin-direct creation.

export type ShelterApplicationStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export type ShelterApplicationRejectionCode =
  | "invalid_registration"
  | "documents_unclear"
  | "jurisdiction_mismatch"
  | "duplicate"
  | "out_of_scope"
  | "other";

/** ISO-3166-1 alpha-2 for the countries the wizard explicitly supports,
 * plus an "other_eu" escape hatch that routes to a manual-review bucket. */
export type ShelterApplicationCountry =
  | "TR"
  | "GB"
  | "US"
  | "DE"
  | "FR"
  | "IT"
  | "ES"
  | "NL"
  | "IE"
  | "other_eu";

export type ShelterSpecies =
  | "dog"
  | "cat"
  | "rabbit"
  | "ferret"
  | "small_mammal";

export interface ShelterEntityType {
  slug: string;
  label: string;
  country: ShelterApplicationCountry;
}

/**
 * One shelter onboarding application. Public GET /apply/status surfaces
 * a redacted subset — the admin queue sees everything except
 * `accessToken`, which is shown only once at submission time.
 */
export interface ShelterApplication {
  id: string;
  status: ShelterApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  /** SubmittedAt + 48h, pre-computed so the admin queue can sort by SLA. */
  slaDeadline: string;

  entityType: string;
  country: ShelterApplicationCountry;
  registrationNumber: string;
  registrationCertificateUrl: string;

  orgName: string;
  orgAddress?: string;
  operatingRegionCountry: ShelterApplicationCountry;
  operatingRegionCity: string;
  speciesFocus: ShelterSpecies[];
  donationUrl?: string;

  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;

  rejectionReasonCode?: ShelterApplicationRejectionCode | "";
  rejectionReasonNote?: string;
  createdShelterId?: string;

  /** Only present on the submit response and on /apply/status lookups. */
  accessToken?: string;
}

/** Wizard → POST /v1/public/shelter-applications payload. */
export interface ShelterApplicationSubmission {
  entityType: string;
  country: ShelterApplicationCountry;
  registrationNumber: string;
  registrationCertificateUrl: string;
  orgName: string;
  orgAddress?: string;
  operatingRegionCountry: ShelterApplicationCountry;
  operatingRegionCity: string;
  speciesFocus: ShelterSpecies[];
  donationUrl?: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
}

export interface ShelterApplicationSubmitResult {
  id: string;
  accessToken: string;
  status: ShelterApplicationStatus;
  submittedAt: string;
  slaDeadline: string;
}

/** Admin approval mints a Shelter + returns the temp password once. */
export interface ApproveShelterApplicationResult {
  shelter: Shelter;
  application: ShelterApplication;
  tempPassword: string;
  passwordNotice: string;
}

// ── Shelter team accounts (v0.15) ───────────────────────────────────
// Multi-user access per shelter with 3 roles. Every shelter has ≥1
// active admin; the API enforces that invariant server-side.

export type ShelterMemberRole = "admin" | "editor" | "viewer";
export type ShelterMemberStatus = "active" | "pending" | "revoked";

export interface ShelterMember {
  id: string;
  shelterId: string;
  email: string;
  name?: string;
  role: ShelterMemberRole;
  status: ShelterMemberStatus;
  mustChangePassword: boolean;
  invitedByMemberId?: string;
  invitedAt?: string;
  joinedAt: string;
  lastLoginAt?: string;
}

/** A one-time invite link. `token` is only ever populated on the
 * create/resend response so the admin can show + share it. */
export interface ShelterMemberInvite {
  id: string;
  shelterId: string;
  email: string;
  role: ShelterMemberRole;
  invitedByMemberId?: string;
  token?: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedMemberId?: string;
  revokedAt?: string;
}

export interface ShelterInviteInfo {
  email: string;
  role: ShelterMemberRole;
  shelterId: string;
  shelterName: string;
  expiresAt: string;
  /** `active` = usable; `expired|accepted|revoked` = accept call will 410. */
  status: "active" | "expired" | "accepted" | "revoked";
}

export interface ShelterInviteSubmission {
  email: string;
  role: ShelterMemberRole;
}

export interface ShelterInviteAcceptSubmission {
  name: string;
  password: string;
}

export interface ShelterAuditEntry {
  id: string;
  shelterId: string;
  actorMemberId?: string;
  actorName: string;
  actorEmail: string;
  /** Dot-separated `target.verb`, e.g. `"member.invite"`, `"pet.create"`. */
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Updated login response (v0.15+): adds `member` alongside the
 * existing `shelter` field. Old clients still read `shelter`. */
export interface ShelterSession {
  shelter: Shelter;
  member: ShelterMember;
  accessToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
}

export interface AdoptionApplicationInput {
  petId: string;
  housingType: string;
  hasOtherPets: boolean;
  otherPetsDetail: string;
  experience: string;
  message: string;
}

export interface AdoptablePetFilters {
  species?: string;
  sex?: string;
  size?: string;
  city?: string;
  maxAgeMonths?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PetAlbum {
  id: string;
  petId: string;
  title: string;
  photos: PetPhoto[];
  createdAt: string;
}

export interface PetMilestone {
  id: string;
  petId: string;
  type: string;
  title: string;
  description: string;
  achievedAt: string;
}

export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiResponse<T> {
  data: T;
}

export const PETTO_COPY = {
  brandName: "Pett.",
  brandTagline: "Meaningful matches for pets and their people.",
  emptyStates: {
    discovery:
      "No new pets nearby right now. Try broadening your filters later.",
    inbox: "No conversations yet. Start with a like and let the pets lead.",
    pets: "Add your first pet to unlock discovery.",
    home: "No posts yet. Share the first update from your pet world.",
    explore:
      "No nearby spots or events yet. Add a place from the admin panel to bring this map to life."
  }
} as const;
