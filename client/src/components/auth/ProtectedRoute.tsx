import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    // Preserve where they were trying to go — redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
