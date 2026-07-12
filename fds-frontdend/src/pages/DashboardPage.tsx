import { useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import useWebSocket, { type FraudAlert } from '../hooks/useWebSocket'
import ToastContainer, { type Toast } from '../components/ToastContainer'
import FraudPieChart from '../components/FraudPieChart'
import TransactionTable from '../components/TransactionTable'
// TODO: 백엔드 연동 시 아래 import 복원
// import { getDashboardStats, type DashboardStats } from '../api/dashboardApi'
import type { DashboardStats } from '../api/dashboardApi'

// ── 임시 더미 통계 (백엔드 연동 전) ──────────────────────────
const DUMMY_STATS: DashboardStats = { todayFraudCount: 23, pendingCount: 8, completeCount: 127 }
// ─────────────────────────────────────────────────────────────

// 공통 레이아웃 (사이드바 + 상단 네비게이션바)
function DashboardLayout() {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((alert: FraudAlert) => {
    const message =
      alert.message || `거래 ID: ${alert.transactionId} / 금액: ${alert.amount.toLocaleString()}원`
    setToasts((prev) => [...prev, { id: Date.now(), message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useWebSocket({ onAlert: addToast })

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 우측 상단 Toast 알림 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 사이드바 */}
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-800">
          <span className="text-lg font-bold text-indigo-400">🛡 FDS</span>
          <p className="text-xs text-gray-500 mt-0.5">Fraud Detection System</p>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            📊 대시보드
          </NavLink>
        </nav>
        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            🚪 로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 네비게이션바 */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-300">대시보드</h2>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            admin
          </div>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// 통계 카드
const STAT_CARDS = [
  { key: 'todayFraudCount', label: '오늘 탐지 건수', color: 'text-red-400', icon: '🚨' },
  { key: 'pendingCount', label: '처리 중 (PENDING)', color: 'text-yellow-400', icon: '⏳' },
  { key: 'completeCount', label: '처리 완료 (COMPLETE)', color: 'text-green-400', icon: '✅' },
] as const

export default function DashboardPage() {
  // TODO: 백엔드 연동 시 아래 코드로 교체
  // const [stats, setStats] = useState<DashboardStats | null>(null)
  // useEffect(() => { getDashboardStats().then(setStats).catch(() => {}) }, [])
  const stats: DashboardStats = DUMMY_STATS

  return (
    <div className="flex flex-col gap-6">
      {/* 페이지 타이틀 */}
      <div>
        <h1 className="text-xl font-bold text-white">실시간 모니터링</h1>
        <p className="text-gray-400 text-sm mt-1">신용카드 이상 결제 탐지 현황</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {STAT_CARDS.map(({ key, label, color, icon }) => (
          <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-400 text-sm">{label}</p>
              <span className="text-lg">{icon}</span>
            </div>
            <p className={`text-3xl font-bold ${color}`}>
              {stats ? stats[key].toLocaleString() : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* 차트 + 테이블 영역 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 파이 차트 (1/3) */}
        <div className="col-span-1">
          <FraudPieChart />
        </div>

        {/* 결제 내역 테이블 (2/3) */}
        <div className="col-span-2">
          <TransactionTable />
        </div>
      </div>
    </div>
  )
}

export { DashboardLayout }
