"use client";

import { Play, Square, Timer as TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TimerProps {
  timer: {
    endTime: number | null;
    duration: number;
  } | null;
  onStart: (duration: number) => void;
  onStop: () => void;
}

export function Timer({ timer, onStart, onStop }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!timer || !timer.endTime) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((timer.endTime! - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        // We don't call onStop here because it should be handled by the server or naturally end
        // But we want to stop the interval
        return false;
      }
      return true;
    };

    updateTimer();
    const interval = setInterval(() => {
      if (!updateTimer()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const timerDurations = [
    { label: "1 min", value: 60 },
    { label: "2 min", value: 120 },
    { label: "3 min", value: 180 },
    { label: "5 min", value: 300 },
    { label: "10 min", value: 600 },
  ];

  return (
    <div className="flex items-center gap-2">
      {timer && timeLeft !== null ? (
        <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md border">
          <TimerIcon className={`h-4 w-4 ${timeLeft < 10 ? "text-destructive animate-pulse" : ""}`} />
          <span className={`font-mono font-medium min-w-[3ch] text-center ${timeLeft < 10 ? "text-destructive" : ""}`}>
            {formatTime(timeLeft)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1 hover:bg-destructive/10 hover:text-destructive"
            onClick={onStop}
            title="Stop Timer"
          >
            <Square className="h-3 w-3 fill-current" />
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Start Timer</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {timerDurations.map((d) => (
              <DropdownMenuItem key={d.value} onClick={() => onStart(d.value)}>
                {d.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
