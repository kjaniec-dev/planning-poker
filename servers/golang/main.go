package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type Participant struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Vote   *string `json:"vote"`
	Paused bool    `json:"paused,omitempty"`
}

type Story struct {
	Title string `json:"title"`
	Link  string `json:"link"`
}

type LastRound struct {
	ID           string        `json:"id"`
	Participants []Participant `json:"participants"`
}

type RoomState struct {
	ID           string
	Participants map[string]*Participant
	Revealed     bool
	LastRound    *LastRound
	Story        *Story
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
}

func NewServer() *Server {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		rooms:   make(map[string]*RoomState),
		clients: make(map[string]*ExtendedWebSocket),
		ctx:     ctx,
		cancel:  cancel,
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
	defer s.roomsMu.Unlock()

	if room, exists := s.rooms[roomID]; exists {
		return room
	}

	room := &RoomState{
		ID:           roomID,
		Participants: make(map[string]*Participant),
		Revealed:     false,
		Story:        nil,
		LastRound:    nil,
	}
	s.rooms[roomID] = room
	return room
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
		excludeMap[id] = true
	}

	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for _, participant := range room.Participants {
		if !excludeMap[participant.ID] {
			if client, ok := s.clients[participant.ID]; ok {
				if err := client.WriteJSON(message); err != nil {
					log.Printf("Error broadcasting to client %s: %v", client.ID, err)
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
				s.broadcastToRoom(redisMsg.RoomID, redisMsg.Type, redisMsg.Data, redisMsg.ExcludeID)
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

func (s *Server) startHeartbeat() {
	s.heartbeat = time.NewTicker(30 * time.Second)

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
			case <-s.ctx.Done():
				return
			}
		}
	}()
}

func (s *Server) handleJoinRoom(ws *ExtendedWebSocket, data map[string]interface{}) {
	roomID, ok := data["roomId"].(string)
	if !ok {
		log.Printf("❌ Invalid roomId in join-room event")
		return
	}
	name, _ := data["name"].(string)
	log.Printf("📥 join-room: roomId=%s, name=%s, clientId=%s", roomID, name, ws.ID)

	ws.RoomID = roomID
	room := s.getOrCreateRoom(roomID)

	room.mu.Lock()
	// Check if a participant with the same name exists (from previous connection)
	var existingParticipant *Participant
	var oldID string
	for id, participant := range room.Participants {
		if participant.Name == name {
			existingParticipant = participant
			oldID = id
			break
		}
	}

	// If participant with same name exists, restore their data with new client ID
	if existingParticipant != nil && oldID != "" {
		log.Printf("🔄 Restoring participant data for %s (old ID: %s, new ID: %s)", name, oldID, ws.ID)
		// Remove old entry
		delete(room.Participants, oldID)
		// Add with new ID but preserve vote and paused state
		room.Participants[ws.ID] = &Participant{
			ID:     ws.ID,
			Name:   name,
			Vote:   existingParticipant.Vote,
			Paused: existingParticipant.Paused,
		}
	} else {
		// New participant
		room.Participants[ws.ID] = &Participant{
			ID:   ws.ID,
			Name: name,
			Vote: nil,
		}
	}
	room.mu.Unlock()

	s.broadcastRoomState(roomID)
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
		participant.Vote = &vote
	}
	room.mu.Unlock()

	// Broadcast that a participant has voted, but don't send the full state yet
	// This is more efficient for just showing the checkmark icon
	s.broadcastToRoom(roomID, "participant-voted", map[string]interface{}{"id": ws.ID, "hasVote": vote != ""})
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

	roundID := time.Now().UnixMilli()
	participants := s.getParticipantsArray(room)
	room.LastRound = &LastRound{
		ID:           string(rune(roundID)),
		Participants: participants,
	}

	lastRound := room.LastRound
	room.mu.Unlock()

	revealedData := map[string]interface{}{
		"participants": participants,
		"lastRound":    lastRound,
	}
	s.broadcastToRoom(roomID, "revealed", revealedData)
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
	for _, p := range room.Participants {
		p.Vote = nil
	}
	room.mu.Unlock()
	s.broadcastRoomState(roomID)
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
	for _, p := range room.Participants {
		p.Vote = nil
	}
	participants := s.getParticipantsArray(room)
	story := room.Story
	room.mu.Unlock()

	roomReset := map[string]interface{}{
		"participants": participants,
		"story":        story,
	}
	s.broadcastToRoom(roomID, "room-reset", roomReset)
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
		participant.Vote = nil
	}
	room.mu.Unlock()
	s.broadcastRoomState(roomID)
}

func (s *Server) handleClientDisconnect(ws *ExtendedWebSocket) {
	log.Printf("❌ Client disconnected: %s", ws.ID)

	s.clientsMu.Lock()
	delete(s.clients, ws.ID)
	s.clientsMu.Unlock()

	// Note: We intentionally DO NOT remove participants from rooms on disconnect
	// This allows their votes to persist when they reconnect (e.g., after page refresh)
	// Participants are only removed when the game is explicitly reset
	// The participant will be updated with new ID when they rejoin with same name
	if ws.RoomID != "" {
		s.roomsMu.RLock()
		room, exists := s.rooms[ws.RoomID]
		s.roomsMu.RUnlock()

		if exists {
			room.mu.RLock()
			if _, ok := room.Participants[ws.ID]; ok {
				log.Printf("🔄 Keeping participant data for potential reconnection: %s", ws.ID)
			}
			room.mu.RUnlock()
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
		participant.Name = name
	}
	room.mu.Unlock()

	s.broadcastRoomState(roomID)
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
	default:
		log.Printf("Unknown message type: %s", message.Type)
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
		"story":        room.Story,
		"lastRound":    room.LastRound,
	}
	s.broadcastToRoom(roomID, "room-state", roomState)
}

func (s *Server) getParticipantsArray(room *RoomState) []Participant {
	participants := make([]Participant, 0, len(room.Participants))
	for _, p := range room.Participants {
		participants = append(participants, *p)
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

	log.Printf("✅ Client connected: %s", ws.ID)

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

	log.Println("✓ WebSocket server initialized")
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
