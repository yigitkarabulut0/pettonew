"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { PetMatchStats, UserPostStats, Pet } from "@petto/types";
import { Card, CardContent, CardHeader, CardTitle } from "@petto/ui";
import { Progress } from "@petto/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import {
  ArrowLeft,
  Loader2,
  Heart,
  ThumbsUp,
  PartyPopper,
  Laugh,
  FileText,
  TrendingUp,
  MessageCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface PetStats extends PetMatchStats {
  pet: Pet;
}

export default function StatsPage() {
  const router = useRouter();
  const [petStats, setPetStats] = useState<PetStats[]>([]);
  const [postStats, setPostStats] = useState<UserPostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<PetStats[]>("/match/stats"),
      api.get<UserPostStats>("/users/me/stats"),
    ])
      .then(([pStats, uStats]) => {
        setPetStats(pStats);
        setPostStats(uStats);
      })
      .catch(() => setError("Failed to load statistics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <h1 className="mb-4 text-xl font-bold">Statistics</h1>

      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}

      {petStats.length === 0 && !postStats && (
        <div className="py-12 text-center text-muted-foreground">
          No statistics available yet. Start swiping and posting!
        </div>
      )}

      {postStats && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted p-3 text-center">
                <FileText className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                <p className="text-lg font-bold">{postStats.totalPosts}</p>
                <p className="text-xs text-muted-foreground">Posts</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <TrendingUp className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                <p className="text-lg font-bold">
                  {postStats.likeRate.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Like Rate</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <ThumbsUp className="mx-auto mb-1 h-5 w-5 text-blue-500" />
                <p className="text-lg font-bold">{postStats.totalLikes}</p>
                <p className="text-xs text-muted-foreground">Likes</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <PartyPopper className="mx-auto mb-1 h-5 w-5 text-green-500" />
                <p className="text-lg font-bold">
                  {postStats.totalCongrats}
                </p>
                <p className="text-xs text-muted-foreground">Congrats</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted p-3 text-center">
                <Laugh className="mx-auto mb-1 h-5 w-5 text-yellow-500" />
                <p className="text-lg font-bold">{postStats.totalFunny}</p>
                <p className="text-xs text-muted-foreground">Funny</p>
              </div>
              {postStats.bestPost && (
                <div className="rounded-lg bg-muted p-3 text-center">
                  <MessageCircle className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                  <p className="text-lg font-bold">
                    {postStats.bestPost.likeCount +
                      postStats.bestPost.congratsCount +
                      postStats.bestPost.funnyCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Best Post</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {petStats.map((stat) => (
        <Card key={stat.pet.id} className="mb-4">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={stat.pet.avatarUrl || undefined} />
              <AvatarFallback>{stat.pet.name[0]}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-base">{stat.pet.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-lg font-bold">{stat.totalSwipes}</p>
                <p className="text-xs text-muted-foreground">Swipes</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-lg font-bold">{stat.totalLikes}</p>
                <p className="text-xs text-muted-foreground">Likes</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-lg font-bold">{stat.totalPasses}</p>
                <p className="text-xs text-muted-foreground">Passes</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-center">
                <Heart className="mx-auto mb-1 h-5 w-5 text-pink-500" />
                <p className="text-lg font-bold text-pink-600">
                  {stat.totalMatches}
                </p>
                <p className="text-xs text-pink-400">Matches</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                <TrendingUp className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="text-lg font-bold text-primary">
                  {stat.matchRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Match Rate</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Match Rate</span>
                <span>{stat.matchRate.toFixed(1)}%</span>
              </div>
              <Progress value={stat.matchRate} className="h-2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
