import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const CARDS = [
  "0",
  "0.5",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "20",
  "40",
  "?",
  "☕",
];

type Props = {
  selection: string | null;
  revealed: boolean;
  onSelect: (value: string | null) => void;
  vote: (value: string) => void;
  isPaused?: boolean;
  suspendVoting: () => void;
  resumeVoting: () => void;
};

export function VotingCards({
  selection,
  revealed,
  onSelect,
  vote,
  isPaused,
  suspendVoting,
  resumeVoting,
}: Props) {
  const handleVote = (value: string) => {
    if (isPaused) return;

    if (value === selection) {
      onSelect(null);
      vote("");
    } else {
      onSelect(value);
      vote(value);
    }
  };

  return (
    <div className={"space-y-4"}>
      <div className="flex flex-col gap-3 sm:flex-row xs:items-center">
        {isPaused ? (
          <Button
            variant="default"
            size="sm"
            onClick={resumeVoting}
            title="Resume voting"
          >
            <Play className="mr-2 h-4 w-4" />
            Resume voting
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={suspendVoting}
            title="Pause your voting (exclude from round)"
          >
            <Pause className="mr-2 h-4 w-4" />
            Pause voting
          </Button>
        )}
        {isPaused && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded sm:ml-2">
            {`You are paused and won’t be counted from ${selection ? "next" : "this"} round.`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-4">
        {CARDS.map((c) => (
          <Button
            key={c}
            variant={selection === c ? "default" : "outline"}
            onClick={() => handleVote(c)}
            disabled={revealed}
            className={`py-8 text-xl transition-all ${isPaused ? "cursor-not-allowed opacity-60" : ""} ${
              revealed &&
              (selection === c ? "ring-2 ring-primary" : "opacity-40")
            }
            `}
          >
            {c === "☕" ? (
              <span className="text-4xl leading-none">☕</span>
            ) : revealed ? (
              selection === c ? (
                c
              ) : (
                "—"
              )
            ) : (
              c
            )}
          </Button>
        ))}
      </div>

      {!revealed && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect(null);
              vote("");
            }}
            title="Clear your selection"
            disabled={!selection}
          >
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
}
