import { useEffect, useRef } from 'react'
import SockJS from 'sockjs-client'
import { Client, type IMessage } from '@stomp/stompjs'

const WS_URL = 'http://localhost:8080/ws'
const TOPIC = '/topic/fraud-alerts'

export interface FraudAlert {
  transactionId: string
  amount: number
  message: string
}

interface UseWebSocketOptions {
  onAlert: (alert: FraudAlert) => void
}

export default function useWebSocket({ onAlert }: UseWebSocketOptions) {
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')

    const client = new Client({
      // SockJS를 transport로 사용
      webSocketFactory: () => new SockJS(WS_URL),

      // STOMP CONNECT 프레임에 JWT 포함
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},

      // 연결 끊어지면 3초 후 재연결
      reconnectDelay: 3000,

      onConnect: () => {
        client.subscribe(TOPIC, (message: IMessage) => {
          try {
            const alert: FraudAlert = JSON.parse(message.body)
            onAlert(alert)
          } catch {
            // 파싱 실패 시 message.body를 그대로 표시
            onAlert({ transactionId: '-', amount: 0, message: message.body })
          }
        })
      },
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
    }
    // onAlert는 렌더링마다 새 참조가 생기므로 의존성 배열에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return clientRef
}
