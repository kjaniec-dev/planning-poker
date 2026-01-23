package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type Participant struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Vote          *string `json:"vote"`
	Paused        bool    `json:"paused,omitempty"`
	ParticipantId string  `json:"participantId,omitempty"`
	Connected     bool    `json:"connected"`
	LastSeen      int64   `json:"lastSeen,omitempty"`
	ReplicaID     string  `json:"replicaId,omitempty"` // Track which replica owns this connection
}

type Story struct {
	Title string `json:"title"`
	Link  string `json:"link"`
}

type HistoryRound struct {
	ID           string        `json:"id"`
	Story        *Story        `json:"story"`
	Participants []Participant `json:"participants"`
	RevealedAt   int64         `json:"revealedAt"`
}

type Timer struct {
	EndTime  *int64 `json:"endTime"`
	Duration int    `json:"duration"`
}

type RoomState struct {
	ID           string                  `json:"id"`
	Participants map[string]*Participant `json:"participants"`
	Revealed     bool                    `json:"revealed"`
	AutoReveal   bool                    `json:"autoReveal"`
	Timer        *Timer                  `json:"timer"`
	Story        *Story                  `json:"story"`
	History      []HistoryRound          `json:"history"`
	mu           sync.RWMutex
}

type WebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type RedisMessage struct {
	Type      string      `json:"type"`
	RoomID    string      `json:"roomId"`
	Data      interface{} `json:"data"`
	ExcludeID string      `json:"excludeId,omitempty"`
}

type ExtendedWebSocket struct {
	*websocket.Conn
	ID      string
	RoomID  string
	IsAlive atomic.Bool
}

type Server struct {
	rooms       map[string]*RoomState
	roomsMu     sync.RWMutex
	redisPub    *redis.Client
	redisSub    *redis.Client
	clients     map[string]*ExtendedWebSocket
	clientsMu   sync.RWMutex
	upgrader    websocket.Upgrader
	ctx         context.Context
	cancel      context.CancelFunc
	heartbeat   *time.Ticker
	replicaID   string // Unique ID for this replica instance
}

func NewServer() *Server {
	ctx, cancel := context.WithCancel(context.Background())

	// Generate unique replica ID from hostname or random value
	replicaID := os.Getenv("HOSTNAME")
	if replicaID == "" {
		replicaID = generateID()
	}

	s := &Server{
		rooms:     make(map[string]*RoomState),
		clients:   make(map[string]*ExtendedWebSocket),
		ctx:       ctx,
		cancel:    cancel,
		replicaID: replicaID,
	}

	// Configure WebSocket upgrader with origin validation
	s.upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // Allow connections without Origin header (e.g., native clients)
			}

			allowedOrigins := getAllowedOrigins()
			for _, allowed := range allowedOrigins {
				if origin == allowed {
					return true
				}
			}

			log.Printf("Rejected WebSocket connection from origin: %s", origin)
			return false
		},
	}

	return s
}

func (s *Server) getOrCreateRoom(roomID string) *RoomState {
	s.roomsMu.Lock()
	if room, exists := s.rooms[roomID]; exists {
		s.roomsMu.Unlock()
		return room
	}

	// Try to load from Redis first
	loadedRoom := s.loadRoomState(roomID)
	if loadedRoom != nil {
		s.rooms[roomID] = loadedRoom
		s.roomsMu.Unlock()
		return loadedRoom
	}

	room := &RoomState{
		ID:           roomID,
		Participants: make(map[string]*Participant),
		Revealed:     false,
		AutoReveal:   false,
		Timer:        nil,
		Story:        nil,
		History:      []HistoryRound{},
	}
	s.rooms[roomID] = room
	s.roomsMu.Unlock()
	return room
}

func (s *Server) saveRoomState(roomID string) {
	if s.redisPub == nil {
		return
	}

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.RLock()
	payload, err := json.Marshal(room)
	room.mu.RUnlock()

	if err != nil {
		log.Printf("Error marshaling room state for %s: %v", roomID, err)
		return
	}

	key := "room:" + roomID
	if err := s.redisPub.Set(s.ctx, key, payload, 24*time.Hour).Err(); err != nil {
		log.Printf("Error saving room state to Redis for %s: %v", roomID, err)
	}

	// Notify other replicas to refresh their local state
	// We use room-updated to signal a full refresh from Redis
	s.publishToRedis(roomID, "room-updated", nil, "")
}

