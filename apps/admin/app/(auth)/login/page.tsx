"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminLogin } from "@/lib/admin-api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormValues>({
    defaultValues: {
      email: "",
      password: ""
    },
    resolver: zodResolver(schema)
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center gap-6">
          <span className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--petto-primary)]">
            Petto Admin
          </span>
          <h1 className="max-w-2xl text-6xl leading-none text-[var(--petto-ink)]">
            Moderation and growth in one warm, sharply organized cockpit.
          </h1>
          <p className="max-w-xl text-lg leading-8 text-[var(--petto-muted)]">
            Manage pet taxonomies, review reports, watch growth, and keep the matching ecosystem healthy.
          </p>
        </div>
        <Card className="p-8">
          <form
            className="space-y-4"
            onSubmit={handleSubmit(async (values) => {
              try {
                await adminLogin(values.email, values.password);
                router.replace("/dashboard");
                router.refresh();
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
              }
            })}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">
                Sign in
              </p>
              <h2 className="text-4xl">Control the system.</h2>
            </div>
            <Input placeholder="Email" {...register("email")} />
            <Input placeholder="Password" type="password" {...register("password")} />
            {errorMessage ? <p className="text-sm text-rose-700">{errorMessage}</p> : null}
            <Button className="w-full" type="submit">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-sm leading-6 text-[var(--petto-muted)]">
              Sign in with your Petto admin credentials to manage live users, pets, taxonomies, and reports.
            </p>
          </form>
        </Card>
      </div>
    </main>
  );
}
