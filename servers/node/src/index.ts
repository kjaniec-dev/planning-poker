import type { Server as HTTPServer } from "http";
import { createServer } from "http";
import Redis from "ioredis";
import { WebSocket, WebSocketServer } from "ws";

let wss: WebSocketServer | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

export type RoomState = {
  id: string;
  participants: Map<
    string,
    { id: string; name: string; vote: string | null; paused?: boolean }
  >;
  revealed: boolean;
  lastRound?: {
    id: string;
    participants: Array<{ id: string; name: string; vote: string | null }>;
  } | null;
  story?: { title: string; link: string } | null;
};

type ExtendedWebSocket = WebSocket & {
  id: string;
  roomId?: string;
  isAlive: boolean;
};

type WSMessage = {
  type: string;
  data: any;
};

const rooms = new Map<string, RoomState>();
const clients = new Map<string, ExtendedWebSocket>();

export function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      participants: new Map(),
      revealed: false,
      story: null,
      lastRound: null,
    });
  }
  return rooms.get(roomId)!;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function sendToClient(ws: ExtendedWebSocket, type: string, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function broadcastToRoom(
  roomId: string,
  type: string,
  data: any,
  excludeId?: string,
) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.participants.forEach((participant) => {
    if (participant.id !== excludeId) {
      const client = clients.get(participant.id);
      if (client) {
        sendToClient(client, type, data);
      }
    }
  });
}

function setupRedisSubscription() {
  if (!redisSub) return;

  redisSub.on("message", (channel: string, message: string) => {
    try {
      const { type, roomId, data, excludeId } = JSON.parse(message);
      broadcastToRoom(roomId, type, data, excludeId);
    } catch (err) {
      console.error("Redis message parse error:", err);
    }
  });

  redisSub.subscribe("ws-broadcast", (err) => {
    if (err) {
      console.error("Redis subscribe error:", err);
    } else {
      console.log("✓ Subscribed to ws-broadcast channel");
    }
  });
}

async function publishToRedis(
  roomId: string,
  type: string,
  data: any,
  excludeId?: string,
) {
  if (redisPub) {
    await redisPub.publish(
      "ws-broadcast",
      JSON.stringify({ type, roomId, data, excludeId }),
    );
  }
}

function emitToRoom(
  roomId: string,
  type: string,
  data: any,
  excludeId?: string,
) {
  broadcastToRoom(roomId, type, data, excludeId);

  if (process.env.REDIS_URL) {
    publishToRedis(roomId, type, data, excludeId).catch(console.error);
  }
}

export function initWebSocketServer(httpServer: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({
    server: httpServer,
    path: "/api/ws",
    perMessageDeflate: false,
  });

  if (process.env.REDIS_URL) {
    redisPub = new Redis(process.env.REDIS_URL);
    redisSub = new Redis(process.env.REDIS_URL);

    redisPub.on("error", (err) => console.error("Redis pub error:", err));
    redisSub.on("error", (err) => console.error("Redis sub error:", err));

    redisPub.on("connect", () => console.log("✓ Redis pub connected"));
    redisSub.on("connect", () => {
      console.log("✓ Redis sub connected");
      setupRedisSubscription();
    });
  }

  const interval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        return ws.terminate();
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.id = generateId();
    extWs.isAlive = true;
    clients.set(extWs.id, extWs);

    console.log("✅ Client connected:", extWs.id);

    ws.on("pong", () => {
      extWs.isAlive = true;
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        console.log("📥 Message received from", extWs.id, ":", message.type);
        handleMessage(extWs, message);
      } catch (err) {
        console.error("Message parse error:", err);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(
        "🔌 Client disconnected:",
        extWs.id,
        "code:",
        code,
        "reason:",
        reason,
      );
      handleDisconnect(extWs);
    });

    ws.on("error", (err) => {
      console.error("❌ WebSocket error for", extWs.id, ":", err);
    });
  });

  console.log("✓ WebSocket server initialized");
  return wss;
}

function handleMessage(ws: ExtendedWebSocket, message: WSMessage) {
  const { type, data } = message;

  switch (type) {
    case "join-room":
      handleJoinRoom(ws, data);
      break;
    case "vote":
      handleVote(ws, data);
      break;
    case "reveal":
      handleReveal(ws, data);
      break;
    case "reestimate":
      handleReestimate(ws, data);
      break;
    case "reset":
      handleReset(ws, data);
      break;
    case "update-story":
      handleUpdateStory(ws, data);
      break;
    case "suspend-voting":
      handleSuspendVoting(ws, data);
      break;
    case "resume-voting":
      handleResumeVoting(ws, data);
      break;
    case "update-name":
      handleUpdateName(ws, data);
      break;
    default:
      console.warn("Unknown message type:", type);
  }
}

function handleJoinRoom(
  ws: ExtendedWebSocket,
  data: { roomId: string; name: string },
) {
  const { roomId, name } = data;
  console.log(
    "📥 join-room: roomId=%s, name=%s, clientId=%s",
    roomId,
    name,
    ws.id,
  );
  ws.roomId = roomId;

  const room = getOrCreateRoom(roomId);
  room.participants.set(ws.id, { id: ws.id, name, vote: null });

  const roomState = {
    participants: Array.from(room.participants.values()),
    revealed: room.revealed,
    story: room.story ?? null,
    lastRound: room.lastRound ?? null,
  };

  console.log("📤 Sending room-state to joining client", ws.id);
  sendToClient(ws, "room-state", roomState);

  console.log("📤 Broadcasting room-state to other clients in", roomId);
  broadcastToRoom(roomId, "room-state", roomState, ws.id);

  if (process.env.REDIS_URL) {
    publishToRedis(roomId, "room-state", roomState, ws.id).catch(console.error);
  }
  console.log("✅ join-room completed for", ws.id);
}

