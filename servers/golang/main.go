package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
	socketio "github.com/googollee/go-socket.io"
    "github.com/googollee/go-socket.io/engineio"
    "github.com/googollee/go-socket.io/engineio/transport"
    "github.com/googollee/go-socket.io/engineio/transport/polling"
    "github.com/googollee/go-socket.io/engineio/transport/websocket"
	"github.com/redis/go-redis/v9"
)

type Participant struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Vote   *string `json:"vote"`
	Paused bool    `json:"paused,omitempty"`
}

type Story struct {
	Title       string `json:"title"`
	Description string `json:"description"`
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

type Server struct {
	io          *socketio.Server
	rooms       map[string]*RoomState
	roomsMu     sync.RWMutex
	redisClient *redis.Client
}

func NewServer() *Server {
	return &Server{
		rooms: make(map[string]*RoomState),
	}
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

func (s *Server) Initialize() error {
	allowOriginFunc := func(r *http.Request) bool {
    		return true
    	}

    	server := socketio.NewServer(&engineio.Options{
    		Transports: []transport.Transport{
    			&polling.Transport{
    				CheckOrigin: allowOriginFunc,
    			},
    			&websocket.Transport{
    				CheckOrigin: allowOriginFunc,
    			},
    		},
    	})

    	s.io = server

    	redisURL := os.Getenv("REDIS_URL")
    	if redisURL != "" {
    		opt, err := redis.ParseURL(redisURL)
    		if err != nil {
    			log.Printf("Failed to parse Redis URL: %v", err)
    		} else {
    			s.redisClient = redis.NewClient(opt)
    			ctx := context.Background()
    			if err := s.redisClient.Ping(ctx).Err(); err != nil {
    				log.Printf("Redis connection failed: %v", err)
    			} else {
    				log.Println("✓ Redis adapter connected")
    			}
    		}
    	}

    	server.OnConnect("/", func(conn socketio.Conn) error {
    		log.Printf("✅ Client connected: %s", conn.ID())
    		return nil
    	})

    	server.OnEvent("/", "join-room", func(conn socketio.Conn, data map[string]interface{}) {
    		log.Printf("📥 join-room received from %s with data: %+v", conn.ID(), data)
    		roomID, ok := data["roomId"].(string)
    		if !ok {
    			log.Printf("❌ Invalid roomId in join-room event")
    			return
    		}
    		name, _ := data["name"].(string)
    		log.Printf("📥 join-room: roomId=%s, name=%s, clientId=%s", roomID, name, conn.ID())

    		conn.Join(roomID)
    		room := s.getOrCreateRoom(roomID)

    		room.mu.Lock()
    		room.Participants[conn.ID()] = &Participant{
    			ID:   conn.ID(),
    			Name: name,
    			Vote: nil,
    		}
    		participants := s.getParticipantsArray(room)
    		revealed := room.Revealed
    		story := room.Story
    		lastRound := room.LastRound
    		room.mu.Unlock()

    		log.Printf("📊 Room state updated. Participants: %d, Revealed: %v", len(participants), revealed)
    		log.Printf("📤 Broadcasting room-state to room %s", roomID)
    		s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
    			"participants": participants,
    			"revealed":     revealed,
    			"story":        story,
    			"lastRound":    lastRound,
    		})
    	})

    	server.OnError("/", func(conn socketio.Conn, err error) {
    		log.Printf("❌ Socket.IO error from %s: %v", conn.ID(), err)
    	})

    	server.OnDisconnect("/", func(conn socketio.Conn, reason string) {
    		log.Printf("❌ Client disconnected: %s (reason: %s)", conn.ID(), reason)

    		s.roomsMu.RLock()
    		roomsCopy := make(map[string]*RoomState)
    		for k, v := range s.rooms {
    			roomsCopy[k] = v
    		}
    		s.roomsMu.RUnlock()

    		for roomID, room := range roomsCopy {
    			room.mu.Lock()
    			if _, exists := room.Participants[conn.ID()]; exists {
    				delete(room.Participants, conn.ID())
    				participants := s.getParticipantsArray(room)
    				revealed := room.Revealed
    				story := room.Story
    				room.mu.Unlock()

    				s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
    					"participants": participants,
    					"revealed":     revealed,
    					"story":        story,
    				})
    			} else {
    				room.mu.Unlock()
    			}
    		}
    	})

	server.OnEvent("/", "vote", func(conn socketio.Conn, data map[string]interface{}) {
		roomID, _ := data["roomId"].(string)
		vote, _ := data["vote"].(string)

		s.roomsMu.RLock()
		room, exists := s.rooms[roomID]
		s.roomsMu.RUnlock()

		if !exists {
			return
		}

		room.mu.Lock()
		if participant, ok := room.Participants[conn.ID()]; ok {
			participant.Vote = &vote
			s.io.BroadcastToRoom("/", roomID, "participant-voted", map[string]interface{}{
				"id":      conn.ID(),
				"hasVote": vote != "",
			})
		}
		room.mu.Unlock()
	})

	server.OnEvent("/", "reveal", func(conn socketio.Conn, data map[string]interface{}) {
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

		s.io.BroadcastToRoom("/", roomID, "revealed", map[string]interface{}{
			"participants": participants,
			"lastRound":    lastRound,
		})
	})

	server.OnEvent("/", "reestimate", func(conn socketio.Conn, data map[string]interface{}) {
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
		lastRound := room.LastRound
		room.mu.Unlock()

		s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
			"participants": participants,
			"revealed":     false,
			"story":        story,
			"lastRound":    lastRound,
		})
	})

	server.OnEvent("/", "reset", func(conn socketio.Conn, data map[string]interface{}) {
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

		s.io.BroadcastToRoom("/", roomID, "room-reset", map[string]interface{}{
			"participants": participants,
			"story":        story,
		})
	})

	server.OnEvent("/", "update-story", func(conn socketio.Conn, data map[string]interface{}) {
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
			description, _ := storyData["description"].(string)
			room.Story = &Story{
				Title:       title,
				Description: description,
			}
		} else {
			room.Story = nil
		}
		story := room.Story
		room.mu.Unlock()

		log.Printf("📥 update-story received: roomId=%s, story=%+v", roomID, story)
		s.io.BroadcastToRoom("/", roomID, "story-updated", map[string]interface{}{
			"story": story,
		})
	})

	server.OnEvent("/", "suspend-voting", func(conn socketio.Conn, data map[string]interface{}) {
		roomID, _ := data["roomId"].(string)

		s.roomsMu.RLock()
		room, exists := s.rooms[roomID]
		s.roomsMu.RUnlock()

		if !exists {
			return
		}

		room.mu.Lock()
		if participant, ok := room.Participants[conn.ID()]; ok {
			participant.Paused = true
		}
		participants := s.getParticipantsArray(room)
		revealed := room.Revealed
		story := room.Story
		lastRound := room.LastRound
		room.mu.Unlock()

		s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
			"participants": participants,
			"revealed":     revealed,
			"story":        story,
			"lastRound":    lastRound,
		})
	})

	server.OnEvent("/", "resume-voting", func(conn socketio.Conn, data map[string]interface{}) {
		roomID, _ := data["roomId"].(string)

		s.roomsMu.RLock()
		room, exists := s.rooms[roomID]
		s.roomsMu.RUnlock()

		if !exists {
			return
		}

		room.mu.Lock()
		if participant, ok := room.Participants[conn.ID()]; ok {
			participant.Paused = false
			participant.Vote = nil
		}
		participants := s.getParticipantsArray(room)
		revealed := room.Revealed
		story := room.Story
		lastRound := room.LastRound
		room.mu.Unlock()

		s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
			"participants": participants,
			"revealed":     revealed,
			"story":        story,
			"lastRound":    lastRound,
		})
	})

	server.OnDisconnect("/", func(conn socketio.Conn, reason string) {
		log.Printf("Client disconnected: %s (reason: %s)", conn.ID(), reason)

		s.roomsMu.RLock()
		roomsCopy := make(map[string]*RoomState)
		for k, v := range s.rooms {
			roomsCopy[k] = v
		}
		s.roomsMu.RUnlock()

		for roomID, room := range roomsCopy {
			room.mu.Lock()
			if _, exists := room.Participants[conn.ID()]; exists {
				delete(room.Participants, conn.ID())
				participants := s.getParticipantsArray(room)
				revealed := room.Revealed
				story := room.Story
				room.mu.Unlock()

				s.io.BroadcastToRoom("/", roomID, "room-state", map[string]interface{}{
					"participants": participants,
					"revealed":     revealed,
					"story":        story,
				})
			} else {
				room.mu.Unlock()
			}
		}
	})

	server.OnError("/", func(conn socketio.Conn, err error) {
		log.Printf("Socket error: %v", err)
	})

	log.Println("✓ Socket.IO server initialized")
	return nil
}

func (s *Server) getParticipantsArray(room *RoomState) []Participant {
	participants := make([]Participant, 0, len(room.Participants))
	for _, p := range room.Participants {
		participants = append(participants, *p)
	}
	return participants
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Starting graceful shutdown...")

	if s.io != nil {
		log.Println("Closing Socket.IO connections...")
		if err := s.io.Close(); err != nil {
			log.Printf("Error closing Socket.IO: %v", err)
		}
	}

	if s.redisClient != nil {
		log.Println("Closing Redis client...")
		if err := s.redisClient.Close(); err != nil {
			log.Printf("Error closing Redis: %v", err)
		}
	}

	s.roomsMu.Lock()
	s.rooms = make(map[string]*RoomState)
	s.roomsMu.Unlock()

	log.Println("✓ Socket.IO graceful shutdown complete")
	return nil
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		if r.Method == "OPTIONS" {
			return
		}

		next.ServeHTTP(w, r)
	})
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
	mux.Handle("/api/socketio/", server.io)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Socket.IO server running"))
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
