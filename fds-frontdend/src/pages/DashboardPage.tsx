import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardSummary } from '../api/dashboardApi'
import FraudPieChart from '../components/FraudPieChart'
import HourlyTrafficChart from '../components/HourlyTrafficChart'
import TransactionTable from '../components/TransactionTable'
import { useRealtime } from '../context/realtimeContextDef'
import type { DashboardSummary } from '../types/fds'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { refreshTick } = useRealtime()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getDashboardSummary()
      .then((res) => {
        if (active) setSummary(res)
      })
      .catch(() => {
        // 일시적 오류 시 기존 수치 유지
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshTick])

  const cards = [
    {
      id: 'todayFraud',
      label: '오늘 이상 탐지',
      value: summary ? `${summary.todayFraudCount.toLocaleString()}건` : '—',
      sub: summary
        ? `전체 ${summary.todayTotalCount.toLocaleString()}건 중 ${summary.todayFraudRatio.toFixed(2)}%`
        : '오늘 KST 집계',
      color: 'text-red-400',
      icon: '🚨',
      onClick: () => navigate('/alerts'),
    },
    {
      id: 'unconfirmed',
      label: '미확인 알람 (조치 필요)',
      value: summary ? `${summary.unconfirmedAlertCount.toLocaleString()}건` : '—',
      sub: '클릭하여 사기 확정 / 오탐 처리',
      color: 'text-amber-400',
      icon: '🔔',
      onClick: () => navigate('/alerts?reviewStatus=UNCONFIRMED'),
    },
    {
      id: 'pending',
      label: 'AI 분석 대기 (PENDING)',
      value: summary ? `${summary.pendingCount.toLocaleString()}건` : '—',
      sub: 'Kafka 파이프라인 처리 중',
      color: 'text-yellow-300',
      icon: '⏳',
      onClick: () => navigate('/transactions'),
    },
    {
      id: 'complete',
      label: '전체 분석 완료 (COMPLETE)',
      value: summary ? `${summary.completeCount.toLocaleString()}건` : '—',
      sub: '누적 처리 완료 결제 로그',
      color: 'text-emerald-400',
      icon: '✅',
      onClick: () => navigate('/transactions'),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">실시간 이상 결제 모니터링</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Rule Engine + LightGBM 하이브리드 탐지 · Redis 결제빈도 실시간 분석 현황
          </p>
        </div>
      </div>

      {/* KPI 카드 4종 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            className="text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-xs font-medium">{card.label}</p>
              <span className="text-lg">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>
              {loading && !summary ? (
                <span className="inline-block w-20 h-7 bg-gray-800 rounded animate-pulse" />
              ) : (
                card.value
              )}
            </p>
            <p className="text-gray-500 text-xs mt-1.5">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* 중단 차트 2종 (12-col: 7 : 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <HourlyTrafficChart />
        </div>
        <div className="lg:col-span-5">
          <FraudPieChart />
        </div>
      </div>

      {/* 하단 최근 결제 내역 요약 테이블 */}
      <TransactionTable compact pageSize={10} />
    </div>
  )
}
