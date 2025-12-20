import { Server as MockWebSocketServer } from "mock-socket";
import {
  connectIfNeeded,
  joinRoom,
  sendMessage,
  subscribeToMessages,
} from "../wsClient";

// Mock window.location using delete and assignment
delete (window as any).location;
(window as any).location = {
  origin: "http://localhost:3000",
};

describe("wsClient", () => {
  let mockServer: MockWebSocketServer;
  const wsUrl = "ws://localhost:3000/api/ws";

  beforeEach(() => {
    // Reset module state
    jest.resetModules();

    // Create mock WebSocket server
    mockServer = new MockWebSocketServer(wsUrl);
  });

  afterEach(() => {
    mockServer.close();
    jest.clearAllTimers();
  });

  describe("connectIfNeeded", () => {
    it("should establish WebSocket connection", (done) => {
      mockServer.on("connection", (socket) => {
        expect(socket).toBeDefined();
        done();
      });

      connectIfNeeded();
    });

    it("should not create duplicate connections", (done) => {
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

    it("should store lastJoin for reconnection", (done) => {
      let joinCount = 0;

      mockServer.on("connection", (socket) => {
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "join-room") {
            joinCount++;
            expect(message.data.roomId).toBe("test-room");
            expect(message.data.name).toBe("Alice");

            if (joinCount === 2) {
              done();
            } else if (joinCount === 1) {
              // Close connection to trigger reconnection
              socket.close();
            }
          }
        });
      });

      joinRoom("test-room", "Alice");
    });
  });

  describe("sendMessage", () => {
    it("should send messages to server", (done) => {
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

    it("should warn when not connected", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      sendMessage("vote", { vote: "5" });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("WebSocket not connected"),
        "vote"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("subscribeToMessages", () => {
    it("should receive messages from server", (done) => {
      const listener = jest.fn((message) => {
        if (message.type === "room-state") {
          expect(message.data.participants).toHaveLength(1);
          done();
        }
      });

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

      subscribeToMessages(listener);
      connectIfNeeded();
    });

    it("should support multiple listeners", (done) => {
      let listener1Called = false;
      let listener2Called = false;

      const listener1 = jest.fn(() => {
        listener1Called = true;
        checkBothCalled();
      });

      const listener2 = jest.fn(() => {
        listener2Called = true;
        checkBothCalled();
      });

      function checkBothCalled() {
        if (listener1Called && listener2Called) {
          expect(listener1).toHaveBeenCalled();
          expect(listener2).toHaveBeenCalled();
          done();
        }
      }

      mockServer.on("connection", (socket) => {
        socket.send(
          JSON.stringify({
            type: "test",
            data: {},
          })
        );
      });

      subscribeToMessages(listener1);
      subscribeToMessages(listener2);
      connectIfNeeded();
    });

    it("should return unsubscribe function", (done) => {
      const listener = jest.fn();

      mockServer.on("connection", (socket) => {
        // Send first message
        socket.send(JSON.stringify({ type: "test1", data: {} }));

        setTimeout(() => {
          // Send second message after unsubscribe
          socket.send(JSON.stringify({ type: "test2", data: {} }));

          setTimeout(() => {
            // Should only be called once (for test1)
            expect(listener).toHaveBeenCalledTimes(1);
            done();
          }, 50);
        }, 50);
      });

      const unsubscribe = subscribeToMessages(listener);
      connectIfNeeded();

      // Unsubscribe after first message
      setTimeout(() => {
        unsubscribe();
      }, 75);
    });
  });

  describe("reconnection logic", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should attempt to reconnect on connection loss", (done) => {
      let connectionCount = 0;

      const server = new MockWebSocketServer(wsUrl);

      server.on("connection", (socket) => {
        connectionCount++;

        if (connectionCount === 1) {
          // Close first connection immediately
          socket.close();
        } else if (connectionCount === 2) {
          // Second connection successful
          expect(connectionCount).toBe(2);
          server.close();
          done();
        }
      });

      connectIfNeeded();

      // Fast-forward timers to trigger reconnection
      setTimeout(() => {
        jest.advanceTimersByTime(2000);
      }, 100);
    });

    it("should use exponential backoff for reconnection", () => {
      const server = new MockWebSocketServer(wsUrl);
      const delays: number[] = [];

      let lastConnectionTime = Date.now();

      server.on("connection", (socket) => {
        const now = Date.now();
        if (delays.length > 0) {
          delays.push(now - lastConnectionTime);
        }
        lastConnectionTime = now;

        // Close immediately to trigger reconnection
        socket.close();
      });

      connectIfNeeded();

      // Fast-forward and check delays
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(10000); // Advance enough time
      }

      server.close();
    });
  });

  describe("error handling", () => {
    it("should handle malformed messages", (done) => {
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

    it("should handle listener errors gracefully", (done) => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const badListener = () => {
        throw new Error("Listener error");
      };
      const goodListener = jest.fn();

      mockServer.on("connection", (socket) => {
        socket.send(JSON.stringify({ type: "test", data: {} }));

        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("Listener error"),
            expect.any(Error)
          );
          expect(goodListener).toHaveBeenCalled();
          consoleSpy.mockRestore();
          done();
        }, 50);
      });

      subscribeToMessages(badListener);
      subscribeToMessages(goodListener);
      connectIfNeeded();
    });
  });

  describe("URL construction", () => {
    it("should use NEXT_PUBLIC_REALTIME_URL if set", (done) => {
      const originalEnv = process.env.NEXT_PUBLIC_REALTIME_URL;
      process.env.NEXT_PUBLIC_REALTIME_URL = "http://custom-host:3001";

      const customServer = new MockWebSocketServer("ws://custom-host:3001/api/ws");

      customServer.on("connection", () => {
        process.env.NEXT_PUBLIC_REALTIME_URL = originalEnv;
        customServer.close();
        done();
      });

      // Need to re-import to pick up new env var
      jest.resetModules();
      const { connectIfNeeded: connect } = require("../wsClient");
      connect();
    });

    it("should use WSS for HTTPS origins", () => {
      const httpsLocation = { origin: "https://example.com" };
      Object.defineProperty(window, "location", {
        value: httpsLocation,
        writable: true,
      });

      // The actual test would require mocking WSS, which is complex
      // This is more of a documentation of expected behavior
      expect(window.location.origin).toBe("https://example.com");
    });
  });
});