func (s *Server) loadRoomState(roomID string) *RoomState {
	if s.redisPub == nil {
		return nil
	}

	key := "room:" + roomID
	payload, err := s.redisPub.Get(s.ctx, key).Result()
	if err == redis.Nil {
		return nil
	} else if err != nil {
		log.Printf("Error loading room state from Redis for %s: %v", roomID, err)
		return nil
	}

	var room RoomState
	if err := json.Unmarshal([]byte(payload), &room); err != nil {
		log.Printf("Error unmarshaling room state for %s: %v", roomID, err)
		return nil
	}

	// Ensure internal mutex is initialized (not serialized)
	room.mu = sync.RWMutex{}

	// Aggregated connection status: if we unmarshal from Redis, we don't know
	// which replica is actually holding the connection.
	// But we know that Participant.Connected=true means someone IS connected.

	// Ensure maps are initialized if they were null in JSON
	if room.Participants == nil {
		room.Participants = make(map[string]*Participant)
	}
	if room.History == nil {
		room.History = []HistoryRound{}
	}

	return &room
}


func (s *Server) sendToClient(ws *ExtendedWebSocket, msgType string, data interface{}) {
	message := WebSocketMessage{
		Type: msgType,
		Data: data,
	}

	if ws.Conn != nil && ws.Conn.UnderlyingConn() != nil {
		if err := ws.WriteJSON(message); err != nil {
			log.Printf("Error sending message to client %s: %v", ws.ID, err)
		}
	}
}

func (s *Server) broadcastToRoom(roomID string, msgType string, data interface{}, excludeID ...string) {
	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	message := WebSocketMessage{
		Type: msgType,
		Data: data,
	}

	excludeMap := make(map[string]bool)
	for _, id := range excludeID {
		if id != "" {
			excludeMap[id] = true
		}
	}

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for id := range room.Participants {
		if !excludeMap[id] {
			if client, ok := s.clients[id]; ok {
				// Use a non-blocking or at least robust write
				// (WriteJSON is blocking, but we can't easily make it non-blocking here without complexity)
				if err := client.WriteJSON(message); err != nil {
					log.Printf("Error broadcasting to client %s in room %s: %v", id, roomID, err)
				}
			}
		}
	}
}

func (s *Server) setupRedisSubscription() {
	if s.redisSub == nil {
		return
	}

	pubsub := s.redisSub.Subscribe(s.ctx, "ws-broadcast")
	ch := pubsub.Channel()

	log.Println("✓ Subscribed to ws-broadcast channel")

	go func() {
		for {
			select {
			case msg := <-ch:
				if msg == nil {
					return
				}
				var redisMsg RedisMessage
				if err := json.Unmarshal([]byte(msg.Payload), &redisMsg); err != nil {
					log.Printf("Redis message parse error: %v", err)
					continue
				}
				if redisMsg.Type == "room-updated" {
					// Reload state from Redis
					loadedRoom := s.loadRoomState(redisMsg.RoomID)
					if loadedRoom != nil {
						s.roomsMu.Lock()
						s.rooms[redisMsg.RoomID] = loadedRoom
						s.roomsMu.Unlock()
						// Optionally broadcast the new state to local clients
						s.broadcastRoomState(redisMsg.RoomID)
					}
				} else if redisMsg.Type == "participant-moved" {
					if data, ok := redisMsg.Data.(map[string]interface{}); ok {
						pID, _ := data["participantId"].(string)
						newRoomID, _ := data["newRoomId"].(string)
						if pID != "" && newRoomID != "" {
							s.handleGlobalParticipantMoved(pID, newRoomID)
						}
					}
				} else {
					s.broadcastToRoom(redisMsg.RoomID, redisMsg.Type, redisMsg.Data, redisMsg.ExcludeID)
				}
			case <-s.ctx.Done():
				pubsub.Close()
				return
			}
		}
	}()
}

func (s *Server) publishToRedis(roomID string, msgType string, data interface{}, excludeID string) {
	if s.redisPub == nil {
		return
	}

	redisMsg := RedisMessage{
		Type:      msgType,
		RoomID:    roomID,
		Data:      data,
		ExcludeID: excludeID,
	}

	payload, err := json.Marshal(redisMsg)
	if err != nil {
		log.Printf("Error marshaling Redis message: %v", err)
		return
	}

	if err := s.redisPub.Publish(s.ctx, "ws-broadcast", string(payload)).Err(); err != nil {
		log.Printf("Error publishing to Redis: %v", err)
	}
}

