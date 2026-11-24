import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './components/DashboardLayout'
import ProtectedRoute from './components/ProtectedRoute'
import { RealtimeProvider } from './context/RealtimeContext'
import AlertsPage from './pages/AlertsPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import TransactionsPage from './pages/TransactionsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />

        {/* 인증 보호 영역 (공통 실시간 WebSocket 컨텍스트 + 레이아웃) */}
        <Route
          element={
            <ProtectedRoute>
              <RealtimeProvider>
                <DashboardLayout />
              </RealtimeProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
