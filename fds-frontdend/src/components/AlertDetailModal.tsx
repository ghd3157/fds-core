import { useEffect, useState } from 'react'
import { getAlertDetail, reviewAlert } from '../api/alertsApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { FraudAlertItem } from '../types/fds'
import {
  DetectionSourceBadge,
  ReviewStatusBadge,
  RiskScoreBar,
} from './StatusBadges'

interface AlertDetailModalProps {
  alertId: number | null
  onClose: () => void
  onReviewed?: (updated: FraudAlertItem) => void
}

function ScoreComparisonBar({
  label,
  score,
  colorClass,
}: {
  label: string
  score: number | null
  colorClass: string
}) {
  const width = score !== null ? Math.max(0, Math.min(100, score)) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono font-semibold text-gray-200">
          {score !== null ? `${score.toFixed(2)}점` : '미적용 / Fallback'}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${score !== null ? colorClass : 'bg-gray-700'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

export default function AlertDetailModal({
  alertId,
  onClose,
  onReviewed,
}: AlertDetailModalProps) {
  const { user, triggerRefresh } = useRealtime()
  const [alert, setAlert] = useState<FraudAlertItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')

  const isAdmin = user?.role === 'ROLE_ADMIN'

  useEffect(() => {
    if (alertId === null) return
    let active = true
    setLoading(true)
    setError('')
    setFeedback('')

    getAlertDetail(alertId)
      .then((res) => {
        if (active) {
          setAlert(res)
          setNote(res.reviewNote ?? '')
        }
      })
      .catch(() => {
        if (active) setError('알람 상세 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [alertId])

  if (alertId === null) return null

  const handleReview = async (status: 'CONFIRMED_FRAUD' | 'FALSE_POSITIVE') => {
    if (!alert) return
    setSubmitting(true)
    setFeedback('')
    setError('')
    try {
      const updated = await reviewAlert(alert.alertId, {
        reviewStatus: status,
        reviewNote: note,
      })
      setAlert(updated)
      setFeedback(
        status === 'CONFIRMED_FRAUD'
          ? '사기 확정으로 처리되었습니다.'
          : '오탐(정상 거래)으로 처리되었습니다.',
      )
      triggerRefresh()
      onReviewed?.(updated)
    } catch {
      setError('판정 처리 중 오류가 발생했습니다. 권한 또는 네트워크 상태를 확인하세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🚨</span>
            <h3 className="text-white font-bold text-base">
              이상 탐지 알람 상세 #{alertId}
            </h3>
            {alert && <ReviewStatusBadge status={alert.reviewStatus} />}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg px-2 py-1 rounded-lg hover:bg-gray-800"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 flex flex-col gap-5">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error && !alert ? (
            <div className="py-10 text-center text-red-400 text-sm">{error}</div>
          ) : alert ? (
            <>
              {/* 거래 핵심 정보 */}
              <div className="grid grid-cols-2 gap-3 bg-gray-950/70 border border-gray-800 rounded-xl p-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">거래 ID</p>
                  <p className="font-mono text-xs text-gray-200 mt-0.5 break-all">
                    {alert.transactionId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">사용자 ID</p>
                  <p className="font-mono text-xs text-gray-200 mt-0.5">{alert.userId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">결제 금액</p>
                  <p className="text-white font-bold text-base mt-0.5">
                    {alert.amount.toLocaleString()}원
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">가맹점 업종 / 1분 결제빈도</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gray-200 text-xs font-medium">
                      {alert.merchantCategory}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-mono">
                      1분 내 {alert.txCount1m}회
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">결제 발생 시각 (KST)</p>
                  <p className="text-gray-300 text-xs mt-0.5">
                    {new Date(alert.transactionDate).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">거래 좌표</p>
                  <p className="font-mono text-gray-400 text-xs mt-0.5">
                    {alert.latitude !== null && alert.longitude !== null
                      ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`
                      : '정보 없음'}
                  </p>
                </div>
              </div>

              {/* 하이브리드 위험 스코어 비교 */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-300">
                      하이브리드 탐지 점수 분석
                    </span>
                    <DetectionSourceBadge source={alert.detectionSource} />
                  </div>
                  <RiskScoreBar score={alert.riskScore} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <ScoreComparisonBar
                    label="Layer 1 · 정책 룰 (Rule Score)"
                    score={alert.ruleScore}
                    colorClass="bg-amber-400"
                  />
                  <ScoreComparisonBar
                    label="Layer 2 · LightGBM (ML Score)"
                    score={alert.mlScore}
                    colorClass="bg-sky-400"
                  />
                </div>

                <div className="mt-1 pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">탐지 사유 (Rule + TreeSHAP)</p>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {alert.detectionReason}
                  </p>
                </div>
              </div>

              {/* 관리자 처리 이력 */}
              {alert.reviewedBy && (
                <div className="bg-gray-800/40 border border-gray-700/60 rounded-xl px-4 py-3 text-xs text-gray-300 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span>
                      처리자: <strong className="text-white">{alert.reviewedBy}</strong>
                    </span>
                    <span className="text-gray-400">
                      {alert.reviewedAt
                        ? new Date(alert.reviewedAt).toLocaleString('ko-KR')
                        : ''}
                    </span>
                  </div>
                  {alert.reviewNote && (
                    <p className="text-gray-300 mt-1">메모: {alert.reviewNote}</p>
                  )}
                </div>
              )}

              {/* 알림 메시지 */}
              {error && (
                <div className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {error}
                </div>
              )}
              {feedback && (
                <div className="px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                  {feedback}
                </div>
              )}

              {/* 관리자 판정 워크플로우 */}
              <div className="border-t border-gray-800 pt-4">
                {isAdmin ? (
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-semibold text-gray-300">
                      관리자 판정 메모 (선택)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="예: 카드 소유주 본인 확인 결과 도용 거래로 확정 / 본인 해외 직구 정상 결제로 오탐 처리"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        disabled={submitting}
                        onClick={() => handleReview('FALSE_POSITIVE')}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 disabled:opacity-50 transition-colors"
                      >
                        오탐 처리 (정상)
                      </button>
                      <button
                        disabled={submitting}
                        onClick={() => handleReview('CONFIRMED_FRAUD')}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
                      >
                        사기 확정
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-400 text-xs">
                    열람 전용 계정(<code>ROLE_VIEWER</code>)으로 로그인되어 있습니다. 알람 사기 확정 및 오탐 처리 권한은 관리자(<code>ROLE_ADMIN</code>)에게만 제공됩니다.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
