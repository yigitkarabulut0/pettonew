"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Trash2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserCell } from "@/components/common/UserCell";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import type { UserProfile } from "@petto/contracts";
import { deleteUser, getUsers, updateUserStatus } from "@/lib/admin-api";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: getUsers
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) => updateUserStatus(userId, status),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.firstName, u.lastName, u.cityLabel].some((v) => v?.toLowerCase().includes(q))
    );
  }, [users, state.search]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const columns = React.useMemo<ColumnDef<UserProfile, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "User",
        cell: ({ row }) => {
          const u = row.original;
          return (
            <UserCell
              id={u.id}
              name={`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()}
              email={u.email}
              avatarUrl={u.avatarUrl}
            />
          );
        }
      },
      {
        accessorKey: "cityLabel",
        header: "Location",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {row.original.cityLabel || "—"}
          </span>
        )
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} />
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => {
          const u = row.original;
          return (
            <RowActions
              items={[
                { label: "View details", href: `/users/${u.id}` },
                {
                  label: u.status === "suspended" ? "Reactivate" : "Suspend",
                  onSelect: () =>
                    statusMutation.mutate({
                      userId: u.id,
                      status: u.status === "suspended" ? "active" : "suspended"
                    })
                },
                {
                  label: "Delete user",
                  destructive: true,
                  onSelect: async () => {
                    await confirm({
                      title: "Delete this user?",
                      description: `All data belonging to ${u.email} will be removed.`,
                      destructive: true,
                      requireReason: true,
                      confirmLabel: "Delete",
                      onConfirm: () => deleteMutation.mutateAsync(u.id)
                    });
                  }
                }
              ]}
            />
          );
        }
      }
    ],
    [confirm, deleteMutation, statusMutation]
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Users"
        description="Every member of the Petto community. Open any row to inspect their pets, posts, reports, and bans."
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by name, email or city"
        trailing={
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
            <UserCog className="h-3.5 w-3.5" /> {filtered.length} users
          </div>
        }
      />
      <DataTable<UserProfile>
        data={paged}
        columns={columns}
        rowId={(row) => row.id}
        total={filtered.length}
        state={state}
        onStateChange={setState}
        loading={isLoading}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
      />
      {confirmNode}
    </div>
  );
}
