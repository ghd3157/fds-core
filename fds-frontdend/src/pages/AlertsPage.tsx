import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAlerts } from '../api/alertsApi'
import AlertDetailModal from '../components/AlertDetailModal'
import {
  DetectionSourceBadge,
  ReviewStatusBadge,
  RiskScoreBar,
} from '../components/StatusBadges'
import { useRealtime } from '../context/realtimeContextDef'
import type {
  DetectionSource,
  FraudAlertItem,
  PageResponse,
  ReviewStatus,
} from '../types/fds'

const PAGE_SIZE = 15

const REVIEW_TABS: Array<{ value: ReviewStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'UNCONFIRMED', label: '미확인' },
  { value: 'CONFIRMED_FRAUD', label: '사기 확정' },
  { value: 'FALSE_POSITIVE', label: '오탐 처리' },
]

export default function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshTick } = useRealtime()

  const initialStatus = (searchParams.get('reviewStatus') as ReviewStatus | '') ?? ''
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | ''>(initialStatus)
  const [detectionSource, setDetectionSource] = useState<DetectionSource | ''>('')
  const [sort, setSort] = useState('createdAt,desc')
  const [page, setPage] = useState(0)

  const [data, setData] = useState<PageResponse<FraudAlertItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [detailAlertId, setDetailAlertId] = useState<number | null>(null)

  const fetchAlerts = useCallback(
    (targetPage: number) => {
      setLoading(true)
      setError(false)
      getAlerts({
        page: targetPage,
        size: PAGE_SIZE,
        reviewStatus,
        detectionSource,
        sort,
      })
        .then((res) => {
          setData(res)
          setPage(targetPage)
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    },
    [reviewStatus, detectionSource, sort],
  )

  useEffect(() => {
    fetchAlerts(0)
  }, [fetchAlerts])

  useEffect(() => {
    if (refreshTick === 0) return
    fetchAlerts(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  const handleTabChange = (nextStatus: ReviewStatus | '') => {
    setReviewStatus(nextStatus)
    if (nextStatus) {
      setSearchParams({ reviewStatus: nextStatus })
    } else {
      setSearchParams({})
    }
  }

  const rows = data?.content ?? []
  const totalPages = Math.max(1, data?.totalPages ?? 1)

  return (
    <>
      <AlertDetailModal
        alertId={detailAlertId}
        onClose={() => setDetailAlertId(null)}
        onReviewed={() => fetchAlerts(page)}
      />

      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold text-white">이상 탐지 알람 관리</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            탐지된 고위험 결제의 Rule/ML 근거를 확인하고 사기 확정 또는 오탐 처리를 수행합니다.
          </p>
        </div>

        {/* 상태 탭 + 필터 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 p-1 rounded-xl">
            {REVIEW_TABS.map((tab) => (
              <button
                key={tab.value || 'ALL'}
                onClick={() => handleTabChange(tab.value)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  reviewStatus === tab.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={detectionSource}
              onChange={(e) => setDetectionSource(e.target.value as DetectionSource | '')}
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">탐지 출처: 전체</option>
              <option value="HYBRID">HYBRID (룰 + ML)</option>
              <option value="RULE">RULE (정책 룰)</option>
              <option value="ML">ML (LightGBM)</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="createdAt,desc">최신 탐지순</option>
              <option value="riskScore,desc">위험 스코어 높은순</option>
            </select>
          </div>
        </div>

        {/* 알람 테이블 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col gap-4 overflow-hidden">
          <div className="px-6 pt-5 flex items-center justify-between">
            <p className="text-gray-400 text-xs">
              검색 결과 <strong className="text-white">{data?.totalElements.toLocaleString() ?? '—'}</strong>건
              (행을 클릭해 상세 근거 확인 및 판정)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-800 bg-gray-800/50">
                  {[
                    '알람 #',
                    '사용자 / 거래 ID',
                    '금액',
                    '업종',
                    '위험 스코어',
                    '출처',
                    '1분 빈도',
                    '탐지 사유',
                    '상태',
                    '탐지 시각',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/60">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500 text-sm">
                      알람 목록을 불러오지 못했습니다.
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500 text-sm">
                      조건에 해당하는 이상 탐지 알람이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((item) => (
                    <tr
                      key={item.alertId}
                      onClick={() => setDetailAlertId(item.alertId)}
                      className={`border-b border-gray-800/60 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                        item.reviewStatus === 'UNCONFIRMED' ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                        #{item.alertId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-mono text-gray-200">{item.userId}</p>
                        <p className="text-[11px] font-mono text-gray-500 max-w-[160px] truncate">
                          {item.transactionId}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-white font-semibold whitespace-nowrap">
                        {item.amount.toLocaleString()}
                        <span className="text-gray-500 text-xs font-normal ml-0.5">원</span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                        {item.merchantCategory}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RiskScoreBar score={item.riskScore} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <DetectionSourceBadge source={item.detectionSource} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-300 whitespace-nowrap">
                        {item.txCount1m}회
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs max-w-[260px] truncate">
                        {item.detectionReason}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ReviewStatusBadge status={item.reviewStatus} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between px-6 pb-5">
            <span className="text-gray-500 text-xs">
              {page + 1} / {totalPages} 페이지
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchAlerts(0)}
                disabled={page === 0 || loading}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                «
              </button>
              <button
                onClick={() => fetchAlerts(page - 1)}
                disabled={page === 0 || loading}
                className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => Math.abs(i - page) <= 2)
                .map((i) => (
                  <button
                    key={i}
                    onClick={() => fetchAlerts(i)}
                    disabled={loading}
                    className={`px-3 py-1 rounded text-xs ${
                      i === page
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              <button
                onClick={() => fetchAlerts(page + 1)}
                disabled={page >= totalPages - 1 || loading}
                className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                다음
              </button>
              <button
                onClick={() => fetchAlerts(totalPages - 1)}
                disabled={page >= totalPages - 1 || loading}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                »
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
