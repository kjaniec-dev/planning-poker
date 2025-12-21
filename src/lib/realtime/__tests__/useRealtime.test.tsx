import { renderHook, act, waitFor } from "@testing-library/react";
import { Server as MockWebSocketServer } from "mock-socket";
import { useRealtime } from "../useRealtime";

//Store original env
const originalEnv = process.env.NEXT_PUBLIC_REALTIME_URL;

describe("useRealtime", () => {
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
    mockServer = new MockWebSocketServer(wsUrl);
  });

  afterEach(() => {
    mockServer.close();
  });

  describe("initialization", () => {
    it("should join room on mount", (done) => {
      mockServer.on("connection", (socket) => {
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "join-room") {
            expect(message.data.roomId).toBe("test-room");
            expect(message.data.name).toBe("Alice");
            done();
          }
        });
      });

      renderHook(() => useRealtime("test-room", "Alice"));
    });

    it("should not join if roomId or userName is missing", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      renderHook(() => useRealtime("", "Alice"));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing roomId or userName"),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("state management", () => {
    it("should update participants from room-state message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [
                { id: "1", name: "Alice", vote: null },
                { id: "2", name: "Bob", vote: null },
              ],
              revealed: false,
              story: null,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.participants).toHaveLength(2);
        expect(result.current.isConnected).toBe(true);
      });
    });

    it("should handle revealed message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      const revealedData = {
        participants: [
          { id: "1", name: "Alice", vote: "5" },
          { id: "2", name: "Bob", vote: "8" },
        ],
        lastRound: {
          id: "123",
          participants: [
            { id: "1", name: "Alice", vote: "5" },
            { id: "2", name: "Bob", vote: "8" },
          ],
        },
      };

      act(() => {
        socket.send(
          JSON.stringify({
            type: "revealed",
            data: revealedData,
          })
        );
      });

      await waitFor(() => {
        expect(result.current.revealed).toBe(true);
        expect(result.current.participants).toHaveLength(2);
      });
    });
  });

  describe("action methods", () => {
    it("should send vote message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const messages: any[] = [];

      socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      act(() => {
        result.current.vote("5");
      });

      await waitFor(() => {
        const voteMessage = messages.find((m) => m.type === "vote");
        expect(voteMessage).toBeDefined();
        expect(voteMessage.data.vote).toBe("5");
      });
    });

    it("should send reveal message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const messages: any[] = [];

      socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      act(() => {
        result.current.reveal();
      });

      await waitFor(() => {
        const revealMessage = messages.find((m) => m.type === "reveal");
        expect(revealMessage).toBeDefined();
      });
    });
  });
});
