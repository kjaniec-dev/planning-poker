"use client";

import { ProgressRing } from "@kjaniec-dev/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, Loader, Pause } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInitials } from "@/lib/utils";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
  connected?: boolean;
};

type Props = {
  participants: Participant[];
};

export function Participants({ participants }: Props) {
  const votingParticipants = participants.filter(
    (p) => p.name !== "Guest" && !p.paused && (p.connected ?? true),
  );
  const votedCount = votingParticipants.filter((p) => p.vote != null).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Participants</CardTitle>
            <CardDescription>
              {votingParticipants.length === 0
                ? "Waiting for voters"
                : votedCount === votingParticipants.length
                  ? "Everyone has voted"
                  : `${votedCount} of ${votingParticipants.length} voted`}
            </CardDescription>
          </div>
          <ProgressRing
            value={votedCount}
            max={Math.max(votingParticipants.length, 1)}
            size="md"
            tone={
              votingParticipants.length > 0 &&
              votedCount === votingParticipants.length
                ? "success"
                : "secondary"
            }
            aria-label="Voting progress"
          >
            <span className="text-xs font-semibold tabular-nums">
              {votedCount}/{votingParticipants.length}
            </span>
          </ProgressRing>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {participants.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`flex items-center justify-between rounded-kj-lg border border-border/70 px-3 py-2 bg-surface ${
                  p.connected === false ? "opacity-50 grayscale-[0.5]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar size="sm" tone="muted" status={p.connected !== false}>
                    {getInitials(p.name)}
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">
                      {p.name}
                      {p.connected === false && " (Offline)"}
                    </span>
                    {p.paused && (
                      <span className="text-[10px] text-muted-foreground mt-1">
                        Paused
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="text-muted-foreground"
                  title={
                    p.name === "Guest"
                      ? "Spectator"
                      : p.paused
                        ? "Paused"
                        : p.vote
                          ? "Voted"
                          : "Voting..."
                  }
                >
                  {p.name === "Guest" ? (
                    <Ban className="h-4 w-4" />
                  ) : p.paused ? (
                    <Pause className="h-4 w-4" />
                  ) : p.vote ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <Check className="h-4 w-4 text-secondary" />
                    </motion.div>
                  ) : (
                    <Loader className="h-4 w-4 animate-spin text-muted-foreground/50" />
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </CardContent>
    </Card>
  );
}
