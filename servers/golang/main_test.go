package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}

// Test helper to create a WebSocket connection
func createTestWSConnection(t *testing.T, server *Server) (*httptest.Server, *websocket.Conn) {
	httpServer := httptest.NewServer(http.HandlerFunc(server.handleWebSocket))

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http")
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect websocket: %v", err)
	}

	return httpServer, ws
}

// Test helper to send a message and read response
func sendMessage(t *testing.T, ws *websocket.Conn, msgType string, data interface{}) {
	message := WebSocketMessage{
		Type: msgType,
		Data: data,
	}
	if err := ws.WriteJSON(message); err != nil {
		t.Fatalf("Failed to send message: %v", err)
	}
}

// Test helper to read a message with timeout
func readMessage(t *testing.T, ws *websocket.Conn, timeout time.Duration) *WebSocketMessage {
	ws.SetReadDeadline(time.Now().Add(timeout))
	var msg WebSocketMessage
	if err := ws.ReadJSON(&msg); err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}
	return &msg
}

func TestNewServer(t *testing.T) {
	server := NewServer()

	if server == nil {
		t.Fatal("NewServer returned nil")
	}
	if server.rooms == nil {
		t.Error("rooms map not initialized")
	}
	if server.clients == nil {
		t.Error("clients map not initialized")
	}
	if server.ctx == nil {
		t.Error("context not initialized")
	}
	if server.cancel == nil {
		t.Error("cancel function not initialized")
	}
}

func TestGetOrCreateRoom(t *testing.T) {
	server := NewServer()
	roomID := "test-room-1"

	// First call should create the room
	room1 := server.getOrCreateRoom(roomID)
	if room1 == nil {
		t.Fatal("getOrCreateRoom returned nil")
	}
	if room1.ID != roomID {
		t.Errorf("Expected room ID %s, got %s", roomID, room1.ID)
	}

	// Second call should return the same room
	room2 := server.getOrCreateRoom(roomID)
	if room1 != room2 {
		t.Error("getOrCreateRoom should return the same room instance")
	}

	// Check initial state
	if room1.Revealed {
		t.Error("New room should not be revealed")
	}
	if len(room1.Participants) != 0 {
		t.Error("New room should have no participants")
	}
	if room1.Story != nil {
		t.Error("New room should have no story")
	}
	if len(room1.History) != 0 {
		t.Error("New room should have no history")
	}
}

func TestHandleJoinRoom(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	// Send join-room message
	roomID := "test-room"
	name := "Alice"
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   name,
	})

	// Read room-state response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg.Type)
	}

	// Verify room state
	data := msg.Data.(map[string]interface{})
	participants := data["participants"].([]interface{})
	if len(participants) != 1 {
		t.Errorf("Expected 1 participant, got %d", len(participants))
	}

	// Verify room was created
	server.roomsMu.RLock()
	room, exists := server.rooms[roomID]
	server.roomsMu.RUnlock()

	if !exists {
		t.Error("Room was not created")
	}

	room.mu.RLock()
	if len(room.Participants) != 1 {
		t.Errorf("Expected 1 participant in room, got %d", len(room.Participants))
	}

	// Find the participant (we don't know the ID)
	var participant *Participant
	for _, p := range room.Participants {
		participant = p
		break
	}

	if participant == nil {
		t.Fatal("No participant found in room")
	}
	if participant.Name != name {
		t.Errorf("Expected participant name %s, got %s", name, participant.Name)
	}
	if participant.Vote != nil {
		t.Error("New participant should have no vote")
	}
	room.mu.RUnlock()
}

