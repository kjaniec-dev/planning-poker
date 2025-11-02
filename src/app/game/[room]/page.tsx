"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { Participants } from "@/app/components/participants";
import { Results } from "@/app/components/results";
import { StoryInfo } from "@/app/components/story-info";
import { VotingCards } from "@/app/components/voting-cards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRealtime } from "@/lib/realtime/useRealtime";

export default function GameRoomPage() {
  const params = useParams<{ room: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const room = (params?.room || "").toString().toUpperCase();
  const name = (search?.get("name") || "Guest").toString();
  const isSpectator = name === "Guest";

  const [selection, setSelection] = useState<string | null>(null);
  const wasRevealed = useRef(false);
  const [newName, setNewName] = useState("");
  const {
    participants,
    revealed,
    vote,
    reveal,
    reset,
    story,
    updateStory,
    lastRound,
    reestimate,
    resumeVoting,
    suspendVoting,
  } = useRealtime(room, name);

  const me = participants.find((p) => p.name === name);
  const isPaused = Boolean(me?.paused);

  useEffect(() => {
    if (wasRevealed.current && !revealed) {
      setSelection(null);
    } else if (me && me.vote != selection && !me.paused) {
      setSelection(me.vote);
    }
    wasRevealed.current = revealed;
  }, [revealed]);

  const handleReveal = () => {
    if (!selection) return;
    reveal();
  };

  const handleReset = () => reset();

  const handleBecomeParticipant = () => {
    if (!newName) return;
    const qp = new URLSearchParams(search);
    qp.set("name", newName);
    router.push(`/game/${encodeURIComponent(room)}?${qp.toString()}`);
  };

  const copyGameUrl = async () => {
    const url =
      typeof window !== "undefined"
        ? `${location.origin}/game/${encodeURIComponent(room)}`
        : "";
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 px-6 pb-12">
        <div className="w-full max-w-7xl mx-auto py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3">
              <StoryInfo
                value={story ?? undefined}
                onChange={(s) => {
                  if (s) {
                    updateStory(s);
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Planning Poker</CardTitle>
                    <CardDescription>
                      Room {room} • {name ? `Welcome, ${name}.` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      variant="default"
                      onClick={copyGameUrl}
                      title="Copy room link"
                    >
                      Copy room link
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Reset the game
                        </Button>
                      }
                      title="Are you sure?"
                      description="This will reset the game, clear all votes, and start a fresh round"
                      actionLabel="Reset"
                      onAction={handleReset}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isSpectator ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-4 text-center">
                    <Ban className="size-12" />
                    <div className="space-y-1">
                      <p className="font-semibold">You are a spectator</p>
                      <p className="text-sm text-muted-foreground">
                        Enter your name to start voting.
                      </p>
                    </div>
                    <form
                      className="flex w-full max-w-sm items-center space-x-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleBecomeParticipant();
                      }}
                    >
                      <Input
                        placeholder="Your Name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Button type="submit" disabled={!newName}>
                        Join
                      </Button>
                    </form>
                  </div>
                ) : (
                  <VotingCards
                    selection={selection}
                    revealed={revealed}
                    onSelect={(s) => setSelection(s)}
                    vote={vote}
                    resumeVoting={resumeVoting}
                    suspendVoting={suspendVoting}
                    isPaused={isPaused}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Participants participants={participants} revealed={revealed} />

            <Results
              onReestimate={reestimate}
              participants={participants}
              revealed={revealed}
              onReveal={handleReveal}
              canReveal={!!selection}
              previousRound={lastRound ?? undefined}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
