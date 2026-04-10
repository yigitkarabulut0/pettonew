"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const badgeTypes = [
  { name: "First Steps", description: "Awarded when a user completes onboarding", category: "Onboarding", icon: "🐾" },
  { name: "Social Butterfly", description: "Awarded after making 5 matches", category: "Social", icon: "🦋" },
  { name: "Explorer", description: "Awarded after visiting 10 venues", category: "Activity", icon: "🗺️" },
  { name: "Health Champion", description: "Awarded for keeping health records up to date", category: "Care", icon: "💪" },
  { name: "Diary Keeper", description: "Awarded after writing 30 diary entries", category: "Care", icon: "📔" },
  { name: "Event Regular", description: "Awarded after attending 5 events", category: "Social", icon: "🎉" },
  { name: "Good Samaritan", description: "Awarded for helping find a lost pet", category: "Community", icon: "🤝" },
  { name: "Top Trainer", description: "Awarded after completing all training tips", category: "Training", icon: "🏆" }
];

export default function BadgesPage() {
  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--petto-primary)]">Badges</p>
        <h1 className="mt-2 text-4xl text-[var(--petto-ink)]">Gamification badges overview</h1>
        <p className="mt-2 text-sm text-[var(--petto-muted)]">
          Badges are automatically awarded to users when they meet specific milestones. This page provides an overview of all available badge types.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {badgeTypes.map((badge) => (
          <Card key={badge.name}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--petto-background)] text-2xl">
                {badge.icon}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-[var(--petto-ink)]">{badge.name}</p>
                  <Badge tone="neutral">{badge.category}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--petto-muted)]">{badge.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