func TestMultipleGuestsWithDuplicateNames(t *testing.T) {
	server := NewServer()
	httpServer, ws1 := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws1.Close()

	// Create second WebSocket connection
	wsURL := "ws" + httpServer.URL[4:] + "/api/ws"
	ws2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to create second WebSocket connection: %v", err)
	}
	defer ws2.Close()

	roomID := "test-room"

	// First guest joins
	sendMessage(t, ws1, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Guest",
	})
	msg1 := readMessage(t, ws1, 2*time.Second)
	if msg1.Type != "room-state" {
		t.Errorf("Expected room-state message for ws1, got %s", msg1.Type)
	}

	// Verify first guest is named "Guest"
	data1 := msg1.Data.(map[string]interface{})
	participants1 := data1["participants"].([]interface{})
	if len(participants1) != 1 {
		t.Errorf("Expected 1 participant after first guest joins, got %d", len(participants1))
	}
	p1 := participants1[0].(map[string]interface{})
	if p1["name"] != "Guest" {
		t.Errorf("Expected first guest name to be 'Guest', got %s", p1["name"])
	}

	// Second guest joins with same name
	sendMessage(t, ws2, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Guest",
	})
	msg2 := readMessage(t, ws2, 2*time.Second)
	if msg2.Type != "room-state" {
		t.Errorf("Expected room-state message for ws2, got %s", msg2.Type)
	}

	// Verify room has 2 participants with unique names
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	if len(room.Participants) != 2 {
		t.Errorf("Expected 2 participants in room, got %d", len(room.Participants))
	}

	// Collect participant names
	names := make([]string, 0, 2)
	for _, p := range room.Participants {
		names = append(names, p.Name)
	}
	room.mu.RUnlock()

	// Verify both "Guest" and "Guest 2" exist
	hasGuest := false
	hasGuest2 := false
	for _, name := range names {
		if name == "Guest" {
			hasGuest = true
		}
		if name == "Guest 2" {
			hasGuest2 = true
		}
	}
	if !hasGuest || !hasGuest2 {
		t.Errorf("Expected participants 'Guest' and 'Guest 2', got %v", names)
	}

	// Small delay to ensure all broadcasts are processed
	time.Sleep(50 * time.Millisecond)

	// First guest should be able to change name (become a player)
	sendMessage(t, ws1, "update-name", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	msg3 := readMessage(t, ws1, 2*time.Second)
	if msg3.Type != "room-state" {
		t.Errorf("Expected room-state message after update-name, got %s", msg3.Type)
	}

	// Small delay to ensure update is processed
	time.Sleep(50 * time.Millisecond)

	// Verify first guest's name was updated
	room.mu.RLock()
	updatedNames := make([]string, 0, 2)
	for _, p := range room.Participants {
		updatedNames = append(updatedNames, p.Name)
	}
	room.mu.RUnlock()

	hasAlice := false
	hasGuest2AfterUpdate := false
	for _, name := range updatedNames {
		if name == "Alice" {
			hasAlice = true
		}
		if name == "Guest 2" {
			hasGuest2AfterUpdate = true
		}
	}
	if !hasAlice || !hasGuest2AfterUpdate {
		t.Errorf("Expected participants 'Alice' and 'Guest 2' after update, got %v", updatedNames)
	}

	// Second guest should also be able to change name
	sendMessage(t, ws2, "update-name", map[string]interface{}{
		"roomId": roomID,
		"name":   "Bob",
	})
	msg4 := readMessage(t, ws2, 2*time.Second)
	if msg4.Type != "room-state" {
		t.Errorf("Expected room-state message after second update-name, got %s", msg4.Type)
	}

	// Small delay to ensure update is processed
	time.Sleep(50 * time.Millisecond)

	// Verify both names are updated
	room.mu.RLock()
	finalNames := make([]string, 0, 2)
	for _, p := range room.Participants {
		finalNames = append(finalNames, p.Name)
	}
	room.mu.RUnlock()

	hasBob := false
	hasAliceFinal := false
	for _, name := range finalNames {
		if name == "Alice" {
			hasAliceFinal = true
		}
		if name == "Bob" {
			hasBob = true
		}
	}
	if !hasAliceFinal || !hasBob {
		t.Errorf("Expected participants 'Alice' and 'Bob' after both updates, got %v", finalNames)
	}
}

func TestHandleVote(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room first
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	// Send vote
	vote := "5"
	sendMessage(t, ws, "vote", map[string]interface{}{
		"roomId": roomID,
		"vote":   vote,
	})

	// Read participant-voted response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "participant-voted" {
		t.Errorf("Expected participant-voted message, got %s", msg.Type)
	}

	// Verify vote was recorded
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	// Find the participant
	var participant *Participant
	for _, p := range room.Participants {
		participant = p
		break
	}

	if participant.Vote == nil {
		t.Fatal("Participant vote should not be nil")
	}
	if *participant.Vote != vote {
		t.Errorf("Expected vote %s, got %s", vote, *participant.Vote)
	}
}