func (s *Server) emitToRoom(roomID string, msgType string, data interface{}, excludeID string) {
	s.broadcastToRoom(roomID, msgType, data, excludeID)

	if s.redisPub != nil {
		s.publishToRedis(roomID, msgType, data, excludeID)
	}
}

func (s *Server) deleteRoomIfEmpty(roomID string) {
	s.roomsMu.Lock()
	defer s.roomsMu.Unlock()

	if room, exists := s.rooms[roomID]; exists {
		room.mu.RLock()
		participantCount := len(room.Participants)
		room.mu.RUnlock()

		if participantCount == 0 {
			log.Printf("🧹 Deleting empty room: %s", roomID)
			delete(s.rooms, roomID)
		}
	}
}

func (s *Server) startHeartbeat() {
	s.heartbeat = time.NewTicker(30 * time.Second)
	cleanupTicker := time.NewTicker(1 * time.Minute)

	go func() {
		for {
			select {
			case <-s.heartbeat.C:
				s.clientsMu.Lock()
				for _, client := range s.clients {
					if !client.IsAlive.Load() {
						client.Close()
					} else {
						client.IsAlive.Store(false)
						client.WriteMessage(websocket.PingMessage, []byte{})
					}
				}
				s.clientsMu.Unlock()
			case <-cleanupTicker.C:
				s.cleanupStaleParticipants()
			case <-s.ctx.Done():
				cleanupTicker.Stop()
				return
			}
		}
	}()
}

func (s *Server) cleanupStaleParticipants() {
	s.roomsMu.RLock()
	rooms := make([]*RoomState, 0, len(s.rooms))
	for _, room := range s.rooms {
		rooms = append(rooms, room)
	}
	s.roomsMu.RUnlock()

	now := time.Now().UnixMilli()
	// 5 minutes timeout for offline users
	const staleTimeout = 5 * 60 * 1000

	for _, room := range rooms {
		room.mu.Lock()
		removed := false
		for id, p := range room.Participants {
			// Only manage participants that belong to THIS replica
			if p.ReplicaID != s.replicaID {
				// This participant belongs to another replica - don't touch it
				continue
			}

			// Check if connected locally (should be since this is our replica)
			s.clientsMu.RLock()
			_, isConnectedLocally := s.clients[id]
			s.clientsMu.RUnlock()

			if isConnectedLocally {
				p.Connected = true
				p.LastSeen = now
				continue
			}

			// Not connected locally and belongs to this replica
			// If they were marked connected but aren't anymore, update status
			if p.Connected {
				p.Connected = false
				p.LastSeen = now
			}

			// If disconnected for too long, remove them
			if !p.Connected && p.LastSeen > 0 && (now-p.LastSeen) > staleTimeout {
				log.Printf("🧹 Removing stale participant %s from room %s (offline for %dms)", id, room.ID, now-p.LastSeen)
				delete(room.Participants, id)
				removed = true
			}
		}
		roomID := room.ID
		room.mu.Unlock()

		if removed {
			// Delete room if empty
			s.deleteRoomIfEmpty(roomID)

			s.broadcastRoomState(roomID)
			s.saveRoomStateWithoutNotify(roomID)
		}
	}
}

func (s *Server) saveRoomStateWithoutNotify(roomID string) {
	if s.redisPub == nil {
		return
	}

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.RLock()
	payload, err := json.Marshal(room)
	room.mu.RUnlock()

	if err != nil {
		log.Printf("Error marshaling room state for %s: %v", roomID, err)
		return
	}

	key := "room:" + roomID
	if err := s.redisPub.Set(s.ctx, key, payload, 24*time.Hour).Err(); err != nil {
		log.Printf("Error saving room state to Redis for %s: %v", roomID, err)
	}
}

