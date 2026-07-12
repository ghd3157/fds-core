import { Navigate } from 'react-router-dom'

// localStorage에 accessToken이 없으면 /login으로 리다이렉트
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
