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

export interface AdoptionListing {
  id: string;
  petName: string;
  petAge: number;
  petSpecies: string;
  petBreed: string;
  gender: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
  location: string;
  photos: PetPhoto[];
  characterTraits: string[];
  isNeutered: boolean;
  activityLevel: number;
  imageUrl?: string;
  status: "active" | "adopted";
  userId: string;
  userName?: string;
  createdAt: string;
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