func (s *Server) handleJoinRoom(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, ok := data["roomId"].(string)
	if !ok {
		log.Printf("❌ Invalid roomId in join-room event")
		return
	}
	name, _ := data["name"].(string)
	participantId, _ := data["participantId"].(string)
	log.Printf("📥 join-room: roomId=%s, name=%s, participantId=%s, clientId=%s", roomID, name, participantId, ws.ID)

	// If the client was already in another room, remove them from that room first
	if ws.RoomID != "" && ws.RoomID != roomID {
		s.roomsMu.RLock()
		oldRoom, exists := s.rooms[ws.RoomID]
		s.roomsMu.RUnlock()
		if exists {
			log.Printf("🚪 Removing client %s from old room %s", ws.ID, ws.RoomID)
			oldRoom.mu.Lock()
			delete(oldRoom.Participants, ws.ID)
			oldRoom.mu.Unlock()
			s.broadcastRoomState(ws.RoomID)
			s.saveRoomState(ws.RoomID)
		}
	}

	ws.RoomID = roomID
	room := s.getOrCreateRoom(roomID)

	room.mu.Lock()
	// First, try to match by participantId if provided
	var existingParticipant *Participant
	var oldID string

	if participantId != "" {
		// Announce to all replicas that this participant has moved to this room
		// This helps remove "ghosts" from other rooms
		s.publishToRedis(roomID, "participant-moved", map[string]string{
			"participantId": participantId,
			"newRoomId":      roomID,
		}, ws.ID)

		for id, participant := range room.Participants {
			if participant.ParticipantId == participantId {
				existingParticipant = participant
				oldID = id
				break
			}
		}
	}

	// If no participantId match, fall back to matching by name (backwards compatibility)
	if existingParticipant == nil {
		for id, participant := range room.Participants {
			// Match by name AND check if that participant is actually disconnected
			// (If someone is already connected with that name, we don't restore)
			s.clientsMu.RLock()
			isDisconnected := s.clients[id] == nil
			s.clientsMu.RUnlock()

			if participant.Name == name && isDisconnected {
				existingParticipant = participant
				oldID = id
				break
			}
		}
	}

	// Check if this is a reconnection or a duplicate name from an active connection
	// If we matched by name above, we already checked isDisconnected.
	// If we matched by participantId, we still need to check if that ID is currently active.

	// Special case: if oldID == ws.ID, this is the same connection updating their info
	// (e.g., after an update-name), so just update the participant in place
	if existingParticipant != nil && oldID == ws.ID {
		log.Printf("🔄 Same connection updating info for %s (ID: %s)", name, ws.ID)
		room.Participants[ws.ID].Name = name
		room.Participants[ws.ID].Connected = true
		room.Participants[ws.ID].LastSeen = time.Now().UnixMilli()
		room.Participants[ws.ID].ReplicaID = s.replicaID
	} else if existingParticipant != nil && oldID != ws.ID {
		// Existing participant found but with a different connection ID
		// (Either reconnection or same user in different tab/browser)
		
		// If the old connection is still active on THIS instance, we should probably 
		// close it or at least handle the takeover.
		s.clientsMu.RLock()
		oldClient, isLocal := s.clients[oldID]
		s.clientsMu.RUnlock()
		
		if isLocal && oldClient != nil {
			log.Printf("🔌 Closing old local connection %s for participant %s", oldID, name)
			oldClient.Close()
			// handleClientDisconnect will be called for oldClient
		}

		log.Printf("🔄 Updating participant %s to new connection %s", name, ws.ID)
		
		// Remove old entry if it exists
		delete(room.Participants, oldID)
		
		// Create new entry with same data but new ID
		room.Participants[ws.ID] = &Participant{
			ID:            ws.ID,
			Name:          name,
			Vote:          existingParticipant.Vote,
			Paused:        existingParticipant.Paused,
			ParticipantId: existingParticipant.ParticipantId,
			Connected:     true,
			LastSeen:      time.Now().UnixMilli(),
			ReplicaID:     s.replicaID,
		}
	} else {
		// New participant - check for duplicate names from active connections
		uniqueName := name
		counter := 2

		// Find a unique name by appending numbers
		s.clientsMu.RLock()
		for {
			nameExists := false
			for _, p := range room.Participants {
				// Only check if participant is still connected
				if p.Name == uniqueName && (p.Connected || s.clients[p.ID] != nil) {
					nameExists = true
					break
				}
			}
			if !nameExists {
				break
			}
			uniqueName = name + " " + strconv.Itoa(counter)
			counter++
		}
		s.clientsMu.RUnlock()

		if uniqueName != name {
			log.Printf("⚠️ Duplicate name detected. Renaming %s to %s for client %s", name, uniqueName, ws.ID)
		}

		// Create new participant with unique name
		room.Participants[ws.ID] = &Participant{
			ID:            ws.ID,
			Name:          uniqueName,
			Vote:          nil,
			ParticipantId: participantId,
			Connected:     true,
			LastSeen:      time.Now().UnixMilli(),
			ReplicaID:     s.replicaID,
		}
	}
	room.mu.Unlock()

	s.broadcastRoomState(roomID)
	s.saveRoomState(roomID)
}

