export type Gender = "woman" | "man" | "non-binary" | "prefer-not-to-say";
export type PetSpecies = "dog" | "cat" | "bird" | "rabbit" | "other";
export type SwipeDirection = "like" | "pass" | "super-like";
export type MatchStatus = "active" | "blocked" | "archived";
export type ReportStatus = "open" | "in_review" | "resolved";
export type UserStatus = "active" | "suspended" | "pending_verification";
export type TaxonomyKind = "species" | "breeds" | "hobbies" | "compatibility" | "cities";
export type VenueCategory = "park" | "cafe" | "bar" | "beach" | "trail" | "other";
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
  status: UserStatus;
  createdAt: string;
}

export interface PetPhoto {
  id: string;
  url: string;
  isPrimary: boolean;
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  ageYears: number;
  speciesId: string;
  speciesLabel: string;
  breedId: string;
  breedLabel: string;
  activityLevel: 1 | 2 | 3 | 4 | 5;
  hobbies: string[];
  goodWith: string[];
  isNeutered: boolean;
  bio: string;
  photos: PetPhoto[];
  cityLabel: string;
  isHidden?: boolean;
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
  lastMessagePreview: string;
  unreadCount: number;
  createdAt: string;
  status: MatchStatus;
}

export interface Message {
  id: string;
  conversationId: string;
  senderProfileId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface Conversation {
  id: string;
  matchId: string;
  title: string;
  subtitle: string;
  unreadCount: number;
  lastMessageAt: string;
  messages: Message[];
}

export interface TaxonomyItem {
  id: string;
  label: string;
  slug: string;
  speciesId?: string;
  isActive: boolean;
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
  audience: EventAudience;
  petFocus: EventPetFocus;
  attendeeCount: number;
  attendees: VenueCheckIn[];
}

export interface HomePost {
  id: string;
  author: Pick<UserProfile, "id" | "firstName" | "lastName" | "avatarUrl" | "cityLabel">;
  body: string;
  imageUrl?: string;
  taggedPets: Pet[];
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

export interface ReportSummary {
  id: string;
  reason: string;
  reporterName: string;
  targetType: "user" | "pet" | "message";
  targetLabel: string;
  status: ReportStatus;
  createdAt: string;
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

export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiResponse<T> {
  data: T;
}

export const PETTO_COPY = {
  brandName: "Petto",
  brandTagline: "Meaningful matches for pets and their people.",
  emptyStates: {
    discovery: "No new pets nearby right now. Try broadening your filters later.",
    inbox: "No conversations yet. Start with a like and let the pets lead.",
    pets: "Add your first pet to unlock discovery.",
    home: "No posts yet. Share the first update from your pet world.",
    explore: "No nearby spots or events yet. Add a place from the admin panel to bring this map to life."
  }
} as const;
