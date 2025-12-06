import { useEffect, useRef, useState } from 'react'

interface WebSocketMessage {
  type: string
  [key: string]: any
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  reconnectAttempts?: number
  reconnectDelay?: number
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectAttempts = 5,
    reconnectDelay = 3000,
  } = options

  const ws = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimeoutId = useRef<NodeJS.Timeout | null>(null)

  const connect = () => {
    try {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        console.log('WebSocket connected to:', url)
        setIsConnected(true)
        setConnectionError(null)
        reconnectCount.current = 0
        onConnect?.()
      }

      ws.current.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          console.log('WebSocket message received:', message)
          onMessage?.(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.current.onclose = event => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        onDisconnect?.()

        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && reconnectCount.current < reconnectAttempts) {
          reconnectCount.current++
          console.log(
            `Attempting to reconnect... (${reconnectCount.current}/${reconnectAttempts})`
          )

          reconnectTimeoutId.current = setTimeout(() => {
            connect()
          }, reconnectDelay)
        } else if (reconnectCount.current >= reconnectAttempts) {
          setConnectionError('Failed to reconnect after multiple attempts')
        }
      }

      ws.current.onerror = error => {
        console.error('WebSocket error:', error)
        setConnectionError('WebSocket connection error')
        onError?.(error)
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setConnectionError('Failed to create WebSocket connection')
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutId.current) {
      clearTimeout(reconnectTimeoutId.current)
      reconnectTimeoutId.current = null
    }

    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect')
      ws.current = null
    }
  }

  const sendMessage = (message: WebSocketMessage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
      return true
    }
    console.warn('WebSocket is not connected. Message not sent:', message)
    return false
  }

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [url])

  return {
    isConnected,
    connectionError,
    sendMessage,
    disconnect,
    reconnect: connect,
  }
}