func (s *Server) handleVote(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)
	vote, _ := data["vote"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	// Lock the room to safely update the participant's vote
	room.mu.Lock()
	if participant, ok := room.Participants[ws.ID]; ok {
		// Prevent clearing vote if paused and cards are already revealed
		// This guards against race conditions where pause action triggers vote clearing
		if vote == "" && participant.Paused && room.Revealed && participant.Vote != nil && *participant.Vote != "" {
			log.Printf("⚠️ Prevented vote clearing for paused participant after reveal: %s", ws.ID)
			room.mu.Unlock()
			return
		}
		participant.Vote = &vote

		if room.AutoReveal && !room.Revealed && vote != "" {
			activeParticipantsCount := 0
			votedCount := 0

			s.clientsMu.RLock()
			for _, p := range room.Participants {
				if !p.Paused && (p.Connected || s.clients[p.ID] != nil) {
					activeParticipantsCount++
					if p.Vote != nil && *p.Vote != "" {
						votedCount++
					}
				}
			}
			s.clientsMu.RUnlock()

			if activeParticipantsCount > 0 && votedCount == activeParticipantsCount {
				log.Printf("🚀 Auto-revealing room: %s", roomID)
				room.mu.Unlock()
				s.handleReveal(ws, map[string]interface{}{"roomId": roomID})
				return
			}
		}
	}
	room.mu.Unlock()

	// Broadcast that a participant has voted, but don't send the full state yet
	// This is more efficient for just showing the checkmark icon
	s.broadcastToRoom(roomID, "participant-voted", map[string]interface{}{"id": ws.ID, "hasVote": vote != ""})
	s.saveRoomState(roomID)
}

func (s *Server) handleReveal(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	room.Revealed = true

	roundID := strconv.FormatInt(time.Now().UnixMilli(), 10)
	participants := s.getParticipantsArray(room)
	round := HistoryRound{
		ID:           roundID,
		Story:        room.Story,
		Participants: participants,
		RevealedAt:   time.Now().UnixMilli(),
	}

	room.History = append(room.History, round)
	history := room.History
	room.mu.Unlock()

	revealedData := map[string]interface{}{
		"participants": participants,
		"history":      history,
	}
	s.broadcastToRoom(roomID, "revealed", revealedData)
	s.saveRoomState(roomID)
}

func (s *Server) handleReestimate(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	room.Revealed = false
	for id, p := range room.Participants {
		p.Vote = nil

		// Only remove disconnected participants that belong to THIS replica
		if p.ReplicaID == s.replicaID {
			s.clientsMu.RLock()
			_, isConnectedLocally := s.clients[id]
			s.clientsMu.RUnlock()

			if !isConnectedLocally {
				log.Printf("🧹 Removing disconnected participant %s during re-estimate", id)
				delete(room.Participants, id)
			}
		}
	}
	room.mu.Unlock()

	// Delete room if empty
	s.deleteRoomIfEmpty(roomID)

	s.broadcastRoomState(roomID)
	s.saveRoomState(roomID)
}

func (s *Server) handleReset(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	room.Revealed = false

	// When resetting, we should also clear out any disconnected participants
	// to keep the room fresh for the next round.
	for id, p := range room.Participants {
		p.Vote = nil

		// Only remove disconnected participants that belong to THIS replica
		if p.ReplicaID == s.replicaID {
			s.clientsMu.RLock()
			_, isConnectedLocally := s.clients[id]
			s.clientsMu.RUnlock()

			if !isConnectedLocally {
				log.Printf("🧹 Removing disconnected participant %s during reset", id)
				delete(room.Participants, id)
			}
		}
	}

	room.History = []HistoryRound{}
	room.Story = nil
	participants := s.getParticipantsArray(room)
	room.mu.Unlock()

	// Delete room if empty
	s.deleteRoomIfEmpty(roomID)

	roomReset := map[string]interface{}{
		"participants": participants,
		"story":        nil,
		"history":      []HistoryRound{},
	}
	s.broadcastToRoom(roomID, "room-reset", roomReset)
	s.saveRoomState(roomID)
}

