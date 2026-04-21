import { useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const pageTitles: Record<string, string> = {
  '/app/dashboard':     'Dashboard',
  '/app/properties':    'Properties',
  '/app/rooms':         'Rooms',
  '/app/tenancies':     'Tenancies',
  '/app/payments':      'Payments',
  '/app/compliance':    'Compliance',
  '/app/maintenance':   'Maintenance',
  '/app/documents':     'Documents',
  '/app/notifications': 'Notifications',
  '/app/my-tenancy':    'My Tenancy',
  '/app/admin':         'Admin',
}

export function Header() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  const normalisedPath = location.pathname.replace(/^\/dev/, '/app')
  const title = pageTitles[normalisedPath] ?? 'PropManage'

  return (
    <header className="flex items-center justify-between px-6 h-16 bg-white border-b border-gray-200 shrink-0">
      {/* Page title */}
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <Bell className="w-4 h-4" />
          {/* Unread dot — shown when there are notifications */}
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-sky-400" />
        </button>

        {/* Avatar */}
        {user && (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-300/20 text-sky-500 text-xs font-bold select-none">
            {user.givenName[0]}{user.lastName[0]}
          </div>
        )}
      </div>
    </header>
  )
}
