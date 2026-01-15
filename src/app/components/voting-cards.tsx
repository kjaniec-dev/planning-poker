import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [lastVote, setLastVote] = useState<string | null>(selection);

  useEffect(() => {
    if (selection !== lastVote) {
      setLastVote(selection);
    }
  }, [selection, lastVote]);

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
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
        {CARDS.map((c) => {
          const isSelected = selection === c;
          return (
            <motion.div
              key={c}
              layout
              initial={false}
              animate={
                isSelected && !revealed
                  ? {
                      scale: [1, 1.05, 1],
                      rotate: [0, -2, 2, -2, 2, 0],
                    }
                  : { scale: 1, rotate: 0 }
              }
              transition={{
                rotate: { duration: 0.4, ease: "easeInOut" },
                scale: { duration: 0.2 },
              }}
            >
              <Button
                variant={isSelected ? "default" : "outline"}
                onClick={() => handleVote(c)}
                disabled={revealed}
                className={`w-full h-24 text-xl relative preserve-3d transition-all duration-300 shadow-sm hover:shadow-md ${
                  isPaused ? "cursor-not-allowed opacity-60" : ""
                } ${
                  revealed && isSelected
                    ? "ring-2 ring-primary ring-offset-2"
                    : ""
                } ${revealed && !isSelected ? "opacity-40" : ""}
                rounded-xl border-2
                ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-lg scale-105 z-10"
                    : "bg-gradient-to-br from-card to-muted/50 border-border hover:border-primary/50"
                }
                `}
              >
                <div className="relative w-full h-full flex items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {revealed ? (
                      <motion.span
                        key="revealed"
                        initial={{ rotateY: 90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: -90, opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className={`absolute inset-0 flex items-center justify-center font-bold ${
                          isSelected ? "text-primary-foreground" : ""
                        }`}
                      >
                        {isSelected ? c : "—"}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="hidden"
                        initial={{ rotateY: -90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: 90, opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className={`absolute inset-0 flex items-center justify-center font-bold ${
                          isSelected ? "text-primary-foreground" : ""
                        }`}
                      >
                        {c === "☕" ? (
                          <span className="text-4xl leading-none">☕</span>
                        ) : (
                          c
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Button>
            </motion.div>
          );
        })}
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
