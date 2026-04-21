import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types/auth'

interface RoleGateProps {
  allowedRoles: Role[]
  children: React.ReactNode
  /**
   * Where to redirect if the role check fails.
   * Defaults to '/app/unauthorized'
   */
  redirectTo?: string
}

export function RoleGate({ allowedRoles, children, redirectTo = '/app/unauthorized' }: RoleGateProps) {
  const user = useAuthStore((s) => s.user)

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}

/**
 * Inline role check — renders children or null, no redirect.
 * Use this inside a page to show/hide UI elements based on role.
 *
 * Example:
 *   <ShowForRole roles={['admin', 'landlord']}>
 *     <DeleteButton />
 *   </ShowForRole>
 */
interface ShowForRoleProps {
  roles: Role[]
  children: React.ReactNode
}

export function ShowForRole({ roles, children }: ShowForRoleProps) {
  const user = useAuthStore((s) => s.user)

  if (!user || !roles.includes(user.role)) return null

  return <>{children}</>
}
