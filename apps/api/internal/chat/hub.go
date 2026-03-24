package chat

import (
	"encoding/json"
	"sync"
)

type Hub struct {
	mu        sync.RWMutex
	listeners map[string]map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{
		listeners: make(map[string]map[chan []byte]struct{}),
	}
}

func (h *Hub) Subscribe(conversationID string) chan []byte {
	h.mu.Lock()
	defer h.mu.Unlock()

	channel := make(chan []byte, 8)
	if _, ok := h.listeners[conversationID]; !ok {
		h.listeners[conversationID] = make(map[chan []byte]struct{})
	}

	h.listeners[conversationID][channel] = struct{}{}
	return channel
}

func (h *Hub) Unsubscribe(conversationID string, channel chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if listeners, ok := h.listeners[conversationID]; ok {
		delete(listeners, channel)
		if len(listeners) == 0 {
			delete(h.listeners, conversationID)
		}
	}

	close(channel)
}

func (h *Hub) Publish(conversationID string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for channel := range h.listeners[conversationID] {
		select {
		case channel <- data:
		default:
		}
	}

	return nil
}

