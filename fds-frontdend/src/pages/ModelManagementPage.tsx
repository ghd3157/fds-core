import { useCallback, useEffect, useState } from 'react'
import { getModelStatus, triggerModelRetrain } from '../api/modelsApi'
import { useRealtime } from '../context/realtimeContextDef'
import type { ModelStatusResponse, RetrainResponse } from '../types/fds'

const DRIFT_STYLE = {
  NORMAL: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    bar: 'bg-emerald-400',
    label: '정상 (안정)',
  },
  WARNING: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    bar: 'bg-amber-400',
    label: '주의 (분포 변화)',
  },
  DRIFT: {
    badge: 'bg-red-500/15 text-red-300 border-red-500/40',
    bar: 'bg-red-500',
    label: '드리프트 경고 (재학습 권장)',
  },
} as const

export default function ModelManagementPage() {
  const { user, refreshTick } = useRealtime()
  const isAdmin = user?.role === 'ROLE_ADMIN'

  const [status, setStatus] = useState<ModelStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retraining, setRetraining] = useState(false)
  const [retrainResult, setRetrainResult] = useState<RetrainResponse | null>(null)

  const fetchStatus = useCallback(() => {
    getModelStatus()
      .then((res) => {
        setStatus(res)
        setError('')
      })
      .catch(() => {
        setError('AI 모델 상태를 불러오지 못했습니다. Python AI 서버 연결을 확인하세요.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus, refreshTick])

  const handleRetrain = async () => {
    setRetraining(true)
    setError('')
    setRetrainResult(null)
    try {
      const res = await triggerModelRetrain(false)
      setRetrainResult(res)
      fetchStatus()
    } catch {
      setError('재학습 실행 중 오류가 발생했습니다. 권한 또는 서버 상태를 확인하세요.')
    } finally {
      setRetraining(false)
    }
  }

  const metrics = status?.metrics ?? {}
  const cm = metrics.confusion_matrix_at_0_80
  const drift = status?.drift
  const driftMeta = drift ? DRIFT_STYLE[drift.status] : DRIFT_STYLE.NORMAL
  const psiPercent = drift ? Math.min(100, (drift.psiScore / 0.35) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">AI 모델 & MLOps 관리</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            LightGBM(지도) + Isolation Forest(비지도) 앙상블 성능 · PSI 데이터 드리프트 · 관리자 피드백 기반 무중단 재학습
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="px-3.5 py-2 rounded-lg text-xs font-medium bg-gray-900 border border-gray-800 hover:border-gray-700 text-gray-300 transition-colors"
        >
          ↻ 상태 새로고침
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 재학습 완료 결과 배너 */}
      {retrainResult && (
        <div
          className={`rounded-xl p-5 border flex flex-col gap-2 ${
            retrainResult.promoted
              ? 'bg-emerald-500/10 border-emerald-500/40'
              : 'bg-amber-500/10 border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">
              {retrainResult.promoted
                ? '🚀 Challenger 모델 무중단 Hot-Swap 승격 완료'
                : '⏸ 기존 Champion 모델 유지'}
            </p>
            <span className="text-xs font-mono text-gray-300">
              {retrainResult.previousVersion} → {retrainResult.newVersion}
            </span>
          </div>
          <p className="text-xs text-gray-200">{retrainResult.reason}</p>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-300 pt-1">
            <span>반영 피드백: {retrainResult.feedbackCount}건</span>
            <span>
              Champion PR-AUC: {(retrainResult.championMetrics.pr_auc ?? 0).toFixed(4)}
            </span>
            <span>
              Challenger PR-AUC: {(retrainResult.challengerMetrics.pr_auc ?? 0).toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {loading && !status ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : status ? (
        <>
          {/* 1행: Champion 모델 요약 + 성능 지표 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">
                      CHAMPION
                    </span>
                    <h3 className="text-white font-bold text-base font-mono">
                      {status.modelVersion}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    학습 시각: {status.trainedAt ?? '—'} · 데이터셋: {status.datasetSource ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    LightGBM {status.modelLoaded ? 'ON' : 'OFF'}
                  </span>
                  <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                    IsolationForest {status.iforestLoaded ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* 5대 평가 지표 */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'PR-AUC', value: metrics.pr_auc?.toFixed(4) ?? '—', color: 'text-indigo-400' },
                  { label: 'ROC-AUC', value: metrics.roc_auc?.toFixed(4) ?? '—', color: 'text-sky-400' },
                  { label: 'F1 (0.80)', value: metrics.f1_at_0_80?.toFixed(4) ?? '—', color: 'text-emerald-400' },
                  { label: 'Recall@1%FPR', value: metrics.recall_at_fpr_1pct?.toFixed(4) ?? '—', color: 'text-amber-400' },
                  { label: 'IForest AUC', value: metrics.iforest_roc_auc?.toFixed(4) ?? '—', color: 'text-fuchsia-400' },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-gray-950/70 border border-gray-800 rounded-lg p-3"
                  >
                    <p className="text-[11px] text-gray-500">{m.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* 혼동 행렬 (Confusion Matrix) */}
              {cm && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-2">
                    시계열 Holdout 검증 혼동 행렬 (임계치 80.0점 · 검증 {status.testSamples.toLocaleString()}건)
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 flex justify-between">
                      <span className="text-emerald-300">TN (정상 정확 판별)</span>
                      <span className="font-mono font-bold text-white">{cm.tn.toLocaleString()}</span>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 flex justify-between">
                      <span className="text-amber-300">FP (오탐)</span>
                      <span className="font-mono font-bold text-white">{cm.fp.toLocaleString()}</span>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-3 flex justify-between">
                      <span className="text-rose-300">FN (미탐)</span>
                      <span className="font-mono font-bold text-white">{cm.fn.toLocaleString()}</span>
                    </div>
                    <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-lg p-3 flex justify-between">
                      <span className="text-indigo-300">TP (사기 정확 탐지)</span>
                      <span className="font-mono font-bold text-white">{cm.tp.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 우측: PSI 데이터 드리프트 + HITL 피드백 재학습 */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* PSI Data Drift 모니터 */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">
                    실시간 데이터 드리프트 (PSI)
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${driftMeta.badge}`}>
                    {driftMeta.label}
                  </span>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold font-mono text-white">
                      {drift ? drift.psiScore.toFixed(4) : '0.0000'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      기준: &lt;0.10 정상 · 0.10~0.25 주의 · ≥0.25 드리프트
                    </p>
                  </div>
                  <div className="text-right text-xs font-mono text-gray-400">
                    <p>금액 PSI: {drift?.amountPsi.toFixed(4) ?? '0.0000'}</p>
                    <p>빈도 PSI: {drift?.velocityPsi.toFixed(4) ?? '0.0000'}</p>
                  </div>
                </div>

                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${driftMeta.bar}`}
                    style={{ width: `${psiPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{drift?.message}</p>
              </div>

              {/* Human-in-the-Loop 피드백 & 재학습 실행 */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
                <div>
                  <h3 className="text-white font-semibold text-sm">
                    Human-in-the-Loop 피드백 재학습
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    관리자가 사기 확정/오탐 처리한 알람을 가중 반영해 Challenger 모델을 검증·교체합니다.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="bg-gray-950/70 border border-gray-800 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">사기 확정</p>
                    <p className="text-lg font-bold text-rose-400 font-mono">
                      {status.feedbackSummary.confirmedFraudCount}
                    </p>
                  </div>
                  <div className="bg-gray-950/70 border border-gray-800 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">오탐 처리</p>
                    <p className="text-lg font-bold text-emerald-400 font-mono">
                      {status.feedbackSummary.falsePositiveCount}
                    </p>
                  </div>
                  <div className="bg-gray-950/70 border border-gray-800 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">누적 피드백</p>
                    <p className="text-lg font-bold text-indigo-400 font-mono">
                      {status.feedbackSummary.totalFeedbackCount}
                    </p>
                  </div>
                </div>

                {isAdmin ? (
                  <button
                    type="button"
                    disabled={retraining}
                    onClick={handleRetrain}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {retraining
                      ? '🔄 Challenger 모델 학습 및 검증 중...'
                      : '🔄 피드백 반영 재학습 및 Hot-Swap 실행'}
                  </button>
                ) : (
                  <p className="text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2">
                    재학습 실행은 <code>ROLE_ADMIN</code> 계정 전용 기능입니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 2행: 모델 버전 & 재학습 이력 테이블 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold text-sm">모델 학습 및 승격 이력</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/40">
                    {['버전', '학습 시각', '반영 피드백', 'PR-AUC', 'F1 (0.80)', 'IForest AUC', '상태', '비고'].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {status.history.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-xs">
                        기록된 모델 학습 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    status.history.map((item, idx) => (
                      <tr key={`${item.version}-${idx}`} className="border-b border-gray-800/60">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-300 whitespace-nowrap">
                          {item.version}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {item.trainedAt}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-200">
                          {item.feedbackSamples}건
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-white">
                          {item.metrics.pr_auc?.toFixed(4) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-200">
                          {item.metrics.f1_at_0_80?.toFixed(4) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-fuchsia-300">
                          {item.metrics.iforest_roc_auc?.toFixed(4) ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.promoted ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              승격됨
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                              보류
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[260px] truncate">
                          {item.note}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
