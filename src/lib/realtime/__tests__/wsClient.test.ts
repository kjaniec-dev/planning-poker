import { Server as MockWebSocketServer } from "mock-socket";

// Store original env
const originalEnv = process.env.NEXT_PUBLIC_REALTIME_URL;

describe("wsClient", () => {
  let mockServer: MockWebSocketServer;
  const wsUrl = "ws://localhost:3000/api/ws";

  beforeAll(() => {
    // Set env var to avoid window.location issues
    process.env.NEXT_PUBLIC_REALTIME_URL = "http://localhost:3000";
  });

  afterAll(() => {
    // Restore env
    process.env.NEXT_PUBLIC_REALTIME_URL = originalEnv;
  });

  beforeEach(() => {
    // Reset modules to clear any cached WebSocket connections
    jest.resetModules();

    // Create mock WebSocket server
    mockServer = new MockWebSocketServer(wsUrl);
  });

  afterEach(() => {
    mockServer.close();
    jest.clearAllTimers();
  });

  // Import after setup to avoid connection attempts during module load
  const getWsClient = () => {
    return require("../wsClient");
  };

  describe("connectIfNeeded", () => {
    it("should establish WebSocket connection", (done) => {
      const { connectIfNeeded } = getWsClient();

      mockServer.on("connection", (socket) => {
        expect(socket).toBeDefined();
        done();
      });

      connectIfNeeded();
    });

    it("should not create duplicate connections", (done) => {
      const { connectIfNeeded } = getWsClient();
      let connectionCount = 0;

      mockServer.on("connection", () => {
        connectionCount++;
        if (connectionCount > 1) {
          done(new Error("Multiple connections created"));
        }
      });

      connectIfNeeded();
      connectIfNeeded();
      connectIfNeeded();

      setTimeout(() => {
        expect(connectionCount).toBe(1);
        done();
      }, 100);
    });
  });

  describe("joinRoom", () => {
    it("should send join-room message when connected", (done) => {
      const { joinRoom } = getWsClient();

      mockServer.on("connection", (socket) => {
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe("join-room");
          expect(message.data.roomId).toBe("test-room");
          expect(message.data.name).toBe("Alice");
          done();
        });
      });

      joinRoom("test-room", "Alice");
    });
  });

  describe("sendMessage", () => {
    it("should send messages to server", (done) => {
      const { joinRoom, sendMessage } = getWsClient();

      mockServer.on("connection", (socket) => {
        let messageCount = 0;

        socket.on("message", (data) => {
          const message = JSON.parse(data.toString());
          messageCount++;

          if (messageCount === 1) {
            // First message is join-room
            expect(message.type).toBe("join-room");
          } else if (messageCount === 2) {
            // Second message is our test message
            expect(message.type).toBe("vote");
            expect(message.data.vote).toBe("5");
            done();
          }
        });
      });

      joinRoom("test-room", "Alice");

      // Wait for connection to be established
      setTimeout(() => {
        sendMessage("vote", { vote: "5" });
      }, 100);
    });
  });

  describe("subscribeToMessages", () => {
    it("should receive messages from server", (done) => {
      const { connectIfNeeded, subscribeToMessages } = getWsClient();

      const listener = jest.fn((message) => {
        if (message.type === "room-state") {
          expect(message.data.participants).toHaveLength(1);
          done();
        }
      });

      subscribeToMessages(listener);

      mockServer.on("connection", (socket) => {
        // Send a message to the client
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [{ id: "1", name: "Alice", vote: null }],
              revealed: false,
            },
          })
        );
      });

      connectIfNeeded();
    });

    it("should support multiple listeners", (done) => {
      const { connectIfNeeded, subscribeToMessages } = getWsClient();

      let listener1Called = false;
      let listener2Called = false;

      const listener1 = () => {
        listener1Called = true;
        checkBothCalled();
      };

      const listener2 = () => {
        listener2Called = true;
        checkBothCalled();
      };

      function checkBothCalled() {
        if (listener1Called && listener2Called) {
          done();
        }
      }

      subscribeToMessages(listener1);
      subscribeToMessages(listener2);

      mockServer.on("connection", (socket) => {
        socket.send(JSON.stringify({ type: "test", data: {} }));
      });

      connectIfNeeded();
    });

    it("should unsubscribe listeners", (done) => {
      const { connectIfNeeded, subscribeToMessages } = getWsClient();
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      const unsubscribe = subscribeToMessages(listener);

      mockServer.on("connection", (socket) => {
        // Send first message
        socket.send(JSON.stringify({ type: "msg1", data: {} }));

        setTimeout(() => {
          // Unsubscribe
          unsubscribe();

          // Send second message (should not be received)
          socket.send(JSON.stringify({ type: "msg2", data: {} }));

          setTimeout(() => {
            expect(callCount).toBe(1);
            done();
          }, 100);
        }, 100);
      });

      connectIfNeeded();
    });
  });

  describe("error handling", () => {
    it("should handle malformed messages", (done) => {
      const { connectIfNeeded } = getWsClient();
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      mockServer.on("connection", (socket) => {
        // Send invalid JSON
        socket.send("invalid json");

        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("Failed to parse message"),
            expect.any(Error)
          );
          consoleSpy.mockRestore();
          done();
        }, 50);
      });

      connectIfNeeded();
    });
  });
});
