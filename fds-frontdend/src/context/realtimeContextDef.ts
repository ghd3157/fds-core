import { createContext, useContext } from 'react'
import type { WsConnectionState } from '../hooks/useWebSocket'
import type { RealtimeAlertPayload, UserProfile } from '../types/fds'

export interface AlertToast {
  toastId: string
  alert: RealtimeAlertPayload
}

export interface RealtimeContextValue {
  user: UserProfile | null
  connectionState: WsConnectionState
  refreshTick: number
  unconfirmedCount: number
  toasts: AlertToast[]
  selectedAlertId: number | null
  triggerRefresh: () => void
  dismissToast: (toastId: string) => void
  openAlertModal: (alertId: number) => void
  closeAlertModal: () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider')
  }
  return ctx
}
