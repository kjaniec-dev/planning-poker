import { createServer, type Server as HTTPServer } from "node:http";
import { WebSocket } from "ws";
import { getOrCreateRoom, initWebSocketServer, shutdown } from "./index";

type ServerMessage = {
  type: string;
  data: unknown;
};

// Helper to safely access message data with type assertion
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getData = (msg: ServerMessage) => msg.data as any;

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

  const sendMessage = (
    ws: WebSocket,
    type: string,
    data: Record<string, unknown>,
  ) => {
    ws.send(JSON.stringify({ type, data }));
  };

  const waitForMessage = (
    ws: WebSocket,
    timeout = 2000,
  ): Promise<ServerMessage> => {
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
      expect(getData(message).participants).toHaveLength(1);
      expect(getData(message).participants[0].name).toBe(name);
      expect(getData(message).revealed).toBe(false);

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
      expect(getData(message2).participants).toHaveLength(2);

      // Verify room state is correct
      const room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);

      ws1.close();
      ws2.close();
    });

    test("should handle multiple guests with duplicate names", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room";

      // First guest joins
      sendMessage(ws1, "join-room", { roomId, name: "Guest" });
      const msg1 = await waitForMessage(ws1);
      expect(msg1.type).toBe("room-state");
      expect(getData(msg1).participants).toHaveLength(1);
      expect(getData(msg1).participants[0].name).toBe("Guest");

      // Second guest joins with same name
      sendMessage(ws2, "join-room", { roomId, name: "Guest" });
      const msg2 = await waitForMessage(ws2);
      expect(msg2.type).toBe("room-state");
      expect(getData(msg2).participants).toHaveLength(2);

      // Verify room state has both participants with unique names
      const room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);
      const participants = Array.from(room.participants.values());
      const names = participants.map((p) => p.name).sort();
      expect(names).toEqual(["Guest", "Guest 2"]);

      // Small delay to ensure all broadcasts are processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // First guest should be able to change name (become a player)
      sendMessage(ws1, "update-name", { roomId, name: "Alice" });
      const msg3 = await waitForMessage(ws1);
      expect(msg3.type).toBe("room-state");

      // Small delay to ensure update is processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify first guest's name was updated
      const updatedRoom = getOrCreateRoom(roomId);
      const updatedParticipants = Array.from(updatedRoom.participants.values());
      const updatedNames = updatedParticipants.map((p) => p.name).sort();
      expect(updatedNames).toEqual(["Alice", "Guest 2"]);

      // Second guest should also be able to change name
      sendMessage(ws2, "update-name", { roomId, name: "Bob" });
      const msg4 = await waitForMessage(ws2);
      expect(msg4.type).toBe("room-state");

      // Small delay to ensure update is processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify both names are updated
      const finalRoom = getOrCreateRoom(roomId);
      const finalParticipants = Array.from(finalRoom.participants.values());
      const finalNames = finalParticipants.map((p) => p.name).sort();
      expect(finalNames).toEqual(["Alice", "Bob"]);

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
      expect(getData(message).hasVote).toBe(true);

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
      expect(getData(msg1).hasVote).toBe(true);

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
      expect(getData(message).participants).toHaveLength(1);
      expect(getData(message).participants[0].vote).toBe("5");
      expect(getData(message).lastRound).toBeDefined();
      expect(getData(message).lastRound.participants).toHaveLength(1);

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
      expect(getData(message).revealed).toBe(false);
      expect(getData(message).participants[0].vote).toBeNull();

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
      expect(getData(message).participants[0].vote).toBeNull();
      expect(getData(message).story).toBeNull();

      ws.close();
    });

    test("should clear lastRound when resetting after reveal", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join, vote, and reveal
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws); // room-state

      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      sendMessage(ws, "reveal", { roomId });
      const revealMessage = await waitForMessage(ws);
      expect(revealMessage.type).toBe("revealed");
      expect(getData(revealMessage).lastRound).toBeDefined();

      // Reset should clear lastRound
      sendMessage(ws, "reset", { roomId });
      const resetMessage = await waitForMessage(ws);
      expect(resetMessage.type).toBe("room-reset");

      // Verify lastRound is cleared in server state
      const room = getOrCreateRoom(roomId);
      expect(room.lastRound).toBeNull();

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
      const story = {
        title: "User Authentication",
        link: "https://example.com/story/123",
      };
      sendMessage(ws, "update-story", { roomId, story });

      const message = await waitForMessage(ws);
      expect(message.type).toBe("story-updated");
      expect(getData(message).story).toEqual(story);

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
      expect(getData(message).participants[0].paused).toBe(true);

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
      expect(getData(message).participants[0].paused).toBe(false);

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
      expect(getData(message).participants[0].name).toBe("Bob");

      ws.close();
    });

    test("should handle same connection rejoining after update-name", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";
      const participantId = "test-participant-id";

      // Join room with participantId
      sendMessage(ws, "join-room", { roomId, name: "Guest", participantId });
      await waitForMessage(ws); // room-state

      // Update name
      sendMessage(ws, "update-name", { roomId, name: "KJ2" });
      await waitForMessage(ws); // room-state from update-name

      // Client sends join-room again (simulating what happens in real scenario)
      sendMessage(ws, "join-room", { roomId, name: "KJ2", participantId });
      const message = await waitForMessage(ws);

      // Should NOT get "KJ2 2", should stay as "KJ2"
      expect(message.type).toBe("room-state");
      expect(getData(message).participants).toHaveLength(1);
      expect(getData(message).participants[0].name).toBe("KJ2");

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

    test("should keep participant data on disconnect", async () => {
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

      // Verify Alice is still in the room (data persisted for reconnection)
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);
      const aliceStillThere = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(aliceStillThere).toBeDefined();

      ws2.close();
    });

    test("should restore vote when participant reconnects with same name", async () => {
      const roomId = "test-room";

      // First connection
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1); // room-state

      // Vote
      sendMessage(ws1, "vote", { roomId, vote: "5" });
      await waitForMessage(ws1); // participant-voted

      // Verify vote is stored
      let room = getOrCreateRoom(roomId);
      let alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      // Disconnect
      ws1.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Alice data is still in room (persisted)
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);
      alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      // Reconnect with same name
      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Alice" });
      const rejoinMessage = await waitForMessage(ws2);

      // Verify vote was restored
      expect(getData(rejoinMessage).participants).toHaveLength(1);
      expect(getData(rejoinMessage).participants[0].name).toBe("Alice");
      expect(getData(rejoinMessage).participants[0].vote).toBe("5");

      // Also verify in room state
      room = getOrCreateRoom(roomId);
      alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      ws2.close();
    });

    test("should restore vote and paused state when reconnecting", async () => {
      const roomId = "test-room";

      // First connection
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws1);

      // Vote and pause
      sendMessage(ws1, "vote", { roomId, vote: "8" });
      await waitForMessage(ws1); // participant-voted

      sendMessage(ws1, "suspend-voting", { roomId });
      await waitForMessage(ws1); // room-state

      // Verify state
      const room = getOrCreateRoom(roomId);
      const bob = Array.from(room.participants.values()).find(
        (p) => p.name === "Bob",
      );
      expect(bob?.vote).toBe("8");
      expect(bob?.paused).toBe(true);

      // Disconnect and reconnect
      ws1.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      const rejoinMessage = await waitForMessage(ws2);

      // Verify both vote and paused state were restored
      expect(getData(rejoinMessage).participants[0].vote).toBe("8");
      expect(getData(rejoinMessage).participants[0].paused).toBe(true);

      ws2.close();
    });

    test("should allow name change to disconnected participant's name", async () => {
      const roomId = "test-room";

      // First user joins with name "KJ2"
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "KJ2" });
      await waitForMessage(ws1);

      // Verify KJ2 is in the room
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);

      // KJ2 disconnects (but data persists for reconnection)
      ws1.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify KJ2 is still in room data but disconnected
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);

      // New guest joins
      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Guest" });
      await waitForMessage(ws2);

      // Guest changes name to "KJ2" - should succeed without " 2" suffix
      // because the original KJ2 is disconnected
      sendMessage(ws2, "update-name", { roomId, name: "KJ2" });
      const updateMessage = await waitForMessage(ws2);

      // Verify the name was updated to "KJ2", NOT "KJ2 2"
      expect(updateMessage.type).toBe("room-state");
      const updatedRoom = getOrCreateRoom(roomId);
      const participants = Array.from(updatedRoom.participants.values());
      const activeParticipant = participants.find(
        (p) => p.name === "KJ2" || p.name === "KJ2 2",
      );
      expect(activeParticipant?.name).toBe("KJ2");

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
      expect(getData(message).participants).toHaveLength(1);
      expect(getData(message).revealed).toBe(false);

      // Vote
      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      // Reveal
      sendMessage(ws, "reveal", { roomId });
      message = await waitForMessage(ws);
      expect(message.type).toBe("revealed");
      expect(getData(message).participants[0].vote).toBe("5");

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
      expect(getData(message).revealed).toBe(false);
      expect(getData(message).participants[0].vote).toBeNull();

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
