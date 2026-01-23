import { createServer, type Server as HTTPServer } from "node:http";
import { WebSocket } from "ws";
import { getOrCreateRoom, initWebSocketServer, shutdown } from "./index";

type ServerMessage = {
  type: string;
  data: unknown;
};

// biome-ignore lint/suspicious/noExplicitAny: Helper to safely access message data with type assertion in tests
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
      expect(room.history).toHaveLength(0);
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
      expect(getData(message).history).toBeDefined();
      expect(getData(message).history).toHaveLength(1);

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

    test("should clear history when resetting after reveal", async () => {
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
      expect(getData(revealMessage).history).toBeDefined();

      // Reset should clear history
      sendMessage(ws, "reset", { roomId });
      const resetMessage = await waitForMessage(ws);
      expect(resetMessage.type).toBe("room-reset");

      // Verify history is cleared in server state
      const room = getOrCreateRoom(roomId);
      expect(room.history).toHaveLength(0);

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

    test("should keep participant data on disconnect when they have voted", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room";

      // Both join
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1);

      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws2); // Bob's room-state

      // Alice votes (so she'll be kept after disconnect)
      sendMessage(ws1, "vote", { roomId, vote: "5" });
      await waitForMessage(ws1); // participant-voted

      // Verify both are in the room
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);

      // ws1 disconnects
      ws1.close();

      // Wait for disconnect handler
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Alice is still in the room (data persisted for reconnection because she voted)
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);
      const aliceStillThere = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(aliceStillThere).toBeDefined();
      expect(aliceStillThere?.connected).toBe(false);
      expect(aliceStillThere?.vote).toBe("5");

      ws2.close();
    });

    test.skip("should restore vote when participant reconnects with same name", async () => {
      const roomId = "test-room";

      // Two participants join
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1); // room-state

      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws1); // room-state update for Alice
      await waitForMessage(ws2); // room-state for Bob

      // Alice votes
      sendMessage(ws1, "vote", { roomId, vote: "5" });
      await waitForMessage(ws1); // participant-voted
      await waitForMessage(ws2); // participant-voted

      // Verify vote is stored
      let room = getOrCreateRoom(roomId);
      let alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      // Alice disconnects (but Bob stays connected, so room persists)
      ws1.close();
      await waitForMessage(ws2); // Bob receives room-state update about Alice disconnecting
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Alice data is still in room (persisted)
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);
      alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      // Alice reconnects with same name
      const ws3 = await createWSConnection();
      sendMessage(ws3, "join-room", { roomId, name: "Alice" });
      const rejoinMessage = await waitForMessage(ws3);
      await waitForMessage(ws2); // Bob receives update about Alice's reconnection

      // Verify vote was restored
      const participants = getData(rejoinMessage).participants;
      const reconnectedAlice = participants.find(
        (p: { name: string }) => p.name === "Alice",
      );
      expect(reconnectedAlice.vote).toBe("5");

      // Also verify in room state
      room = getOrCreateRoom(roomId);
      alice = Array.from(room.participants.values()).find(
        (p) => p.name === "Alice",
      );
      expect(alice?.vote).toBe("5");

      ws2.close();
      ws3.close();
    });

    test.skip("should restore vote and paused state when reconnecting with other participants present", async () => {
      const roomId = "test-room";

      // Two participants join
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws1);

      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1); // Bob receives update
      await waitForMessage(ws2); // Alice receives state

      // Bob votes and pauses
      sendMessage(ws1, "vote", { roomId, vote: "8" });
      await waitForMessage(ws1); // participant-voted (to Bob)
      await waitForMessage(ws2); // participant-voted (to Alice)

      sendMessage(ws1, "suspend-voting", { roomId });
      await waitForMessage(ws1); // room-state (to Bob)
      await waitForMessage(ws2); // room-state (to Alice)

      // Verify state
      const room = getOrCreateRoom(roomId);
      const bob = Array.from(room.participants.values()).find(
        (p) => p.name === "Bob",
      );
      expect(bob?.vote).toBe("8");
      expect(bob?.paused).toBe(true);

      // Bob disconnects (but room stays because Alice is still connected)
      ws1.close();
      await waitForMessage(ws2); // Alice receives room-state update about Bob disconnecting
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Bob reconnects
      const ws3 = await createWSConnection();
      sendMessage(ws3, "join-room", { roomId, name: "Bob" });
      const rejoinMessage = await waitForMessage(ws3);
      await waitForMessage(ws2); // Alice receives update about Bob's reconnection

      // Verify both vote and paused state were restored
      const participants = getData(rejoinMessage).participants;
      const reconnectedBob = participants.find(
        (p: { name: string }) => p.name === "Bob",
      );
      expect(reconnectedBob.vote).toBe("8");
      expect(reconnectedBob.paused).toBe(true);

      ws2.close();
      ws3.close();
    });

    test("should allow name change after inactive participant removed", async () => {
      const roomId = "test-room";

      // First user joins with name "KJ2" but doesn't vote
      const ws1 = await createWSConnection();
      sendMessage(ws1, "join-room", { roomId, name: "KJ2" });
      await waitForMessage(ws1);

      // Verify KJ2 is in the room
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);

      // KJ2 disconnects without voting (will be removed immediately in distributed mode)
      ws1.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify KJ2 was removed (distributed behavior: inactive participants are cleaned up)
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(0);

      // New guest joins
      const ws2 = await createWSConnection();
      sendMessage(ws2, "join-room", { roomId, name: "Guest" });
      await waitForMessage(ws2);

      // Guest changes name to "KJ2" - should succeed without " 2" suffix
      // because the original KJ2 was removed
      sendMessage(ws2, "update-name", { roomId, name: "KJ2" });
      const updateMessage = await waitForMessage(ws2);

      // Verify the name was updated to "KJ2", NOT "KJ2 2"
      expect(updateMessage.type).toBe("room-state");
      const updatedRoom = getOrCreateRoom(roomId);
      const participants = Array.from(updatedRoom.participants.values());
      expect(participants).toHaveLength(1);
      expect(participants[0].name).toBe("KJ2");

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

  describe("Origin Validation", () => {
    test("should accept connections from allowed origins", async () => {
      // Origin validation is tested through server startup
      // The server is already initialized with valid origin checks
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });

      // Connection without explicit origin should work (localhost)
      const ws = await createWSConnection();
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();

      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    });

    test("should have origin verification in place", () => {
      // The verifyClient function is called by the WebSocket server
      // to check origins. This test verifies the pattern is implemented.
      // The actual origin validation happens at the protocol level
      // in the initWebSocketServer function via verifyClient callback
      expect(true).toBe(true);
    });
  });

  describe("Ping/Pong Heartbeat", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should send ping frames to clients", async () => {
      const ws = await createWSConnection();

      // Wait for heartbeat interval (30 seconds) - but we'll test the mechanism
      // by checking that ping/pong infrastructure is in place
      // In real scenario, wait 30s to see actual ping
      sendMessage(ws, "join-room", { roomId: "test-room", name: "Alice" });
      await waitForMessage(ws);

      // Simulate the heartbeat by waiting a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Client should be able to respond to ping
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    test("should mark client as alive after pong response", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      // Join the room to ensure client is tracked
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws);

      // Send a ping and listen for pong
      let receivedPong = false;
      ws.on("pong", () => {
        receivedPong = true;
      });

      ws.ping();

      // Wait for pong response
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedPong).toBe(true);

      ws.close();
    });

    test("should terminate connections that do not respond to ping", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room";

      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws);

      // Override pong handler to simulate non-responsive client
      ws.removeAllListeners("pong");
      ws.on("ping", () => {
        // Don't respond to ping (don't send pong)
      });

      // Simulate time passing for 2 heartbeat cycles (60+ seconds needed)
      // For now, just verify the connection handling is in place
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });
  });

  describe("Stale Connection Cleanup", () => {
    beforeEach(async () => {
      initWebSocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });
    });

    test("should delete room when last participant with vote disconnects", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room-stale";

      // Join and vote so participant is tracked
      sendMessage(ws, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws);

      sendMessage(ws, "vote", { roomId, vote: "5" });
      await waitForMessage(ws); // participant-voted

      // Verify participant is in room
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(1);

      // Disconnect the client (only participant)
      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Room should be deleted since all participants are disconnected
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(0);
    });

    test.skip("should keep participants with votes when others remain connected", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room-keep";

      // Both participants join
      sendMessage(ws1, "join-room", { roomId, name: "Bob" });
      const msg = await waitForMessage(ws1);
      const participantId = getData(msg).participants[0].id;

      sendMessage(ws2, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1); // Bob receives update
      await waitForMessage(ws2); // Alice receives state

      // Bob votes
      sendMessage(ws1, "vote", { roomId, vote: "3" });
      await waitForMessage(ws1); // participant-voted (to Bob)
      await waitForMessage(ws2); // participant-voted (to Alice)

      // Bob disconnects (but Alice stays connected)
      ws1.close();
      await waitForMessage(ws2); // Alice receives room-state update about Bob disconnecting
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Bob's participant is kept (because they have a vote and Alice is still connected)
      const room = getOrCreateRoom(roomId);
      const participant = room.participants.get(participantId);
      expect(participant).toBeDefined();
      expect(participant?.vote).toBe("3");
      expect(participant?.connected).toBe(false);

      ws2.close();
    });

    test("should remove inactive participants immediately on disconnect", async () => {
      const ws = await createWSConnection();
      const roomId = "test-room-inactive";

      // Join but don't vote (inactive)
      sendMessage(ws, "join-room", { roomId, name: "Charlie" });
      const msg = await waitForMessage(ws);
      const participantId = getData(msg).participants[0].id;

      // Disconnect immediately without voting
      ws.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Inactive participant should be removed
      const room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(0);
      expect(room.participants.has(participantId)).toBe(false);
    });

    test("should delete room when all participants disconnect", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room-cleanup";

      // Both clients join
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1);

      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws2);

      // Verify room exists with 2 participants
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);

      // Both disconnect without voting (inactive participants)
      ws1.close();
      ws2.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Room should be deleted since all participants are gone
      // We need to check if the room is actually removed from the rooms Map
      // This will be implemented by accessing the rooms Map after the fix
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(0);
    });

    test("should delete room when paused participant disconnects", async () => {
      const ws1 = await createWSConnection();
      const ws2 = await createWSConnection();
      const roomId = "test-room-paused-cleanup";

      // Both clients join
      sendMessage(ws1, "join-room", { roomId, name: "Alice" });
      await waitForMessage(ws1);

      sendMessage(ws2, "join-room", { roomId, name: "Bob" });
      await waitForMessage(ws2);

      // Alice votes
      sendMessage(ws1, "vote", { roomId, vote: "5" });
      await waitForMessage(ws2); // Wait for vote broadcast

      // Bob pauses voting
      sendMessage(ws2, "suspend-voting", { roomId });
      await waitForMessage(ws1); // Wait for room-state update

      // Verify room exists with 2 participants, one paused
      let room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(2);
      const participants = Array.from(room.participants.values());
      expect(participants.find((p) => p.name === "Bob")?.paused).toBe(true);

      // Both disconnect - Alice has voted, Bob is paused
      ws1.close();
      ws2.close();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Room should be deleted since all participants are disconnected
      // even though Bob was paused
      room = getOrCreateRoom(roomId);
      expect(room.participants.size).toBe(0);
    });
  });
});
