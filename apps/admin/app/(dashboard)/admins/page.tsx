"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ShieldCheck } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RelativeTime } from "@/components/common/RelativeTime";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { RowActions } from "@/components/data-table/columns";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { useDataTable } from "@/components/data-table/useDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type AdminAccount,
  createAdminAccount,
  deleteAdminAccount,
  listAdmins,
  resetAdminPassword
} from "@/lib/api/system";

export default function AdminsPage() {
  const { state, setState, selection, setSelection } = useDataTable();
  const qc = useQueryClient();
  const { confirm, node: confirmNode } = useConfirm();

  const query = useQuery({
    queryKey: ["admins", state],
    queryFn: () => listAdmins()
  });

  const [newOpen, setNewOpen] = React.useState(false);

  const createMut = useMutation({
    mutationFn: createAdminAccount,
    onSuccess: () => {
      toast.success("Admin created");
      setNewOpen(false);
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMut = useMutation({
    mutationFn: deleteAdminAccount,
    onSuccess: () => {
      toast.success("Admin removed");
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const resetMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetAdminPassword(id, password),
    onSuccess: () => toast.success("Password reset"),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const columns = React.useMemo<ColumnDef<AdminAccount, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--petto-muted)]" />
            <div className="leading-tight">
              <div className="text-sm font-medium">{row.original.name || row.original.email}</div>
              <div className="text-xs text-[var(--petto-muted)]">{row.original.email}</div>
            </div>
          </div>
        )
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => <Badge tone="brand">{row.original.role}</Badge>
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status ?? "active"} />
      },
      {
        accessorKey: "lastLoginAt",
        header: "Last login",
        cell: ({ row }) => <RelativeTime value={row.original.lastLoginAt} />
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              {
                label: "Reset password",
                onSelect: () => {
                  const pw = window.prompt("New password (min 8 chars)");
                  if (pw && pw.length >= 8) resetMut.mutate({ id: row.original.id, password: pw });
                }
              },
              {
                label: "Remove admin",
                destructive: true,
                onSelect: async () => {
                  await confirm({
                    title: "Remove admin?",
                    description: `${row.original.email} will lose console access.`,
                    confirmLabel: "Remove",
                    destructive: true,
                    requireReason: true,
                    onConfirm: async () => deleteMut.mutateAsync(row.original.id)
                  });
                }
              }
            ]}
          />
        )
      }
    ],
    [confirm, deleteMut, resetMut]
  );

  const data = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Admins"
        description="Manage who has access to the Petto admin console and their role."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New admin
          </Button>
        }
      />
      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by email or name"
      />
      <DataTable
        data={data}
        columns={columns}
        rowId={(row) => row.id}
        total={query.data?.total}
        state={state}
        onStateChange={setState}
        loading={query.isLoading}
        selection={selection}
        onSelectionChange={setSelection}
      />

      <NewAdminDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={(values) => createMut.mutate(values)}
        pending={createMut.isPending}
      />
      {confirmNode}
    </div>
  );
}

function NewAdminDialog({
  open,
  onOpenChange,
  onSubmit,
  pending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { email: string; name?: string; password: string; role: AdminAccount["role"] }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<AdminAccount["role"]>("moderator");

  React.useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
      setPassword("");
      setRole("moderator");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a new admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Temporary password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AdminAccount["role"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="superadmin">Superadmin — full access</SelectItem>
                <SelectItem value="moderator">Moderator — content & users</SelectItem>
                <SelectItem value="support">Support — read-only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!email || !password || password.length < 8) {
                toast.error("Email and 8+ char password required");
                return;
              }
              onSubmit({ email, name, password, role });
            }}
            disabled={pending}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
