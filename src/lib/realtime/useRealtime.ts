import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
};

type Story = { title: string; link: string } | null;

export function useRealtime(roomId: string, userName: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [story, setStory] = useState<Story>(null);
  const [lastRound, setLastRound] = useState<null | {
    id: string;
    participants: any[];
  }>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
      console.log("🔍 useRealtime effect triggered with:", { roomId, userName });

      // Check if parameters are valid
      if (!roomId || !userName) {
          console.error("❌ Missing roomId or userName:", { roomId, userName });
          return;
      }

    const socketUrl = process.env.NEXT_PUBLIC_REALTIME_URL || "";
      const socket = io(socketUrl, {
          path: "/api/socketio",
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
      });
    socketRef.current = socket;

    socket.on("connect", () => {
        console.log("✅ Socket connected with ID:", socket.id);
        console.log("📤 About to emit join-room:", { roomId, name: userName });
      socket.emit("join-room", { roomId, name: userName });
    });

      socket.on("connect_error", (error) => {
          console.error("❌ Connection error:", error);
      });

      socket.on("connect_failed", (reason) => {
          console.error("❌ Connection failed:", reason);
      });

    socket.on(
      "room-state",
      ({ participants: p, revealed: r, story: s, lastRound: lr }) => {
        setParticipants(p);
        setRevealed(r);
        setStory(s ?? null);
        setLastRound(lr ?? null);
      },
    );

    socket.on("participant-voted", ({ id, hasVote }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, vote: hasVote ? "hidden" : null } : p,
        ),
      );
    });

    socket.on("revealed", ({ participants: p, lastRound: lr }) => {
      setParticipants(p);
      setRevealed(true);
      setLastRound(lr ?? null);
    });

    socket.on("room-reset", ({ participants: p, story: s }) => {
      setParticipants(p);
      setRevealed(false);
      setStory(null);
      setLastRound(null);
    });

    socket.on("story-updated", ({ story: s }) => {
      setStory(s ?? null);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, userName]);

  const vote = (value: string) => {
    socketRef.current?.emit("vote", { roomId, vote: value });
  };

  const reveal = () => {
    socketRef.current?.emit("reveal", { roomId });
  };

  const reestimate = () => {
    socketRef.current?.emit("reestimate", { roomId });
  };

  const reset = () => {
    socketRef.current?.emit("reset", { roomId });
  };

  const updateStory = (s: Story) => {
    socketRef.current?.emit("update-story", { roomId, story: s });
  };

  const suspendVoting = () => {
    socketRef.current?.emit("suspend-voting", { roomId });
  };

  const resumeVoting = () => {
    socketRef.current?.emit("resume-voting", { roomId });
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
  };
}
