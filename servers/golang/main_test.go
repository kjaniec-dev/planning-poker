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
	if room1.LastRound != nil {
		t.Error("New room should have no last round")
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
	if room.LastRound == nil {
		t.Error("LastRound should be set after reveal")
	}
	if len(room.LastRound.Participants) != 1 {
		t.Errorf("Expected 1 participant in last round, got %d", len(room.LastRound.Participants))
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

	// Verify participant data is kept for potential reconnection
	server.roomsMu.RLock()
	room := server.rooms[roomID]
	server.roomsMu.RUnlock()

	room.mu.RLock()
	defer room.mu.RUnlock()

	// Participant should still be in room for reconnection support
	if len(room.Participants) != 1 {
		t.Errorf("Expected 1 participant (kept for reconnection) after disconnect, got %d", len(room.Participants))
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