function handleVote(
  ws: ExtendedWebSocket,
  data: { roomId: string; vote: string },
) {
  const { roomId, vote } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  const participant = room.participants.get(ws.id);
  if (participant) {
    participant.vote = vote;
    emitToRoom(roomId, "participant-voted", { id: ws.id, hasVote: !!vote });
  }
}

function handleReveal(ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = true;

  const roundId = `${Date.now()}`;
  room.lastRound = {
    id: roundId,
    participants: Array.from(room.participants.values()).map((p) => ({ ...p })),
  };

  emitToRoom(roomId, "revealed", {
    participants: Array.from(room.participants.values()),
    lastRound: room.lastRound,
  });
}

function handleReestimate(ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = false;
  room.participants.forEach((p) => {
    p.vote = null;
  });

  emitToRoom(roomId, "room-state", {
    participants: Array.from(room.participants.values()),
    revealed: room.revealed,
    story: room.story ?? null,
    lastRound: room.lastRound ?? null,
  });
}

function handleReset(ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = false;
  room.participants.forEach((p) => (p.vote = null));

  room.lastRound = null;
  room.story = null;

  emitToRoom(roomId, "room-reset", {
    participants: Array.from(room.participants.values()),
    story: room.story ?? null,
  });
}

function handleUpdateStory(
  ws: ExtendedWebSocket,
  data: { roomId: string; story: any },
) {
  const { roomId, story } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.story = story ?? null;
  console.log("📥 update-story received:", { roomId, story });
  emitToRoom(roomId, "story-updated", { story: room.story });
}

function handleSuspendVoting(ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (room) {
    const participant = room.participants.get(ws.id);
    if (participant) {
      participant.paused = true;
      emitToRoom(roomId, "room-state", {
        participants: Array.from(room.participants.values()),
        revealed: room.revealed,
        story: room.story ?? null,
        lastRound: room.lastRound ?? null,
      });
    }
  }
}

function handleResumeVoting(ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (room) {
    const participant = room.participants.get(ws.id);
    if (participant) {
      participant.paused = false;
      emitToRoom(roomId, "room-state", {
        participants: Array.from(room.participants.values()),
        revealed: room.revealed,
        story: room.story ?? null,
        lastRound: room.lastRound ?? null,
      });
    }
  }
}

function handleDisconnect(ws: ExtendedWebSocket) {
  console.log("Client disconnected:", ws.id);
  clients.delete(ws.id);

  rooms.forEach((room, roomId) => {
    if (room.participants.has(ws.id)) {
      room.participants.delete(ws.id);
      emitToRoom(roomId, "room-state", {
        participants: Array.from(room.participants.values()),
        revealed: room.revealed,
        story: room.story ?? null,
      });
    }
  });
}

function handleUpdateName(
  ws: ExtendedWebSocket,
  data: { roomId: string; name: string },
) {
  const { roomId, name } = data;

  console.log(
    "📥 update-name: roomId=%s, newName=%s, clientId=%s",
    roomId,
    name,
    ws.id,
  );

  const room = rooms.get(roomId);
  if (!room) {
    console.warn("❌ Room not found:", roomId);
    return;
  }

  const participant = room.participants.get(ws.id);
  if (!participant) {
    console.warn("❌ Participant not found for WebSocket ID:", ws.id);
    return;
  }

  console.log(
    "✏️ Updating participant name from '%s' to '%s'",
    participant.name,
    name,
  );
  participant.name = name;

  const roomState = {
    participants: Array.from(room.participants.values()),
    revealed: room.revealed,
    story: room.story ?? null,
    lastRound: room.lastRound ?? null,
  };

  console.log("📤 Broadcasting updated room-state to room %s", roomId);
  emitToRoom(roomId, "room-state", roomState);
}

export async function shutdown(): Promise<void> {
  try {
    if (wss) {
      console.log("Closing WebSocket connections...");
      wss.clients.forEach((client) => client.close());
      await new Promise<void>((resolve) => {
        wss!.close(() => resolve());
      });
      wss = null;
    }

    if (redisPub) {
      console.log("Closing Redis pub client...");
      await redisPub.quit();
      redisPub = null;
    }

    if (redisSub) {
      console.log("Closing Redis sub client...");
      await redisSub.quit();
      redisSub = null;
    }

    rooms.clear();
    clients.clear();
    console.log("✓ WebSocket graceful shutdown complete");
  } catch (err) {
    console.error("Error during WebSocket shutdown:", err);
  }
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || "3001", 10);
  const httpServer = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server is running");
  });

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${port} is already in use. Exiting...`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });

  initWebSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`✓ WebSocket server listening on :${port}`);
  });

  async function gracefulShutdown(signal: string) {
    console.log(`\n✓ Received ${signal}, starting graceful shutdown...`);
    try {
      await shutdown();
      httpServer.close(() => {
        console.log("✓ HTTP server closed");
        process.exit(0);
      });

      setTimeout(() => {
        console.error("⚠ Shutdown timeout, forcing exit");
        process.exit(0);
      }, 2000);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // nodemon sends SIGUSR2
}
