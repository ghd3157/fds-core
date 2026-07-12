import { useEffect } from 'react'

export interface Toast {
  id: number
  message: string
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: number) => void
}

// 개별 Toast 아이템 — 5초 후 자동 제거
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  return (
    <div
      className="flex items-start gap-3 bg-gray-900 border border-red-500/50 rounded-xl px-4 py-3 shadow-xl w-80 animate-slide-in"
      role="alert"
    >
      <span className="text-xl flex-shrink-0">🚨</span>
      <div className="flex-1 min-w-0">
        <p className="text-red-400 font-semibold text-sm">[경고] 이상 결제 탐지!</p>
        <p className="text-gray-300 text-xs mt-0.5 break-words">{toast.message}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-500 hover:text-white text-sm flex-shrink-0 leading-none"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  )
}

// Toast 목록을 우측 상단에 렌더링
export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}
