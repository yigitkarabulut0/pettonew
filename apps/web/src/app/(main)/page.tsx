"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Post } from "@petto/types";
import { Card, CardContent, CardFooter, CardHeader } from "@petto/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@petto/ui";
import { Badge } from "@petto/ui";
import { Button } from "@petto/ui";
import { ThumbsUp, PartyPopper, Laugh, Loader2 } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState("");

  const fetchPosts = useCallback(async () => {
    try {
      const res = await api.get<{
        data: Post[];
        total: number;
        has_more: boolean;
      }>(`/posts?page=${page}&page_size=10`);
      if (page === 1) {
        setPosts(res.data);
      } else {
        setPosts((prev) => [...prev, ...res.data]);
      }
      setHasMore(res.has_more);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    try {
      const res = await api.post<Post>("/posts", {
        content: newPostContent,
      });
      setPosts((prev) => [res, ...prev]);
      setNewPostContent("");
    } catch (err) {
      console.error("Failed to create post:", err);
    }
  };

  const handleReact = async (postId: string, type: "like" | "congrats" | "funny") => {
    try {
      await api.post(`/posts/${postId}/react`, { type });
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId) {
            const updated = { ...p };
            if (p.myReaction === type) {
              updated.myReaction = null;
              if (type === "like") updated.likeCount--;
              if (type === "congrats") updated.congratsCount--;
              if (type === "funny") updated.funnyCount--;
            } else {
              if (p.myReaction) {
                if (p.myReaction === "like") updated.likeCount--;
                if (p.myReaction === "congrats") updated.congratsCount--;
                if (p.myReaction === "funny") updated.funnyCount--;
              }
              updated.myReaction = type;
              if (type === "like") updated.likeCount++;
              if (type === "congrats") updated.congratsCount++;
              if (type === "funny") updated.funnyCount++;
            }
            return updated;
          }
          return p;
        })
      );
    } catch (err) {
      console.error("Failed to react:", err);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <div className="mb-4">
        <div className="rounded-lg border bg-card p-4">
          <textarea
            className="w-full resize-none border-0 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            rows={3}
            placeholder="What's on your mind?"
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
          />
          <div className="flex justify-end border-t pt-3">
            <Button
              size="sm"
              onClick={handleCreatePost}
              disabled={!newPostContent.trim()}
            >
              Post
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No posts yet. Be the first to share!
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={
                      post.user?.avatarUrl ||
                      post.user?.avatar_url ||
                      undefined
                    }
                  />
                  <AvatarFallback>
                    {post.user?.firstName?.[0] || post.user?.first_name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {post.user?.firstName || post.user?.first_name}{" "}
                      {post.user?.lastName || post.user?.last_name}
                    </span>
                    {post.isMatchedUser && (
                      <Badge variant="success" className="text-xs">
                        Match
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              {post.imageUrls && post.imageUrls.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="overflow-hidden rounded-md">
                    <img
                      src={post.imageUrls[0]}
                      alt="Post image"
                      className="h-64 w-full object-cover"
                    />
                  </div>
                </div>
              )}
              <CardContent className="pb-3">
                <p className="whitespace-pre-wrap text-sm">{post.content}</p>
              </CardContent>
              <CardFooter className="flex gap-1 pt-0">
                <button
                  onClick={() => handleReact(post.id, "like")}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    post.myReaction === "like"
                      ? "bg-blue-100 text-blue-600"
                      : "hover:bg-muted"
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  {post.likeCount > 0 && <span>{post.likeCount}</span>}
                </button>
                <button
                  onClick={() => handleReact(post.id, "congrats")}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    post.myReaction === "congrats"
                      ? "bg-green-100 text-green-600"
                      : "hover:bg-muted"
                  }`}
                >
                  <PartyPopper className="h-4 w-4" />
                  {post.congratsCount > 0 && (
                    <span>{post.congratsCount}</span>
                  )}
                </button>
                <button
                  onClick={() => handleReact(post.id, "funny")}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    post.myReaction === "funny"
                      ? "bg-yellow-100 text-yellow-600"
                      : "hover:bg-muted"
                  }`}
                >
                  <Laugh className="h-4 w-4" />
                  {post.funnyCount > 0 && <span>{post.funnyCount}</span>}
                </button>
              </CardFooter>
            </Card>
          ))}

          {hasMore && (
            <div className="py-4 text-center">
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
