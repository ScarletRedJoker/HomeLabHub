import { useEffect, useRef, useCallback } from 'react';
import { useAuthContext } from '@/components/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';

type WebSocketEventHandler = (data: any) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const eventHandlersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!user?.id) {
      console.log('[WebSocket] No user ID, skipping connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('[WebSocket] Connecting to', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttempts.current = 0;
        
        // Send authentication message
        ws.send(JSON.stringify({
          type: 'auth',
          userId: user.id
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', data.type, data);
          
          // Handle different event types
          switch (data.type) {
            case 'auth_success':
              console.log('[WebSocket] Authentication successful');
              break;
              
            case 'auth_error':
              console.log('[WebSocket] Authentication failed:', data.message);
              ws.close();
              break;
              
            case 'connected':
              console.log('[WebSocket] Server acknowledged connection');
              break;
              
            case 'TICKET_CREATED':
              console.log('[WebSocket] New ticket created:', data.data);
              // Invalidate ticket queries to refetch
              queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
              break;
              
            case 'TICKET_UPDATED':
              console.log('[WebSocket] Ticket updated:', data.data);
              // Invalidate ticket queries
              queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
              if (data.data?.id) {
                queryClient.invalidateQueries({ queryKey: [`/api/tickets/${data.data.id}`] });
              }
              break;
              
            case 'MESSAGE_ADDED':
              console.log('[WebSocket] Message added to ticket:', data.data);
              // Invalidate message queries for this ticket
              if (data.data?.ticketId) {
                queryClient.invalidateQueries({ queryKey: [`/api/tickets/${data.data.ticketId}/messages`] });
              }
              break;
              
            default:
              // Call custom event handlers
              const handlers = eventHandlersRef.current.get(data.type);
              if (handlers) {
                handlers.forEach(handler => handler(data));
              }
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        wsRef.current = null;
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`[WebSocket] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to create WebSocket:', error);
    }
  }, [user?.id, queryClient]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      console.log('[WebSocket] Closing connection');
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
  }, []);

  // Subscribe to custom events
  const subscribe = useCallback((eventType: string, handler: WebSocketEventHandler) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    eventHandlersRef.current.get(eventType)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = eventHandlersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          eventHandlersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  // Send a message through WebSocket
  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] Cannot send message, not connected');
    }
  }, []);

  // Connect when user is available
  useEffect(() => {
    if (user?.id) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [user?.id, connect, disconnect]); // Include all dependencies

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    subscribe,
    send,
    reconnect: connect
  };
}