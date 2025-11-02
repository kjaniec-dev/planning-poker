import { createAdapter } from "@socket.io/redis-adapter";
import type { Server as HTTPServer } from "http";
import Redis from "ioredis";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";

let io: SocketIOServer | null = null;
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
    story?: { title: string; description: string } | null;
};

const rooms = new Map<string, RoomState>();

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

export function initSocketIO(httpServer: HTTPServer) {
    if (io) return io;

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.NEXT_PUBLIC_APP_URL || "*",
            methods: ["GET", "POST"],
        },
        path: "/api/socketio",
    });

    // Redis adapter for multi-instance (K8s)
    if (process.env.REDIS_URL) {
        redisPub = new Redis(process.env.REDIS_URL);
        redisSub = redisPub.duplicate();

        Promise.all([redisPub.connect(), redisSub.connect()]).then(() => {
            io!.adapter(createAdapter(redisPub!, redisSub!));
            console.log("✓ Socket.IO Redis adapter connected");
        });
    }

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.on("join-room", ({ roomId, name }) => {
            socket.join(roomId);
            const room = getOrCreateRoom(roomId);

            room.participants.set(socket.id, { id: socket.id, name, vote: null });

            io!.to(roomId).emit("room-state", {
                participants: Array.from(room.participants.values()),
                revealed: room.revealed,
                story: room.story ?? null,
            });
        });

        socket.on("vote", ({ roomId, vote }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            const participant = room.participants.get(socket.id);
            if (participant) {
                participant.vote = vote;
                io!
                    .to(roomId)
                    .emit("participant-voted", { id: socket.id, hasVote: !!vote });
            }
        });

        socket.on("reveal", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            room.revealed = true;

            const roundId = `${Date.now()}`;
            room.lastRound = {
                id: roundId,
                participants: Array.from(room.participants.values()).map((p) => ({
                    ...p,
                })),
            };

            io!.to(roomId).emit("revealed", {
                participants: Array.from(room.participants.values()),
                lastRound: room.lastRound,
            });
        });

        socket.on("reestimate", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            room.revealed = false;
            room.participants.forEach((p) => {
                p.vote = null;
            });

            io!.to(roomId).emit("room-state", {
                participants: Array.from(room.participants.values()),
                revealed: room.revealed,
                story: room.story ?? null,
                lastRound: room.lastRound ?? null,
            });
        });

        socket.on("reset", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            room.revealed = false;
            room.participants.forEach((p) => (p.vote = null));

            io!.to(roomId).emit("room-reset", {
                participants: Array.from(room.participants.values()),
                story: room.story ?? null,
            });
        });

        socket.on("update-story", ({ roomId, story }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            room.story = story ?? null;
            console.log("📥 update-story received:", { roomId, story });
            io!.to(roomId).emit("story-updated", { story: room.story });
        });

        socket.on("suspend-voting", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (room) {
                const participant = room.participants.get(socket.id);
                if (participant) {
                    participant.paused = true;
                    io!.to(roomId).emit("room-state", {
                        participants: Array.from(room.participants.values()),
                        revealed: room.revealed,
                        story: room.story ?? null,
                        lastRound: room.lastRound ?? null,
                    });
                }
            }
        });

        socket.on("resume-voting", ({ roomId }) => {
            const room = rooms.get(roomId);
            if (room) {
                const participant = room.participants.get(socket.id);
                if (participant) {
                    participant.paused = false;
                    participant.vote = null;
                    io!.to(roomId).emit("room-state", {
                        participants: Array.from(room.participants.values()),
                        revealed: room.revealed,
                        story: room.story ?? null,
                        lastRound: room.lastRound ?? null,
                    });
                }
            }
        });

        socket.on("disconnect", () => {
            rooms.forEach((room, roomId) => {
                if (room.participants.has(socket.id)) {
                    room.participants.delete(socket.id);
                    io!.to(roomId).emit("room-state", {
                        participants: Array.from(room.participants.values()),
                        revealed: room.revealed,
                        story: room.story ?? null,
                    });
                }
            });
        });
    });

    console.log("✓ Socket.IO server initialized");
    return io;
}

export async function shutdown(): Promise<void> {
    try {
        if (io) {
            console.log("Closing Socket.IO connections...");
            await new Promise<void>((resolve) => {
                io!.close(() => resolve());
            });
            io = null;
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
        console.log("✓ Socket.IO graceful shutdown complete");
    } catch (err) {
        console.error("Error during Socket.IO shutdown:", err);
    }
}

if (require.main === module) {
    const port = parseInt(process.env.PORT || "3001", 10);
    const httpServer = createServer();
    initSocketIO(httpServer);

    httpServer.listen(port, () => {
        console.log(`✓ Realtime server listening on :${port}`);
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
                process.exit(1);
            }, 10000);
        } catch (err) {
            console.error("Error during shutdown:", err);
            process.exit(1);
        }
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}
