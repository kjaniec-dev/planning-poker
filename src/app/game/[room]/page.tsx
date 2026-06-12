"use client";

import { ErrorState, Skeleton } from "@kjaniec-dev/ui";
import {
  Ban,
  CheckCircle,
  Copy,
  History,
  LayoutDashboard,
  Link,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { Participants } from "@/app/components/participants";
import { Results } from "@/app/components/results";
import { SessionHistory } from "@/app/components/session-history";
import { StoryInfo } from "@/app/components/story-info";
import { Timer } from "@/app/components/timer";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRealtime } from "@/lib/realtime/useRealtime";

export default function GameRoomPage() {
  const params = useParams<{ room: string }>();
  const search = useSearchParams();
  const _router = useRouter();

  const room = (params?.room || "").toString().toUpperCase();
  const initialNameFromUrl = search?.get("name")?.toString();

  const [currentName, setCurrentName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (initialNameFromUrl) {
      setCurrentName(initialNameFromUrl.trim());
      localStorage.setItem(
        "planning-poker-user-name",
        initialNameFromUrl.trim(),
      );
    } else {
      const savedName = localStorage.getItem("planning-poker-user-name");
      if (savedName) {
        setCurrentName(savedName);
        // Sync URL with saved name for consistency if joined without name
        const url = new URL(window.location.href);
        if (!url.searchParams.has("name")) {
          url.searchParams.set("name", savedName);
          window.history.replaceState(
            { ...window.history.state, as: url.href, url: url.href },
            "",
            url.href,
          );
        }
      } else {
        setCurrentName("Guest");
      }
    }
  }, [initialNameFromUrl]);

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
    history,
    reestimate,
    resumeVoting,
    suspendVoting,
    updateName,
    autoReveal,
    toggleAutoReveal,
    timer,
    startTimer,
    stopTimer,
    isConnected,
  } = useRealtime(room, currentName);

  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setConnectionError(false);
      return;
    }

    const timerId = setTimeout(() => {
      if (!isConnected) {
        setConnectionError(true);
      }
    }, 8000);

    return () => clearTimeout(timerId);
  }, [isConnected]);

  const me = participants.find((p) => p.name === currentName);
  const isSpectator = currentName === "Guest";
  const isPaused = Boolean(me?.paused);

  const [activeTab, setActiveTab] = useState("voting");

  // SessionStorage key for persisting vote
  const getVoteKey = useCallback(
    () => `vote:${room}:${currentName}`,
    [room, currentName],
  );

  // Restore vote from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined" || isSpectator) return;

    const savedVote = sessionStorage.getItem(getVoteKey());
    if (savedVote && !revealed) {
      setSelection(savedVote);
    }
  }, [isSpectator, getVoteKey, revealed]);

  // Clear selection when revealed or reset
  useEffect(() => {
    if (wasRevealed.current && !revealed) {
      setSelection(null);
      sessionStorage.removeItem(getVoteKey());
      setActiveTab("voting");
    } else if (revealed && me && me.vote !== selection) {
      setSelection(me.vote);
    }

    if (!wasRevealed.current && revealed) {
      setActiveTab("results");
    }

    wasRevealed.current = revealed;
  }, [revealed, getVoteKey, me, selection]);

  if (!mounted) return null;

  if (connectionError) {
    return (
      <div className="w-full max-w-7xl mx-auto py-12 px-6 flex justify-center items-center">
        <ErrorState
          title="Connection Error"
          message="We could not establish a connection to the realtime server. Please try again."
          onRetry={() => {
            window.location.reload();
          }}
          retryLabel="Reload Page"
        />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="w-full max-w-7xl mx-auto py-6 px-6 pb-12 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-3">
            <Skeleton
              variant="rectangular"
              height={100}
              className="w-full rounded-xl"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton
              variant="rectangular"
              height={400}
              className="w-full rounded-xl"
            />
          </div>
          <div className="lg:col-span-1">
            <Skeleton
              variant="rectangular"
              height={400}
              className="w-full rounded-xl"
            />
          </div>
        </div>
      </div>
    );
  }

  // Wrapper for vote that persists to sessionStorage
  const handleVote = (value: string) => {
    vote(value);
    if (value) {
      sessionStorage.setItem(getVoteKey(), value);
    } else {
      sessionStorage.removeItem(getVoteKey());
    }
  };

  const handleReveal = () => {
    if (!selection) return;
    reveal();
    // Clear vote from sessionStorage after revealing
    sessionStorage.removeItem(getVoteKey());
  };

  const handleReset = () => {
    reset();
    sessionStorage.removeItem(getVoteKey());
  };

  const handleBecomeParticipant = () => {
    if (!newName) return;
    const trimmedName = newName.trim();
    localStorage.setItem("planning-poker-user-name", trimmedName);
    updateName(trimmedName);
    setCurrentName(trimmedName);

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("name", trimmedName);
    window.history.pushState(
      { ...window.history.state, as: newUrl.href, url: newUrl.href },
      "",
      newUrl.href,
    );

    setNewName("");
  };

  const copyGameUrl = async () => {
    const url =
      typeof window !== "undefined"
        ? `${location.origin}/game/${encodeURIComponent(room)}`
        : "";
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6 pb-12 space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Planning Poker</CardTitle>
                    <CardDescription>
                      Room {room} •{" "}
                      {currentName ? `Welcome, ${currentName}.` : ""}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Timer
                      timer={timer}
                      onStart={startTimer}
                      onStop={stopTimer}
                    />
                    <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyGameUrl}
                          className="flex items-center gap-2"
                        >
                          {linkCopied ? (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {linkCopied ? "Link copied!" : "Copy room link"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-4 mb-6">
                  <TabsTrigger
                    value="voting"
                    className="flex items-center gap-2"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Voting</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="results"
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">Results</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="flex items-center gap-2"
                  >
                    <History className="h-4 w-4" />
                    <span className="hidden sm:inline">History</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="settings"
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Settings</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="voting" className="mt-0 outline-none">
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
                          autoFocus={true}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                        <Button type="submit" disabled={!newName.trim()}>
                          Join
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <VotingCards
                      selection={selection}
                      revealed={revealed}
                      onSelect={(s) => setSelection(s)}
                      vote={handleVote}
                      resumeVoting={resumeVoting}
                      suspendVoting={suspendVoting}
                      isPaused={isPaused}
                    />
                  )}
                </TabsContent>

                <TabsContent value="results" className="mt-0 outline-none">
                  <Results
                    onReestimate={reestimate}
                    participants={participants}
                    revealed={revealed}
                    onReveal={handleReveal}
                    canReveal={!!selection}
                    isPaused={isPaused}
                    previousRound={history[history.length - 1] ?? undefined}
                  />
                </TabsContent>

                <TabsContent value="history" className="mt-0 outline-none">
                  <SessionHistory history={history} />
                </TabsContent>

                <TabsContent value="settings" className="mt-0 outline-none">
                  <div className="space-y-6 py-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-subtle">
                        <div className="space-y-0.5 mr-4">
                          <h4 className="text-sm font-medium">Auto-Reveal</h4>
                          <p className="text-sm text-muted-foreground">
                            Automatically reveal cards when everyone has voted
                          </p>
                        </div>
                        <Switch
                          checked={autoReveal}
                          onChange={(e) => toggleAutoReveal(e.target.checked)}
                        />
                      </div>

                      <div className="flex flex-col gap-4 p-4 rounded-lg border bg-subtle">
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-medium">Room Link</h4>
                          <p className="text-sm text-muted-foreground truncate max-w-full">
                            {typeof window !== "undefined"
                              ? `${location.origin}/game/${room}`
                              : ""}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyGameUrl}
                          className="flex items-center gap-2 w-full sm:w-auto sm:self-start"
                        >
                          {linkCopied ? (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Link className="h-4 w-4" />
                              <span>Copy URL</span>
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="flex flex-col gap-4 p-4 rounded-lg border bg-subtle">
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-medium text-danger">
                            Danger Zone
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Reset the current round and clear all votes
                          </p>
                        </div>
                        <ConfirmDialog
                          trigger={
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isPaused}
                              className="flex items-center gap-2 border-danger text-danger hover:bg-danger hover:text-white w-full sm:w-auto sm:self-start"
                            >
                              <RotateCcw className="h-4 w-4" />
                              <span>Reset Game</span>
                            </Button>
                          }
                          title="Are you sure?"
                          description="This will reset the game, clear all votes, and start a fresh round"
                          actionLabel="Reset"
                          onAction={handleReset}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Participants participants={participants} />
        </div>
      </div>
    </div>
  );
}