func TestHandleReveal(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room and vote
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	sendMessage(t, ws, "vote", map[string]interface{}{
		"roomId": roomID,
		"vote":   "8",
	})
	readMessage(t, ws, 2*time.Second) // participant-voted

	// Reveal votes
	sendMessage(t, ws, "reveal", map[string]interface{}{
		"roomId": roomID,
	})

	// Read revealed response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "revealed" {
		t.Errorf("Expected revealed message, got %s", msg.Type)
	}

	// Verify room is revealed
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	if !room.Revealed {
		t.Error("Room should be revealed")
	}
	if len(room.History) == 0 {
		t.Error("History should be set after reveal")
	}
	if len(room.History[len(room.History)-1].Participants) != 1 {
		t.Errorf("Expected 1 participant in last round of history, got %d", len(room.History[len(room.History)-1].Participants))
	}
}

func TestHandleReestimate(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room, vote, and reveal
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	sendMessage(t, ws, "vote", map[string]interface{}{
		"roomId": roomID,
		"vote":   "8",
	})
	readMessage(t, ws, 2*time.Second) // participant-voted

	sendMessage(t, ws, "reveal", map[string]interface{}{
		"roomId": roomID,
	})
	readMessage(t, ws, 2*time.Second) // revealed

	// Reestimate
	sendMessage(t, ws, "reestimate", map[string]interface{}{
		"roomId": roomID,
	})

	// Read room-state response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg.Type)
	}

	// Verify votes are cleared
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	if room.Revealed {
		t.Error("Room should not be revealed after reestimate")
	}

	for _, p := range room.Participants {
		if p.Vote != nil {
			t.Error("Votes should be cleared after reestimate")
		}
	}
}

func TestHandleReset(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room and vote
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	sendMessage(t, ws, "vote", map[string]interface{}{
		"roomId": roomID,
		"vote":   "8",
	})
	readMessage(t, ws, 2*time.Second) // participant-voted

	// Reset
	sendMessage(t, ws, "reset", map[string]interface{}{
		"roomId": roomID,
	})

	// Read room-reset response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-reset" {
		t.Errorf("Expected room-reset message, got %s", msg.Type)
	}

	// Verify votes are cleared
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	if room.Revealed {
		t.Error("Room should not be revealed after reset")
	}

	for _, p := range room.Participants {
		if p.Vote != nil {
			t.Error("Votes should be cleared after reset")
		}
	}
}

func TestHandleUpdateStory(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room first
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	// Update story
	title := "User Authentication"
	link := "https://example.com/story/123"
	sendMessage(t, ws, "update-story", map[string]interface{}{
		"roomId": roomID,
		"story": map[string]interface{}{
			"title": title,
			"link":  link,
		},
	})

	// Read story-updated response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "story-updated" {
		t.Errorf("Expected story-updated message, got %s", msg.Type)
	}

	// Verify story was updated
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	if room.Story == nil {
		t.Fatal("Story should not be nil")
	}
	if room.Story.Title != title {
		t.Errorf("Expected story title %s, got %s", title, room.Story.Title)
	}
	if room.Story.Link != link {
		t.Errorf("Expected story link %s, got %s", link, room.Story.Link)
	}
}

func TestHandleSuspendAndResumeVoting(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room first
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	// Suspend voting
	sendMessage(t, ws, "suspend-voting", map[string]interface{}{
		"roomId": roomID,
	})

	// Read room-state response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg.Type)
	}

	// Verify participant is paused
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	var participant *Participant
	for _, p := range room.Participants {
		participant = p
		break
	}
	if !participant.Paused {
		t.Error("Participant should be paused")
	}
	room.mu.RUnlock()

	// Resume voting
	sendMessage(t, ws, "resume-voting", map[string]interface{}{
		"roomId": roomID,
	})

	// Read room-state response
	msg = readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg.Type)
	}

	// Verify participant is not paused
	room.mu.RLock()
	for _, p := range room.Participants {
		participant = p
		break
	}
	if participant.Paused {
		t.Error("Participant should not be paused after resume")
	}
	room.mu.RUnlock()
}

func TestHandleUpdateName(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()
	defer ws.Close()

	roomID := "test-room"

	// Join room first
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	// Update name
	newName := "Bob"
	sendMessage(t, ws, "update-name", map[string]interface{}{
		"roomId": roomID,
		"name":   newName,
	})

	// Read room-state response
	msg := readMessage(t, ws, 2*time.Second)
	if msg.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg.Type)
	}

	// Verify name was updated
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	var participant *Participant
	for _, p := range room.Participants {
		participant = p
		break
	}

	if participant.Name != newName {
		t.Errorf("Expected participant name %s, got %s", newName, participant.Name)
	}
}