func (s *Server) handleUpdateStory(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)
	storyData, _ := data["story"].(map[string]interface{})

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	if storyData != nil {
		title, _ := storyData["title"].(string)
		link, _ := storyData["link"].(string)
		room.Story = &Story{
			Title: title,
			Link:  link,
		}
	} else {
		room.Story = nil
	}
	story := room.Story
	room.mu.Unlock()

	log.Printf("📥 update-story received: roomId=%s, story=%+v", roomID, story)
	storyUpdated := map[string]interface{}{
		"story": story,
	}
	s.broadcastToRoom(roomID, "story-updated", storyUpdated)
	s.saveRoomState(roomID)
}

func (s *Server) handleSuspendVoting(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	if participant, ok := room.Participants[ws.ID]; ok {
		participant.Paused = true
	}
	room.mu.Unlock()
	s.broadcastRoomState(roomID)
	s.saveRoomState(roomID)
}

func (s *Server) handleResumeVoting(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	if participant, ok := room.Participants[ws.ID]; ok {
		participant.Paused = false
		// Don't clear the vote when resuming - preserve it
	}
	room.mu.Unlock()
	s.broadcastRoomState(roomID)
	s.saveRoomState(roomID)
}

func (s *Server) handleClientDisconnect(ws *ExtendedWebSocket) {
	log.Printf("❌ Client disconnected: %s", ws.ID)

	s.clientsMu.Lock()
	delete(s.clients, ws.ID)
	s.clientsMu.Unlock()

	if ws.RoomID != "" {
		s.roomsMu.RLock()
		room, exists := s.rooms[ws.RoomID]
		s.roomsMu.RUnlock()

		if exists {
			room.mu.Lock()
			if participant, ok := room.Participants[ws.ID]; ok {
				// Only manage if this participant belongs to this replica
				if participant.ReplicaID == s.replicaID {
					log.Printf("🔄 Participant %s disconnected from room %s", ws.ID, ws.RoomID)
					participant.Connected = false
					participant.LastSeen = time.Now().UnixMilli()

					// If they haven't voted and aren't paused, remove them immediately
					if (participant.Vote == nil || *participant.Vote == "") && !participant.Paused {
						log.Printf("🧹 Removing inactive participant %s from room %s", ws.ID, ws.RoomID)
						delete(room.Participants, ws.ID)
					}
				}
			}
			room.mu.Unlock()

			// Delete room if empty
			s.deleteRoomIfEmpty(ws.RoomID)

			// Broadcast the updated state (including the disconnected/removed status)
			s.broadcastRoomState(ws.RoomID)
			s.saveRoomState(ws.RoomID)
		}
	}
}

func (s *Server) handleUpdateName(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)
	name, _ := data["name"].(string)
	log.Printf("📥 update-name: roomId=%s, newName=%s, clientId=%s", roomID, name, ws.ID)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	if participant, ok := room.Participants[ws.ID]; ok {
		// Check if the new name is already taken by another ACTIVE participant
		// Only check connected participants to avoid conflicts with disconnected users
		finalName := name
		counter := 2

		for {
			nameExists := false
			s.clientsMu.RLock()
			for _, p := range room.Participants {
				// Only check if participant is still connected
				if p.ID != ws.ID && p.Name == finalName && (p.Connected || s.clients[p.ID] != nil) {
					nameExists = true
					break
				}
			}
			s.clientsMu.RUnlock()
			if !nameExists {
				break
			}
			finalName = name + " " + strconv.Itoa(counter)
			counter++
		}

		if finalName != name {
			log.Printf("⚠️ Name '%s' already taken. Using '%s' instead for client %s", name, finalName, ws.ID)
		}

		log.Printf("✏️ Updating participant name from '%s' to '%s'", participant.Name, finalName)
		participant.Name = finalName
	}
	room.mu.Unlock()
	s.broadcastRoomState(roomID)
	s.saveRoomState(roomID)
}

