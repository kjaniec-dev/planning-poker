import type { Server as HTTPServer, IncomingMessage } from "node:http";
import { createServer } from "node:http";
import Redis from "ioredis";
import { WebSocket, WebSocketServer } from "ws";

let wss: WebSocketServer | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

function getAllowedOrigins(): string[] {
  const originsEnv = process.env.ALLOWED_ORIGINS;
  if (!originsEnv) {
    // Default to localhost for development
    return ["http://localhost:3000", "https://localhost:3000"];
  }

  return originsEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function verifyClient(info: {
  origin: string;
  req: IncomingMessage;
  secure: boolean;
}): boolean {
  const { origin } = info;

  // Allow connections without Origin header (e.g., native clients)
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  const isAllowed = allowedOrigins.includes(origin);

  if (!isAllowed) {
    console.log(`Rejected WebSocket connection from origin: ${origin}`);
  }

  return isAllowed;
}

type Participant = {
  id: string;
  name: string;
  vote: string | null;
  paused?: boolean;
  participantId?: string;
  connected: boolean;
  lastSeen: number;
  replicaId: string; // Track which replica owns this connection
};

export type RoomState = {
  id: string;
  participants: Map<string, Participant>;
  revealed: boolean;
  autoReveal: boolean;
  story: { title: string; link: string } | null;
  timer?: {
    endTime: number | null;
    duration: number;
  } | null;
  history: Array<{
    id: string;
    story: { title: string; link: string } | null;
    participants: Array<{ id: string; name: string; vote: string | null }>;
    revealedAt: number;
  }>;
};

type ExtendedWebSocket = WebSocket & {
  id: string;
  roomId?: string;
  isAlive: boolean;
};

type WSMessage = {
  type: string;
  data: unknown;
};

const rooms = new Map<string, RoomState>();
const clients = new Map<string, ExtendedWebSocket>();

// Generate unique replica ID from hostname or random value
const replicaId = process.env.HOSTNAME || generateId();

export function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      participants: new Map(),
      revealed: false,
      autoReveal: false,
      timer: null,
      story: null,
      history: [],
    });
  }
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found after creation`);
  }
  return room;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function sendToClient(ws: ExtendedWebSocket, type: string, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function broadcastToRoom(
  roomId: string,
  type: string,
  data: unknown,
  excludeId?: string,
) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.participants.forEach((participant) => {
    if (participant.id !== excludeId) {
      // Only send to participants connected to THIS replica
      if (participant.replicaId === replicaId) {
        const client = clients.get(participant.id);
        if (client) {
          sendToClient(client, type, data);
        }
      }
    }
  });
}

function setupRedisSubscription() {
  if (!redisSub) return;

  redisSub.on("message", (_channel: string, message: string) => {
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
  data: unknown,
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
  data: unknown,
  excludeId?: string,
) {
  broadcastToRoom(roomId, type, data, excludeId);

  if (process.env.REDIS_URL) {
    publishToRedis(roomId, type, data, excludeId).catch(console.error);
  }
}

function deleteRoomIfEmpty(roomId: string) {
  const room = rooms.get(roomId);
  if (room && room.participants.size === 0) {
    console.log(`🧹 Deleting empty room: ${roomId}`);
    rooms.delete(roomId);
  }
}

export function initWebSocketServer(httpServer: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({
    server: httpServer,
    path: "/api/ws",
    perMessageDeflate: false,
    verifyClient, // Add origin validation
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
    for (const ws of wss?.clients || []) {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        ws.terminate();
        continue;
      }
      extWs.isAlive = false;
      ws.ping();
    }
  }, 30000);

  // Cleanup stale participants every minute
  const cleanupInterval = setInterval(() => {
    cleanupStaleParticipants();
  }, 60000);

  wss.on("close", () => {
    clearInterval(interval);
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.id = generateId();
    extWs.isAlive = true;
    clients.set(extWs.id, extWs);

    console.log(`✅ Client connected: ${extWs.id} (replica: ${replicaId})`);

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

  console.log(`✓ WebSocket server initialized (Replica ID: ${replicaId})`);
  return wss;
}

function handleMessage(ws: ExtendedWebSocket, message: WSMessage) {
  const { type, data } = message;

  switch (type) {
    case "join-room":
      handleJoinRoom(ws, data as { roomId: string; name: string });
      break;
    case "vote":
      handleVote(ws, data as { roomId: string; vote: string });
      break;
    case "reveal":
      handleReveal(ws, data as { roomId: string });
      break;
    case "reestimate":
      handleReestimate(ws, data as { roomId: string });
      break;
    case "reset":
      handleReset(ws, data as { roomId: string });
      break;
    case "update-story":
      handleUpdateStory(ws, data as { roomId: string; story: unknown });
      break;
    case "suspend-voting":
      handleSuspendVoting(ws, data as { roomId: string });
      break;
    case "resume-voting":
      handleResumeVoting(ws, data as { roomId: string });
      break;
    case "update-name":
      handleUpdateName(ws, data as { roomId: string; name: string });
      break;
    case "toggle-auto-reveal":
      handleToggleAutoReveal(
        ws,
        data as { roomId: string; autoReveal: boolean },
      );
      break;
    case "start-timer":
      handleStartTimer(ws, data as { roomId: string; duration: number });
      break;
    case "stop-timer":
      handleStopTimer(ws, data as { roomId: string });
      break;
    default:
      console.warn("Unknown message type:", type);
  }
}

function handleJoinRoom(
  ws: ExtendedWebSocket,
  data: { roomId: string; name: string; participantId?: string },
) {
  const { roomId, name, participantId } = data;
  console.log(
    "📥 join-room: roomId=%s, name=%s, participantId=%s, clientId=%s",
    roomId,
    name,
    participantId,
    ws.id,
  );
  ws.roomId = roomId;

  const room = getOrCreateRoom(roomId);

  // First, try to match by participantId if provided
  let existingParticipant: Participant | null = null;
  let oldId: string | null = null;

  if (participantId) {
    for (const [id, participant] of room.participants.entries()) {
      if (participant.participantId === participantId) {
        existingParticipant = participant;
        oldId = id;
        break;
      }
    }
  }

  // If no participantId match, fall back to matching by name (backwards compatibility)
  if (!existingParticipant) {
    for (const [id, participant] of room.participants.entries()) {
      if (participant.name === name) {
        existingParticipant = participant;
        oldId = id;
        break;
      }
    }
  }

  // Check if this is a reconnection or a duplicate name from an active connection
  const oldClientStillConnected = oldId ? clients.has(oldId) : false;

  // Special case: if oldId == ws.id, this is the same connection updating their info
  // (e.g., after an update-name), so just update the participant in place
  if (existingParticipant && oldId === ws.id) {
    console.log(
      "🔄 Same connection updating info for %s (ID: %s)",
      name,
      ws.id,
    );
    existingParticipant.name = name;
    // Don't need to do anything else, participant already exists
  } else if (existingParticipant && oldId && !oldClientStillConnected) {
    // This is a legitimate reconnection - the old client is gone
    console.log(
      "🔄 Restoring participant data for %s (old ID: %s, new ID: %s)",
      name,
      oldId,
      ws.id,
    );
    // Remove old entry
    room.participants.delete(oldId);
    // Add with new ID but preserve vote, paused state, and participantId
    room.participants.set(ws.id, {
      id: ws.id,
      name,
      vote: existingParticipant.vote,
      paused: existingParticipant.paused,
      participantId: participantId || existingParticipant.participantId,
      connected: true,
      lastSeen: Date.now(),
      replicaId,
    });
  } else if (existingParticipant && oldClientStillConnected) {
    // Duplicate name from an active connection - generate unique name
    // Only check connected participants to avoid conflicts with disconnected users
    let uniqueName = name;
    let counter = 2;

    // Find a unique name by appending numbers
    while (
      Array.from(room.participants.values()).some(
        (p) => p.name === uniqueName && clients.has(p.id),
      )
    ) {
      uniqueName = `${name} ${counter}`;
      counter++;
    }

    console.log(
      "⚠️ Duplicate name detected. Renaming %s to %s for client %s",
      name,
      uniqueName,
      ws.id,
    );

    // Create new participant with unique name
    room.participants.set(ws.id, {
      id: ws.id,
      name: uniqueName,
      vote: null,
      participantId,
      connected: true,
      lastSeen: Date.now(),
      replicaId,
    });
  } else {
    // New participant - check for duplicate names from active connections
    let uniqueName = name;
    let counter = 2;

    // Find a unique name by appending numbers
    while (
      Array.from(room.participants.values()).some(
        (p) => p.name === uniqueName && clients.has(p.id),
      )
    ) {
      uniqueName = `${name} ${counter}`;
      counter++;
    }

    if (uniqueName !== name) {
      console.log(
        "⚠️ Duplicate name detected. Renaming %s to %s for client %s",
        name,
        uniqueName,
        ws.id,
      );
    }

    // Create new participant with unique name
    room.participants.set(ws.id, {
      id: ws.id,
      name: uniqueName,
      vote: null,
      participantId,
      connected: true,
      lastSeen: Date.now(),
      replicaId,
    });
  }

  const roomState = {
    participants: getParticipantsArray(room),
    revealed: room.revealed,
    autoReveal: room.autoReveal,
    timer: room.timer ?? null,
    story: room.story ?? null,
    history: room.history,
  };

  console.log("📤 Sending room-state to joining client", ws.id);
  sendToClient(ws, "room-state", roomState);

  console.log("📤 Broadcasting room-state to other clients in", roomId);
  emitToRoom(roomId, "room-state", roomState, ws.id);
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
    // Prevent clearing vote if paused and cards are already revealed
    // This guards against race conditions where pause action triggers vote clearing
    if (!vote && participant.paused && room.revealed && participant.vote) {
      console.warn(
        "⚠️ Prevented vote clearing for paused participant after reveal:",
        ws.id,
      );
      return;
    }

    participant.vote = vote;
    emitToRoom(roomId, "participant-voted", { id: ws.id, hasVote: !!vote });

    if (room.autoReveal && !room.revealed && vote) {
      const activeParticipants = Array.from(room.participants.values()).filter(
        (p) => !p.paused && p.connected,
      );
      const allVoted = activeParticipants.every((p) => p.vote);
      if (allVoted && activeParticipants.length > 0) {
        console.log("🚀 Auto-revealing room:", roomId);
        handleReveal(ws, { roomId });
      }
    }
  }
}

function handleReveal(_ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = true;

  const roundId = `${Date.now()}`;
  const round = {
    id: roundId,
    story: room.story ? { ...room.story } : null,
    participants: Array.from(room.participants.values()).map((p) => ({ ...p })),
    revealedAt: Date.now(),
  };

  room.history.push(round);

  emitToRoom(roomId, "revealed", {
    participants: getParticipantsArray(room),
    history: room.history,
  });
}

function handleReestimate(_ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = false;

  // Clear votes and remove disconnected participants that belong to this replica
  for (const [id, p] of room.participants.entries()) {
    p.vote = null;

    // Only remove disconnected participants that belong to THIS replica
    if (p.replicaId === replicaId && !clients.has(id)) {
      console.log(
        `🧹 Removing disconnected participant ${id} during re-estimate`,
      );
      room.participants.delete(id);
    }
  }

  // Delete room if empty
  deleteRoomIfEmpty(roomId);

  emitToRoom(roomId, "room-state", {
    participants: getParticipantsArray(room),
    revealed: room.revealed,
    autoReveal: room.autoReveal,
    timer: room.timer ?? null,
    story: room.story ?? null,
    history: room.history,
  });
}

function handleReset(_ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.revealed = false;

  // Clear votes and remove disconnected participants that belong to this replica
  for (const [id, p] of room.participants.entries()) {
    p.vote = null;

    // Only remove disconnected participants that belong to THIS replica
    if (p.replicaId === replicaId && !clients.has(id)) {
      console.log(`🧹 Removing disconnected participant ${id} during reset`);
      room.participants.delete(id);
    }
  }

  room.history = [];
  room.story = null;

  // Delete room if empty
  deleteRoomIfEmpty(roomId);

  emitToRoom(roomId, "room-reset", {
    participants: getParticipantsArray(room),
    story: room.story ?? null,
    history: room.history,
  });
}

function handleUpdateStory(
  _ws: ExtendedWebSocket,
  data: { roomId: string; story: unknown },
) {
  const { roomId, story } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.story = (story as { title: string; link: string } | null) ?? null;
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
        participants: getParticipantsArray(room),
        revealed: room.revealed,
        autoReveal: room.autoReveal,
        timer: room.timer ?? null,
        story: room.story ?? null,
        history: room.history,
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
        participants: getParticipantsArray(room),
        revealed: room.revealed,
        autoReveal: room.autoReveal,
        timer: room.timer ?? null,
        story: room.story ?? null,
        history: room.history,
      });
    }
  }
}

function handleDisconnect(ws: ExtendedWebSocket) {
  console.log("❌ Client disconnected:", ws.id);
  clients.delete(ws.id);

  if (ws.roomId) {
    const room = rooms.get(ws.roomId);
    if (room) {
      const participant = room.participants.get(ws.id);
      if (participant && participant.replicaId === replicaId) {
        console.log(
          `🔄 Participant ${ws.id} disconnected from room ${ws.roomId}`,
        );
        participant.connected = false;
        participant.lastSeen = Date.now();

        // If they haven't voted and aren't paused, remove them immediately
        if (!participant.vote && !participant.paused) {
          console.log(
            `🧹 Removing inactive participant ${ws.id} from room ${ws.roomId}`,
          );
          room.participants.delete(ws.id);
        }

        // Delete room if empty
        deleteRoomIfEmpty(ws.roomId);

        // Broadcast the updated state
        const roomState = {
          participants: getParticipantsArray(room),
          revealed: room.revealed,
          autoReveal: room.autoReveal,
          timer: room.timer ?? null,
          story: room.story ?? null,
          history: room.history,
        };
        emitToRoom(ws.roomId, "room-state", roomState);
      }
    }
  }
}

function cleanupStaleParticipants() {
  const now = Date.now();
  const staleTimeout = 5 * 60 * 1000; // 5 minutes

  rooms.forEach((room, roomId) => {
    let removed = false;

    for (const [id, participant] of room.participants.entries()) {
      // Only manage participants that belong to THIS replica
      if (participant.replicaId !== replicaId) {
        continue;
      }

      // Check if connected locally (should be since this is our replica)
      const isConnectedLocally = clients.has(id);

      if (isConnectedLocally) {
        participant.connected = true;
        participant.lastSeen = now;
        continue;
      }

      // Not connected locally and belongs to this replica
      if (participant.connected) {
        participant.connected = false;
        participant.lastSeen = now;
      }

      // If disconnected for too long, remove them
      if (
        !participant.connected &&
        participant.lastSeen > 0 &&
        now - participant.lastSeen > staleTimeout
      ) {
        console.log(
          `🧹 Removing stale participant ${id} from room ${roomId} (offline for ${now - participant.lastSeen}ms)`,
        );
        room.participants.delete(id);
        removed = true;
      }
    }

    if (removed) {
      // Delete room if empty
      deleteRoomIfEmpty(roomId);

      const roomState = {
        participants: getParticipantsArray(room),
        revealed: room.revealed,
        autoReveal: room.autoReveal,
        timer: room.timer ?? null,
        story: room.story ?? null,
        history: room.history,
      };
      emitToRoom(roomId, "room-state", roomState);
    }
  });
}

function getParticipantsArray(room: RoomState): Participant[] {
  const participants: Participant[] = [];

  for (const participant of room.participants.values()) {
    // Create a copy to avoid modifying the original
    const participantCopy = { ...participant };

    // Only update connection status for participants owned by THIS replica
    if (participantCopy.replicaId === replicaId) {
      const isConnectedLocally = clients.has(participantCopy.id);
      participantCopy.connected = isConnectedLocally;
    }
    // For participants from other replicas, trust the stored connected status

    participants.push(participantCopy);
  }

  return participants;
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

  // Check if the new name is already taken by another ACTIVE participant
  // Only check connected participants to avoid conflicts with disconnected users
  let finalName = name;
  let counter = 2;

  while (
    Array.from(room.participants.values()).some(
      (p) => p.id !== ws.id && p.name === finalName && clients.has(p.id),
    )
  ) {
    finalName = `${name} ${counter}`;
    counter++;
  }

  if (finalName !== name) {
    console.log(
      "⚠️ Name '%s' already taken. Using '%s' instead for client %s",
      name,
      finalName,
      ws.id,
    );
  }

  console.log(
    "✏️ Updating participant name from '%s' to '%s'",
    participant.name,
    finalName,
  );
  participant.name = finalName;

  const roomState = {
    participants: getParticipantsArray(room),
    revealed: room.revealed,
    autoReveal: room.autoReveal,
    timer: room.timer ?? null,
    story: room.story ?? null,
    history: room.history,
  };

  console.log("📤 Broadcasting updated room-state to room %s", roomId);
  emitToRoom(roomId, "room-state", roomState);
}

function handleToggleAutoReveal(
  _ws: ExtendedWebSocket,
  data: { roomId: string; autoReveal: boolean },
) {
  const { roomId, autoReveal } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.autoReveal = autoReveal;
  console.log("📥 toggle-auto-reveal received:", { roomId, autoReveal });
  emitToRoom(roomId, "auto-reveal-updated", { autoReveal });
}

function handleStartTimer(
  _ws: ExtendedWebSocket,
  data: { roomId: string; duration: number },
) {
  const { roomId, duration } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  const endTime = Date.now() + duration * 1000;
  room.timer = { endTime, duration };
  console.log("📥 start-timer received:", { roomId, duration, endTime });
  emitToRoom(roomId, "timer-updated", { timer: room.timer });
}

function handleStopTimer(_ws: ExtendedWebSocket, data: { roomId: string }) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;

  room.timer = null;
  console.log("📥 stop-timer received:", { roomId });
  emitToRoom(roomId, "timer-updated", { timer: null });
}

export async function shutdown(): Promise<void> {
  try {
    if (wss) {
      console.log("Closing WebSocket connections...");
      for (const client of wss.clients) {
        client.close();
      }
      await new Promise<void>((resolve) => {
        wss?.close(() => resolve());
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
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server is running");
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
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
