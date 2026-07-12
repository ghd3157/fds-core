import { Outlet, NavLink, useNavigate } from 'react-router-dom'

// 공통 레이아웃 (사이드바 + 상단 네비게이션바)
function DashboardLayout() {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
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

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-white">실시간 모니터링</h1>
        <p className="text-gray-400 text-sm mt-1">신용카드 이상 결제 탐지 현황</p>
      </div>

      {/* 통계 카드 (Step 4에서 실제 데이터로 교체) */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '오늘 탐지 건수', value: '-', color: 'text-red-400' },
          { label: '처리 중 (PENDING)', value: '-', color: 'text-yellow-400' },
          { label: '처리 완료 (COMPLETE)', value: '-', color: 'text-green-400' },
        ].map((card) => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-sm">{card.label}</p>
            <p className={`text-3xl font-bold mt-2 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 차트 / 테이블 영역 (Step 4에서 구현) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-gray-500 text-sm text-center py-12">
          📈 차트 및 결제 내역 테이블은 Step 4에서 구현됩니다.
        </p>
      </div>
    </div>
  )
}

export { DashboardLayout }
