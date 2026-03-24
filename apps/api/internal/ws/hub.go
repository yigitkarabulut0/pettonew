package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID     string
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
	hub    *Hub
}

type Hub struct {
	clients     map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	mu          sync.RWMutex
	userClients map[string][]*Client
}

func NewHub() *Hub {
	return &Hub{
		broadcast:   make(chan []byte),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		clients:     make(map[*Client]bool),
		userClients: make(map[string][]*Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.userClients[client.UserID] = append(h.userClients[client.UserID], client)
			h.mu.Unlock()
			log.Printf("Client registered: user=%s", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				userClients := h.userClients[client.UserID]
				for i, c := range userClients {
					if c == client {
						h.userClients[client.UserID] = append(userClients[:i], userClients[i+1:]...)
						break
					}
				}
				if len(h.userClients[client.UserID]) == 0 {
					delete(h.userClients, client.UserID)
				}
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: user=%s", client.UserID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) SendToUser(userID string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.userClients[userID]; ok {
		for _, client := range clients {
			select {
			case client.Send <- message:
			default:
			}
		}
	}
}

func (h *Hub) SendToConversation(conversationID string, senderID string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, clients := range h.userClients {
		for _, client := range clients {
			if client.UserID != senderID {
				select {
				case client.Send <- message:
				default:
				}
			}
		}
	}
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			continue
		}

		switch wsMsg.Type {
		case "ping":
			c.Send <- []byte(`{"type":"pong"}`)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		conn.Close()
		return
	}

	hubInterface, exists := c.Get("hub")
	if !exists {
		conn.Close()
		return
	}
	hub := hubInterface.(*Hub)

	client := &Client{
		ID:     conn.RemoteAddr().String(),
		UserID: userID.(string),
		Conn:   conn,
		Send:   make(chan []byte, 256),
		hub:    hub,
	}

	hub.register <- client

	go client.WritePump()
	go client.ReadPump()
}
