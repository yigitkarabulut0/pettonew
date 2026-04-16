"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncement } from "@/lib/api/system";

const schema = z.object({
  title: z.string().min(3, "Required"),
  body: z.string().min(5, "Required"),
  severity: z.enum(["info", "warn", "critical"]),
  startsAt: z.string(),
  endsAt: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function NewAnnouncementPage() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { severity: "info", startsAt: new Date().toISOString().slice(0, 16) }
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) =>
      createAnnouncement({
        title: values.title,
        body: values.body,
        severity: values.severity,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null
      }),
    onSuccess: () => {
      toast.success("Announcement scheduled");
      router.push("/announcements");
    },
    onError: (err: Error) => toast.error(err.message)
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="New announcement" description="Reach the Petto community." />
      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...form.register("title")} />
              {form.formState.errors.title ? (
                <p className="text-xs text-red-600">{form.formState.errors.title.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body">Body</Label>
              <Textarea id="body" rows={5} {...form.register("body")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Severity</Label>
              <RadioGroup
                value={form.watch("severity")}
                onValueChange={(v) => form.setValue("severity", v as "info" | "warn" | "critical")}
                className="flex flex-row gap-3"
              >
                {(["info", "warn", "critical"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={s} />
                    <span className="capitalize">{s}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startsAt">Starts</Label>
                <Input id="startsAt" type="datetime-local" {...form.register("startsAt")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endsAt">Ends (optional)</Label>
                <Input id="endsAt" type="datetime-local" {...form.register("endsAt")} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Scheduling…" : "Schedule announcement"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
