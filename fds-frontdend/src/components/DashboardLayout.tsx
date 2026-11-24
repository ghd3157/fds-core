import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/authApi'
import { useRealtime } from '../context/realtimeContextDef'
import AlertDetailModal from './AlertDetailModal'
import ToastContainer from './ToastContainer'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '실시간 모니터링 대시보드',
  '/alerts': '이상 탐지 알람 관리',
  '/transactions': '전체 결제 내역 조회',
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user,
    connectionState,
    unconfirmedCount,
    toasts,
    selectedAlertId,
    dismissToast,
    openAlertModal,
    closeAlertModal,
  } = useRealtime()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const wsBadge =
    connectionState === 'connected'
      ? { dot: 'bg-emerald-400', text: '실시간 연결됨', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' }
      : connectionState === 'connecting'
        ? { dot: 'bg-yellow-400 animate-pulse', text: '연결 중...', cls: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' }
        : { dot: 'bg-red-400', text: '연결 끊김', cls: 'text-red-300 bg-red-500/10 border-red-500/30' }

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'FDS 관리자'

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 우측 상단 실시간 Toast 알림 */}
      <ToastContainer
        toasts={toasts}
        onRemove={dismissToast}
        onSelectAlert={openAlertModal}
      />

      {/* 글로벌 알람 상세/판정 모달 (Toast 클릭 시 어느 페이지에서도 열림) */}
      <AlertDetailModal alertId={selectedAlertId} onClose={closeAlertModal} />

      {/* 사이드바 */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡</span>
            <span className="text-lg font-bold text-indigo-400">FDS Core</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
              v2.0
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Hybrid Fraud Detection System</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span>📊</span>
            <span>실시간 대시보드</span>
          </NavLink>

          <NavLink
            to="/alerts"
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="flex items-center gap-3">
              <span>🚨</span>
              <span>이상 탐지 알람</span>
            </span>
            {unconfirmedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500 text-white">
                {unconfirmedCount > 99 ? '99+' : unconfirmedCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span>💳</span>
            <span>전체 결제 내역</span>
          </NavLink>
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 네비게이션바 */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-200">{pageTitle}</h2>

          <div className="flex items-center gap-3">
            {/* WebSocket 연결 상태 뱃지 */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${wsBadge.cls}`}
            >
              <span className={`w-2 h-2 rounded-full ${wsBadge.dot}`} />
              <span>{wsBadge.text}</span>
            </div>

            {/* 로그인 사용자 프로필 & 역할 뱃지 */}
            <div className="flex items-center gap-2 pl-2 border-l border-gray-800 text-sm">
              <span className="text-gray-200 font-medium">
                {user?.username ?? '...'}
              </span>
              {user && (
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    user.role === 'ROLE_ADMIN'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {user.role === 'ROLE_ADMIN' ? 'ADMIN' : 'VIEWER'}
                </span>
              )}
            </div>
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
