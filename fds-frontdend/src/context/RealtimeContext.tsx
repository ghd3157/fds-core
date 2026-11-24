import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getMe } from '../api/authApi'
import { getDashboardSummary } from '../api/dashboardApi'
import useWebSocket from '../hooks/useWebSocket'
import type { RealtimeAlertPayload, UserProfile } from '../types/fds'
import { RealtimeContext, type AlertToast } from './realtimeContextDef'

const DEBOUNCE_MS = 1500

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [unconfirmedCount, setUnconfirmedCount] = useState(0)
  const [toasts, setToasts] = useState<AlertToast[]>([])
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null)

  const debounceTimerRef = useRef<number | null>(null)

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1)
  }, [])

  // WebSocket 알림 폭주(Burst) 시 API 호출 과부하를 방지하기 위한 1.5초 디바운스 갱신
  const scheduleDebouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = window.setTimeout(() => {
      setRefreshTick((prev) => prev + 1)
      debounceTimerRef.current = null
    }, DEBOUNCE_MS)
  }, [])

  const handleAlert = useCallback(
    (alert: RealtimeAlertPayload) => {
      const toastId = `${alert.alertId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev.slice(-4), { toastId, alert }])
      setUnconfirmedCount((prev) => prev + 1)
      scheduleDebouncedRefresh()
    },
    [scheduleDebouncedRefresh],
  )

  const { connectionState } = useWebSocket({ onAlert: handleAlert })

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
        setUser(null)
      })
  }, [])

  useEffect(() => {
    getDashboardSummary()
      .then((summary) => setUnconfirmedCount(summary.unconfirmedAlertCount))
      .catch(() => {
        // 초기 로드 실패 시 무시
      })
  }, [refreshTick])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  const openAlertModal = useCallback((alertId: number) => {
    setSelectedAlertId(alertId)
  }, [])

  const closeAlertModal = useCallback(() => {
    setSelectedAlertId(null)
  }, [])

  return (
    <RealtimeContext.Provider
      value={{
        user,
        connectionState,
        refreshTick,
        unconfirmedCount,
        toasts,
        selectedAlertId,
        triggerRefresh,
        dismissToast,
        openAlertModal,
        closeAlertModal,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  )
}
