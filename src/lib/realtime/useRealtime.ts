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

type LastRound = {
  id: string;
  participants: Participant[];
};

export function useRealtime(roomId: string, userName: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [story, setStory] = useState<Story>(null);
  const [lastRound, setLastRound] = useState<LastRound | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomId || !userName) {
      console.error("❌ Missing roomId or userName:", { roomId, userName });
      return;
    }

    joinRoom(roomId, userName);

    const unsubscribe = subscribeToMessages((message) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { type, data } = message as { type: string; data: any };

      switch (type) {
        case "room-state":
          setIsConnected(true);
          setParticipants(data.participants);
          setRevealed(data.revealed);
          setStory(data.story ?? null);
          setLastRound(data.lastRound ?? null);
          break;

        case "participant-voted":
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === data.id
                ? { ...p, vote: data.hasVote ? "hidden" : null }
                : p,
            ),
          );
          break;

        case "revealed":
          setParticipants(data.participants);
          setRevealed(true);
          setLastRound(data.lastRound ?? null);
          break;

        case "room-reset":
          setParticipants(data.participants);
          setRevealed(false);
          setStory(null);
          setLastRound(null);
          break;

        case "story-updated":
          setStory(data.story ?? null);
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

  return {
    participants,
    reestimate,
    revealed,
    story,
    vote,
    reveal,
    lastRound,
    reset,
    updateStory,
    suspendVoting,
    resumeVoting,
    isConnected,
    updateName,
  };
}
