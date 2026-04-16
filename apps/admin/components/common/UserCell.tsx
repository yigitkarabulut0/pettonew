import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fmtInitials } from "@/lib/format";

interface UserCellProps {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  subtitle?: string;
}

export function UserCell({ id, name, email, avatarUrl, subtitle }: UserCellProps) {
  const label = name?.trim() || email || id;
  return (
    <Link
      href={`/users/${id}`}
      className="flex items-center gap-2 hover:text-[var(--primary)]"
    >
      <Avatar className="h-7 w-7">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={label} /> : null}
        <AvatarFallback>{fmtInitials(label)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-[var(--foreground)]">{label}</span>
        {subtitle || email ? (
          <span className="truncate text-[11px] text-[var(--muted-foreground)]">{subtitle ?? email}</span>
        ) : null}
      </div>
    </Link>
  );
}
