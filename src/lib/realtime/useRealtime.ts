import { useEffect, useState } from "react";
import {
  joinRoom,
  sendMessage,
  subscribeToMessages,
  updateLastJoinName,
} from "./wsClient";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
};

type Story = { title: string; link: string } | null;

type HistoryRound = {
  id: string;
  story: Story | null;
  participants: Participant[];
  revealedAt: number;
};

export function useRealtime(roomId: string, userName: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [autoReveal, setAutoReveal] = useState(false);
  const [timer, setTimer] = useState<{
    endTime: number | null;
    duration: number;
  } | null>(null);
  const [story, setStory] = useState<Story>(null);
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomId || !userName) {
      return;
    }

    joinRoom(roomId, userName);

    const unsubscribe = subscribeToMessages((message) => {
      const { type, data } = message as {
        type: string;
        data: Record<string, unknown>;
      };

      switch (type) {
        case "room-state":
          setIsConnected(true);
          setParticipants(data.participants as Participant[]);
          setRevealed(data.revealed as boolean);
          setAutoReveal((data.autoReveal as boolean) ?? false);
          setTimer(
            (data.timer as { endTime: number | null; duration: number }) ??
              null,
          );
          setStory((data.story as Story) ?? null);
          setHistory((data.history as HistoryRound[]) ?? []);
          break;

        case "auto-reveal-updated":
          setAutoReveal(data.autoReveal as boolean);
          break;

        case "timer-updated":
          setTimer(data.timer as { endTime: number | null; duration: number });
          break;

        case "participant-voted":
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === (data.id as string)
                ? { ...p, vote: data.hasVote ? "hidden" : null }
                : p,
            ),
          );
          break;

        case "revealed":
          setParticipants(data.participants as Participant[]);
          setRevealed(true);
          setHistory((data.history as HistoryRound[]) ?? []);
          break;

        case "room-reset":
          setParticipants(data.participants as Participant[]);
          setRevealed(false);
          setStory(null);
          setHistory([]);
          break;

        case "story-updated":
          setStory((data.story as Story) ?? null);
          break;

        default:
          console.warn("⚠️ Unknown message type:", type);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomId, userName]);

  const send = (type: string, data: Record<string, unknown>) => {
    sendMessage(type, data);
  };

  const vote = (value: string) => {
    send("vote", { roomId, vote: value });
  };

  const reveal = () => {
    send("reveal", { roomId });
  };

  const reestimate = () => {
    send("reestimate", { roomId });
  };

  const reset = () => {
    send("reset", { roomId });
  };

  const updateStory = (s: Story) => {
    send("update-story", { roomId, story: s });
  };

  const suspendVoting = () => {
    send("suspend-voting", { roomId });
  };

  const resumeVoting = () => {
    send("resume-voting", { roomId });
  };

  const updateName = (newName: string) => {
    send("update-name", { roomId, name: newName });
    updateLastJoinName(newName);
  };

  const toggleAutoReveal = (enabled: boolean) => {
    send("toggle-auto-reveal", { roomId, autoReveal: enabled });
  };

  const startTimer = (duration: number) => {
    send("start-timer", { roomId, duration });
  };

  const stopTimer = () => {
    send("stop-timer", { roomId });
  };

  return {
    participants,
    reestimate,
    revealed,
    autoReveal,
    timer,
    story,
    vote,
    reveal,
    history,
    reset,
    updateStory,
    suspendVoting,
    resumeVoting,
    isConnected,
    updateName,
    toggleAutoReveal,
    startTimer,
    stopTimer,
  };
}
