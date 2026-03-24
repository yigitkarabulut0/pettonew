"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@petto/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@petto/ui";
import { Separator } from "@petto/ui";
import { Settings, LogOut, BarChart3, PawPrint, ChevronRight } from "lucide-react";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.avatarUrl || undefined} />
            <AvatarFallback className="text-lg">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>
              {user?.firstName} {user?.lastName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardHeader>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <Link
            href="/profile/pets"
            className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-muted"
          >
            <PawPrint className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">My Pets</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Separator className="my-1" />
          <Link
            href="/profile/stats"
            className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-muted"
          >
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Statistics</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Separator className="my-1" />
          <Link
            href="/profile/settings"
            className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-muted"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Settings</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Separator className="my-1" />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              Log Out
            </span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
