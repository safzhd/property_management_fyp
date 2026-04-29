import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  FileText,
  ArrowLeftRight,
  FolderOpen,
  Bell,
  Home,
  Settings,
  LogOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { logoutUser } from '@/api/auth'
import type { Role } from '@/types/auth'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  roles: Role[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard',     to: '/app/dashboard',     icon: LayoutDashboard,  roles: ['admin', 'landlord'] },
  { label: 'Properties',    to: '/app/properties',    icon: Building2,        roles: ['admin', 'landlord'] },
  { label: 'Tenancies',     to: '/app/tenancies',     icon: FileText,         roles: ['admin', 'landlord'] },
  { label: 'Transactions',  to: '/app/transactions',  icon: ArrowLeftRight,   roles: ['admin', 'landlord'] },
  { label: 'My Tenancy',    to: '/app/my-tenancy',    icon: Home,             roles: ['tenant'] },
  { label: 'Documents',     to: '/app/documents',     icon: FolderOpen,       roles: ['admin', 'landlord'] },
  { label: 'Notifications', to: '/app/notifications', icon: Bell,             roles: ['admin', 'landlord', 'tenant'] },
  { label: 'Admin',         to: '/app/admin',         icon: Settings,         roles: ['admin'] },
]

const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  landlord: 'Landlord',
  tenant: 'Tenant',
}

const roleBadgeColour: Record<Role, string> = {
  admin: 'bg-purple-500/20 text-purple-300',
  landlord: 'bg-sky-400/20 text-sky-300',
  tenant: 'bg-emerald-500/20 text-emerald-300',
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const base = location.pathname.startsWith('/dev') ? '/dev' : '/app'

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  )

  const handleLogout = async () => {
    try {
      await logoutUser()
    } catch {
      // ignore — clear client state regardless
    }
    logout()
    toast.success('Signed out successfully')
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-700 border-r border-slate-600 shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-600">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#7ab8d0]">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">PropManage</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to.replace('/app', base)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-300/10 text-sky-300'
                  : 'text-gray-400 hover:bg-slate-600 hover:text-gray-100'
              )
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 py-4 border-t border-slate-600 space-y-3">
          {/* User info */}
          <div className="flex items-center gap-3 px-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-300/20 text-sky-300 text-xs font-bold shrink-0">
              {user.givenName[0]}{user.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-100 truncate">
                {user.givenName} {user.lastName}
              </p>
              <span className={cn('inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded font-medium', roleBadgeColour[user.role])}>
                {roleLabel[user.role]}
              </span>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-slate-600 hover:text-gray-100 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
