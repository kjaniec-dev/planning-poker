"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { calculateAverage } from "@/lib/utils";

type HistoryRound = {
  id: string;
  story: { title: string; link: string } | null;
  participants: Array<{ id: string; name: string; vote: string | null }>;
  revealedAt: number;
};

type Props = {
  history: HistoryRound[];
};

export function SessionHistory({ history }: Props) {
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.revealedAt - a.revealedAt);
  }, [history]);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 py-4">
      {sortedHistory.map((round) => {
        const numericVotes = round.participants.reduce<number[]>((acc, p) => {
          const num = Number(p.vote);
          if (!Number.isNaN(num) && p.vote) {
            acc.push(num);
          }
          return acc;
        }, []);
        const avg =
          numericVotes.length > 0 ? calculateAverage(numericVotes) : null;

        return (
          <div key={round.id} className="border-b pb-4 last:border-0 last:pb-0">
            <div className="flex justify-between items-start gap-2 mb-2">
              <div className="font-medium text-sm break-words flex-1">
                {round.story?.title || "Untitled Round"}
              </div>
              {avg !== null && <Badge variant="primary">Avg: {avg}</Badge>}
            </div>
            {round.story?.link && (
              <a
                href={round.story.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline mb-2 block truncate"
              >
                {round.story.link}
              </a>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {round.participants.map((p) => (
                <div
                  key={p.id}
                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-1"
                  title={`${p.name}: ${p.vote || "No vote"}`}
                >
                  <span className="max-w-[60px] truncate">{p.name}</span>
                  <span className="font-bold border-l pl-1">
                    {p.vote === "☕" ? "☕" : p.vote || "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              {new Date(round.revealedAt).toLocaleTimeString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
