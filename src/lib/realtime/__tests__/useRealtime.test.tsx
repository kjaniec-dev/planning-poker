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

    it("should handle participant-voted message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      // Set initial state
      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [{ id: "1", name: "Alice", vote: null }],
              revealed: false,
              story: null,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.participants).toHaveLength(1);
      });

      // Send participant-voted
      act(() => {
        socket.send(
          JSON.stringify({
            type: "participant-voted",
            data: { id: "1", hasVote: true },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.participants[0].vote).toBe("hidden");
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
        expect(result.current.lastRound).toBeDefined();
      });
    });

    it("should handle room-reset message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      // Set some state
      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [{ id: "1", name: "Alice", vote: "5" }],
              revealed: true,
              story: { title: "Test", link: "http://test.com" },
              lastRound: { id: "123", participants: [] },
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.revealed).toBe(true);
      });

      // Reset
      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-reset",
            data: {
              participants: [{ id: "1", name: "Alice", vote: null }],
              story: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.revealed).toBe(false);
        expect(result.current.story).toBeNull();
        expect(result.current.lastRound).toBeNull();
      });
    });

    it("should handle story-updated message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const story = { title: "New Story", link: "https://new.com" };

      act(() => {
        socket.send(
          JSON.stringify({
            type: "story-updated",
            data: { story },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.story).toEqual(story);
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

      await waitFor(() => {
        const joinMessage = messages.find((m) => m.type === "join-room");
        expect(joinMessage).toBeDefined();
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

      await waitFor(() => {
        const joinMessage = messages.find((m) => m.type === "join-room");
        expect(joinMessage).toBeDefined();
      });

      act(() => {
        result.current.reveal();
      });

      await waitFor(() => {
        const revealMessage = messages.find((m) => m.type === "reveal");
        expect(revealMessage).toBeDefined();
      });
    });

    it("should send reestimate message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const messages: any[] = [];

      socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await waitFor(() => {
        const joinMessage = messages.find((m) => m.type === "join-room");
        expect(joinMessage).toBeDefined();
      });

      act(() => {
        result.current.reestimate();
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "reestimate");
        expect(message).toBeDefined();
        expect(message.data.roomId).toBe("test-room");
      });
    });

    it("should send updateStory message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const messages: any[] = [];

      socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await waitFor(() => {
        const joinMessage = messages.find((m) => m.type === "join-room");
        expect(joinMessage).toBeDefined();
      });

      const story = { title: "Test Story", link: "https://test.com" };

      act(() => {
        result.current.updateStory(story);
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "update-story");
        expect(message).toBeDefined();
        expect(message.data.story).toEqual(story);
      });
    });
  });
});
