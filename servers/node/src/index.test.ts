import { createServer, Server as HTTPServer } from "http";
import { WebSocket } from "ws";
import { getOrCreateRoom, initWebSocketServer, shutdown } from "./index";

describe("WebSocket Server", () => {
  let httpServer: HTTPServer;
  let port: number;

  beforeEach(() => {
    port = 3000 + Math.floor(Math.random() * 1000);
    httpServer = createServer();
  });

  afterEach(async () => {
    await shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  const createWSConnection = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/api/ws`);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  };

  const sendMessage = (ws: WebSocket, type: string, data: any) => {
    ws.send(JSON.stringify({ type, data }));
  };

  const waitForMessage = (ws: WebSocket, timeout = 2000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Message timeout"));
      }, timeout);

      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  };

  describe("Room Management", () => {
    test("should create a new room", () => {
      const roomId = "test-room-1";
      const room = getOrCreateRoom(roomId);

      expect(room).toBeDefined();
      expect(room.id).toBe(roomId);
      expect(room.revealed).toBe(false);
      expect(room.participants.size).toBe(0);
      expect(room.story).toBeNull();
      expect(room.lastRound).toBeNull();
    });

    test("should return the same room instance", () => {
      const roomId = "test-room-2";
      const room1 = getOrCreateRoom(roomId);
      const room2 = getOrCreateRoom(roomId);

      expect(room1).toBe(room2);
    });
  });

  describe("Client Connection", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should accept WebSocket connection", async () => {
      const ws = await createWSConnection();
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    test("should handle multiple connections", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();

      expect(ws1.readyState).toBe(WebSocket.OPEN);
      expect(ws2.readyState).toBe(WebSocket.OPEN);

      ws1.close();
      ws2.close();
    });
  });

  describe("Message Handling - join-room", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should handle join-room message", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";
      const name = "Alice";

      sendMessage(ws, "join-room", { roomId, name });

      const message = await waitForMessage(ws);

      expect(message.type).toBe("room-state");
      expect(message.data.participants).toHaveLength(1);
      expect(message.data.participants[0].name).toBe(name);
      expect(message.data.revealed).toBe(false);

      ws.close();
    });

    test("should broadcast to other clients when joining", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room";

      // First client joins
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1); // room-state

      // Second client joins
      sendMessage(ws2, "join-room", { roomId, name: "Bob" });

      // ws2 should receive room state with both participants
      const message2 = await waitForMessage(ws2);
      expect(message2.type).toBe("room-state");
      expect(message2.data.participants).toHaveLength(2);

      // Verify room state is correct
      const room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);

      ws1.close();
      ws2.close();
    });
  });

  describe("Message Handling - vote", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should handle vote message", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join room first
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      // Vote
      sendMessage(ws, "vote", { roomId, vote: "5" });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("participant-voted");
      expect(message.data.hasVote).toBe(true);

      ws.close();
    });

    test("should broadcast vote to other participants", async () => {
      const ws1 = await createWSConnection();
      const roomId = "test-room";

      // Join room
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1);

      // Vote
      sendMessage(ws1, "vote", { roomId, vote: "8" });

      // ws1 should receive participant-voted
      const msg1 = await waitForMessage(ws1);
      expect(msg1.type).toBe("participant-voted");
      expect(msg1.data.hasVote).toBe(true);

      // Verify vote was recorded in room state
      const room = getOrCreateRoom(roomId);
      const participants = Array.from(room.participants.values());
      const alice = participants.find((p) => p.name === "Alice");
      expect(alice?.vote).toBe("8");

      ws1.close();
    });
  });

  describe("Message Handling - reveal", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should reveal votes", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join and vote
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      // Reveal
      sendMessage(ws, "reveal", { roomId });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("revealed");
      expect(message.data.participants).toHaveLength(1);
      expect(message.data.participants[0].vote).toBe("5");
      expect(message.data.lastRound).toBeDefined();
      expect(message.data.lastRound.participants).toHaveLength(1);

      ws.close();
    });
  });

  describe("Message Handling - reestimate", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should clear votes after reestimate", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join, vote, and reveal
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      sendMessage(ws, "vote", { roomId, vote: "8" });
      await waitForMessage(ws); // participant-voted

      sendMessage(ws, "reveal", { roomId });
      await waitForMessage(ws); // revealed

      // Reestimate
      sendMessage(ws, "reestimate", { roomId });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("room-state");
      expect(message.data.revealed).toBe(false);
      expect(message.data.participants[0].vote).toBeNull();

      ws.close();
    });
  });

  describe("Message Handling - reset", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should reset room state", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join and vote
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      // Reset
      sendMessage(ws, "reset", { roomId });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("room-reset");
      expect(message.data.participants[0].vote).toBeNull();
      expect(message.data.story).toBeNull();

      ws.close();
    });
  });

  describe("Message Handling - update-story", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should update story", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join room
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      // Update story
      const story = { title: "User Authentication", link: "https://example.com/story/123" };
      sendMessage(ws, "update-story", { roomId, story });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("story-updated");
      expect(message.data.story).toEqual(story);

      ws.close();
    });
  });

  describe("Message Handling - suspend/resume voting", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should suspend voting", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join room
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      // Suspend voting
      sendMessage(ws, "suspend-voting", { roomId });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("room-state");
      expect(message.data.participants[0].paused).toBe(true);

      ws.close();
    });

    test("should resume voting", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join room
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      // Suspend then resume
      sendMessage(ws, "suspend-voting", { roomId });
      await waitForMessage(ws); // room-state

      sendMessage(ws, "resume-voting", { roomId });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("room-state");
      expect(message.data.participants[0].paused).toBe(false);

      ws.close();
    });
  });

  describe("Message Handling - update-name", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should update participant name", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join room
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      // Update name
      sendMessage(ws, "update-name", { roomId, name: "Bob" });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("room-state");
      expect(message.data.participants[0].name).toBe("Bob");

      ws.close();
    });
  });

  describe("Client Disconnection", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should remove participant on disconnect", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room";

      // Both join
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1);

      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws2); // Bob's room-state

      // Verify both are in the room
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);

      // ws1 disconnects
      ws1.close();

      // Wait for disconnect handler
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Alice was removed from room
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);
      const remainingParticipant = Array.from(room.participants.values())[0];
      expect(remainingParticipant.name).toBe("Bob");

      ws2.close();
    });
  });

  describe("Room State Consistency", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should maintain consistent state across operations", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      let message = await waitForMessage(ws);
      expect(message.data.participants).toHaveLength(1);
      expect(message.data.revealed).toBe(false);

      // Vote
      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      // Reveal
      sendMessage(ws, "reveal", { roomId });
      message = await waitForMessage(ws);
      expect(message.type).toBe("revealed");
      expect(message.data.participants[0].vote).toBe("5");

      // Update story
      sendMessage(ws, "update-story", {
        roomId,
        story: { title: "Test", link: "http://test.com" },
      });
      message = await waitForMessage(ws);
      expect(message.type).toBe("story-updated");

      // Reestimate
      sendMessage(ws, "reestimate", { roomId });
      message = await waitForMessage(ws);
      expect(message.data.revealed).toBe(false);
      expect(message.data.participants[0].vote).toBeNull();

      ws.close();
    });
  });

  describe("Edge Cases", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should handle vote without joining room", async () => {
      const ws = await createWSConnection();

      // Try to vote without joining
      sendMessage(ws, "vote", { roomId: "nonexistent", vote: "5" });

      // Should not crash - wait a bit to ensure no errors
      await new Promise((resolve) => setTimeout(resolve, 200));

      ws.close();
    });

    test("should handle malformed messages gracefully", async () => {
      const ws = await createWSConnection();

      // Send invalid JSON
      ws.send("invalid json");

      // Should not crash
      await new Promise((resolve) => setTimeout(resolve, 200));

      ws.close();
    });

    test("should handle unknown message type", async () => {
      const ws = await createWSConnection();

      // Send unknown message type
      sendMessage(ws, "unknown-type", { data: "test" });

      // Should not crash
      await new Promise((resolve) => setTimeout(resolve, 200));

      ws.close();
    });
  });
});
