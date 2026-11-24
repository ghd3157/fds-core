import { useEffect } from 'react'
import type { AlertToast } from '../context/realtimeContextDef'
import { DetectionSourceBadge } from './StatusBadges'

interface ToastContainerProps {
  toasts: AlertToast[]
  onRemove: (toastId: string) => void
  onSelectAlert: (alertId: number) => void
}

function ToastItem({
  item,
  onRemove,
  onSelectAlert,
}: {
  item: AlertToast
  onRemove: (toastId: string) => void
  onSelectAlert: (alertId: number) => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onRemove(item.toastId), 6000)
    return () => window.clearTimeout(timer)
  }, [item.toastId, onRemove])

  const { alert } = item

  return (
    <div
      className="flex items-start gap-3 bg-gray-900/95 backdrop-blur border border-red-500/50 rounded-xl px-4 py-3 shadow-2xl w-96 animate-slide-in cursor-pointer hover:border-red-400 transition-colors"
      role="alert"
      onClick={() => {
        onSelectAlert(alert.alertId)
        onRemove(item.toastId)
      }}
    >
      <span className="text-xl flex-shrink-0 mt-0.5">🚨</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-red-400 font-semibold text-sm">이상 결제 탐지</p>
          <DetectionSourceBadge source={alert.detectionSource} />
          <span className="ml-auto text-xs font-mono font-bold text-red-300">
            {alert.riskScore.toFixed(1)}점
          </span>
        </div>
        <p className="text-white text-xs font-medium mt-1">
          {alert.amount.toLocaleString()}원 · {alert.merchantCategory} ({alert.userId})
        </p>
        <p className="text-gray-400 text-xs mt-0.5 line-clamp-2 break-words">
          {alert.detectionReason}
        </p>
        <p className="text-[11px] text-indigo-400 mt-1.5">
          클릭하여 상세 내역 확인 및 판정 →
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove(item.toastId)
        }}
        className="text-gray-500 hover:text-white text-sm flex-shrink-0 leading-none"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  )
}

export default function ToastContainer({
  toasts,
  onRemove,
  onSelectAlert,
}: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5">
      {toasts.map((item) => (
        <ToastItem
          key={item.toastId}
          item={item}
          onRemove={onRemove}
          onSelectAlert={onSelectAlert}
        />
      ))}
    </div>
  )
}
