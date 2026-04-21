"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BulkImport } from "@/components/bulk-import";

export default function BulkImportPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/pets">
            <ArrowLeft className="size-4" /> Back to pets
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Bulk import listings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Upload a CSV of up to 500 rows. Everything lands as a draft — we never
          auto-publish on import. Jurisdiction rules (banned breeds, prohibited
          species) block rows inline.
        </p>
      </div>
      <div className="mt-6">
        <BulkImport />
      </div>
    </div>
  );
}
