"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, Loader, Pause } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
};

type Props = {
  participants: Participant[];
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Participants({ participants }: Props) {
  const votingParticipants = participants.filter(
    (p) => p.name !== "Guest" && !p.paused,
  );
  const votedCount = votingParticipants.filter((p) => p.vote != null).length;
  const progress =
    votingParticipants.length > 0
      ? (votedCount / votingParticipants.length) * 100
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Participants</CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            {votedCount}/{votingParticipants.length}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
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
                className="flex items-center justify-between rounded-md border px-3 py-2 bg-card/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground ring-1 ring-border shadow-sm">
                    {getInitials(p.name)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">
                      {p.name}
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
                      <Check className="h-4 w-4 text-primary" />
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