func (s *Server) handleToggleAutoReveal(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)
	autoReveal, _ := data["autoReveal"].(bool)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	room.AutoReveal = autoReveal
	room.mu.Unlock()

	s.broadcastToRoom(roomID, "auto-reveal-updated", map[string]interface{}{"autoReveal": autoReveal})
	s.saveRoomState(roomID)
}

func (s *Server) handleStartTimer(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)
	durationFloat, _ := data["duration"].(float64)
	duration := int(durationFloat)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	endTime := time.Now().UnixMilli() + int64(duration*1000)
	room.mu.Lock()
	room.Timer = &Timer{
		EndTime:  &endTime,
		Duration: duration,
	}
	timer := room.Timer
	room.mu.Unlock()

	log.Printf("📥 start-timer received: roomId=%s, duration=%d, endTime=%d", roomID, duration, endTime)
	s.broadcastToRoom(roomID, "timer-updated", map[string]interface{}{"timer": timer})
	s.saveRoomState(roomID)
}

func (s *Server) handleStopTimer(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, _ := data["roomId"].(string)

	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	room.Timer = nil
	room.mu.Unlock()

	s.broadcastToRoom(roomID, "timer-updated", map[string]interface{}{"timer": nil})
	s.saveRoomState(roomID)
}

func (s *Server) handleMessage(ws *ExtendedWebSocket, message WebSocketMessage) {
	switch message.Type {
	case "join-room":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleJoinRoom(ws, data)
		}
	case "vote":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleVote(ws, data)
		}
	case "reveal":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleReveal(ws, data)
		}
	case "reestimate":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleReestimate(ws, data)
		}
	case "reset":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleReset(ws, data)
		}
	case "update-story":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleUpdateStory(ws, data)
		}
	case "update-name":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleUpdateName(ws, data)
		}
	case "suspend-voting":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleSuspendVoting(ws, data)
		}
	case "resume-voting":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleResumeVoting(ws, data)
		}
	case "toggle-auto-reveal":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleToggleAutoReveal(ws, data)
		}
	case "start-timer":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleStartTimer(ws, data)
		}
	case "stop-timer":
		if data, ok := message.Data.(map[string]interface{}); ok {
			s.handleStopTimer(ws, data)
		}
	default:
		log.Printf("Unknown message type: %s", message.Type)
	}
}

func (s *Server) handleGlobalParticipantMoved(participantId string, newRoomID string) {
	s.roomsMu.RLock()
	rooms := make([]*RoomState, 0, len(s.rooms))
	for rID, room := range s.rooms {
		if rID != newRoomID {
			rooms = append(rooms, room)
		}
	}
	s.roomsMu.RUnlock()

	for _, room := range rooms {
		room.mu.Lock()
		removed := false
		for id, p := range room.Participants {
			if p.ParticipantId == participantId {
				log.Printf("🧹 Global cleanup: Removing participant %s from room %s (moved to %s)", id, room.ID, newRoomID)
				delete(room.Participants, id)
				removed = true
				
				// If this connection was local to THIS instance, we should close it
				s.clientsMu.RLock()
				client, isLocal := s.clients[id]
				s.clientsMu.RUnlock()
				if isLocal && client != nil {
					client.Close()
				}
			}
		}
		roomID := room.ID
		room.mu.Unlock()

		if removed {
			s.broadcastRoomState(roomID)
			s.saveRoomStateWithoutNotify(roomID)
		}
	}
}

func (s *Server) broadcastRoomState(roomID string) {
	s.roomsMu.RLock()
	room, exists := s.rooms[roomID]
	s.roomsMu.RUnlock()

	if !exists {
		return
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	roomState := map[string]interface{}{
		"participants": s.getParticipantsArray(room),
		"revealed":     room.Revealed,
		"autoReveal":   room.AutoReveal,
		"timer":        room.Timer,
		"story":        room.Story,
		"history":      room.History,
	}
	s.emitToRoom(roomID, "room-state", roomState, "")
}

func (s *Server) getParticipantsArray(room *RoomState) []Participant {
	participants := make([]Participant, 0, len(room.Participants))
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for _, p := range room.Participants {
		// Create a copy to avoid modifying the original
		participant := *p

		// Only update connection status for participants owned by THIS replica
		if participant.ReplicaID == s.replicaID {
			// This participant belongs to this replica - update based on local connection
			_, isConnectedLocally := s.clients[participant.ID]
			participant.Connected = isConnectedLocally
		}
		// For participants from other replicas, trust the stored Connected status

		participants = append(participants, participant)
	}
	return participants
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading to websocket: %v", err)
		return
	}
	defer conn.Close()

	ws := &ExtendedWebSocket{
		Conn: conn,
		ID:   generateID(),
	}
	ws.IsAlive.Store(true)

	s.clientsMu.Lock()
	s.clients[ws.ID] = ws
	s.clientsMu.Unlock()

	log.Printf("✅ Client connected: %s (replica: %s)", ws.ID, s.replicaID)

	// Setup pong handler for heartbeat
	ws.SetPongHandler(func(string) error {
		ws.IsAlive.Store(true)
		return nil
	})

	for {
		var message WebSocketMessage
		err := conn.ReadJSON(&message)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		s.handleMessage(ws, message)
	}

	s.handleClientDisconnect(ws)
}

