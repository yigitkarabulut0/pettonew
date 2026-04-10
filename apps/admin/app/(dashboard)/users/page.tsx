"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deleteUser, getUsers, updateUserStatus } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: getUsers
  });
  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) => updateUserStatus(userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pets"] });
    }
  });

  return (
    <Card>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Users</p>
          <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Member oversight</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--petto-muted)]">
            Open a full dossier for any member, inspect their pets and matches, then suspend or delete from the same surface.
          </p>
        </div>
      </div>
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && users.length === 0 && (
        <div className="mt-6 rounded-[22px] border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No items found.
        </div>
      )}
      {!isLoading && users.length > 0 && (
      <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--petto-border)]">
        <table className="w-full border-collapse text-left">
          <thead className="bg-white/70">
            <tr className="text-sm uppercase tracking-[0.2em] text-[var(--petto-muted)]">
              <th className="px-4 py-4">User</th>
              <th className="px-4 py-4">Location</th>
              <th className="px-4 py-4">Joined</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-[var(--petto-border)] bg-[rgba(255,252,248,0.88)]">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[var(--petto-border)] bg-white">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt={user.firstName || user.email} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-[var(--petto-muted)]" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--petto-ink)]">
                        {user.firstName || "Unnamed"} {user.lastName}
                      </p>
                      <p className="text-sm text-[var(--petto-muted)]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-[var(--petto-secondary)]">{user.cityLabel || "No location"}</td>
                <td className="px-4 py-4 text-sm text-[var(--petto-muted)]">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "Unknown"}
                </td>
                <td className="px-4 py-4">
                  <Badge tone={user.status === "active" ? "success" : "warning"}>{user.status}</Badge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/users/${user.id}`}
                      className={cn(
                        "inline-flex items-center justify-center rounded-full border border-[var(--petto-border)] bg-white/60 px-4 py-2.5 text-sm font-semibold text-[var(--petto-secondary)] transition-all hover:bg-white"
                      )}
                    >
                      View details
                    </Link>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        statusMutation.mutate({
                          userId: user.id,
                          status: user.status === "suspended" ? "active" : "suspended"
                        })
                      }
                    >
                      {user.status === "suspended" ? "Activate" : "Suspend"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-rose-700 hover:text-rose-800"
                      onClick={() => {
                        if (typeof window === "undefined" || window.confirm(`Delete ${user.email} and all related data?`)) {
                          deleteMutation.mutate(user.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}
