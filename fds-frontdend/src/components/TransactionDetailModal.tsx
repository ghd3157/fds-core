import { useEffect, useState } from 'react'
import { getTransactionDetail } from '../api/transactionsApi'
import type { TransactionDetail } from '../types/fds'
import {
  DetectionSourceBadge,
  FraudBadge,
  ProcessStatusBadge,
  ReviewStatusBadge,
} from './StatusBadges'

interface TransactionDetailModalProps {
  transactionId: string | null
  onClose: () => void
  onOpenAlert: (alertId: number) => void
}

export default function TransactionDetailModal({
  transactionId,
  onClose,
  onOpenAlert,
}: TransactionDetailModalProps) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!transactionId) return
    let active = true
    setLoading(true)
    setError('')

    getTransactionDetail(transactionId)
      .then((res) => {
        if (active) setDetail(res)
      })
      .catch(() => {
        if (active) setError('거래 상세 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [transactionId])

  if (!transactionId) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-white font-bold text-base">결제 거래 상세</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg px-2 py-1 rounded-lg hover:bg-gray-800"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-red-400 text-sm">{error}</div>
          ) : detail ? (
            <>
              <div className="flex items-center gap-2">
                <ProcessStatusBadge status={detail.status} />
                <FraudBadge isFraud={detail.isFraud} />
              </div>

              <div className="grid grid-cols-2 gap-3 bg-gray-950/70 border border-gray-800 rounded-xl p-4 text-sm">
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">거래 ID</p>
                  <p className="font-mono text-xs text-gray-200 mt-0.5 break-all">
                    {detail.transactionId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">사용자 ID</p>
                  <p className="font-mono text-xs text-gray-200 mt-0.5">{detail.userId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">결제 금액</p>
                  <p className="text-white font-bold mt-0.5">
                    {detail.amount.toLocaleString()}원
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">가맹점 업종</p>
                  <p className="text-gray-200 text-xs mt-0.5">{detail.merchantCategory}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">결제 시각 (KST)</p>
                  <p className="text-gray-300 text-xs mt-0.5">
                    {new Date(detail.createdAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">거래 위치 좌표</p>
                  <p className="font-mono text-gray-400 text-xs mt-0.5">
                    {detail.latitude !== null && detail.longitude !== null
                      ? `위도 ${detail.latitude.toFixed(4)}, 경도 ${detail.longitude.toFixed(4)}`
                      : '좌표 정보 없음'}
                  </p>
                </div>
              </div>

              {detail.alert && (
                <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-xs font-semibold">
                        연결된 이상 탐지 알람 #{detail.alert.alertId}
                      </span>
                      <DetectionSourceBadge source={detail.alert.detectionSource} />
                    </div>
                    <ReviewStatusBadge status={detail.alert.reviewStatus} />
                  </div>
                  <p className="text-xs text-gray-300">
                    최종 위험 스코어:{' '}
                    <strong className="text-red-300 font-mono">
                      {detail.alert.riskScore.toFixed(1)}점
                    </strong>{' '}
                    · 1분 결제빈도 {detail.alert.txCount1m}회
                  </p>
                  <p className="text-xs text-gray-400">{detail.alert.detectionReason}</p>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        const id = detail.alert!.alertId
                        onClose()
                        onOpenAlert(id)
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                      알람 상세 및 판정 화면 열기 →
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
