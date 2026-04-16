"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { NAV_GROUPS } from "@/components/shell/nav-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { hasRole, useAdminSession } from "@/lib/permissions";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const Ctx = React.createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { session } = useAdminSession();

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, actions, entities…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.requires || hasRole(session, item.requires));
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group.label} heading={group.label}>
                {items.map((item) => (
                  <CommandItem key={item.href} value={`${group.label} ${item.label}`} onSelect={() => go(item.href)}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-[var(--petto-muted)]" />
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          <CommandSeparator />
          <CommandGroup heading="Quick actions">
            <CommandItem onSelect={() => go("/notifications/new")}>Send notification…</CommandItem>
            <CommandItem onSelect={() => go("/broadcast")}>Send broadcast…</CommandItem>
            <CommandItem onSelect={() => go("/reports?status=open")}>Open reports</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </Ctx.Provider>
  );
}
