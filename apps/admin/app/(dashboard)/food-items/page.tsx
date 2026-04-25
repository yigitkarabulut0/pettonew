"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Drumstick, Globe, Lock, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { RowActions } from "@/components/data-table/columns";
import { useDataTable } from "@/components/data-table/useDataTable";
import {
  AdminFoodItem,
  createAdminFoodItem,
  deleteAdminFoodItem,
  getAdminFoodItems,
  updateAdminFoodItem
} from "@/lib/admin-api";

type Kind = AdminFoodItem["kind"];

type FormState = {
  id: string;
  name: string;
  brand: string;
  kind: Kind;
  speciesLabel: string;
  kcalPer100g: string;
  isPublic: boolean;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  brand: "",
  kind: "dry",
  speciesLabel: "",
  kcalPer100g: "",
  isPublic: true
};

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export default function FoodItemsPage() {
  const qc = useQueryClient();
  const { state, setState, selection, setSelection } = useDataTable();
  const { confirm, node: confirmNode } = useConfirm();

  const [speciesFilter, setSpeciesFilter] = React.useState("");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ["admin-food-items"],
    queryFn: () => getAdminFoodItems()
  });

  const all = query.data ?? [];
  const filtered = React.useMemo(() => {
    const q = state.search.trim().toLowerCase();
    return all.filter((it) => {
      if (
        speciesFilter &&
        (it.speciesLabel ?? "").toLowerCase() !== speciesFilter.toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      return [it.name, it.brand].some((v) => v?.toLowerCase().includes(q));
    });
  }, [all, state.search, speciesFilter]);

  const paged = React.useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }, [filtered, state.page, state.pageSize]);

  const upsertMutation = useMutation({
    mutationFn: () => {
      const kcal = parseFloat(form.kcalPer100g);
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        kind: form.kind,
        speciesLabel: form.speciesLabel || undefined,
        kcalPer100g: Number.isFinite(kcal) ? kcal : 0,
        isPublic: form.isPublic
      };
      return form.id
        ? updateAdminFoodItem(form.id, payload)
        : createAdminFoodItem(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Food item updated" : "Food item added");
      qc.invalidateQueries({ queryKey: ["admin-food-items"] });
      setSheetOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminFoodItem(id),
    onSuccess: () => {
      toast.success("Food item deleted");
      qc.invalidateQueries({ queryKey: ["admin-food-items"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed")
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (item: AdminFoodItem) => {
    setForm({
      id: item.id,
      name: item.name,
      brand: item.brand ?? "",
      kind: item.kind,
      speciesLabel: item.speciesLabel ?? "",
      kcalPer100g: String(item.kcalPer100g),
      isPublic: item.isPublic
    });
    setSheetOpen(true);
  };

  const askDelete = (item: AdminFoodItem) => {
    confirm({
      title: `Delete "${item.name}"?`,
      description:
        "Existing meal logs that referenced this item keep their snapshotted kcal — only future entries are affected.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteMutation.mutateAsync(item.id);
      }
    });
  };

  const columns = React.useMemo<ColumnDef<AdminFoodItem, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Item",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Drumstick className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-[var(--foreground)]">
                {row.original.name}
              </div>
              {row.original.brand ? (
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {row.original.brand}
                </div>
              ) : null}
            </div>
          </div>
        )
      },
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-xs capitalize text-[var(--muted-foreground)]">
            {row.original.kind}
          </span>
        )
      },
      {
        accessorKey: "speciesLabel",
        header: "Species",
        cell: ({ row }) => (
          <span className="text-xs capitalize text-[var(--muted-foreground)]">
            {row.original.speciesLabel || "any"}
          </span>
        )
      },
      {
        accessorKey: "kcalPer100g",
        header: () => <div className="text-right">kcal/100g</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono text-xs text-[var(--foreground)]">
            {row.original.kcalPer100g}
          </div>
        )
      },
      {
        accessorKey: "isPublic",
        header: "Visibility",
        cell: ({ row }) =>
          row.original.isPublic ? (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
              <Globe className="h-3 w-3" />
              Public
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Lock className="h-3 w-3" />
              Private
            </span>
          )
      },
      {
        id: "_actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            items={[
              { label: "Edit", onSelect: () => openEdit(row.original) },
              {
                label: "Delete",
                destructive: true,
                onSelect: () => askDelete(row.original)
              }
            ]}
          />
        )
      }
    ],
    []
  );

  const stats = React.useMemo(() => {
    const total = all.length;
    const publicCount = all.filter((i) => i.isPublic).length;
    return { total, publicCount, privateCount: total - publicCount };
  }, [all]);

  const canSubmit =
    form.name.trim().length > 0 && parseFloat(form.kcalPer100g) > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Food Items"
        description={`Calorie counter database — ${stats.total} items (${stats.publicCount} public, ${stats.privateCount} private). Mobile multiplies grams × kcalPer100g ÷ 100, so keep these accurate.`}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New food item
          </Button>
        }
      />

      <DataTableToolbar
        searchValue={state.search}
        onSearchChange={(value) => setState({ search: value, page: 1 })}
        searchPlaceholder="Search by name or brand"
        trailing={
          <select
            className={SELECT_CLASS + " w-36"}
            value={speciesFilter}
            onChange={(e) => setSpeciesFilter(e.target.value)}
          >
            <option value="">All species</option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="rabbit">Rabbit</option>
            <option value="bird">Bird</option>
          </select>
        }
      />

      {!query.isLoading && all.length === 0 ? (
        <EmptyState
          icon={Drumstick}
          title="No food items yet"
          description="Add the first one — start with a couple of common dry foods so the mobile calorie counter has something to suggest."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New food item
            </Button>
          }
        />
      ) : (
        <DataTable<AdminFoodItem>
          data={paged}
          columns={columns}
          rowId={(row) => row.id}
          total={filtered.length}
          state={state}
          onStateChange={setState}
          loading={query.isLoading}
          selection={selection}
          onSelectionChange={setSelection}
          onRowClick={(row) => openEdit(row)}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4">
            <SheetTitle>{form.id ? "Edit food item" : "New food item"}</SheetTitle>
            <SheetDescription>
              {form.id
                ? "Update the food row. Existing meal logs keep their snapshotted kcal."
                : "Public items show up in every user's food picker. Keep kcal/100g accurate — the calorie maths depends on it."}
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) upsertMutation.mutate();
            }}
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="food-name">Name</Label>
              <Input
                id="food-name"
                placeholder="e.g. Adult Chicken"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="food-brand">Brand</Label>
              <Input
                id="food-brand"
                placeholder="e.g. Royal Canin (optional)"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="food-kind">Type</Label>
                <select
                  id="food-kind"
                  className={SELECT_CLASS}
                  value={form.kind}
                  onChange={(e) =>
                    setForm({ ...form, kind: e.target.value as Kind })
                  }
                >
                  <option value="dry">Dry</option>
                  <option value="wet">Wet</option>
                  <option value="treat">Treat</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="food-species">Species</Label>
                <select
                  id="food-species"
                  className={SELECT_CLASS}
                  value={form.speciesLabel}
                  onChange={(e) =>
                    setForm({ ...form, speciesLabel: e.target.value })
                  }
                >
                  <option value="">Any species</option>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="rabbit">Rabbit</option>
                  <option value="bird">Bird</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="food-kcal">kcal per 100g</Label>
              <Input
                id="food-kcal"
                type="number"
                inputMode="decimal"
                placeholder="380"
                value={form.kcalPer100g}
                onChange={(e) =>
                  setForm({ ...form, kcalPer100g: e.target.value })
                }
              />
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Caloric density. Look this up on the bag — most dry kibbles
                are 350–420 kcal/100g.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="food-public" className="cursor-pointer">
                  Public
                </Label>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Visible to every Fetcht user. Off = private to the creator.
                </p>
              </div>
              <Switch
                id="food-public"
                checked={form.isPublic}
                onCheckedChange={(v) => setForm({ ...form, isPublic: v })}
              />
            </div>

            </div>

            <SheetFooter className="shrink-0 border-t border-[var(--border)] bg-[var(--petto-surface)] px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || upsertMutation.isPending}>
                {upsertMutation.isPending
                  ? "Saving…"
                  : form.id
                  ? "Save changes"
                  : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {confirmNode}
    </div>
  );
}
