import { format, formatDistanceToNow } from "date-fns";

export function fmtDate(value: string | Date | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) return "—";
  try {
    return format(new Date(value), pattern);
  } catch {
    return String(value);
  }
}

export function fmtDateTime(value: string | Date | null | undefined) {
  return fmtDate(value, "MMM d, yyyy HH:mm");
}

export function fmtRelative(value: string | Date | null | undefined) {
  if (!value) return "—";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return String(value);
  }
}

export function fmtNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtInitials(input?: string | null) {
  if (!input) return "?";
  return input
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(text: string | null | undefined, max = 80) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
