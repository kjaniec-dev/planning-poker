import { renderHook, act, waitFor } from "@testing-library/react";
import { Server as MockWebSocketServer } from "mock-socket";
import { useRealtime } from "../useRealtime";
import * as wsClient from "../wsClient";

// Mock window.location
delete (window as any).location;
(window as any).location = {
  origin: "http://localhost:3000",
};

describe("useRealtime", () => {
  let mockServer: MockWebSocketServer;
  const wsUrl = "ws://localhost:3000/api/ws";

  beforeEach(() => {
    mockServer = new MockWebSocketServer(wsUrl);
    jest.clearAllMocks();
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

      renderHook(() => useRealtime("test-room", ""));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing roomId or userName"),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it("should unsubscribe on unmount", () => {
      const unsubscribeSpy = jest.fn();
      jest
        .spyOn(wsClient, "subscribeToMessages")
        .mockReturnValue(unsubscribeSpy);

      const { unmount } = renderHook(() => useRealtime("test-room", "Alice"));

      unmount();

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });

  describe("state management - room-state", () => {
    it("should update participants from room-state message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await act(async () => {
        mockServer.emit("connection", mockServer.clients()[0]);
      });

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
        expect(result.current.revealed).toBe(false);
        expect(result.current.isConnected).toBe(true);
      });
    });

    it("should update revealed state", async () => {
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
              participants: [{ id: "1", name: "Alice", vote: "5" }],
              revealed: true,
              story: null,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.revealed).toBe(true);
      });
    });

    it("should update story state", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const story = { title: "Test Story", link: "https://example.com" };

      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [],
              revealed: false,
              story,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.story).toEqual(story);
      });
    });
  });

  describe("state management - participant-voted", () => {
    it("should update participant vote status", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      // First, set initial room state
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
      });

      // Then, send participant-voted message
      act(() => {
        socket.send(
          JSON.stringify({
            type: "participant-voted",
            data: { id: "1", hasVote: true },
          })
        );
      });

      await waitFor(() => {
        const alice = result.current.participants.find((p) => p.id === "1");
        expect(alice?.vote).toBe("hidden");
      });
    });

    it("should clear vote when hasVote is false", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      // Set initial state with a vote
      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [{ id: "1", name: "Alice", vote: "hidden" }],
              revealed: false,
              story: null,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.participants[0].vote).toBe("hidden");
      });

      // Clear vote
      act(() => {
        socket.send(
          JSON.stringify({
            type: "participant-voted",
            data: { id: "1", hasVote: false },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.participants[0].vote).toBeNull();
      });
    });
  });

  describe("state management - revealed", () => {
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
        expect(result.current.lastRound).toEqual(revealedData.lastRound);
      });
    });
  });

  describe("state management - room-reset", () => {
    it("should reset room state", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      // Set some state first
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
        expect(result.current.story).toBeDefined();
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
        expect(result.current.participants[0].vote).toBeNull();
      });
    });
  });

  describe("state management - story-updated", () => {
    it("should update story", async () => {
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

      act(() => {
        result.current.vote("5");
      });

      await waitFor(() => {
        const voteMessage = messages.find((m) => m.type === "vote");
        expect(voteMessage).toBeDefined();
        expect(voteMessage.data.vote).toBe("5");
        expect(voteMessage.data.roomId).toBe("test-room");
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
        expect(revealMessage.data.roomId).toBe("test-room");
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

      act(() => {
        result.current.reestimate();
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "reestimate");
        expect(message).toBeDefined();
      });
    });

    it("should send reset message", async () => {
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
        result.current.reset();
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "reset");
        expect(message).toBeDefined();
      });
    });

    it("should send update-story message", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];
      const messages: any[] = [];

      socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
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

    it("should send suspend-voting message", async () => {
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
        result.current.suspendVoting();
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "suspend-voting");
        expect(message).toBeDefined();
      });
    });

    it("should send resume-voting message", async () => {
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
        result.current.resumeVoting();
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "resume-voting");
        expect(message).toBeDefined();
      });
    });

    it("should send update-name message", async () => {
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
        result.current.updateName("Bob");
      });

      await waitFor(() => {
        const message = messages.find((m) => m.type === "update-name");
        expect(message).toBeDefined();
        expect(message.data.name).toBe("Bob");
      });
    });
  });

  describe("connection status", () => {
    it("should set isConnected to true on room-state", async () => {
      const { result } = renderHook(() => useRealtime("test-room", "Alice"));

      expect(result.current.isConnected).toBe(false);

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      act(() => {
        socket.send(
          JSON.stringify({
            type: "room-state",
            data: {
              participants: [],
              revealed: false,
              story: null,
              lastRound: null,
            },
          })
        );
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });
  });

  describe("unknown message types", () => {
    it("should warn about unknown message types", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      renderHook(() => useRealtime("test-room", "Alice"));

      await waitFor(() => {
        expect(mockServer.clients().length).toBe(1);
      });

      const socket = mockServer.clients()[0];

      act(() => {
        socket.send(
          JSON.stringify({
            type: "unknown-type",
            data: {},
          })
        );
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unknown message type"),
          "unknown-type"
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
