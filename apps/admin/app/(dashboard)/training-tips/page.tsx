"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createAdminTrainingTip, deleteAdminTrainingTip, getAdminTrainingTips } from "@/lib/admin-api";

interface StepForm {
  order: number;
  title: string;
  description: string;
  videoUrl: string;
}

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm";
const TEXTAREA_CLASS = "flex min-h-[80px] w-full rounded-md border border-[var(--petto-border)] bg-white px-3 py-2 text-sm";

export default function TrainingTipsPage() {
  const queryClient = useQueryClient();
  const { data: tips = [], isLoading } = useQuery({
    queryKey: ["admin-training-tips"],
    queryFn: getAdminTrainingTips
  });

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("basic-commands");
  const [petType, setPetType] = useState("dog");
  const [difficulty, setDifficulty] = useState("easy");
  const [videoUrl, setVideoUrl] = useState("");
  const [steps, setSteps] = useState<StepForm[]>([]);

  const resetForm = () => {
    setTitle("");
    setSummary("");
    setBody("");
    setCategory("basic-commands");
    setPetType("dog");
    setDifficulty("easy");
    setVideoUrl("");
    setSteps([]);
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { order: prev.length + 1, title: "", description: "", videoUrl: "" }
    ]);
  };

  const updateStep = (index: number, field: keyof StepForm, value: string | number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeStep = (index: number) => {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }))
    );
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminTrainingTip({
        title,
        summary,
        body,
        category,
        petType,
        difficulty,
        steps: steps.map((s) => ({
          order: s.order,
          title: s.title,
          description: s.description,
          videoUrl: s.videoUrl || undefined
        })),
        videoUrl: videoUrl || undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-training-tips"] });
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (tipId: string) => deleteAdminTrainingTip(tipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-training-tips"] });
    }
  });

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Training Tips</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">Create rich training content for pet owners</h1>
      </Card>

      {/* Creation Form */}
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Input placeholder="Tip title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Video URL (optional)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          </div>

          <textarea
            placeholder="Summary (short description)"
            className={TEXTAREA_CLASS}
            style={{ minHeight: 60 }}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />

          <textarea
            placeholder="Body (full content)"
            className={TEXTAREA_CLASS}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="grid gap-3 lg:grid-cols-3">
            <select className={SELECT_CLASS} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="basic-commands">Basic Commands</option>
              <option value="potty-training">Potty Training</option>
              <option value="socialization">Socialization</option>
              <option value="behavior">Behavior</option>
              <option value="health-care">Health Care</option>
            </select>
            <select className={SELECT_CLASS} value={petType} onChange={(e) => setPetType(e.target.value)}>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="bird">Bird</option>
              <option value="rabbit">Rabbit</option>
              <option value="all">All</option>
            </select>
            <select className={SELECT_CLASS} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Steps Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--petto-ink)]">Steps</h3>
              <Button type="button" variant="outline" onClick={addStep}>
                Add Step
              </Button>
            </div>
            {steps.map((step, index) => (
              <div key={index} className="rounded-xl border border-[var(--petto-border)] bg-white/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--petto-muted)]">
                    Step {step.order}
                  </span>
                  <Button type="button" variant="ghost" className="text-rose-700 hover:text-rose-800 text-xs" onClick={() => removeStep(index)}>
                    Remove
                  </Button>
                </div>
                <Input placeholder="Step title" value={step.title} onChange={(e) => updateStep(index, "title", e.target.value)} />
                <textarea
                  placeholder="Step description"
                  className={TEXTAREA_CLASS}
                  style={{ minHeight: 60 }}
                  value={step.description}
                  onChange={(e) => updateStep(index, "description", e.target.value)}
                />
                <Input placeholder="Step video URL (optional)" value={step.videoUrl} onChange={(e) => updateStep(index, "videoUrl", e.target.value)} />
              </div>
            ))}
          </div>

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create tip"}
          </Button>
        </form>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--petto-primary)] border-t-transparent" />
        </div>
      )}
      {!isLoading && tips.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--petto-border)] bg-white/60 px-4 py-12 text-center text-sm text-[var(--petto-muted)]">
          No training tips found.
        </div>
      )}

      {/* Tips List */}
      <div className="grid gap-4 lg:grid-cols-2">
        {tips.map((tip) => (
          <Card key={tip.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-semibold text-[var(--petto-ink)]">{tip.title}</p>
                {(tip as Record<string, unknown>).summary ? (
                  <p className="mt-1 text-sm text-[var(--petto-muted)] line-clamp-2">
                    {String((tip as Record<string, unknown>).summary ?? "")}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={tip.difficulty === "hard" ? "warning" : tip.difficulty === "medium" ? "warning" : "neutral"}>
                    {tip.difficulty}
                  </Badge>
                  <Badge tone="neutral">{tip.category}</Badge>
                  <Badge tone="success">{tip.petType}</Badge>
                  {Array.isArray((tip as Record<string, unknown>).steps) &&
                    ((tip as Record<string, unknown>).steps as unknown[]).length > 0 && (
                      <Badge tone="neutral">
                        {((tip as Record<string, unknown>).steps as unknown[]).length} steps
                      </Badge>
                    )}
                </div>
              </div>
              <Button variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => deleteMutation.mutate(tip.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
