import { useEffect, useRef, useState } from 'react'
import SockJS from 'sockjs-client'
import { Client, type IMessage } from '@stomp/stompjs'
import type { RealtimeAlertPayload } from '../types/fds'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:8080/ws-fds'
const TOPIC = '/topic/alerts'

export type WsConnectionState = 'connecting' | 'connected' | 'disconnected'

interface UseWebSocketOptions {
  onAlert: (alert: RealtimeAlertPayload) => void
}

export default function useWebSocket({ onAlert }: UseWebSocketOptions) {
  const clientRef = useRef<Client | null>(null)
  const onAlertRef = useRef(onAlert)
  onAlertRef.current = onAlert

  const [connectionState, setConnectionState] =
    useState<WsConnectionState>('connecting')

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 3000,

      // 재연결 시마다 최신 Access Token을 STOMP CONNECT 헤더에 주입
      beforeConnect: () => {
        setConnectionState('connecting')
        const token = localStorage.getItem('accessToken')
        client.connectHeaders = token
          ? { Authorization: `Bearer ${token}` }
          : {}
      },

      onConnect: () => {
        setConnectionState('connected')
        client.subscribe(TOPIC, (message: IMessage) => {
          try {
            const payload: RealtimeAlertPayload = JSON.parse(message.body)
            onAlertRef.current(payload)
          } catch (err) {
            console.error('[WebSocket] AlertPayload 파싱 실패:', err, message.body)
          }
        })
      },

      onStompError: () => {
        setConnectionState('disconnected')
      },

      onWebSocketClose: () => {
        setConnectionState('disconnected')
      },
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
  }, [])

  return { clientRef, connectionState }
}