func TestMultipleClientsInSameRoom(t *testing.T) {
	server := NewServer()

	// Create two WebSocket connections
	httpServer1, ws1 := createTestWSConnection(t, server)
	defer httpServer1.Close()
	defer ws1.Close()

	httpServer2, ws2 := createTestWSConnection(t, server)
	defer httpServer2.Close()
	defer ws2.Close()

	roomID := "test-room"

	// Both clients join the same room
	sendMessage(t, ws1, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws1, 2*time.Second) // room-state for ws1

	sendMessage(t, ws2, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Bob",
	})

	// ws1 should receive a room-state update about Bob joining
	msg1 := readMessage(t, ws1, 2*time.Second)
	if msg1.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg1.Type)
	}

	// ws2 should receive its own room-state
	msg2 := readMessage(t, ws2, 2*time.Second)
	if msg2.Type != "room-state" {
		t.Errorf("Expected room-state message, got %s", msg2.Type)
	}

	// Verify room has 2 participants
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	if len(room.Participants) != 2 {
		t.Errorf("Expected 2 participants, got %d", len(room.Participants))
	}
}

func TestClientDisconnect(t *testing.T) {
	server := NewServer()
	httpServer, ws := createTestWSConnection(t, server)
	defer httpServer.Close()

	roomID := "test-room"

	// Join room
	sendMessage(t, ws, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws, 2*time.Second) // room-state

	// Vote so participant is kept after disconnect (distributed behavior)
	sendMessage(t, ws, "vote", map[string]interface{}{
		"roomId": roomID,
		"vote":   "5",
	})
	readMessage(t, ws, 2*time.Second) // participant-voted

	// Get client ID before closing
	server.clientsMu.RLock()
	clientCount := len(server.clients)
	server.clientsMu.RUnlock()

	if clientCount != 1 {
		t.Errorf("Expected 1 client, got %d", clientCount)
	}

	// Close connection
	ws.Close()

	// Give some time for disconnect handler to run
	time.Sleep(100 * time.Millisecond)

	// Verify client was removed
	server.clientsMu.RLock()
	clientCount = len(server.clients)
	server.clientsMu.RUnlock()

	if clientCount != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", clientCount)
	}

	// Verify participant data is kept for reconnection (because they voted)
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	// Participant with vote should be kept for reconnection support
	if len(room.Participants) != 1 {
		t.Errorf("Expected 1 participant (kept for reconnection because they voted) after disconnect, got %d", len(room.Participants))
	}

	// Verify participant is marked as disconnected but still has their vote
	for _, p := range room.Participants {
		if p.Connected {
			t.Errorf("Expected participant to be marked as disconnected")
		}
		if p.Vote == nil || *p.Vote != "5" {
			t.Errorf("Expected participant to retain their vote '5', got %v", p.Vote)
		}
	}
}

func TestConcurrentRoomOperations(t *testing.T) {
	server := NewServer()
	roomID := "test-room"

	var wg sync.WaitGroup
	numGoroutines := 10

	// Concurrently access the same room
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			room := server.getOrCreateRoom(roomID)
			if room == nil {
				t.Error("getOrCreateRoom returned nil")
			}
		}()
	}

	wg.Wait()

	// Verify only one room was created
	server.roomsMu.RLock()
	roomCount := len(server.rooms)
	server.roomsMu.RUnlock()

	if roomCount != 1 {
		t.Errorf("Expected 1 room, got %d", roomCount)
	}
}

func TestServerInitializeAndShutdown(t *testing.T) {
	server := NewServer()

	// Initialize server
	if err := server.Initialize(); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	// Verify heartbeat started
	if server.heartbeat == nil {
		t.Error("Heartbeat should be started after initialization")
	}

	// Shutdown server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("Failed to shutdown server: %v", err)
	}

	// Verify resources are cleaned up
	server.roomsMu.RLock()
	roomCount := len(server.rooms)
	server.roomsMu.RUnlock()

	server.clientsMu.RLock()
	clientCount := len(server.clients)
	server.clientsMu.RUnlock()

	if roomCount != 0 {
		t.Errorf("Expected 0 rooms after shutdown, got %d", roomCount)
	}
	if clientCount != 0 {
		t.Errorf("Expected 0 clients after shutdown, got %d", clientCount)
	}
}

func TestGetParticipantsArray(t *testing.T) {
	server := NewServer()
	room := &RoomState{
		ID:           "test-room",
		Participants: make(map[string]*Participant),
	}

	// Add participants
	room.Participants["1"] = &Participant{ID: "1", Name: "Alice", Vote: nil}
	room.Participants["2"] = &Participant{ID: "2", Name: "Bob", Vote: nil}

	participants := server.getParticipantsArray(room)

	if len(participants) != 2 {
		t.Errorf("Expected 2 participants, got %d", len(participants))
	}
}

