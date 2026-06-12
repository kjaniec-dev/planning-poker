"use client";

import { MetricCard } from "@kjaniec-dev/ui";
import { useMemo } from "react";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { calculateAverage, calculateMedian } from "@/lib/utils";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
};

type Props = {
  participants: Participant[];
  revealed: boolean;
  onReveal: () => void;
  canReveal: boolean;
  isPaused?: boolean;
  onReestimate?: () => void;
  previousRound?: {
    id: string;
    story: { title: string; link: string } | null;
    participants: Array<{ id: string; name: string; vote: string | null }>;
  } | null;
};

export function Results({
  participants,
  revealed,
  onReveal,
  canReveal,
  isPaused = false,
  onReestimate,
  previousRound,
}: Props) {
  const results = useMemo(() => {
    if (!revealed) return null;
    const roundParticipants = previousRound?.participants || [];
    const counts = new Map<string, number>();
    for (const p of roundParticipants) {
      const v = p.vote ?? "—";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries()).sort((a, b) => {
      const na = Number(a[0]),
        nb = Number(b[0]);
      const aNum = !Number.isNaN(na),
        bNum = !Number.isNaN(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a[0].localeCompare(b[0]);
    });
    const numericVotes = roundParticipants.reduce<number[]>((acc, p) => {
      const num = Number(p.vote);
      if (!Number.isNaN(num) && p.vote) {
        acc.push(num);
      }
      return acc;
    }, []);
    const avg = numericVotes.length > 0 ? calculateAverage(numericVotes) : null;
    const median =
      numericVotes.length > 0 ? calculateMedian(numericVotes) : null;

    return { entries, avg, median };
  }, [revealed, previousRound]);

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
            Round summary
          </span>
          <h3 className="text-2xl font-bold leading-tight tracking-tight mt-1">
            Results
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {revealed
              ? "Votes distribution"
              : previousRound
                ? "Previous results (re-estimating)"
                : "Reveal to see results"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button size="sm" disabled={!canReveal || revealed || isPaused}>
                Reveal
              </Button>
            }
            title="Reveal all votes?"
            description="This will show everyone's vote. This action cannot be undone."
            actionLabel="Reveal"
            onAction={onReveal}
          />
          {revealed && onReestimate && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="outline" disabled={isPaused}>
                  Re-estimate
                </Button>
              }
              title="Wanna re-estimate?"
              description="This will clear the current selection of the card."
              actionLabel="Continue"
              onAction={onReestimate}
            />
          )}
        </div>
      </div>

      <div className="pt-4 border-t">
        {!revealed ? (
          previousRound ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Previous round results
              </div>
              <ul className="space-y-2">
                <li className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground underline">
                    Vote
                  </span>
                  <span className="text-sm text-muted-foreground underline">
                    Count
                  </span>
                </li>
                {Array.from(
                  previousRound.participants
                    .reduce<Map<string, number>>((acc, p) => {
                      const v = p.vote ?? "—";
                      acc.set(v, (acc.get(v) ?? 0) + 1);
                      return acc;
                    }, new Map())
                    .entries(),
                ).map(([value, count]) => (
                  <li key={value} className="flex items-center justify-between">
                    <span className="font-mono text-lg">
                      {value === "☕" ? (
                        <span className="text-4xl leading-none">☕</span>
                      ) : (
                        value
                      )}
                    </span>
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No results yet.</div>
          )
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2">
              <li className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground underline">
                  Vote
                </span>
                <span className="text-sm text-muted-foreground underline">
                  Count
                </span>
              </li>
              {results?.entries.map(([value, count]) => (
                <li key={value} className="flex items-center justify-between">
                  <span className="font-mono text-lg">
                    {value === "☕" ? (
                      <span className="text-4xl leading-none">☕</span>
                    ) : (
                      value
                    )}
                  </span>
                  <span className="text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
            {(results?.avg || results?.median) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {results?.avg && (
                  <MetricCard title="Average" value={results.avg} />
                )}
                {results?.median && (
                  <MetricCard title="Median" value={results.median} />
                )}
              </div>
            )}
            <div className="pt-2 border-t">
              <ul className="mt-2 space-y-1">
                {participants.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="font-mono">
                      {p.vote === "☕" ? (
                        <span className="text-2xl leading-none">☕</span>
                      ) : (
                        (p.vote ?? "—")
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
