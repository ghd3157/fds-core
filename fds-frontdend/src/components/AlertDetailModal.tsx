import { useEffect, useState } from 'react'
import { generateAiReport, getAlertDetail, reviewAlert } from '../api/alertsApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { CopilotReport, FraudAlertItem } from '../types/fds'
import ShapWaterfallChart from './ShapWaterfallChart'
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
          {score !== null ? `${score.toFixed(1)}점` : '미적용'}
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

const RISK_LEVEL_STYLE: Record<CopilotReport['riskLevel'], string> = {
  CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/40',
  HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  LOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
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

  const [aiReport, setAiReport] = useState<CopilotReport | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [copiedSms, setCopiedSms] = useState(false)

  const isAdmin = user?.role === 'ROLE_ADMIN'

  useEffect(() => {
    if (alertId === null) return
    let active = true
    setLoading(true)
    setError('')
    setFeedback('')
    setAiReport(null)
    setAiError('')
    setCopiedSms(false)

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
          ? '사기 확정으로 처리되었습니다. (재학습 피드백에 자동 반영 가능)'
          : '오탐(정상 거래)으로 처리되었습니다. (재학습 피드백에 자동 반영 가능)',
      )
      triggerRefresh()
      onReviewed?.(updated)
    } catch {
      setError('판정 처리 중 오류가 발생했습니다. 권한 또는 네트워크 상태를 확인하세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateReport = async () => {
    if (!alert) return
    setAiLoading(true)
    setAiError('')
    setCopiedSms(false)
    try {
      const report = await generateAiReport(alert.alertId)
      setAiReport(report)
    } catch {
      setAiError('AI 관제 리포트를 생성하지 못했습니다. Python AI 서버 상태를 확인하세요.')
    } finally {
      setAiLoading(false)
    }
  }

  const handleCopySms = async () => {
    if (!aiReport) return
    try {
      await navigator.clipboard.writeText(aiReport.customerSmsDraft)
      setCopiedSms(true)
      window.setTimeout(() => setCopiedSms(false), 2000)
    } catch {
      // 클립보드 미지원 환경 무시
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-900/95 backdrop-blur z-10">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-950/70 border border-gray-800 rounded-xl p-4 text-sm">
                <div className="col-span-2 sm:col-span-1">
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
                  <p className="text-xs text-gray-500">가맹점 업종 / 1분 빈도</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-gray-200 text-xs font-medium">
                      {alert.merchantCategory}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono">
                      1분 {alert.txCount1m}회
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

              {/* 3중 하이브리드 탐지 점수 + XAI SHAP 차트 */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200">
                      3중 앙상블 위험 스코어 분석
                    </span>
                    <DetectionSourceBadge source={alert.detectionSource} />
                  </div>
                  <RiskScoreBar score={alert.riskScore} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ScoreComparisonBar
                    label="Layer 1 · 정책 룰"
                    score={alert.ruleScore}
                    colorClass="bg-amber-400"
                  />
                  <ScoreComparisonBar
                    label="Layer 2 · LightGBM (지도)"
                    score={alert.mlScore}
                    colorClass="bg-sky-400"
                  />
                  <ScoreComparisonBar
                    label="Layer 3 · IsolationForest (비지도)"
                    score={alert.anomalyScore}
                    colorClass="bg-fuchsia-400"
                  />
                </div>

                <div className="pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">탐지 사유 요약</p>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {alert.detectionReason}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-800">
                  <ShapWaterfallChart contributions={alert.shapContributions ?? []} />
                </div>
              </div>

              {/* AI 관제 사건 요약 & 대응 리포트 (Copilot) */}
              <div className="bg-indigo-950/25 border border-indigo-500/30 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-300 flex items-center gap-1.5">
                      <span>✨</span>
                      <span>AI 관제 사건 요약 & 대응 리포트 Copilot</span>
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      최근 사용자 거래 이력 · 3중 모델 점수 · SHAP 근거를 종합해 대응 브리핑과 고객 안내 문자를 생성합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleGenerateReport}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white whitespace-nowrap transition-colors"
                  >
                    {aiLoading ? '분석 생성 중...' : aiReport ? '리포트 재생성' : '✨ AI 리포트 생성'}
                  </button>
                </div>

                {aiError && (
                  <p className="text-xs text-red-400">{aiError}</p>
                )}

                {aiReport && (
                  <div className="flex flex-col gap-3 pt-2 border-t border-indigo-500/20">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-bold ${RISK_LEVEL_STYLE[aiReport.riskLevel]}`}
                      >
                        위험 등급: {aiReport.riskLevel}
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">
                        엔진: {aiReport.generator}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-300 mb-1">사건 브리핑</p>
                      <p className="text-xs text-gray-200 leading-relaxed bg-gray-900/70 rounded-lg p-3 border border-gray-800">
                        {aiReport.summary}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-300 mb-1">권고 조치 체크리스트</p>
                      <ul className="flex flex-col gap-1.5">
                        {aiReport.recommendedActions.map((act, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-300 flex items-start gap-2"
                          >
                            <span className="text-indigo-400 font-bold">{idx + 1}.</span>
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-gray-300">고객 안내 SMS 초안</p>
                        <button
                          type="button"
                          onClick={handleCopySms}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300"
                        >
                          {copiedSms ? '✓ 복사됨' : '📋 문자 복사'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-300 bg-gray-900/80 border border-gray-800 rounded-lg p-3 leading-relaxed">
                        {aiReport.customerSmsDraft}
                      </p>
                    </div>
                  </div>
                )}
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
                      관리자 판정 메모 (사기 확정 / 오탐 피드백은 AI 모델 재학습에 활용됩니다)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="예: 카드 소유주 본인 확인 결과 도용 거래로 확정 / 본인 결제로 오탐 처리"
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
                    열람 전용 계정(<code>ROLE_VIEWER</code>)으로 로그인되어 있습니다. 알람 판정 권한은 관리자(<code>ROLE_ADMIN</code>)에게만 제공됩니다.
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
