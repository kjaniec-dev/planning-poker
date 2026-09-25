"use client";

import { DataTable, type DataTableColumn, Sparkline } from "@kjaniec-dev/ui";
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

function roundAverage(round: HistoryRound): number | null {
  const numericVotes = round.participants.reduce<number[]>((acc, p) => {
    const num = Number(p.vote);
    if (!Number.isNaN(num) && p.vote) {
      acc.push(num);
    }
    return acc;
  }, []);
  return calculateAverage(numericVotes);
}

export function SessionHistory({ history }: Props) {
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.revealedAt - a.revealedAt);
  }, [history]);

  // Chronological averages for the trend line (rounds without numeric votes are skipped).
  const averageTrend = useMemo(
    () =>
      [...history]
        .sort((a, b) => a.revealedAt - b.revealedAt)
        .map(roundAverage)
        .filter((avg): avg is number => avg !== null),
    [history],
  );

  const columns = useMemo<DataTableColumn<HistoryRound>[]>(
    () => [
      {
        header: "Story / Round",
        accessor: (round) => (
          <div className="space-y-1">
            <div className="font-medium text-sm break-words">
              {round.story?.title || "Untitled Round"}
            </div>
            {round.story?.link && (
              <a
                href={round.story.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline block truncate max-w-[240px]"
              >
                {round.story.link}
              </a>
            )}
          </div>
        ),
      },
      {
        header: "Average",
        accessor: (round) => {
          const avg = roundAverage(round);
          return avg !== null ? (
            <Badge variant="primary">Avg: {avg}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        header: "Votes",
        accessor: (round) => (
          <div className="flex flex-wrap gap-1">
            {round.participants.map((p) => (
              <div
                key={p.id}
                className="text-[10px] bg-subtle px-1.5 py-0.5 rounded flex items-center gap-1 border border-border/40"
                title={`${p.name}: ${p.vote || "No vote"}`}
              >
                <span className="max-w-[60px] truncate">{p.name}</span>
                <span className="font-bold border-l pl-1">
                  {p.vote === "☕" ? "☕" : p.vote || "—"}
                </span>
              </div>
            ))}
          </div>
        ),
      },
      {
        header: "Time",
        accessor: (round) => (
          <span className="text-xs text-muted-foreground">
            {new Date(round.revealedAt).toLocaleTimeString()}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 py-2">
      {averageTrend.length >= 2 && (
        <div className="flex items-center gap-4 rounded-kj-lg border bg-subtle px-4 py-3">
          <div className="shrink-0">
            <div className="text-xs font-medium text-muted-foreground">
              Average trend
            </div>
            <div className="font-mono text-lg font-semibold">
              {averageTrend[averageTrend.length - 1]}
            </div>
          </div>
          <Sparkline
            data={averageTrend}
            variant="area"
            color="chart1"
            height={40}
            ariaLabel={`Average estimate across ${averageTrend.length} rounds`}
            className="min-w-0 flex-1"
          />
        </div>
      )}
      <DataTable
        columns={columns}
        data={sortedHistory}
        emptyTitle="No session history"
        emptyDescription="No rounds have been revealed in this session yet."
      />
    </div>
  );
}