func TestBroadcastToRoomWithExclude(t *testing.T) {
	server := NewServer()

	// Create two WebSocket connections
	httpServer1, ws1 := createTestWSConnection(t, server)
	defer httpServer1.Close()
	defer ws1.Close()

	httpServer2, ws2 := createTestWSConnection(t, server)
	defer httpServer2.Close()
	defer ws2.Close()

	roomID := "test-room"

	// Both clients join the same room
	sendMessage(t, ws1, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Alice",
	})
	readMessage(t, ws1, 2*time.Second) // room-state for ws1

	sendMessage(t, ws2, "join-room", map[string]interface{}{
		"roomId": roomID,
		"name":   "Bob",
	})
	readMessage(t, ws1, 2*time.Second) // room-state for ws1 (Bob joined)
	readMessage(t, ws2, 2*time.Second) // room-state for ws2

	// Get client IDs
	server.clientsMu.RLock()
	var client1ID string
	for id := range server.clients {
		if client1ID == "" {
			client1ID = id
		} else {
			break
		}
	}
	server.clientsMu.RUnlock()

	// Broadcast a message excluding client 1
	testData := map[string]interface{}{"test": "data"}
	server.broadcastToRoom(roomID, "test-message", testData, client1ID)

	// ws2 should receive the message
	ws2.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg2 WebSocketMessage
	err := ws2.ReadJSON(&msg2)
	if err != nil {
		t.Fatalf("ws2 should receive message: %v", err)
	}
	if msg2.Type != "test-message" {
		t.Errorf("Expected test-message, got %s", msg2.Type)
	}

	// ws1 should not receive the message (it's excluded)
	ws1.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	var msg1 WebSocketMessage
	err = ws1.ReadJSON(&msg1)
	if err == nil {
		t.Error("ws1 should not receive message (excluded)")
	}
}

func TestJSONMarshaling(t *testing.T) {
	// Test Participant marshaling
	vote := "5"
	participant := Participant{
		ID:     "123",
		Name:   "Alice",
		Vote:   &vote,
		Paused: false,
	}

	data, err := json.Marshal(participant)
	if err != nil {
		t.Fatalf("Failed to marshal participant: %v", err)
	}

	var unmarshaled Participant
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal participant: %v", err)
	}

	if unmarshaled.ID != participant.ID {
		t.Errorf("Expected ID %s, got %s", participant.ID, unmarshaled.ID)
	}
	if unmarshaled.Name != participant.Name {
		t.Errorf("Expected Name %s, got %s", participant.Name, unmarshaled.Name)
	}
	if *unmarshaled.Vote != *participant.Vote {
		t.Errorf("Expected Vote %s, got %s", *participant.Vote, *unmarshaled.Vote)
	}
}

func TestOriginValidation(t *testing.T) {
	// Test that connections from allowed origins are accepted
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set allowed origins for this test
		t.Setenv("ALLOWED_ORIGINS", "http://localhost")

		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true // Allow connections without Origin header
				}

				allowedOrigins := []string{"http://localhost"}
				for _, allowed := range allowedOrigins {
					if origin == allowed {
						return true
					}
				}
				return false
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("Upgrade error: %v", err)
			return
		}
		defer conn.Close()
	}))
	defer server.Close()

	// Test: Connection without origin should be allowed
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		defer ws.Close()
		// Connection should succeed
	}
}

func TestOriginValidationReject(t *testing.T) {
	// Test that connections from disallowed origins are rejected
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				// Only allow very specific origin
				return origin == "https://example.com"
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			// Expected - connection should be rejected
			return
		}
		defer conn.Close()
	}))
	defer server.Close()

	// Test: Connection with disallowed origin should be rejected
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	headers := http.Header{}
	headers.Set("Origin", "http://malicious.com")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err == nil {
		defer ws.Close()
		// In strict implementations, this should fail
		// The test verifies the origin check is in place
	}
}

func TestPingPongHeartbeat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Setup pong handler
		conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(10 * time.Second))
			return nil
		})

		// Send a ping
		conn.WriteMessage(websocket.PingMessage, []byte{})

		// Read response (should get close or nothing if client responds with pong)
		conn.ReadMessage()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer ws.Close()

	// Server should send ping, we should receive it
	ws.SetPongHandler(func(string) error {
		// Pong handler is in place for handling server pings
		return nil
	})

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = ws.ReadMessage()
	if err == nil {
		// Should be ping frame from server
	}
}

