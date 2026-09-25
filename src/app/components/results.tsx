"use client";

import { BarChart, MetricCard, SectionHeader } from "@kjaniec-dev/ui";
import { useMemo } from "react";
import { ConfirmDialog } from "@/app/components/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { calculateAverage, calculateMedian, getInitials } from "@/lib/utils";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
};

type RoundParticipant = { id: string; name: string; vote: string | null };

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
    participants: RoundParticipant[];
  } | null;
};

type RoundSummary = {
  distribution: Array<{ vote: string; count: number }>;
  avg: number | null;
  median: number | null;
  agreement: number | null;
};

const NO_VOTE = "—";

function compareVotes(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

export function summarizeRound(participants: RoundParticipant[]): RoundSummary {
  const counts = new Map<string, number>();
  const numericVotes: number[] = [];
  let castVotes = 0;

  // Participants without a vote (spectators, late joiners) are left out of
  // the chart and stats.
  for (const p of participants) {
    if (!p.vote) continue;
    counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
    castVotes++;
    const num = Number(p.vote);
    if (!Number.isNaN(num)) numericVotes.push(num);
  }

  const distribution = Array.from(counts.entries())
    .sort((a, b) => compareVotes(a[0], b[0]))
    .map(([vote, count]) => ({ vote, count }));

  // Share of cast votes that landed on the most popular card.
  const topCount = Math.max(0, ...distribution.map((d) => d.count));
  const agreement =
    castVotes > 0 ? Math.round((topCount / castVotes) * 100) : null;

  return {
    distribution,
    avg: calculateAverage(numericVotes),
    median: calculateMedian(numericVotes),
    agreement,
  };
}

function RoundBreakdown({ summary }: { summary: RoundSummary }) {
  const maxCount = Math.max(1, ...summary.distribution.map((d) => d.count));

  return (
    <div className="space-y-4">
      <BarChart
        data={summary.distribution}
        index="vote"
        series={[{ key: "count", label: "Votes", color: "chart1" }]}
        height={220}
        barMaxWidth={56}
        // Counts are whole numbers: keep the nice-scale step >= 1 and hide
        // fractional ticks that appear when only one person voted.
        yTicksCount={Math.min(maxCount, 5)}
        showLegend={false}
        valueFormatter={(v) => (Number.isInteger(v) ? String(v) : "")}
        emptyMessage="No votes to display"
        ariaLabel="Vote distribution"
        caption="Number of participants per card"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard title="Average" value={summary.avg ?? NO_VOTE} />
        <MetricCard title="Median" value={summary.median ?? NO_VOTE} />
        <MetricCard
          className="col-span-2 sm:col-span-1"
          title="Agreement"
          value={summary.agreement !== null ? `${summary.agreement}%` : NO_VOTE}
          description="Votes on the most picked card"
        />
      </div>
    </div>
  );
}

export function Results({
  participants,
  revealed,
  onReveal,
  canReveal,
  isPaused = false,
  onReestimate,
  previousRound,
}: Props) {
  const summary = useMemo(
    () => (previousRound ? summarizeRound(previousRound.participants) : null),
    [previousRound],
  );

  return (
    <div className="space-y-6 py-4">
      <SectionHeader
        kicker="Round summary"
        title="Results"
        headingLevel="h3"
        description={
          revealed
            ? "Votes distribution"
            : previousRound
              ? "Previous results (re-estimating)"
              : "Reveal to see results"
        }
        actions={
          <>
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
          </>
        }
      />

      <div className="border-t pt-4">
        {!summary && !revealed ? (
          <div className="text-sm text-muted-foreground">No results yet.</div>
        ) : (
          <div className="space-y-6">
            {!revealed && (
              <div className="text-sm text-muted-foreground">
                Previous round results
              </div>
            )}
            {summary && <RoundBreakdown summary={summary} />}
            {revealed && (
              <ul className="space-y-2 border-t pt-4">
                {participants.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar size="sm" tone="muted">
                        {getInitials(p.name)}
                      </Avatar>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <Badge variant={p.vote ? "primary" : "neutral"}>
                      {p.vote ?? NO_VOTE}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
