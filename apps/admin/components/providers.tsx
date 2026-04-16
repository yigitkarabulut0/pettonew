"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 60_000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            placeholderData: (previousData: unknown) => previousData
          }
        }
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <CommandPaletteProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </CommandPaletteProvider>
    </QueryClientProvider>
  );
}
