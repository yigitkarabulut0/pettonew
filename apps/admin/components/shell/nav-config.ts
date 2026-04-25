import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Briefcase,
  Drumstick,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Dog,
  Building2,
  Flag,
  Flame,
  Footprints,
  GraduationCap,
  Heart,
  HeartCrack,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  MapPinned,
  MessageSquare,
  MessagesSquare,
  Newspaper,
  PawPrint,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Stethoscope,
  Store,
  Tag,
  UserCheck,
  Users,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AdminRole = "superadmin" | "moderator" | "support";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  requires?: AdminRole;
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/announcements", label: "Announcements", icon: Newspaper },
      { href: "/feature-flags", label: "Feature Flags", icon: Flame, requires: "superadmin" }
    ]
  },
  {
    label: "People",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/admins", label: "Admins", icon: ShieldCheck, requires: "superadmin" },
      { href: "/blocks", label: "Blocks", icon: ShieldAlert }
    ]
  },
  {
    label: "Pets",
    items: [
      { href: "/pets", label: "Pets", icon: PawPrint },
      { href: "/lost-pets", label: "Lost Pets", icon: AlertTriangle },
      { href: "/shelters", label: "Shelters", icon: Building2 },
      {
        href: "/shelter-applications",
        label: "Shelter Applications",
        icon: ClipboardCheck
      }
    ]
  },
  {
    label: "Social",
    items: [
      { href: "/posts", label: "Posts", icon: ImageIcon },
      { href: "/playdates", label: "Playdates", icon: Calendar },
      { href: "/groups", label: "Groups", icon: UsersRound },
      { href: "/matches", label: "Matches", icon: HeartCrack },
      { href: "/swipes", label: "Swipes", icon: Tag }
    ]
  },
  {
    label: "Messaging",
    items: [
      { href: "/conversations", label: "Conversations", icon: MessageSquare },
      { href: "/group-chats", label: "Group Chats", icon: MessagesSquare }
    ]
  },
  {
    label: "Places",
    items: [
      { href: "/venues", label: "Venues", icon: MapPinned },
      { href: "/check-ins", label: "Check-ins", icon: Store },
      { href: "/reviews", label: "Reviews", icon: Star },
      { href: "/events", label: "Events", icon: CalendarDays }
    ]
  },
  {
    label: "Directory",
    items: [
      { href: "/breed-care-guides", label: "Breed Care Guides", icon: BookOpen },
      { href: "/first-aid-topics", label: "First-Aid Topics", icon: Heart },
      { href: "/food-items", label: "Food Items", icon: Drumstick },
      { href: "/training-tips", label: "Training Tips", icon: GraduationCap },
      { href: "/vet-clinics", label: "Vet Clinics", icon: Stethoscope },
      { href: "/pet-sitters", label: "Pet Sitters", icon: UserCheck },
      { href: "/walk-routes", label: "Walk Routes", icon: Footprints }
    ]
  },
  {
    label: "Engagement",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/broadcast", label: "Broadcast", icon: Send, requires: "moderator" },
      { href: "/badges", label: "Badges", icon: Award }
    ]
  },
  {
    label: "Moderation",
    items: [
      { href: "/listings", label: "Listing Reviews", icon: ShieldCheck },
      { href: "/listing-reports", label: "Listing Reports", icon: Flag },
      { href: "/reports", label: "User Reports", icon: Flag },
      { href: "/audit-logs", label: "Audit Logs", icon: ClipboardCheck, requires: "moderator" }
    ]
  },
  {
    label: "Configuration",
    items: [
      { href: "/taxonomies", label: "Taxonomies", icon: Dog },
      { href: "/settings", label: "Settings", icon: Briefcase, requires: "superadmin" },
      { href: "/account", label: "My account", icon: KeyRound }
    ]
  }
];