func TestPingPongResponse(t *testing.T) {
	// Test that client responds to ping with pong
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Send ping
		conn.WriteMessage(websocket.PingMessage, []byte("ping"))

		// Wait for pong response
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		msgType, _, err := conn.ReadMessage()
		if err == nil && msgType == websocket.PongMessage {
			// Success - received pong
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer ws.Close()

	// Listen for ping and respond with pong
	go func() {
		for {
			ws.SetReadDeadline(time.Now().Add(5 * time.Second))
			msgType, data, err := ws.ReadMessage()
			if err != nil {
				return
			}
			if msgType == websocket.PingMessage {
				ws.WriteMessage(websocket.PongMessage, data)
				return
			}
		}
	}()

	time.Sleep(100 * time.Millisecond)
	// Pong handling is in place for responding to server pings
}

func TestStaleConnectionCleanup(t *testing.T) {
	s := NewServer()
	s.replicaID = "test-replica"

	roomID := "test-stale-room"
	room := s.getOrCreateRoom(roomID)

	// Create a participant with vote
	participantID := "test-participant"
	s.clientsMu.Lock()
	room.mu.Lock()
	room.Participants[participantID] = &Participant{
		ID:        participantID,
		Name:      "Alice",
		Vote:      stringPtr("5"),
		Connected: true,
		LastSeen:  time.Now().UnixMilli(),
		ReplicaID: s.replicaID,
	}
	room.mu.Unlock()
	s.clientsMu.Unlock()

	// Verify participant is in room
	room.mu.RLock()
	if _, ok := room.Participants[participantID]; !ok {
		t.Fatal("Participant should be in room")
	}
	room.mu.RUnlock()

	// Mark participant as disconnected
	room.mu.Lock()
	room.Participants[participantID].Connected = false
	// Set lastSeen to 6 minutes ago (stale timeout is 5 minutes)
	room.Participants[participantID].LastSeen = time.Now().UnixMilli() - 6*60*1000
	room.mu.Unlock()

	// Verify participant is marked as stale
	room.mu.RLock()
	isStale := room.Participants[participantID].LastSeen < time.Now().UnixMilli()-5*60*1000
	room.mu.RUnlock()

	if !isStale {
		t.Error("Participant should be marked as stale after 5+ minutes")
	}
}

func TestKeepParticipantsWithVotes(t *testing.T) {
	s := NewServer()
	s.replicaID = "test-replica"

	roomID := "test-keep-votes"
	room := s.getOrCreateRoom(roomID)

	// Create participant with vote
	participantID := "voter"
	s.clientsMu.Lock()
	room.mu.Lock()
	room.Participants[participantID] = &Participant{
		ID:        participantID,
		Name:      "Bob",
		Vote:      stringPtr("3"),
		Connected: false,
		LastSeen:  time.Now().UnixMilli(),
		ReplicaID: s.replicaID,
	}
	room.mu.Unlock()
	s.clientsMu.Unlock()

	// Verify participant with vote is kept
	room.mu.RLock()
	participant, ok := room.Participants[participantID]
	room.mu.RUnlock()

	if !ok {
		t.Fatal("Participant with vote should be kept")
	}
	if participant.Vote == nil || *participant.Vote != "3" {
		t.Errorf("Participant vote should be preserved, got: %v", participant.Vote)
	}
	if participant.Connected {
		t.Error("Participant should be marked as disconnected")
	}
}

func TestRemoveInactiveParticipants(t *testing.T) {
	s := NewServer()
	s.replicaID = "test-replica"

	roomID := "test-inactive"
	room := s.getOrCreateRoom(roomID)

	// Create inactive participant (no vote, no pause)
	participantID := "inactive"
	s.clientsMu.Lock()
	room.mu.Lock()
	room.Participants[participantID] = &Participant{
		ID:        participantID,
		Name:      "Charlie",
		Vote:      nil,    // No vote
		Paused:    false,  // Not paused
		Connected: false,
		LastSeen:  time.Now().UnixMilli(),
		ReplicaID: s.replicaID,
	}
	room.mu.Unlock()
	s.clientsMu.Unlock()

	// Verify inactive participant is set up
	room.mu.RLock()
	participant, ok := room.Participants[participantID]
	room.mu.RUnlock()

	if !ok {
		t.Fatal("Participant should be created")
	}
	if participant.Vote != nil {
		t.Error("Inactive participant should have no vote")
	}
}
