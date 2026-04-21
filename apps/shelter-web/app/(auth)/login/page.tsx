"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiLogin } from "@/lib/api";

export default function ShelterLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await apiLogin(email.trim(), password);
      if (result.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Shelter sign in</h1>
          <p className="max-w-xs text-xs text-[var(--muted-foreground)]">
            Sign in with the credentials Petto support sent you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shelter@example.org"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <p className="text-center text-[12px] text-[var(--muted-foreground)]">
            Not signed up yet?
          </p>
          <Link
            href="/apply"
            className="flex h-10 w-full items-center justify-center rounded-md bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
          >
            Start a shelter application →
          </Link>
          <p className="text-center text-[11px] text-[var(--muted-foreground)]">
            Reviewed within 48 hours by the Fetcht team.
          </p>
        </div>
      </Card>
    </main>
  );
}
