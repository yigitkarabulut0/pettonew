export type UserRole = "user" | "admin";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreate {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: string;
}

export interface UserUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export type ReactionType = "like" | "congrats" | "funny";

export interface Post {
  id: string;
  userId: string;
  user: User;
  content: string;
  imageUrls: string[];
  likeCount: number;
  congratsCount: number;
  funnyCount: number;
  myReaction: ReactionType | null;
  isMatchedUser: boolean;
  createdAt: string;
}

export interface PostCreate {
  content: string;
  imageUrls?: string[];
}

export interface PostReaction {
  type: ReactionType;
}

export type ActivityLevel = 1 | 2 | 3 | 4 | 5;

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  1: "Very Calm",
  2: "Calm",
  3: "Moderate",
  4: "Active",
  5: "Very Active",
};

export interface Pet {
  id: string;
  userId: string;
  user: User;
  name: string;
  speciesId: string;
  species: PetSpecies;
  breedId: string | null;
  breed: PetBreed | null;
  age: number | null;
  activityLevel: ActivityLevel;
  neutered: boolean;
  avatarUrl: string | null;
  compatibilities: PetCompatibilityOption[];
  hobbies: PetHobbyOption[];
  createdAt: string;
}

export interface PetCreate {
  name: string;
  speciesId: string;
  breedId?: string;
  age?: number;
  activityLevel: ActivityLevel;
  neutered: boolean;
  avatarUrl?: string;
  compatibilityIds?: string[];
  hobbyIds?: string[];
}

export interface PetSpecies {
  id: string;
  name: string;
}

export interface PetBreed {
  id: string;
  speciesId: string;
  name: string;
}

export interface PetCompatibilityOption {
  id: string;
  name: string;
}

export interface PetHobbyOption {
  id: string;
  name: string;
}

export type SwipeDirection = "like" | "pass";

export interface Swipe {
  id: string;
  swiperPetId: string;
  swipedPetId: string;
  direction: SwipeDirection;
  createdAt: string;
}

export interface Match {
  id: string;
  pet1Id: string;
  pet2Id: string;
  pet1: Pet;
  pet2: Pet;
  matchedAt: string;
}

export interface SwipeCandidate {
  pet: Pet;
  distance: number;
  compatibilityScore: number;
}

export type ConversationType = "dm" | "group";

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  eventId: string | null;
  lastMessage: Message | null;
  members: ConversationMember[];
  unreadCount: number;
  createdAt: string;
}

export interface ConversationMember {
  userId: string;
  user: User;
  petId: string | null;
  pet: Pet | null;
}

export type MessageType = "text" | "image";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: User;
  type: MessageType;
  content: string;
  createdAt: string;
}

export type LocationCategory = "park" | "cafe" | "restaurant" | "pub" | "vet" | "grooming" | "other";

export interface Location {
  id: string;
  name: string;
  description: string;
  category: LocationCategory;
  lat: number;
  lng: number;
  address: string;
  imageUrl: string | null;
  checkinCount: number;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  userId: string;
  user: User;
  locationId: string;
  location: Location;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  locationId: string | null;
  locationName: string | null;
  lat: number;
  lng: number;
  startTime: string;
  endTime: string;
  maxParticipants: number | null;
  filters: EventFilters;
  imageUrl: string | null;
  participantCount: number;
  isParticipating: boolean;
  createdBy: string;
  createdAt: string;
}

export interface EventFilters {
  gender?: "male" | "female" | "all";
  petType?: "cat" | "dog" | "all";
  minAge?: number;
  maxAge?: number;
}

export interface EventParticipant {
  userId: string;
  user: User;
  status: "going" | "interested";
  joinedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface DashboardStats {
  totalUsers: number;
  totalPets: number;
  totalPosts: number;
  totalMatches: number;
  totalMessages: number;
  totalCheckIns: number;
  newUsersToday: number;
  newPostsToday: number;
  activeUsersToday: number;
}

export interface UserPostStats {
  totalPosts: number;
  totalLikes: number;
  totalCongrats: number;
  totalFunny: number;
  likeRate: number;
  bestPost: Post | null;
}

export interface PetMatchStats {
  totalSwipes: number;
  totalLikes: number;
  totalPasses: number;
  totalMatches: number;
  matchRate: number;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface WsMessage {
  type: "message" | "typing" | "read" | "match" | "check_in";
  payload: unknown;
}