func (s *Server) Initialize() error {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Printf("Failed to parse Redis URL: %v", err)
		} else {
			s.redisPub = redis.NewClient(opt)
			s.redisSub = redis.NewClient(opt)

			// Test pub connection
			if err := s.redisPub.Ping(s.ctx).Err(); err != nil {
				log.Printf("Redis pub connection failed: %v", err)
				s.redisPub.Close()
				s.redisPub = nil
			} else {
				log.Println("✓ Redis pub connected")
			}

			// Test sub connection
			if err := s.redisSub.Ping(s.ctx).Err(); err != nil {
				log.Printf("Redis sub connection failed: %v", err)
				s.redisSub.Close()
				s.redisSub = nil
			} else {
				log.Println("✓ Redis sub connected")
				s.setupRedisSubscription()
			}

			// Error handlers are handled by redis client by default
		}
	}

	// Start heartbeat mechanism
	s.startHeartbeat()

	log.Printf("✓ WebSocket server initialized (Replica ID: %s)", s.replicaID)
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Starting graceful shutdown...")

	// Cancel context to stop all goroutines
	s.cancel()

	// Stop heartbeat
	if s.heartbeat != nil {
		s.heartbeat.Stop()
	}

	// Close Redis pub client
	if s.redisPub != nil {
		log.Println("Closing Redis pub client...")
		if err := s.redisPub.Close(); err != nil {
			log.Printf("Error closing Redis pub: %v", err)
		}
	}

	// Close Redis sub client
	if s.redisSub != nil {
		log.Println("Closing Redis sub client...")
		if err := s.redisSub.Close(); err != nil {
			log.Printf("Error closing Redis sub: %v", err)
		}
	}

	// Clear rooms
	s.roomsMu.Lock()
	s.rooms = make(map[string]*RoomState)
	s.roomsMu.Unlock()

	// Close all clients
	s.clientsMu.Lock()
	for _, client := range s.clients {
		if client.Conn != nil {
			client.Close()
		}
	}
	s.clients = make(map[string]*ExtendedWebSocket)
	s.clientsMu.Unlock()

	log.Println("✓ WebSocket graceful shutdown complete")
	return nil
}

func getAllowedOrigins() []string {
	originsEnv := os.Getenv("ALLOWED_ORIGINS")
	if originsEnv == "" {
		// Default to localhost for development
		return []string{"http://localhost:3000", "https://localhost:3000"}
	}

	var origins []string
	for _, origin := range splitAndTrim(originsEnv, ",") {
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

func splitAndTrim(s string, sep string) []string {
	parts := make([]string, 0)
	for _, part := range strings.Split(s, sep) {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigins := getAllowedOrigins()

		// Check if the origin is allowed
		originAllowed := false
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				originAllowed = true
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}

		if !originAllowed && origin != "" {
			log.Printf("CORS: Rejected request from origin: %s", origin)
			http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			return
		}

		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400") // Cache preflight for 24 hours

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func generateID() string {
	return time.Now().Format("20060102150405.000000") + "-" + os.Getenv("HOSTNAME")
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	server := NewServer()
	if err := server.Initialize(); err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/ws", server.handleWebSocket)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("WebSocket server running"))
	})

	httpServer := &http.Server{
		Addr:    ":" + port,
		Handler: corsMiddleware(mux),
	}

	go func() {
		log.Printf("✓ Realtime server listening on :%s", port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	sig := <-quit

	log.Printf("\n✓ Received %v, starting graceful shutdown...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	log.Println("✓ HTTP server closed")
}
