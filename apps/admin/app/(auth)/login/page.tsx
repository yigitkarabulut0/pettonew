"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PawPrint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiLogin } from "@/lib/api/client";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await apiLogin(values.email, values.password);
      toast.success("Welcome back");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign in");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--muted)] px-5">
      <Card className="w-full max-w-sm p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
            <PawPrint className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Petto</div>
            <div className="font-mono text-[10px] text-[var(--muted-foreground)]">admin console</div>
          </div>
        </div>

        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="mb-5 mt-0.5 text-xs text-[var(--muted-foreground)]">
          Use your admin credentials to continue.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@petto.app"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-[11px] text-[var(--destructive)]">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-[11px] text-[var(--destructive)]">{errors.password.message}</p>
            ) : null}
          </div>

          <Button type="submit" size="md" disabled={isSubmitting} className="mt-1">
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] text-[var(--muted-foreground)]">
          Access is recorded in the audit trail.
        </p>
      </Card>
    </div>
  );
}
